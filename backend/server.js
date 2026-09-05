import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import sharp from 'sharp';
import { GoogleGenAI, Type } from '@google/genai';
import { runLocalForensics, combineForensics } from './forensics/ensemble.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const GEMINI_MODEL = (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== 'gemini-2.5-flash')
  ? process.env.GEMINI_MODEL
  : 'gemini-3.6-flash';
const PYTHON_LAYER_URL = process.env.PYTHON_LAYER_URL || 'http://localhost:8000';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const IMAGE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_IMAGE_STORE_SIZE = 500; // Maximum in-memory images (LRU cap)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Module-level Gemini singleton (avoids re-instantiation per request)
const genaiInstance = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// =========================================================================
// MIDDLEWARE
// =========================================================================

// Security headers (CSP, X-Content-Type-Options, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for SPA with inline styles
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOrigin = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(',').map((s) => s.trim())
  : true;

app.use(cors({ origin: corsOrigin, credentials: true }));

// Apply rate limiting to all API routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);
app.use(express.json({ limit: '10mb' }));

// Disable request and response timeouts so long forensic scans run until completed
app.use((req, res, next) => {
  req.setTimeout(0);
  res.setTimeout(0);
  next();
});

// =========================================================================
// IN-MEMORY IMAGE STORE WITH LRU EVICTION
// =========================================================================
const images = new Map();

/**
 * Store an image with LRU eviction when the store exceeds MAX_IMAGE_STORE_SIZE.
 * Evicts the oldest entry by uploadedAt timestamp.
 */
function storeImage(imageId, imageData) {
  // Evict oldest entries if at capacity
  while (images.size >= MAX_IMAGE_STORE_SIZE) {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, item] of images.entries()) {
      if (item.uploadedAt < oldestTime) {
        oldestTime = item.uploadedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) images.delete(oldestKey);
    else break;
  }
  images.set(imageId, imageData);
}

// Background purge every 15 minutes (unreferenced so it doesn't block process exit)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, item] of images.entries()) {
    if (now - item.uploadedAt > IMAGE_TTL_MS) {
      images.delete(id);
    }
  }
}, IMAGE_TTL_MS);
cleanupTimer.unref();

// =========================================================================
// MULTER CONFIGURATION
// =========================================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`), false);
    }
  }
});

// =========================================================================
// TERMINAL LOGGING & DIAGNOSTIC CARD FORMATTERS
// =========================================================================
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

/**
 * Log visual execution breakdown of all forensic pipeline tasks
 */
function logExecutionTimeline({ imageId, imageSizeKb, timings, status = 'SUCCESS' }) {
  const line = `${C.gray}─`.repeat(72);
  const statusBadge = status === 'FAILED'
    ? `${C.red}[FAILED]${C.reset}`
    : status === 'POSSIBLE_AI'
      ? `${C.yellow}[POSSIBLE AI]${C.reset}`
      : `${C.green}[AUTHENTIC]${C.reset}`;

  console.log(`\n${C.cyan}┌${line}┐${C.reset}`);
  console.log(`${C.cyan}│ ${C.bright}⏱️  AI FORENSICS EXECUTION TIMELINE${C.reset} ${statusBadge} ${C.dim}(ID: ${imageId.slice(0, 8)}... | ${imageSizeKb} KB)${C.reset}${' '.repeat(Math.max(0, 16 - imageId.slice(0, 8).length))}${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}├${line}┤${C.reset}`);

  // 1. Sharp Preprocessing
  const prepStr = timings.preprocessMs !== undefined ? `${timings.preprocessMs} ms` : 'skipped';
  console.log(`${C.cyan}│${C.reset}  🖼️  Image Preprocessing (Sharp 1536px) : ${C.green}${prepStr.padEnd(10)}${C.reset}                           ${C.cyan}│${C.reset}`);

  // 2. Local Ensemble
  if (timings.localForensicsMs !== undefined) {
    console.log(`${C.cyan}│${C.reset}  🔬 Local Forensics Ensemble (Parallel) : ${C.green}${(`${timings.localForensicsMs} ms`).padEnd(10)}${C.reset}                           ${C.cyan}│${C.reset}`);
    if (timings.localSubTimings) {
      const s = timings.localSubTimings;
      console.log(`${C.cyan}│${C.reset}     ├─ 2D-FFT Spectral (Grid Artifact)  : ${C.dim}${(`${s.frequencyMs || 0} ms`).padEnd(8)}${C.reset}                                 ${C.cyan}│${C.reset}`);
      console.log(`${C.cyan}│${C.reset}     ├─ PRNU Sensor Noise Consistency    : ${C.dim}${(`${s.prnuMs || 0} ms`).padEnd(8)}${C.reset}                                 ${C.cyan}│${C.reset}`);
      console.log(`${C.cyan}│${C.reset}     ├─ CFA Demosaicing Interpolation    : ${C.dim}${(`${s.cfaDemosaicMs || 0} ms`).padEnd(8)}${C.reset}                                 ${C.cyan}│${C.reset}`);
      console.log(`${C.cyan}│${C.reset}     ├─ JPEG Ghost / ELA Splicing        : ${C.dim}${(`${s.jpegGhostMs || 0} ms`).padEnd(8)}${C.reset}                                 ${C.cyan}│${C.reset}`);
      console.log(`${C.cyan}│${C.reset}     ├─ Localized Block Noise Variance   : ${C.dim}${(`${s.noiseMs || 0} ms`).padEnd(8)}${C.reset}                                 ${C.cyan}│${C.reset}`);
      console.log(`${C.cyan}│${C.reset}     ├─ Structural EXIF Header Metadata  : ${C.dim}${(`${s.metadataMs || 0} ms`).padEnd(8)}${C.reset}                                 ${C.cyan}│${C.reset}`);
      console.log(`${C.cyan}│${C.reset}     └─ SynthID & C2PA Credentials       : ${C.dim}${(`${s.synthIdMs || 0} ms`).padEnd(8)}${C.reset}                                 ${C.cyan}│${C.reset}`);
    }
  }

  // 3. Python Layer B
  if (timings.pythonLayerMs !== undefined) {
    const pyStatus = timings.pythonStatus || 'OK';
    const pyColor = pyStatus === 'OK' ? C.green : C.yellow;
    console.log(`${C.cyan}│${C.reset}  🧠 Python Layer B (FastAPI Deep ML)    : ${pyColor}${(`${timings.pythonLayerMs} ms [${pyStatus}]`).padEnd(24)}${C.reset}                 ${C.cyan}│${C.reset}`);
  }

  // 4. Gemini Vision API
  if (timings.geminiVisionMs !== undefined) {
    const gemStatus = timings.geminiStatus || 'SUCCESS';
    const gemColor = gemStatus === 'SUCCESS' ? C.green : C.red;
    console.log(`${C.cyan}│${C.reset}  👁️  Gemini Vision API (${GEMINI_MODEL}) : ${gemColor}${(`${timings.geminiVisionMs} ms [${gemStatus}]`).padEnd(24)}${C.reset}               ${C.cyan}│${C.reset}`);
  }

  // 5. Unified Synthesis
  if (timings.unifiedSummaryMs !== undefined) {
    const unType = timings.unifiedType || 'LLM';
    console.log(`${C.cyan}│${C.reset}  📑 Cross-Layer Verdict Synthesis       : ${C.green}${(`${timings.unifiedSummaryMs} ms (${unType})`).padEnd(24)}${C.reset}                 ${C.cyan}│${C.reset}`);
  }

  // Total Duration
  console.log(`${C.cyan}├${line}┤${C.reset}`);
  console.log(`${C.cyan}│ ${C.bright}⚡ TOTAL PIPELINE DURATION             : ${C.yellow}${timings.totalMs} ms${C.reset}${' '.repeat(Math.max(0, 39 - String(timings.totalMs).length))}${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}└${line}┘${C.reset}\n`);
}

