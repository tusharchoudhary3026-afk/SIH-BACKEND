import { analyzePrnu } from '../prnu.js';
import { analyzeCfaDemosaic } from '../cfa_demosaic.js';
import { analyzeEla } from '../ela.js';
import { analyzeFrequency } from '../frequency.js';
import { analyzeNoise } from '../noise.js';

export default async function pixelAnalysisWorker({ task, resizedBuffer, rgbData, rgbInfo, grayData, grayInfo }) {
  const rgb = rgbData ? { data: rgbData, info: rgbInfo } : null;
  const gray = grayData ? { data: grayData, info: grayInfo } : null;

  switch (task) {
    case 'ela':
      return await analyzeEla(resizedBuffer, rgb);
    case 'frequency':
      return await analyzeFrequency(resizedBuffer, gray);
    case 'noise':
      return await analyzeNoise(resizedBuffer, gray);
    case 'prnu':
      return await analyzePrnu(resizedBuffer, gray);
    case 'cfa_demosaic':
      return await analyzeCfaDemosaic(resizedBuffer, rgb);
    default:
      throw new Error(`Unknown analysis task: ${task}`);
  }
}
