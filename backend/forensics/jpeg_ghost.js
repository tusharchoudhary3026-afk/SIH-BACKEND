import sharp from 'sharp';
import { clamp01 } from './config.js';

/**
 * JPEG Ghosting analysis: detects spliced/inpainted regions saved at different
 * compression quality than the rest of the image.
 *
 * @param {Buffer} buffer - Original image buffer (always needed for JPEG recompress)
 * @param {object} [preDecoded] - Optional pre-decoded grayscale { data, info }
 */
export async function analyzeJpegGhost(buffer, preDecoded) {
  try {
    const N = 256;

    let original;

    if (preDecoded) {
      // Resize pre-decoded grayscale to NxN
      original = await sharp(preDecoded.data, {
        raw: { width: preDecoded.info.width, height: preDecoded.info.height, channels: 1 }
      })
        .resize(N, N, { fit: 'fill' })
        .raw()
        .toBuffer();
    } else {
      original = await sharp(buffer).resize(N, N, { fit: 'fill' }).grayscale().raw().toBuffer();
    }

    // Re-save at Q=65 (must use original buffer for realistic JPEG compression)
    const resavedBuffer = await sharp(buffer)
      .resize(N, N, { fit: 'fill' })
      .jpeg({ quality: 65 })
      .toBuffer();

    const resaved = await sharp(resavedBuffer)
      .grayscale()
      .raw()
      .toBuffer();

    const length = Math.min(original.length, resaved.length);
    let sumDiff = 0;

    // Compute absolute differences
    const diffs = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      diffs[i] = Math.abs(original[i] - resaved[i]);
      sumDiff += diffs[i];
    }

    const meanDiff = sumDiff / length;

    // Look for localized anomalies (ghosts) where the difference is abnormally low
    // meaning that specific region was already saved at Q=65 previously.
    let ghostCount = 0;
    for (let i = 0; i < length; i++) {
      if (diffs[i] < (meanDiff * 0.1)) {
        ghostCount++;
      }
    }

    const ghostRatio = ghostCount / length;

    // Calibrate: if > 5% of the image has suspiciously low delta to Q=65, it's likely a localized splice
    const aiLikelihood = clamp01((ghostRatio - 0.02) / 0.08);

    return {
      aiLikelihood,
      evidence: {
        ghostRatio: Number(ghostRatio.toFixed(3)),
        meanCompressionDiff: Number(meanDiff.toFixed(3)),
        status: aiLikelihood > 0.5 ? 'Ghosting Anomalies Found' : 'Uniform Compression'
      }
    };

  } catch (err) {
    return {
      aiLikelihood: 0.20,
      evidence: {
        ghostRatio: 0,
        meanCompressionDiff: 0,
        status: 'Error Computing Ghosts',
        error: err.message
      }
    };
  }
}