/**
 * Log structured diagnostic box for specific API errors
 */
function logErrorDiagnostics({ type, status, code, reason, action, rawError }) {
  const line = `${C.red}═`.repeat(72);
  console.error(`\n${C.red}╔${line}╗${C.reset}`);
  console.error(`${C.red}║ ${C.bright}🔴 API ERROR DIAGNOSTIC: ${type.toUpperCase()}${C.reset}${' '.repeat(Math.max(0, 72 - 26 - type.length))}${C.red}║${C.reset}`);
  console.error(`${C.red}╠${line}╣${C.reset}`);
  console.error(`${C.red}║${C.reset}  ${C.bright}HTTP Status :${C.reset} ${C.yellow}${String(status).padEnd(54)}${C.reset}${C.red}║${C.reset}`);
  console.error(`${C.red}║${C.reset}  ${C.bright}Error Code  :${C.reset} ${C.cyan}${String(code).padEnd(54)}${C.reset}${C.red}║${C.reset}`);
  console.error(`${C.red}║${C.reset}  ${C.bright}Diagnosis   :${C.reset} ${reason.slice(0, 54).padEnd(54)}${C.red}║${C.reset}`);
  if (reason.length > 54) {
    console.error(`${C.red}║${C.reset}                ${reason.slice(54, 108).padEnd(54)}${C.red}║${C.reset}`);
  }
  console.error(`${C.red}║${C.reset}  ${C.bright}Resolution  :${C.reset} ${C.green}${action.slice(0, 54).padEnd(54)}${C.reset}${C.red}║${C.reset}`);
  if (action.length > 54) {
    console.error(`${C.red}║${C.reset}                ${C.green}${action.slice(54, 108).padEnd(54)}${C.reset}${C.red}║${C.reset}`);
  }
  if (rawError && rawError.message) {
    console.error(`${C.red}║${C.reset}  ${C.dim}Raw Error   : ${rawError.message.slice(0, 52).padEnd(52)}${C.reset}${C.red}║${C.reset}`);
  }
  console.error(`${C.red}╚${line}╝${C.reset}\n`);
}

