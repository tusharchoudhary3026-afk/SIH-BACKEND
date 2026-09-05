import sharp from 'sharp';
import { GoogleAuth } from 'google-auth-library';
import { analyzeC2pa } from './c2pa.js';

let authClient = null;
function getGoogleAuth() {
  if (!authClient) {
    authClient = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
  }
  return authClient;
}

export async function verifyPixelWatermark(buffer, mimeType) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_PROJECT || process.env.GCLOUD_PROJECT;
  const isConfigured = Boolean(projectId);

  if (!isConfigured) {
    return {
      status: 'INCONCLUSIVE',
      configured: false,
      statusDetail: 'UNCONFIGURED'
    };
  }

  try {
    const location = process.env.VERTEX_LOCATION || 'us-central1';
    const model = process.env.SYNTHID_MODEL || 'imageverification@001';
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

    // Ensure format is jpeg, png, or webp
    let imageBuffer = buffer;
    const lowerMime = (mimeType || '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(lowerMime)) {
      imageBuffer = await sharp(buffer).rotate().png().toBuffer();
    }

    const bytesBase64Encoded = imageBuffer.toString('base64');
    const auth = getGoogleAuth();
    const client = await auth.getClient();

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: {
        instances: [
          {
            image: {
              bytesBase64Encoded
            }
          }
        ]
      }
    });

    const prediction = response.data?.predictions?.[0] || {};
    const decision = prediction.decision || prediction.watermarkVerificationResult || '';

    let status = 'INCONCLUSIVE';
    if (decision === 'ACCEPT' || decision === 'DETECTED') {
      status = 'PRESENT';
    } else if (decision === 'REJECT' || decision === 'NOT_DETECTED') {
      status = 'NOT_DETECTED';
    }

    return {
      status,
      configured: true,
      decision,
      rawPrediction: prediction
    };
  } catch (err) {
    return {
      status: 'INCONCLUSIVE',
      configured: true,
      statusDetail: 'UNAVAILABLE',
      error: err.message
    };
  }
}

export function combineStatus(pixelStatus, c2paStatus, pixelConfigured) {
  if (pixelStatus === 'PRESENT' || c2paStatus === 'PRESENT') {
    return 'PRESENT';
  }
  if (pixelConfigured && pixelStatus === 'NOT_DETECTED') {
    return 'NOT_DETECTED';
  }
  return 'INCONCLUSIVE';
}

export async function scanSynthId(buffer, mimeType) {
  const [c2pa, pixel] = await Promise.all([
    analyzeC2pa(buffer, mimeType),
    verifyPixelWatermark(buffer, mimeType)
  ]);

  const combined = combineStatus(pixel.status, c2pa.synthIdStatus, pixel.configured);

  let pixelLine = '';
  if (!pixel.configured) {
    pixelLine = 'Pixel Watermark: Inconclusive (Dedicated Vertex AI verification unconfigured or unavailable).';
  } else if (pixel.status === 'PRESENT') {
    pixelLine = 'Pixel Watermark: Detected / Verified SynthID pattern.';
  } else if (pixel.status === 'NOT_DETECTED') {
    pixelLine = 'Pixel Watermark: Not detected in digital sensor stream.';
  } else {
    pixelLine = 'Pixel Watermark: Inconclusive verification response.';
  }

  let c2paLine = '';
  if (c2pa.evidence.status === 'MANIFEST_PRESENT') {
    c2paLine = `C2PA Content Credentials: Valid provenance manifest found (AI Claim: ${c2pa.evidence.hasAiClaim ? 'Yes' : 'No'}).`;
  } else if (c2pa.evidence.status === 'UNREADABLE') {
    c2paLine = 'C2PA Content Credentials: Manifest unreadable or corrupted.';
  } else {
    c2paLine = 'C2PA Content Credentials: No signed C2PA manifest found.';
  }

  let summaryLine = '';
  if (combined === 'PRESENT') {
    summaryLine = 'Overall SynthID / Provenance Status: Cryptographic or generative watermark detected.';
  } else if (combined === 'NOT_DETECTED') {
    summaryLine = 'Overall SynthID / Provenance Status: No SynthID watermark detected via pixel verification.';
  } else {
    summaryLine = 'Overall SynthID / Provenance Status: Inconclusive without authoritative cryptographic verification.';
  }

  const explanation = `${pixelLine} ${c2paLine} ${summaryLine}`;

  return {
    c2pa,
    pixel,
    status: combined,
    explanation
  };
}
