import React, { useEffect, useRef, useState } from 'react';

export interface HandPosition {
  x: number; // 0 to 1 normalized horizontally across screen
  y: number; // 0 to 1 normalized vertically (centroid)
  fingersY: number; // top of fingertips (0 to 1)
  offsetX: number; // pixel offset from screen center
  offsetY: number; // pixel offset from screen center
}

interface RobotHandCanvasProps {
  className?: string;
  onHandUpdate?: (pos: HandPosition) => void;
}

// Hand motion trajectory keyframes sampled directly from the video stream
const trajectoryKeyframes = [
  { t: 0.0, x: 0.500, y: 0.820, fingersY: 0.650 },
  { t: 1.0, x: 0.510, y: 0.767, fingersY: 0.559 },
  { t: 2.0, x: 0.512, y: 0.671, fingersY: 0.436 },
  { t: 3.0, x: 0.516, y: 0.575, fingersY: 0.310 },
  { t: 4.0, x: 0.519, y: 0.531, fingersY: 0.256 },
  { t: 5.0, x: 0.515, y: 0.521, fingersY: 0.233 },
  { t: 5.5, x: 0.518, y: 0.506, fingersY: 0.163 },
  { t: 6.0, x: 0.527, y: 0.498, fingersY: 0.135 },
  { t: 6.5, x: 0.523, y: 0.501, fingersY: 0.145 },
  { t: 7.0, x: 0.517, y: 0.510, fingersY: 0.172 },
  { t: 7.5, x: 0.515, y: 0.516, fingersY: 0.187 },
  { t: 8.0, x: 0.515, y: 0.518, fingersY: 0.187 }
];

function interpolateHand(time: number): { x: number; y: number; fingersY: number } {
  const t = Math.max(0, Math.min(8.0, time % 8.04));
  for (let i = 0; i < trajectoryKeyframes.length - 1; i++) {
    const k1 = trajectoryKeyframes[i];
    const k2 = trajectoryKeyframes[i + 1];
    if (t >= k1.t && t <= k2.t) {
      const alpha = (t - k1.t) / (k2.t - k1.t);
      // Smooth cubic hermite interpolation
      const ease = alpha * alpha * (3 - 2 * alpha);
      return {
        x: k1.x + (k2.x - k1.x) * ease,
        y: k1.y + (k2.y - k1.y) * ease,
        fingersY: k1.fingersY + (k2.fingersY - k1.fingersY) * ease
      };
    }
  }
  return trajectoryKeyframes[trajectoryKeyframes.length - 1];
}