// =========================================================================
// HELPER: CLASSIFY GEMINI ERRORS
// =========================================================================
function handleGeminiError(err, modelName, res, timings = {}) {
  const msg = (err.message || '').toLowerCase();
  const status = err.status || err.statusCode || err.response?.status || 0;
  const errorDetails = err.errorDetails || err.details || [];
  const detailsStr = typeof errorDetails === 'string' ? errorDetails.toLowerCase() : JSON.stringify(errorDetails).toLowerCase();
  const fullText = `${msg} ${detailsStr}`;

  // 1. QUOTA EXCEEDED (Free tier limit, tokens per min, rate quota exhaustion)
  // Note: Can arrive as HTTP 429 OR HTTP 503 from Google AI Studio
  const isQuota = status === 429 ||
    (status === 503 && (fullText.includes('quota') || fullText.includes('resource_exhausted'))) ||
    fullText.includes('quota') ||
    fullText.includes('resource_exhausted') ||
    fullText.includes('free tier') ||
    fullText.includes('billing') ||
    fullText.includes('queries per minute') ||
    fullText.includes('tokens per minute');

  if (isQuota) {
    const httpCode = (status === 503 || status === 429) ? status : 503;
    logErrorDiagnostics({
      type: 'Quota Limit Exceeded',
      status: `HTTP ${httpCode} (RESOURCE_EXHAUSTED)`,
      code: 'GEMINI_QUOTA_EXCEEDED',
      reason: 'Your Gemini API Key has exhausted its free-tier or per-minute rate quota.',
      action: 'Wait ~60 seconds for the token window to reset, or replace GEMINI_API_KEY in .env.',
      rawError: err
    });

    return res.status(httpCode).json({
      success: false,
      code: 'GEMINI_QUOTA_EXCEEDED',
      errorType: 'QUOTA_EXCEEDED',
      httpStatus: httpCode,
      error: 'Gemini API quota/token limit exceeded for this API key. Please wait 60s or replace GEMINI_API_KEY in .env.',
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
      timings
    });
  }

  // 2. MODEL OVERLOADED / HIGH DEMAND (HTTP 503 without quota)
  if (status === 503 || fullText.includes('high demand') || fullText.includes('overloaded') || fullText.includes('unavailable')) {
    logErrorDiagnostics({
      type: '503 Service Overloaded',
      status: 'HTTP 503 Service Unavailable',
      code: 'GEMINI_SERVICE_UNAVAILABLE',
      reason: `Google's ${modelName} model is temporarily experiencing heavy global traffic.`,
      action: 'Retry your scan in a few moments; traffic surges usually clear quickly.',
      rawError: err
    });

    return res.status(503).json({
      success: false,
      code: 'GEMINI_SERVICE_UNAVAILABLE',
      errorType: 'SERVICE_OVERLOADED',
      httpStatus: 503,
      error: 'The Gemini vision model is experiencing high demand. Please retry in a few seconds.',
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
      timings
    });
  }

  // 3. INVALID API KEY / PERMISSION (HTTP 401 / 403)
  if (status === 401 || status === 403 || fullText.includes('api_key') || fullText.includes('unauthorized') || fullText.includes('permission_denied') || fullText.includes('api key not valid')) {
    logErrorDiagnostics({
      type: 'Invalid API Key',
      status: `HTTP ${status || 401} Unauthorized`,
      code: 'GEMINI_KEY_INVALID',
      reason: 'GEMINI_API_KEY is missing, invalid, or lacks vision model permissions.',
      action: 'Verify your GEMINI_API_KEY in .env against https://aistudio.google.com/.',
      rawError: err
    });

    return res.status(500).json({
      success: false,
      code: 'GEMINI_KEY_INVALID',
      errorType: 'AUTHENTICATION_ERROR',
      httpStatus: 500,
      error: 'Gemini API key is invalid or lacks access. Check GEMINI_API_KEY in .env.',
      timings
    });
  }

  // 4. RATE LIMITED (429 standard)
  if (status === 429 || fullText.includes('rate limit')) {
    logErrorDiagnostics({
      type: 'Rate Limited',
      status: 'HTTP 429 Too Many Requests',
      code: 'GEMINI_RATE_LIMITED',
      reason: 'Too many requests sent in a short interval.',
      action: 'Wait a moment before submitting your next scan.',
      rawError: err
    });

    return res.status(429).json({
      success: false,
      code: 'GEMINI_RATE_LIMITED',
      errorType: 'RATE_LIMITED',
      httpStatus: 429,
      error: 'Too many requests right now — please wait a moment and try again.',
      timings
    });
  }

  // 5. TIMEOUT (HTTP 504)
  if (status === 504 || fullText.includes('abort') || fullText.includes('timed out') || fullText.includes('timeout')) {
    logErrorDiagnostics({
      type: 'Gateway Timeout',
      status: 'HTTP 504 Gateway Timeout',
      code: 'GEMINI_TIMEOUT',
      reason: 'Gemini Vision API call exceeded processing deadline.',
      action: 'Try again or check network connectivity.',
      rawError: err
    });

    return res.status(504).json({
      success: false,
      code: 'GEMINI_TIMEOUT',
      errorType: 'TIMEOUT_ERROR',
      httpStatus: 504,
      error: 'Gemini analysis timed out. Please try again.',
      timings
    });
  }

  // 6. MODEL UNAVAILABLE (HTTP 404 / 500)
  if (status === 404 || fullText.includes('not found') || fullText.includes('is not available') || fullText.includes('unsupported model')) {
    logErrorDiagnostics({
      type: 'Model Unavailable',
      status: `HTTP ${status || 404}`,
      code: 'GEMINI_MODEL_UNAVAILABLE',
      reason: `Configured model "${modelName}" is not available on this tier.`,
      action: 'Check GEMINI_MODEL in server.js or switch to a supported model.',
      rawError: err
    });

    return res.status(500).json({
      success: false,
      code: 'GEMINI_MODEL_UNAVAILABLE',
      errorType: 'MODEL_ERROR',
      httpStatus: 500,
      error: `Configured model "${modelName}" is not available.`,
      timings
    });
  }

  // 7. UNKNOWN ERROR
  logErrorDiagnostics({
    type: 'Unexpected Gemini Error',
    status: `HTTP ${status || 502}`,
    code: 'GEMINI_UNKNOWN_ERROR',
    reason: err.message || 'Unknown upstream exception from Gemini API.',
    action: 'Inspect backend logs or try again.',
    rawError: err
  });

  return res.status(502).json({
    success: false,
    code: 'GEMINI_UNKNOWN_ERROR',
    errorType: 'UNKNOWN_ERROR',
    httpStatus: 502,
    error: 'Gemini could not analyze this image.',
    detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
    timings
  });
}

