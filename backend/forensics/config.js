// ==========================================
// FORENSIC ENSEMBLE WEIGHTS
// ==========================================
// Rationale for weight distribution:
// - geminiOpinion (0.35): Still the strongest semantic analyzer for physical impossibilities, but reduced from 0.75 so local heuristics can mathematically override it.
// - c2pa (0.20): Near-deterministic cryptographic provenance. If it's cryptographically signed as AI, it's AI.
// - prnu (0.10): Hardware sensor pattern noise. GANs/Diffusion models cannot replicate unique physical sensor defects. Highly reliable.
// - cfa_demosaic (0.10): Bayer filter interpolation artifacts. Generative AI synthesizes full RGB natively and lacks periodic CFA footprints.
// - jpeg_ghost (0.10): Localized compression variance is a strong indicator of splicing/inpainting.
// - frequency (0.04): Good for detecting GAN upsampling artifacts (checkerboarding), but modern diffusion models are smoother.
// - noise (0.04): Good for detecting unnatural uniformity, but easily fooled by post-generation noise injection.
// - ela (0.04): Good for detecting resave boundaries, but struggles on highly compressed web images.
// - metadata (0.03): Useful but trivially stripped or spoofed by malicious actors.
export const weights = {
  geminiOpinion: 0.35,
  c2pa: 0.20,
  prnu: 0.10,
  cfa_demosaic: 0.10,
  jpeg_ghost: 0.10,
  frequency: 0.04,
  noise: 0.04,
  ela: 0.04,
  metadata: 0.03
};

// ==========================================
// CALIBRATION THRESHOLDS
// ==========================================
// These thresholds can be tuned via calibrate.js to maximize F1-score on a labeled dataset.
export const THRESHOLDS = {
  // Frequency (2D-FFT) thresholds
  FREQ_PEAK_RATIO_BASE: 4,
  FREQ_PEAK_RATIO_RANGE: 18, // 4 to 22

  // Noise thresholds
  NOISE_UNIFORMITY_MAX: 0.24,
  NOISE_DISCONTINUITY_MIN: 1.2,
  NOISE_DISCONTINUITY_RANGE: 2.5
};

export const maxPreprocessedEdge = 1536;

export const PYTHON_LAYER_URL = process.env.PYTHON_LAYER_URL || 'http://localhost:8000';

export function clamp01(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
