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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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
// HELPER: CLASSIFY GEMINI ERRORS
// =========================================================================
function handleGeminiError(err, modelName, res) {
  console.error('[Gemini API Error]:', err);
  const msg = (err.message || '').toLowerCase();
  const status = err.status || err.statusCode || 0;

  if (status === 401 || status === 403 || msg.includes('api_key') || msg.includes('unauthorized') || msg.includes('permission_denied') || msg.includes('api key not valid')) {
    return res.status(500).json({
      success: false,
      code: 'GEMINI_KEY_INVALID',
      error: 'Gemini API key is missing or invalid.'
    });
  }

  if (status === 429 || msg.includes('quota') || msg.includes('resource_exhausted')) {
    return res.status(429).json({
      success: false,
      code: 'GEMINI_QUOTA_EXCEEDED',
      error: 'Gemini API quota/tokens for this key have been used up.'
    });
  }

  if (msg.includes('rate limit')) {
    return res.status(429).json({
      success: false,
      code: 'GEMINI_RATE_LIMITED',
      error: 'Too many requests right now — please wait and try again.'
    });
  }

  if (msg.includes('abort') || msg.includes('timed out') || msg.includes('timeout')) {
    return res.status(504).json({
      success: false,
      code: 'GEMINI_TIMEOUT',
      error: 'Gemini analysis timed out. Please try again.'
    });
  }

  if (status === 503 || msg.includes('high demand') || msg.includes('unavailable')) {
    return res.status(503).json({
      success: false,
      code: 'GEMINI_SERVICE_UNAVAILABLE',
      error: 'The Gemini model is experiencing unusually high demand. Please try again shortly.'
    });
  }

  if (status === 404 || msg.includes('not found') || msg.includes('is not available') || msg.includes('unsupported model')) {
    return res.status(500).json({
      success: false,
      code: 'GEMINI_MODEL_UNAVAILABLE',
      error: `Configured model "${modelName}" is not available.`
    });
  }

  return res.status(502).json({
    success: false,
    code: 'GEMINI_UNKNOWN_ERROR',
    error: 'Gemini could not analyze this image.',
    detail: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
}

// =========================================================================
// API ENDPOINTS
// =========================================================================

// 1. GET /health
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    imageStoreSize: images.size
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

    const sizeMb = (req.file.size / (1024 * 1024)).toFixed(1);

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
    return res.status(503).json({
      success: false,
      code: 'GEMINI_KEY_MISSING',
      error: 'Gemini API key missing'
    });
  }

  const imageRecord = images.get(imageId);

  // 1. Preprocess image once for Gemini (shared preprocessing)
  let preprocessedBuffer;
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

  // 2. Run local forensics and Gemini analysis in parallel
  let localResults, geminiData;

  // Local forensics (sharp-based, no external API)
  const localForensicsPromise = runLocalForensics(imageRecord.buffer, imageRecord.mimeType)
    .catch(localErr => {
      console.error('[Local Forensics Error]:', localErr);
      return null; // Will handle below
    });

  // Gemini analysis
  const geminiPromise = (async () => {
    const base64Image = preprocessedBuffer.toString('base64');
    console.log('Preprocessed image size for Gemini:', (base64Image.length / 1024).toFixed(1), 'KB');
    const ai = genaiInstance;

    const instructionText = `Critically inspect this image for evidence of AI generation (e.g., Midjourney, DALL-E, Stable Diffusion). Focus on common AI failure points: extra/missing fingers, merged joints, asymmetrical teeth, mismatched eye reflections, gibberish text, and structurally impossible background geometry.
Crucially, look for any visible AI-platform watermarks or logos. If a visible watermark is present, 'visibleWatermarkDetected' must be true and 'aiProbability' must be at least 85.
Do not assume the image is AI-generated; most are authentic unless obvious generative artifacts exist.
Provide an honest 'aiProbability' (0-100). Provide a brief 'explanation' of your reasoning, and if AI-generated, guess the 'modelAttribution'.`;

    try {
      console.time('Gemini API call');
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
      console.timeEnd('Gemini API call');

      let responseText = typeof response.text === 'function' ? response.text() : response.text;
      if (!responseText) {
        responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      }
      responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(responseText);
    } catch (err) {
      throw err;
    }
  })();

  // Await both in parallel
  try {
    [localResults, geminiData] = await Promise.all([localForensicsPromise, geminiPromise]);
  } catch (geminiErr) {
    return handleGeminiError(geminiErr, GEMINI_MODEL, res);
  }

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
    scanMode: mode
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