// =========================================================================
// LAYER B & UNIFIED SUMMARY INTEGRATION
// =========================================================================

/**
 * Call the Python Layer B FastAPI microservice (/analyze) with high-resolution timing
 */
async function callPythonLayerB(imageBuffer, filename = 'image.jpg', mimeType = 'image/jpeg') {
  const start = performance.now();
  try {
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: mimeType });
    formData.append('file', blob, filename);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);

    const res = await fetch(`${PYTHON_LAYER_URL}/analyze`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeout);
    const ms = Number((performance.now() - start).toFixed(1));

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[AI Forensics] ⚠️ Layer B HTTP ${res.status}: ${errText}`);
      return { data: null, ms, status: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { data, ms, status: 'OK' };
  } catch (err) {
    const ms = Number((performance.now() - start).toFixed(1));
    const isConnRefused = err.cause?.code === 'ECONNREFUSED' || err.message?.includes('fetch failed');
    const statusMsg = isConnRefused ? 'OFFLINE (Port 8000)' : 'ERROR';
    return { data: null, ms, status: statusMsg };
  }
}

/**
 * Deterministic fallback for unified verdict if LLM call is unavailable
 */
function buildFallbackUnifiedSummary(layerAData, layerBData) {
  const isAiA = layerAData?.isAi || false;
  const sdxlScore = layerBData?.sdxlClassifier?.aiProbability ?? null;
  const liveness = layerBData?.liveness?.verdict;
  const docDecision = layerBData?.documentForensics?.decision;
  const docRisk = layerBData?.documentForensics?.riskScore ?? 0;

  let verdict = 'AUTHENTIC';
  let riskLevel = 'LOW';
  let primaryThreatType = 'NONE';
  let recommendedAction = 'APPROVE';
  const anomalies = [];

  if (sdxlScore !== null && sdxlScore >= 0.7 && isAiA) {
    verdict = 'SUSPECTED AI GENERATION';
    riskLevel = 'CRITICAL';
    primaryThreatType = 'AI_SYNTHESIS';
    recommendedAction = 'REJECT';
    anomalies.push(`Deep learning SDXL diffusion score is high (${Math.round(sdxlScore * 100)}%) and corroborated by vision semantics.`);
  } else if (liveness === 'SPOOF_SUSPECTED') {
    verdict = 'SCREEN RECAPTURE / PRESENTATION ATTACK';
    riskLevel = 'HIGH';
    primaryThreatType = 'RECAPTURE_SPOOF';
    recommendedAction = 'MANUAL_REVIEW';
    anomalies.push('Liveness analysis detected presentation attack / periodic screen moiré pattern.');
  } else if (docDecision === 'REVIEW' || docRisk > 40) {
    verdict = 'SUSPECTED DOCUMENT TAMPERING';
    riskLevel = docRisk > 60 ? 'HIGH' : 'MEDIUM';
    primaryThreatType = 'MANUAL_TAMPERING';
    recommendedAction = 'MANUAL_REVIEW';
    anomalies.push(`Document forensics flagged manipulation (Risk Score: ${docRisk}).`);
  } else if (isAiA) {
    verdict = 'SUSPECTED AI GENERATION';
    riskLevel = 'MEDIUM';
    primaryThreatType = 'AI_SYNTHESIS';
    recommendedAction = 'MANUAL_REVIEW';
    anomalies.push('Vision model identified generative inconsistencies.');
  }

  // aiProbability = actual probability of AI generation (0-100)
  // overallConfidence = how confident we are in the verdict (0-100)
  const aiProb = layerAData?.isAi
    ? Math.round(layerAData?.confidence || 75)
    : Math.round(100 - (layerAData?.confidence || 75));

  return {
    verdict,
    aiProbability: Math.max(0, Math.min(100, aiProb)),
    overallConfidence: Math.round(layerAData?.confidence || 75),
    riskLevel,
    primaryThreatType,
    executiveSummary: `Multi-layer correlation performed. Assessed status is ${verdict} with ${riskLevel} risk level.`,
    detectedAnomalies: anomalies.length > 0 ? anomalies : ['No critical anomalies detected.'],
    layerCorrelations: `Layer A scored ${layerAData?.confidence ?? 0}% suspicion. Layer B signals evaluated for neural classification, liveness, and document integrity.`,
    recommendedAction
  };
}

/**
 * Generate Chief Forensics Analyst unified verdict using Gemini
 */
async function generateUnifiedSummary(layerAData, layerBData, aiInstance) {
  const start = performance.now();
  if (!aiInstance) {
    const summary = buildFallbackUnifiedSummary(layerAData, layerBData);
    const ms = Number((performance.now() - start).toFixed(1));
    return { summary, ms, type: 'Deterministic Fallback' };
  }

  const systemPrompt = `You are an expert Chief Digital Forensics & Document Authentication Analyst.
