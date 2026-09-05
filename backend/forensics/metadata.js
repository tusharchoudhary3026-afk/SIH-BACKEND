import exifr from 'exifr';

const GENERATOR_REGEX = /midjourney|stable\s*diffusion|automatic1111|comfyui|dall[-\s]?e|firefly|adobe\s*firefly|generative\s*fill|flux|leonardo|runway|ideogram|dreamstudio/i;
const PARAMETERS_KEY_REGEX = /(^|[._\s-])parameters($|[._\s-])/i;
const CAMERA_FIELDS_REGEX = /make|model|lens|fnumber|exposure|iso|focallength|datetimeoriginal/i;

export async function analyzeMetadata(buffer) {
  try {
    const rawMeta = await exifr.parse(buffer, {
      tiff: true,
      xmp: true,
      icc: false,
      iptc: true,
      jfif: true
    });

    if (!rawMeta || typeof rawMeta !== 'object' || Object.keys(rawMeta).length === 0) {
      return {
        aiLikelihood: 0.42,
        evidence: {
          status: 'EMPTY_OR_STRIPPED',
          fieldCount: 0,
          cameraFieldsPresent: false,
          generatorMatches: [],
          fields: {}
        }
      };
    }

    const entries = Object.entries(rawMeta);
    const fieldCount = entries.length;
    const generatorMatches = [];
    let hasCameraFields = false;
    const sampledFields = {};

    entries.slice(0, 80).forEach(([key, val]) => {
      // Store serializable representation in sampledFields
      sampledFields[key] = typeof val === 'object' && val !== null ? JSON.stringify(val).slice(0, 100) : String(val).slice(0, 100);
    });

    for (const [key, val] of entries) {
      const keyStr = String(key);
      const valStr = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
      const combined = `${keyStr}: ${valStr}`;

      if (GENERATOR_REGEX.test(combined)) {
        generatorMatches.push(combined.slice(0, 120));
      } else if (PARAMETERS_KEY_REGEX.test(keyStr)) {
        generatorMatches.push(`Stable Diffusion parameters key detected: ${keyStr}`);
      }

      if (CAMERA_FIELDS_REGEX.test(keyStr)) {
        hasCameraFields = true;
      }
    }

    const matchesFound = generatorMatches.length > 0;
    const aiLikelihood = matchesFound ? 0.98 : (hasCameraFields ? 0.12 : 0.42);

    return {
      aiLikelihood,
      evidence: {
        status: 'PRESENT',
        fieldCount,
        cameraFieldsPresent: hasCameraFields,
        generatorMatches,
        fields: sampledFields
      }
    };
  } catch (err) {
    return {
      aiLikelihood: 0.55,
      evidence: {
        status: 'UNREADABLE',
        fieldCount: 0,
        cameraFieldsPresent: false,
        generatorMatches: [],
        fields: {},
        error: err.message
      }
    };
  }
}
