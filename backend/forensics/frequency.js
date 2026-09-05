import sharp from 'sharp';
import FFT from 'fft.js';
import { clamp01, THRESHOLDS } from './config.js';

/**
 * Frequency analysis via column-wise 1D FFT to detect GAN upsampling artifacts.
 *
 * @param {Buffer} buffer - Original image buffer
 * @param {object} [preDecoded] - Optional pre-decoded grayscale { data, info }
 */
export async function analyzeFrequency(buffer, preDecoded) {
  try {
    const N = 256;
    let data;

    if (preDecoded) {
      // Resize pre-decoded grayscale to NxN for FFT
      const resized = await sharp(preDecoded.data, {
        raw: { width: preDecoded.info.width, height: preDecoded.info.height, channels: 1 }
      })
        .resize(N, N, { fit: 'fill' })
        .raw()
        .toBuffer();
      data = resized;
    } else {
      const result = await sharp(buffer)
        .resize(N, N, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      data = result.data;
    }

    const f = new FFT(N);

    // Accumulate frequency energy from column FFTs (mid-high frequency bins)
    const colInput = new Float64Array(N);
    const colOutput = f.createComplexArray();

    let energy = 0;
    let peak = 0;
    let samples = 0;

    for (let c = 0; c < N; c++) {
      for (let r = 0; r < N; r++) {
        colInput[r] = data[r * N + c];
      }
      f.realTransform(colOutput, colInput);
      f.completeSpectrum(colOutput);

      // For columns: for row indices 8..127 (skip low frequencies)
      for (let k = 8; k <= 127; k++) {
        const re = colOutput[2 * k];
        const im = colOutput[2 * k + 1];
        const mag = Math.hypot(re, im);

        energy += mag;
        if (mag > peak) {
          peak = mag;
        }
        samples++;
      }
    }

    const mean = samples > 0 ? energy / samples : 0;
    const peakRatio = mean > 0 ? peak / mean : 0;
    const periodicPeak = clamp01((peakRatio - THRESHOLDS.FREQ_PEAK_RATIO_BASE) / THRESHOLDS.FREQ_PEAK_RATIO_RANGE);
    const aiLikelihood = periodicPeak;

    return {
      aiLikelihood,
      evidence: {
        width: N,
        height: N,
        midHighFrequencyMean: Number(mean.toFixed(3)),
        peakMagnitude: Number(peak.toFixed(3)),
        peakRatio: Number(peakRatio.toFixed(3))
      }
    };
  } catch (err) {
    return {
      aiLikelihood: 0.1,
      evidence: {
        width: 256,
        height: 256,
        midHighFrequencyMean: 0,
        peakMagnitude: 0,
        peakRatio: 0,
        error: err.message
      }
    };
  }
}