You will be given forensic analysis results for an uploaded image from two distinct scanning layers:
1. LAYER A (Semantic & Multimodal LLM Vision Analysis + Sharp Heuristics):
   - Semantic anomalies (unnatural anatomy, hallucinated text, lighting/shadow physics)
   - Visible AI watermarks (DALL-E, Midjourney, SynthID, etc.)
   - Pixel-level Error Level Analysis (ELA) and Noise Variance.
2. LAYER B (Deep-Learning Neural & Signal Forensics):
   - PyTorch SDXL Diffusion Classifier Score
   - Hardware Recapture & Moiré Pattern Liveness (detecting photos of screens or printed photos)
   - ID Document Forgery & Splicing Detection (tampered text, face swapping, clone stamping)
---
### INSTRUCTIONS:
1. Cross-correlate findings between both layers:
   - If Layer B's SDXL classifier shows high AI probability AND Layer A's Gemini vision spotted visual/semantic anomalies, flag with HIGH CONFIDENCE AI generation.
   - If Layer B flags Moiré / Screen Recapture, note that the image may be a genuine document re-photographed from a monitor or print (presentation attack).
   - If Layer B flags Document Forgery (ELA / Noise / Copy-Move) but Layer A did not spot AI generation, this may be a classical manual splice / Photoshop forgery.
2. Synthesize a unified forensic assessment into a single coherent verdict.`;

  const userPrompt = `### INPUT DATA:
Layer A (Node.js & Gemini Output):
${JSON.stringify(layerAData, null, 2)}

Layer B (Python Deep CV & Liveness Output):
${JSON.stringify(layerBData, null, 2)}

