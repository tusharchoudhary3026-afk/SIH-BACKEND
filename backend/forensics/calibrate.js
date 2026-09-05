import fs from 'fs';
import path from 'path';
import { analyzeFrequency } from './frequency.js';
import { analyzeNoise } from './noise.js';
import { THRESHOLDS } from './config.js';

// Basic F1 Score calculation
function calculateF1(tp, fp, fn) {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

export async function calibrateThresholds(realDirPath, aiDirPath) {
  console.log(`Starting calibration...\nReal dataset: ${realDirPath}\nAI dataset: ${aiDirPath}`);
  
  const realFiles = fs.readdirSync(realDirPath).map(f => path.join(realDirPath, f)).filter(f => f.match(/\.(jpg|jpeg|png)$/i));
  const aiFiles = fs.readdirSync(aiDirPath).map(f => path.join(aiDirPath, f)).filter(f => f.match(/\.(jpg|jpeg|png)$/i));
  
  if (realFiles.length === 0 || aiFiles.length === 0) {
    console.error('Datasets not found or empty. Please provide directories with images.');
    return;
  }
  
  console.log(`Loaded ${realFiles.length} Real images and ${aiFiles.length} AI images.`);
  
  const dataset = [];
  
  // Extract base heuristics to test thresholds offline quickly
  for (const file of realFiles) {
    const buffer = fs.readFileSync(file);
    const freq = await analyzeFrequency(buffer);
    const noise = await analyzeNoise(buffer);
    dataset.push({ label: 0, peakRatio: freq.evidence.peakRatio, noiseCoeff: noise.evidence.noiseFloorCoefficient });
  }
  
  for (const file of aiFiles) {
    const buffer = fs.readFileSync(file);
    const freq = await analyzeFrequency(buffer);
    const noise = await analyzeNoise(buffer);
    dataset.push({ label: 1, peakRatio: freq.evidence.peakRatio, noiseCoeff: noise.evidence.noiseFloorCoefficient });
  }

  // Optimize FREQ_PEAK_RATIO_BASE
  console.log('\n--- Frequency Threshold Optimization ---');
  let bestFreqF1 = 0;
  let bestFreqThresh = THRESHOLDS.FREQ_PEAK_RATIO_BASE;
  
  for (let t = 2; t <= 10; t += 0.5) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const d of dataset) {
      const pred = d.peakRatio > t ? 1 : 0; // Higher peak ratio = AI
      if (pred === 1 && d.label === 1) tp++;
      else if (pred === 1 && d.label === 0) fp++;
      else if (pred === 0 && d.label === 1) fn++;
      else tn++;
    }
    const metrics = calculateF1(tp, fp, fn);
    if (metrics.f1 > bestFreqF1) {
      bestFreqF1 = metrics.f1;
      bestFreqThresh = t;
    }
  }
  
  console.log(`Current Base Threshold: ${THRESHOLDS.FREQ_PEAK_RATIO_BASE}`);
  console.log(`Suggested Base Threshold: ${bestFreqThresh} (Achieves F1: ${bestFreqF1.toFixed(3)})`);

  // Optimize NOISE_UNIFORMITY_MAX
  console.log('\n--- Noise Uniformity Optimization ---');
  let bestNoiseF1 = 0;
  let bestNoiseThresh = THRESHOLDS.NOISE_UNIFORMITY_MAX;
  
  for (let t = 0.10; t <= 0.40; t += 0.02) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const d of dataset) {
      const pred = d.noiseCoeff < t ? 1 : 0; // Lower coefficient (more uniform) = AI
      if (pred === 1 && d.label === 1) tp++;
      else if (pred === 1 && d.label === 0) fp++;
      else if (pred === 0 && d.label === 1) fn++;
      else tn++;
    }
    const metrics = calculateF1(tp, fp, fn);
    if (metrics.f1 > bestNoiseF1) {
      bestNoiseF1 = metrics.f1;
      bestNoiseThresh = t;
    }
  }
  
  console.log(`Current Uniformity Threshold: ${THRESHOLDS.NOISE_UNIFORMITY_MAX}`);
  console.log(`Suggested Uniformity Threshold: ${bestNoiseThresh.toFixed(3)} (Achieves F1: ${bestNoiseF1.toFixed(3)})`);
  
  console.log('\nUpdate config.js with suggested thresholds if they improve performance.');
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('calibrate.js')) {
  const realDir = process.argv[2];
  const aiDir = process.argv[3];
  if (!realDir || !aiDir) {
    console.log('Usage: node calibrate.js <path_to_real_images> <path_to_ai_images>');
    process.exit(1);
  }
  calibrateThresholds(realDir, aiDir).catch(console.error);
}
