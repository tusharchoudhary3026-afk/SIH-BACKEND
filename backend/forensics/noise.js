import sharp from 'sharp';
import { clamp01, THRESHOLDS } from './config.js';

/**
 * Local Noise Consistency analysis via block-wise noise variance.
 *
 * @param {Buffer} buffer - Original image buffer
 * @param {object} [preDecoded] - Optional pre-decoded grayscale { data, info }
 */
export async function analyzeNoise(buffer, preDecoded) {
  try {
    let data, width, height;

    if (preDecoded) {
      // Resize pre-decoded grayscale to <=512x512
      const resized = await sharp(preDecoded.data, {
        raw: { width: preDecoded.info.width, height: preDecoded.info.height, channels: 1 }
      })
        .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .raw()
        .toBuffer({ resolveWithObject: true });
      data = resized.data;
      width = resized.info.width;
      height = resized.info.height;
    } else {
      const result = await sharp(buffer)
        .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      data = result.data;
      width = result.info.width;
      height = result.info.height;
    }

    const blockSize = 32;
    const blockVariances = [];

    for (let startY = 1; startY + blockSize <= height; startY += blockSize) {
      for (let startX = 1; startX + blockSize <= width; startX += blockSize) {
        let sumResidual = 0;
        let sumResidualSq = 0;
        const pixelCount = blockSize * blockSize;

        for (let dy = 0; dy < blockSize; dy++) {
          const y = startY + dy;
          const rowOffset = y * width;
          const prevRowOffset = (y - 1) * width;

          for (let dx = 0; dx < blockSize; dx++) {
            const x = startX + dx;
            const current = data[rowOffset + x];
            const left = data[rowOffset + (x - 1)];
            const top = data[prevRowOffset + x];
            const neighborAvg = (left + top) / 2;
            const residual = current - neighborAvg;

            sumResidual += residual;
            sumResidualSq += residual * residual;
          }
        }

        const blockMean = sumResidual / pixelCount;
        const blockVar = Math.max(0, (sumResidualSq / pixelCount) - (blockMean * blockMean));
        blockVariances.push(blockVar);
      }
    }

    if (blockVariances.length === 0) {
      return {
        aiLikelihood: 0.25,
        evidence: {
          blockSize: 32,
          blockCount: 0,
          meanNoiseVariance: 0,
          noiseFloorCoefficient: 0,
          uniformityFlag: false,
          discontinuityFlag: false
        }
      };
    }

    let sumBv = 0;
    let sumBvSq = 0;
    const N = blockVariances.length;

    for (let i = 0; i < N; i++) {
      const bv = blockVariances[i];
      sumBv += bv;
      sumBvSq += bv * bv;
    }

    const mean = sumBv / N;
    const varianceOfVariances = Math.max(0, (sumBvSq / N) - (mean * mean));
    const coefficient = mean > 0 ? Math.sqrt(varianceOfVariances) / mean : 0;

    const tooUniform = clamp01((THRESHOLDS.NOISE_UNIFORMITY_MAX - coefficient) / THRESHOLDS.NOISE_UNIFORMITY_MAX);
    const discontinuous = clamp01((coefficient - THRESHOLDS.NOISE_DISCONTINUITY_MIN) / THRESHOLDS.NOISE_DISCONTINUITY_RANGE);
    const aiLikelihood = clamp01(Math.max(tooUniform, discontinuous));

    return {
      aiLikelihood,
      evidence: {
        blockSize: 32,
        blockCount: N,
        meanNoiseVariance: Number(mean.toFixed(3)),
        noiseFloorCoefficient: Number(coefficient.toFixed(3)),
        uniformityFlag: tooUniform > 0.3,
        discontinuityFlag: discontinuous > 0.3
      }
    };
  } catch (err) {
    return {
      aiLikelihood: 0.25,
      evidence: {
        blockSize: 32,
        blockCount: 0,
        meanNoiseVariance: 0,
        noiseFloorCoefficient: 0,
        uniformityFlag: false,
        discontinuityFlag: false,
        error: err.message
      }
    };
  }
}