Cross-correlate both layers and return the unified verdict.`;

  try {
    const response = await aiInstance.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verdict: {
              type: Type.STRING,
              description: 'One of: AUTHENTIC, SUSPECTED AI GENERATION, SUSPECTED DOCUMENT TAMPERING, SCREEN RECAPTURE / PRESENTATION ATTACK, INCONCLUSIVE'
            },
            aiProbability: {
              type: Type.NUMBER,
              description: 'Probability from 0 to 100 that this image is AI-generated or synthetically produced. 0 = certainly genuine, 100 = certainly AI. This is NOT confidence in the verdict; it is the likelihood of AI generation specifically.'
            },
            overallConfidence: {
              type: Type.NUMBER,
              description: 'How confident you are in your verdict, from 0 to 100. This is NOT the AI probability.'
            },
            riskLevel: {
              type: Type.STRING,
              description: 'Risk severity: LOW, MEDIUM, HIGH, or CRITICAL'
            },
            primaryThreatType: {
              type: Type.STRING,
              description: 'Primary identified threat: AI_SYNTHESIS, MANUAL_TAMPERING, RECAPTURE_SPOOF, or NONE'
            },
            executiveSummary: {
              type: Type.STRING,
              description: 'Clear, authoritative executive forensic summary'
            },
            detectedAnomalies: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Array of detected anomalies'
            },
            layerCorrelations: {
              type: Type.STRING,
              description: 'Synthesis of how Layer A and Layer B corroborate or contradict each other'
            },
            recommendedAction: {
              type: Type.STRING,
              description: 'One of: APPROVE, MANUAL_REVIEW, REJECT'
            }
          },
          required: [
            'verdict',
            'aiProbability',
            'overallConfidence',
            'riskLevel',
            'primaryThreatType',
            'executiveSummary',
            'detectedAnomalies',
            'layerCorrelations',
            'recommendedAction'
          ]
        }
      }
    });

    let responseText = typeof response.text === 'function' ? response.text() : response.text;
    if (!responseText) {
      responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    }
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const summary = JSON.parse(responseText);
    const ms = Number((performance.now() - start).toFixed(1));
    return { summary, ms, type: 'Gemini LLM' };
  } catch (err) {
    console.warn('[AI Forensics] ⚠️ Unified Summary LLM Fallback:', err.message);
    const summary = buildFallbackUnifiedSummary(layerAData, layerBData);
    const ms = Number((performance.now() - start).toFixed(1));
    return { summary, ms, type: 'Deterministic Fallback' };
  }
}

// =========================================================================
// API ENDPOINTS
// =========================================================================

// 1. GET /health
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    pythonLayerUrl: PYTHON_LAYER_URL,
    imageStoreSize: images.size
  });
});

// =========================================================================
// FRAUD RELATIONSHIP GRAPH ENDPOINTS (ENGINE 8)
// =========================================================================
const SIH_DATA_DIR = path.resolve(__dirname, '../sih26188-project/backend/data');

function loadSihJson(filename) {
  try {
    const filePath = path.join(SIH_DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.warn(`[Graph Data] Failed to load ${filename}:`, err.message);
  }
  return null;
}

// 1.1 GET /api/v1/graph/elements
app.get('/api/v1/graph/elements', (req, res) => {
  const elements = loadSihJson('fraud_graph_cytoscape.json') || loadSihJson('graph_cytoscape.json') || { nodes: [], edges: [] };
  const clusters = loadSihJson('fraud_graph_report.json') || [];

  const clusterMemberMap = new Map();
  for (const c of clusters) {
    for (const pid of c.person_ids || []) {
      clusterMemberMap.set(pid, c);
    }
  }

  const nodes = (elements.nodes || []).map(n => {
    const id = n.data?.id;
    const cluster = clusterMemberMap.get(id);
    const inRing = Boolean(n.data?.ring || cluster);
    return {
      data: {
        ...n.data,
        in_fraud_cluster: inRing,
        cluster_id: cluster?.cluster_id || (n.data?.ring ? 'CLUSTER' : null),
        cluster_severity: cluster?.risk_level || (inRing ? 'HIGH' : null),
        inferred_type: cluster?.inferred_type || null
      }
    };
  });

  const edges = (elements.edges || []).map(e => {
    const isSuspicious = e.data?.label && e.data.label !== 'SUBMITTED';
    return {
      data: {
        ...e.data,
        suspicious: isSuspicious
      }
    };
  });

  res.json({ nodes, edges });
});

// 1.2 GET /api/v1/graph/clusters
app.get('/api/v1/graph/clusters', (req, res) => {
  const clusters = loadSihJson('fraud_graph_report.json') || loadSihJson('graph_clusters.json') || [];
  res.json(clusters);
});

// 1.3 GET /api/v1/graph/person/:personId
app.get('/api/v1/graph/person/:personId', (req, res) => {
  const { personId } = req.params;
  const persons = loadSihJson('fraud_graph_persons.json') || loadSihJson('persons.json') || [];
  const documents = loadSihJson('fraud_graph_documents.json') || loadSihJson('documents.json') || [];
  const clusters = loadSihJson('fraud_graph_report.json') || loadSihJson('graph_clusters.json') || [];
  const consistency = loadSihJson('consistency_report.json') || [];

  const person = persons.find(p => p.person_id === personId || p.id === personId);
  if (!person) {
    return res.status(404).json({ success: false, error: `Person ${personId} not found.` });
  }

  const personDocs = documents.filter(d => d.person_id === personId);
  const cluster = clusters.find(c => (c.person_ids || []).includes(personId));
  const consistencyReport = consistency.find(r => r.person_id === personId);

  res.json({
    success: true,
    person,
    documents: personDocs,
    cluster: cluster || null,
    in_fraud_cluster: Boolean(cluster),
    findings: consistencyReport ? consistencyReport.findings : []
  });
});

// 1.4 GET /api/v1/graph/search
app.get('/api/v1/graph/search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) {
    return res.json({ success: true, results: [] });
  }
  const persons = loadSihJson('fraud_graph_persons.json') || loadSihJson('persons.json') || [];
  const matches = persons.filter(p => {
    const name = (p.name || p.canonical_name_en || '').toLowerCase();
    const id = (p.person_id || p.id || '').toLowerCase();
    return name.includes(q) || id.includes(q);
  }).slice(0, 10);

  res.json({ success: true, query: q, results: matches });
});

// 1.5 GET /api/v1/graph/summary
app.get('/api/v1/graph/summary', (req, res) => {
  const elements = loadSihJson('fraud_graph_cytoscape.json') || { nodes: [], edges: [] };
  const clusters = loadSihJson('fraud_graph_report.json') || [];

  const personNodes = (elements.nodes || []).filter(n => n.data?.type === 'person');
  const documentNodes = (elements.nodes || []).filter(n => n.data?.type === 'document');
  const suspiciousEdges = (elements.edges || []).filter(e => e.data?.label !== 'SUBMITTED');

  res.json({
    success: true,
    totalPersons: personNodes.length,
    totalDocuments: documentNodes.length,
    totalEdges: (elements.edges || []).length,
    suspiciousLinks: suspiciousEdges.length,
    fraudRingsCount: clusters.length,
    clusters
  });
});

// 2. POST /api/v1/upload
app.post('/api/v1/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded under form field "file".'
      });
    }

    const imageId = crypto.randomUUID();
    const mimeType = req.file.mimetype.toLowerCase();
    const subtype = mimeType.split('/')[1] || 'JPEG';

    storeImage(imageId, {
      buffer: req.file.buffer,
      mimeType,
      filename: req.file.originalname || `upload_${imageId}.${subtype}`,
      uploadedAt: Date.now()
    });

    const sizeKb = (req.file.size / 1024).toFixed(1);
    const sizeMb = (req.file.size / (1024 * 1024)).toFixed(1);

    console.log(`[AI Forensics] 📥 Upload received: "${req.file.originalname}" (${sizeKb} KB) -> ID: ${imageId.slice(0, 8)}...`);

    return res.status(200).json({
      success: true,
      imageId,
      url: `/media/${imageId}`,
      filename: req.file.originalname || `upload_${imageId}`,
      filesize: `${sizeMb} MB`,
      format: subtype.toUpperCase()
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Image upload failed.'
    });
  }
});

// 3. GET /media/:imageId
app.get('/media/:imageId', (req, res) => {
  const { imageId } = req.params;

  if (!UUID_REGEX.test(imageId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid image ID format.'
    });
  }

  const imageItem = images.get(imageId);

  if (!imageItem) {
    return res.status(404).json({
      success: false,
      error: 'Media not found or expired.'
    });
  }

  res.type(imageItem.mimeType).send(imageItem.buffer);
});

// 4. POST /api/v1/detect
app.post('/api/v1/detect', async (req, res) => {
  const reqStart = performance.now();
  const { imageId, mode = 'deep_scan', sensitivity = 85 } = req.body || {};

  // Validate imageId format
  if (!imageId || !UUID_REGEX.test(imageId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or missing imageId.'
    });
  }

  if (!images.has(imageId)) {
    return res.status(404).json({
      success: false,
      error: 'Image expired. Please upload it again.'
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    logErrorDiagnostics({
      type: 'Missing API Key',
      status: 'HTTP 503 Service Unavailable',
      code: 'GEMINI_KEY_MISSING',
      reason: 'GEMINI_API_KEY environment variable is not defined.',
      action: 'Add GEMINI_API_KEY to .env in project root and restart backend.'
    });
    return res.status(503).json({
      success: false,
      code: 'GEMINI_KEY_MISSING',
      error: 'Gemini API key missing'
    });
  }

  const imageRecord = images.get(imageId);
  const imageSizeKb = (imageRecord.buffer.length / 1024).toFixed(1);
  console.log(`\n[AI Forensics] 🚀 Starting Multi-Signal Scan | Img: "${imageRecord.filename}" (${imageSizeKb} KB) | Mode: ${mode}`);

  // 1. Preprocess image once for Gemini (shared preprocessing)
  let preprocessedBuffer;
  const tPrepStart = performance.now();
  try {
    preprocessedBuffer = await sharp(imageRecord.buffer)
      .rotate()
      .resize({
        width: 1536,
        height: 1536,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (preprocessErr) {
    console.error('[Image Preprocess Error]:', preprocessErr);
    return res.status(500).json({
      success: false,
      code: 'PREPROCESS_ERROR',
      error: 'Failed to preprocess image.',
      detail: process.env.NODE_ENV === 'production' ? undefined : preprocessErr.message
    });
  }
  const preprocessMs = Number((performance.now() - tPrepStart).toFixed(1));

  // 2. Run local forensics, Gemini analysis, and Layer B in parallel
  let localResults, geminiData, layerBResult;
  let localForensicsMs = 0;
  let geminiVisionMs = 0;

  // Local forensics (sharp-based, no external API)
  const tLocalStart = performance.now();
  const localForensicsPromise = runLocalForensics(imageRecord.buffer, imageRecord.mimeType)
    .then(res => {
      localForensicsMs = Number((performance.now() - tLocalStart).toFixed(1));
      return res;
    })
    .catch(localErr => {
      localForensicsMs = Number((performance.now() - tLocalStart).toFixed(1));
      console.error('[Local Forensics Error]:', localErr);
      return null;
    });

  // Layer B deep learning forensics (Python FastAPI)
  const layerBPromise = callPythonLayerB(imageRecord.buffer, imageRecord.filename, imageRecord.mimeType)
    .catch(() => ({ data: null, ms: 0, status: 'ERROR' }));

  // Gemini analysis
  const tGeminiStart = performance.now();
  const geminiPromise = (async () => {
    const base64Image = preprocessedBuffer.toString('base64');
    const ai = genaiInstance;

    const instructionText = `Critically inspect this image for evidence of AI generation (e.g., Midjourney, DALL-E, Stable Diffusion). Focus on common AI failure points: extra/missing fingers, merged joints, asymmetrical teeth, mismatched eye reflections, gibberish text, and structurally impossible background geometry.
