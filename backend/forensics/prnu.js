import sharp from 'sharp';
import { clamp01 } from './config.js';

/**
 * PRNU (Photo-Response Non-Uniformity) analysis.
 * Checks for consistent noise fingerprint left by hardware camera sensors.
 *
 * @param {Buffer} buffer - Original image buffer
 * @param {object} [preDecoded] - Optional pre-decoded grayscale { data, info }
 */
export async function analyzePrnu(buffer, preDecoded) {
  try {
    const N = 512;

    let original, blurred;

    if (preDecoded) {
      // Resize pre-decoded grayscale to NxN
      const rawOpts = {
        raw: { width: preDecoded.info.width, height: preDecoded.info.height, channels: 1 }
      };
      [original, blurred] = await Promise.all([
        sharp(preDecoded.data, rawOpts).resize(N, N, { fit: 'fill' }).raw().toBuffer(),
        sharp(preDecoded.data, rawOpts).resize(N, N, { fit: 'fill' }).blur(2).raw().toBuffer()
      ]);
    } else {
      // BUG FIX: Sharp pipelines are single-use. Create two separate instances.
      [original, blurred] = await Promise.all([
        sharp(buffer).resize(N, N, { fit: 'fill' }).grayscale().raw().toBuffer(),
        sharp(buffer).resize(N, N, { fit: 'fill' }).blur(2).grayscale().raw().toBuffer()
      ]);
    }

    const length = Math.min(original.length, blurred.length);
    let sumResidual = 0;

    // Extract noise residual
    const residual = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      residual[i] = original[i] - blurred[i];
      sumResidual += residual[i];
    }

    const meanResidual = sumResidual / length;

    // Divide into 4 quadrants to check for spatial consistency of the noise floor
    // Use fit:'fill' so output is always exactly NxN, making stride == N.
    const stride = N;
    const midX = Math.floor(N / 2);
    const midY = Math.floor(N / 2);

    let q1 = 0, q2 = 0, q3 = 0, q4 = 0;
    let c1 = 0, c2 = 0, c3 = 0, c4 = 0;

    for (let i = 0; i < length; i++) {
      const y = Math.floor(i / stride);
      const x = i % stride;

      const v = Math.abs(residual[i] - meanResidual);
      if (y < midY) {
        if (x < midX) { q1 += v; c1++; }
        else { q2 += v; c2++; }
      } else {
        if (x < midX) { q3 += v; c3++; }
        else { q4 += v; c4++; }
      }
    }

    const m1 = c1 > 0 ? q1 / c1 : 0;
    const m2 = c2 > 0 ? q2 / c2 : 0;
    const m3 = c3 > 0 ? q3 / c3 : 0;
    const m4 = c4 > 0 ? q4 / c4 : 0;

    const globalMean = (m1 + m2 + m3 + m4) / 4;

    // Real sensors have a consistent PRNU noise floor variance across the frame.
    // AI generators often have wildly varying noise (or completely smooth areas).
    const variance = (Math.pow(m1 - globalMean, 2) + Math.pow(m2 - globalMean, 2) + Math.pow(m3 - globalMean, 2) + Math.pow(m4 - globalMean, 2)) / 4;

    const inconsistency = Math.sqrt(variance);
    const aiLikelihood = clamp01((inconsistency - 0.5) / 1.5);

    return {
      aiLikelihood,
      evidence: {
        prnuInconsistency: Number(inconsistency.toFixed(3)),
        globalNoiseMean: Number(globalMean.toFixed(3)),
        status: aiLikelihood > 0.5 ? 'Inconsistent Sensor Pattern' : 'Stable Sensor Noise'
      }
    };

  } catch (err) {
    return {
      aiLikelihood: 0.25,
      evidence: {
        prnuInconsistency: 0,
        globalNoiseMean: 0,
        status: 'Error Computing PRNU',
        error: err.message
      }
    };
  }
}
