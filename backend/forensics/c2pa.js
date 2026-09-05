import { createC2pa } from 'c2pa-node';

const AI_ASSERTION_REGEX = /synthid|trained_algorithmic_media/i;
const AI_GENERATOR_REGEX = /midjourney|stable\.diffusion|dall|firefly|generative/i;
const SYNTHID_ASSERTION_REGEX = /synthid/i;

let c2paInstance = null;
async function getC2paInstance() {
  if (!c2paInstance) {
    c2paInstance = await createC2pa();
  }
  return c2paInstance;
}

export async function analyzeC2pa(buffer, mimeType) {
  try {
    const c2pa = await getC2paInstance();
    const result = await c2pa.read({ buffer, mimeType });

    if (!result || !result.manifests || Object.keys(result.manifests).length === 0) {
      return {
        aiLikelihood: 0,
        synthIdStatus: 'NOT_DETECTED',
        evidence: {
          status: 'NO_MANIFEST'
        }
      };
    }

    const manifests = result.manifests;
    const activeManifest = result.active_manifest || Object.values(manifests)[0];

    if (!activeManifest) {
      return {
        aiLikelihood: 0,
        synthIdStatus: 'NOT_DETECTED',
        evidence: {
          status: 'NO_MANIFEST'
        }
      };
    }

    const assertions = activeManifest.assertions || [];
    let hasAiAssertion = false;
    let hasSynthIdAssertion = false;

    for (const assertion of assertions) {
      const combined = `${assertion.label || ''} ${JSON.stringify(assertion.data || {})}`;
      if (AI_ASSERTION_REGEX.test(combined)) {
        hasAiAssertion = true;
      }
      if (SYNTHID_ASSERTION_REGEX.test(combined)) {
        hasSynthIdAssertion = true;
      }
    }

    const claimGenerator = activeManifest.claim_generator || '';
    const hasAiClaimGenerator = AI_GENERATOR_REGEX.test(claimGenerator);
    const hasAiClaim = hasAiAssertion || hasAiClaimGenerator;

    const aiLikelihood = hasAiClaim ? 1 : 0.15;
    const synthIdStatus = hasSynthIdAssertion ? 'PRESENT' : 'NOT_DETECTED';

    return {
      aiLikelihood,
      synthIdStatus,
      evidence: {
        status: 'MANIFEST_PRESENT',
        claimGenerator,
        title: activeManifest.title,
        format: activeManifest.format,
        hasAiClaim,
        assertionsCount: assertions.length
      }
    };
  } catch (err) {
    return {
      aiLikelihood: 0,
      synthIdStatus: 'NOT_DETECTED',
      evidence: {
        status: 'UNREADABLE',
        error: err.message
      }
    };
  }
}