Crucially, look for any visible AI-platform watermarks or logos. If a visible watermark is present, 'visibleWatermarkDetected' must be true and 'aiProbability' must be at least 85.
Do not assume the image is AI-generated; most are authentic unless obvious generative artifacts exist.
Provide an honest 'aiProbability' (0-100). Provide a brief 'explanation' of your reasoning, and if AI-generated, guess the 'modelAttribution'.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image
              }
            },
            {
              text: instructionText
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            aiProbability: { type: Type.NUMBER, description: '0 to 100 likelihood of AI generation' },
            visibleWatermarkDetected: { type: Type.BOOLEAN, description: 'true if an AI watermark or logo is visibly rendered' },
            explanation: { type: Type.STRING, description: 'Brief explanation of your verdict' },
            modelAttribution: { type: Type.STRING, description: 'Predicted AI model if applicable, else unknown' }
          },
          required: ['aiProbability', 'visibleWatermarkDetected', 'explanation', 'modelAttribution']
        }
      }
    });

    geminiVisionMs = Number((performance.now() - tGeminiStart).toFixed(1));

    let responseText = typeof response.text === 'function' ? response.text() : response.text;
    if (!responseText) {
      responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    }
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(responseText);
  })();

  // Await all 3 pipelines in parallel using Promise.allSettled so timings are preserved even on failure
  const [localOutcome, geminiOutcome, layerBOutcome] = await Promise.allSettled([
    localForensicsPromise,
    geminiPromise,
    layerBPromise
  ]);

  localResults = localOutcome.status === 'fulfilled' ? localOutcome.value : null;
  layerBResult = layerBOutcome.status === 'fulfilled' ? layerBOutcome.value : { data: null, ms: 0, status: 'ERROR' };

  if (geminiOutcome.status === 'rejected') {
    const geminiErr = geminiOutcome.reason;
    if (geminiVisionMs === 0) {
      geminiVisionMs = Number((performance.now() - tGeminiStart).toFixed(1));
    }
    const totalMs = Number((performance.now() - reqStart).toFixed(1));
    const partialTimings = {
      totalMs,
      preprocessMs,
      localForensicsMs: localResults?._timings?.totalLocalMs || localForensicsMs,
      localSubTimings: localResults?._timings,
      pythonLayerMs: layerBResult?.ms || 0,
      pythonStatus: layerBResult?.status || 'UNKNOWN',
      geminiVisionMs,
      geminiStatus: 'FAILED'
    };

    // Log the timeline card up to failure point
    logExecutionTimeline({
      imageId,
      imageSizeKb,
      timings: partialTimings,
      status: 'FAILED'
    });

    return handleGeminiError(geminiErr, GEMINI_MODEL, res, partialTimings);
  }

  geminiData = geminiOutcome.value;

  const layerBData = layerBResult?.data || null;
  const pythonLayerMs = layerBResult?.ms || 0;
  const pythonStatus = layerBResult?.status || 'OK';

  // Handle local forensics failure
  if (!localResults) {
    return res.status(500).json({
      success: false,
      code: 'LOCAL_FORENSICS_ERROR',
      error: 'Image processing failed during local forensic analysis.'
    });
  }

  // 3. Combine results
  const rawAiProb = typeof geminiData.aiProbability === 'number' ? geminiData.aiProbability : 50;
  const clampedAiProb = Math.max(0, Math.min(100, rawAiProb));
  const visibleWatermarkDetected = geminiData.visibleWatermarkDetected === true;
  const geminiIsAi = clampedAiProb >= 50 || visibleWatermarkDetected;

  const ensemble = combineForensics(localResults, clampedAiProb / 100, geminiIsAi, visibleWatermarkDetected);
  const isAi = ensemble.score >= 0.5;

  // Prepare Layer A data package for cross-layer correlation
  const layerAData = {
    verdict: isAi ? 'POSSIBLE AI-GENERATED IMAGE' : 'AUTHENTIC IMAGE',
    isAi,
    confidence: Number(clampedAiProb.toFixed(1)),
    visibleWatermarkDetected,
    modelAttribution: geminiData.modelAttribution || 'Unknown / Not Determined',
    geminiExplanation: geminiData.explanation || '',
    ensembleScore: ensemble.score,
    forensicsMetrics: ensemble.metrics,
    localSignals: {
      ela: localResults.ela,
      frequency: localResults.frequency,
      noise: localResults.noise,
      prnu: localResults.prnu,
      cfa_demosaic: localResults.cfa_demosaic,
      jpeg_ghost: localResults.jpeg_ghost,
      synthId: localResults.synthId
    }
  };

  // Generate unified cross-layer verdict via Gemini Chief Analyst prompt
  const unifiedResult = await generateUnifiedSummary(layerAData, layerBData, genaiInstance);
  const unifiedVerdict = unifiedResult.summary;
  const unifiedSummaryMs = unifiedResult.ms;
  const unifiedType = unifiedResult.type;

  const totalMs = Number((performance.now() - reqStart).toFixed(1));
  const timings = {
    totalMs,
    preprocessMs,
    localForensicsMs: localResults._timings?.totalLocalMs || localForensicsMs,
    localSubTimings: localResults._timings,
    pythonLayerMs,
    pythonStatus,
    geminiVisionMs,
    geminiStatus: 'SUCCESS',
    unifiedSummaryMs,
    unifiedType
  };

  // Print formatted visual execution timeline in terminal
  logExecutionTimeline({
    imageId,
    imageSizeKb,
    timings,
    status: isAi ? 'POSSIBLE_AI' : 'AUTHENTIC'
  });

  return res.status(200).json({
    success: true,
    taskId: `scan_${crypto.randomUUID()}`,
    verdict: isAi ? 'POSSIBLE AI-GENERATED IMAGE' : 'AUTHENTIC IMAGE',
    isAi,
    confidence: Number((clampedAiProb).toFixed(1)),
    regions: geminiData.regions || [],
    modelAttribution: geminiData.modelAttribution || 'Unknown / Not Determined',
    synthIdStatus: ensemble.synthIdStatus,
    explanation: {
      gemini: geminiData.explanation || '',
      forensics: ensemble.explanation || ''
    },
    metrics: ensemble.metrics,
    forensicSignals: {
      score: ensemble.score,
      metadata: localResults.metadata,
      ela: localResults.ela,
      frequency: localResults.frequency,
      noise: localResults.noise,
      synthId: localResults.synthId,
      prnu: localResults.prnu,
      jpeg_ghost: localResults.jpeg_ghost,
      cfa_demosaic: localResults.cfa_demosaic
    },
    heatmapUrl: `/media/${imageId}`,
    scanMode: mode,
    layerB: layerBData,
    unifiedVerdict,
    timings
  });
});

// 5. Serve the frontend as static files
const frontendDistPath = path.resolve(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use('/', express.static(frontendDistPath));
  // SPA catch-all: serve index.html for any non-API, non-media route
  // This enables client-side routing (e.g., /analyze) to work correctly
  app.get(/^(?!\/api\/)(?!\/media\/)(?!\/health).*/, (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// Global error handler for Multer and other middleware errors (BUG-7)
app.use((err, req, res, _next) => {
  console.error('[Express Error Handler]:', err.message);

  // Multer file-size or file-type errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
    });
  }

  if (err.message && err.message.includes('Unsupported file type')) {
    return res.status(415).json({
      success: false,
      error: err.message
    });
  }

  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error.'
      : err.message || 'Internal server error.'
  });
});

const server = app.listen(PORT, () => {
  console.log(`[AI Forensics Backend] Server running on port ${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn(`[AI Forensics Backend] WARNING: GEMINI_API_KEY is not set. Forensic detection will fail.`);
  } else {
    console.log(`[AI Forensics Backend] Gemini configured successfully.`);
  }
});

// Disable socket & HTTP request timeouts so deep forensic scans run until completed
server.timeout = 0;
server.keepAliveTimeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;