export const RobotHandCanvas: React.FC<RobotHandCanvasProps> = ({
  className = '',
  onHandUpdate
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onHandUpdateRef = useRef(onHandUpdate);
  onHandUpdateRef.current = onHandUpdate;
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    // Initialize WebGL context with high precision
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      console.warn('WebGL not supported, falling back to 2D canvas');
      setHasError(true);
      return;
    }

    // Vertex shader
    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    // Advanced Fragment Shader:
    // 1. 3x3 Unsharp Mask Sharpening kernel (removes all blurriness)
    // 2. High-precision Luminance Alpha Threshold
    // 3. True De-spill Algorithm (eradicates the white edge fringe)
    // 4. Metallic contrast boost (rich darks and glossy highlights)
    // 5. Smooth bottom floor reflection fade
    const fsSource = `
      precision highp float;
      uniform sampler2D u_video;
      uniform vec2 u_videoSize;
      uniform vec2 u_canvasSize;
      varying vec2 v_texCoord;

      void main() {
        // Object-cover UV mapping
        float canvasAspect = u_canvasSize.x / u_canvasSize.y;
        float videoAspect = u_videoSize.x / u_videoSize.y;

        vec2 uv = v_texCoord;
        if (canvasAspect > videoAspect) {
          float scale = canvasAspect / videoAspect;
          uv.y = (uv.y - 0.5) / scale + 0.5;
        } else {
          float scale = videoAspect / canvasAspect;
          uv.x = (uv.x - 0.5) / scale + 0.5;
        }

        // Out of bounds safety
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          gl_FragColor = vec4(0.0);
          return;
        }

        // 1. Micro-detail Unsharp Mask Convolution (3x3 Kernel)
        vec2 texel = 1.0 / u_videoSize;
        vec4 center = texture2D(u_video, uv);
        vec4 left   = texture2D(u_video, uv + vec2(-texel.x, 0.0));
        vec4 right  = texture2D(u_video, uv + vec2( texel.x, 0.0));
        vec4 up     = texture2D(u_video, uv + vec2(0.0, -texel.y));
        vec4 down   = texture2D(u_video, uv + vec2(0.0,  texel.y));

        // High-pass edge amplification
        vec4 sharp = center * 1.85 - (left + right + up + down) * 0.2125;
        sharp = clamp(sharp, 0.0, 1.0);

        // 2. Precise Luminance Calculation
        float lum = dot(center.rgb, vec3(0.299, 0.587, 0.114));

        // 3. Crisp Alpha Edge with strict threshold
        // Pure background is > 0.955. Hand edges start at 0.935.
        float alpha = clamp((0.950 - lum) / 0.025, 0.0, 1.0);

        // 4. White De-spill (Removes white halo/blur around mechanical joints)
        float bgLum = 0.98;
        vec3 despilled = (sharp.rgb - (1.0 - alpha) * vec3(bgLum)) / max(alpha, 0.001);
        despilled = clamp(despilled, 0.0, 1.0);

        // 5. Metallic Contrast Enhancement
        despilled = pow(despilled, vec3(1.18));

        // 6. Smooth Floor Reflection Gradient
        float bottomFade = smoothstep(1.0, 0.82, uv.y);
        alpha *= bottomFade;

        // Premultiplied alpha output
        gl_FragColor = vec4(despilled * alpha, alpha);
      }
    `;

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) {
      setHasError(true);
      return;
    }

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      setHasError(true);
      return;
    }

    gl.useProgram(program);

    // Fullscreen Quad
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]),
      gl.STATIC_DRAW
    );

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0, 1,
        1, 1,
        0, 0,
        0, 0,
        1, 1,
        1, 0,
      ]),
      gl.STATIC_DRAW
    );

    const aPosition = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPosition);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const aTexCoord = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(aTexCoord);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

    // High Quality Texture Filtering
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uVideo = gl.getUniformLocation(program, 'u_video');
    const uVideoSize = gl.getUniformLocation(program, 'u_videoSize');
    const uCanvasSize = gl.getUniformLocation(program, 'u_canvasSize');

    gl.uniform1i(uVideo, 0);

    // Alpha blending with premultiplied alpha
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    let animationFrameId: number;
    let isDisposed = false;

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const displayWidth = Math.floor(canvas.clientWidth * dpr);
      const displayHeight = Math.floor(canvas.clientHeight * dpr);

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, displayWidth, displayHeight);
      }
    };

    const render = () => {
      if (isDisposed) return;

      resizeCanvas();

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

        const vw = video.videoWidth || 3836;
        const vh = video.videoHeight || 2160;

        gl.uniform2f(uVideoSize, vw, vh);
        gl.uniform2f(uCanvasSize, canvas.width, canvas.height);

        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Notify parent of real-time hand position for motion tracking
        if (onHandUpdateRef.current) {
          const currentTime = video.currentTime || 0;
          const hand = interpolateHand(currentTime);
          const cw = canvas.clientWidth || window.innerWidth;
          const ch = canvas.clientHeight || window.innerHeight;

          onHandUpdateRef.current({
            x: hand.x,
            y: hand.y,
            fingersY: hand.fingersY,
            offsetX: (hand.x - 0.5) * cw,
            offsetY: (hand.y - 0.5) * ch
          });
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    video.muted = true;
    video.playsInline = true;
    const attemptPlay = () => {
      video.play().catch(() => {});
    };

    video.addEventListener('canplay', attemptPlay);
    video.addEventListener('loadeddata', attemptPlay);
    attemptPlay();

    render();

    const handleResize = () => {
      resizeCanvas();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('resize', handleResize);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(texCoordBuffer);
    };
  }, []);

  return (
    <div className={`pointer-events-none select-none ${className}`}>
      {/* 4K Source Video: Full dimensions ensure zero hardware downscaling */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        crossOrigin="anonymous"
        style={{
          position: 'fixed',
          top: -99999,
          left: -99999,
          width: 3840,
          height: 2160,
          opacity: 0,
          pointerEvents: 'none'
        }}
      >
        <source src="/videos/robot_hero.mp4" type="video/mp4" />
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_215831_c6a8989c-d716-4d8d-8745-e972a2eec711.mp4"
          type="video/mp4"
        />
      </video>

      {/* Hardware-Accelerated High-Fidelity WebGL Canvas */}
      {!hasError ? (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      ) : (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-85 mix-blend-screen"
        >
          <source src="/videos/robot_hero.mp4" type="video/mp4" />
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_215831_c6a8989c-d716-4d8d-8745-e972a2eec711.mp4"
            type="video/mp4"
          />
        </video>
      )}
    </div>
  );
};
