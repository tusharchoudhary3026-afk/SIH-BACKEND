"""
Layer B — Deep-Learning & Signal Forensics Microservice
--------------------------------------------------------
FastAPI service exposing a single POST /analyze endpoint that runs
three forensic engines in parallel on an uploaded image:

1. SDXL Diffusion Classifier  (Organika/sdxl-detector via HuggingFace)
2. Liveness / Moiré / Recapture Detection (frequency + blur + color analysis)
3. Document Forensics (ELA, noise, frequency, copy-move)

Run:  uvicorn main:app --reload --port 8000
"""

import asyncio
import io
import logging
import traceback
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Layer B — Deep CV & Neural Forensics")
LOGGER = logging.getLogger("layer_b")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Thread pool for CPU-bound forensic work
_executor = ThreadPoolExecutor(max_workers=4)

# ---------------------------------------------------------------------------
# 1. SDXL Diffusion Classifier
# ---------------------------------------------------------------------------
MODEL_NAME = "Organika/sdxl-detector"
_classifier = None


def _get_classifier():
    """Lazily load the HuggingFace image-classification pipeline."""
    global _classifier
    if _classifier is None:
        try:
            from transformers import pipeline
            LOGGER.info("Loading classifier model: %s ...", MODEL_NAME)
            _classifier = pipeline("image-classification", model=MODEL_NAME)
            LOGGER.info("Classifier loaded successfully.")
        except Exception as exc:
            LOGGER.error("Failed to load classifier: %s", exc)
            return None
    return _classifier


def _run_sdxl_classifier(pil_img: Image.Image) -> dict:
    """Run the SDXL real-vs-AI classifier and return structured results."""
    classifier = _get_classifier()
    if classifier is None:
        return {
            "aiProbability": None,
            "modelName": MODEL_NAME,
            "rawOutput": [],
            "error": "classifier_unavailable",
        }
    try:
        results = classifier(pil_img)
    except Exception as exc:
        return {
            "aiProbability": None,
            "modelName": MODEL_NAME,
            "rawOutput": [],
            "error": f"{type(exc).__name__}: {exc}",
        }

    ai_labels = {"artificial", "ai", "fake", "synthetic", "ai-generated", "generated"}
    ai_prob = None
    for r in results:
        label = r["label"].strip().lower()
        if label in ai_labels or "artificial" in label or "ai" in label:
            ai_prob = float(r["score"])
            break

    return {
        "aiProbability": round(ai_prob, 4) if ai_prob is not None else None,
        "modelName": MODEL_NAME,
        "rawOutput": results,
    }


# ---------------------------------------------------------------------------
# 2. Liveness / Moiré / Recapture Detection
# ---------------------------------------------------------------------------

def _blur_score(img: Image.Image) -> float:
    gray = np.array(img.convert("L"), dtype=float)
    lap = (
        -4 * gray
        + np.roll(gray, 1, axis=0)
        + np.roll(gray, -1, axis=0)
        + np.roll(gray, 1, axis=1)
        + np.roll(gray, -1, axis=1)
    )
    variance = lap.var()
    return float(min(100, variance / 8))


def _moire_score(img: Image.Image) -> float:
    gray = np.array(img.convert("L"), dtype=float)
    f = np.fft.fft2(gray)
    fshift = np.fft.fftshift(f)
    magnitude = np.abs(fshift)
    h, w = magnitude.shape
    cy, cx = h // 2, w // 2
    yy, xx = np.ogrid[:h, :w]
    dist = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2)
    ring_mask = (dist > min(h, w) * 0.15) & (dist < min(h, w) * 0.4)
    ring_energy = magnitude[ring_mask].mean()
    total_energy = magnitude.mean() + 1e-6
    ratio = ring_energy / total_energy
    return float(min(100, ratio * 12))


def _color_diversity_score(img: Image.Image) -> float:
    small = img.convert("RGB").resize((64, 64))
    arr = np.array(small).reshape(-1, 3)
    unique_colors = len(np.unique(arr, axis=0))
    return float(min(100, unique_colors / 20))


def _run_liveness(pil_img: Image.Image) -> dict:
    sharpness = _blur_score(pil_img)
    moire = _moire_score(pil_img)
    color_div = _color_diversity_score(pil_img)

    liveness_consistency = 0.4 * sharpness + 0.4 * (100 - moire) + 0.2 * color_div
    liveness_consistency = round(min(100, max(0, liveness_consistency)), 1)

    if liveness_consistency >= 70:
        verdict = "LIVE"
    elif liveness_consistency <= 65:
        verdict = "SPOOF_SUSPECTED"
    else:
        verdict = "UNCERTAIN_NEEDS_REVIEW"

    reasons = []
    if sharpness < 40:
        reasons.append(
            f"Low sharpness ({sharpness:.1f}/100) — consistent with a "
            f"recaptured/re-photographed image."
        )
    if moire > 40:
        reasons.append(
            f"Elevated mid-frequency periodicity ({moire:.1f}/100) — "
            f"consistent with screen-recapture moiré pattern."
        )
    if color_div < 30:
        reasons.append(
            f"Compressed color diversity ({color_div:.1f}/100) — "
            f"consistent with print/screen color banding."
        )
    if not reasons:
        reasons.append(
            "No presentation-attack indicators detected across sharpness, "
            "frequency, or color-diversity checks."
        )

    return {
        "verdict": verdict,
        "livenessConsistencyScore": liveness_consistency,
        "signals": {
            "sharpnessScore": round(sharpness, 1),
            "moireScore": round(moire, 1),
            "colorDiversityScore": round(color_div, 1),
        },
        "reasons": reasons,
    }


# ---------------------------------------------------------------------------
# 3. Document Forensics (ELA, noise, frequency, copy-move)
# ---------------------------------------------------------------------------

def _ela_score(image: np.ndarray) -> float:
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        return 0.0
    recompressed = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    difference = cv2.absdiff(image, recompressed)
    return round(float(np.mean(difference)) / 255.0, 4)


def _noise_score(image: np.ndarray) -> float:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    residual = cv2.absdiff(gray, cv2.GaussianBlur(gray, (5, 5), 0))
    h = residual.shape[0]
    upper = float(np.var(residual[: h // 2]))
    lower = float(np.var(residual[h // 2 :]))
    return round(abs(upper - lower) / (max(upper, lower) + 1e-8), 4)


def _frequency_score(image: np.ndarray) -> float:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
    spectrum = np.log1p(np.abs(np.fft.fftshift(np.fft.fft2(gray))))
    h, w = spectrum.shape
    y, x = np.ogrid[:h, :w]
    radius = min(h, w) * 0.25
    high = spectrum[(x - w / 2) ** 2 + (y - h / 2) ** 2 > radius ** 2]
    low = spectrum[(x - w / 2) ** 2 + (y - h / 2) ** 2 <= radius ** 2]
    return round(float(np.mean(high) / (np.mean(low) + 1e-8)), 4)


def _copy_move_score(image: np.ndarray) -> float:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(nfeatures=400)
    keypoints, descriptors = orb.detectAndCompute(gray, None)
    if descriptors is None or len(keypoints) < 8:
        return 0.0
    matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(
        descriptors, descriptors
    )
    suspicious = 0
    for match in matches:
        if match.queryIdx == match.trainIdx:
            continue
        first = keypoints[match.queryIdx].pt
        second = keypoints[match.trainIdx].pt
        if np.hypot(first[0] - second[0], first[1] - second[1]) > 35 and match.distance < 25:
            suspicious += 1
    return round(min(1.0, suspicious / 20), 4)


def _run_document_forensics(cv_image: np.ndarray) -> dict:
    ela = _ela_score(cv_image)
    noise = _noise_score(cv_image)
    frequency = _frequency_score(cv_image)
    copy_move = _copy_move_score(cv_image)

    risk = round(
        min(100.0, ela * 45 + noise * 25 + copy_move * 25 + max(0.0, frequency - 0.8) * 15),
        1,
    )

    reason_codes = []
    if ela >= 0.12:
        reason_codes.append("ELEVATED_RECOMPRESSION_DIFFERENCE")
    if noise >= 0.45:
        reason_codes.append("NOISE_PROFILE_INCONSISTENCY")
    if copy_move >= 0.3:
        reason_codes.append("POSSIBLE_COPY_MOVE_PATTERN")
    if frequency > 1.0:
        reason_codes.append("FREQUENCY_ARTIFACT_ANOMALY")
    if not reason_codes:
        reason_codes.append("NO_STRONG_VISUAL_ANOMALY")

    decision = "REVIEW" if risk >= 35 else "CLEAR"

    return {
        "elaScore": ela,
        "noiseInconsistencyScore": noise,
        "frequencyArtifactScore": frequency,
        "copyMoveScore": copy_move,
        "riskScore": risk,
        "decision": decision,
        "reasonCodes": reason_codes,
    }


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------

@app.get("/")
def health():
    return {"status": "ok", "service": "Layer B — Deep CV & Neural Forensics"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Accept an uploaded image and run all three Layer B engines in parallel.
    Returns structured JSON with sdxlClassifier, liveness, and documentForensics results.
    """
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    # Decode image
    try:
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read uploaded file as an image.")

    # Convert to OpenCV format for document forensics
    cv_image = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    # Resize large images for performance (max 1536px edge)
    max_edge = 1536
    h, w = cv_image.shape[:2]
    if max(h, w) > max_edge:
        scale = max_edge / max(h, w)
        new_w, new_h = int(w * scale), int(h * scale)
        cv_image = cv2.resize(cv_image, (new_w, new_h), interpolation=cv2.INTER_AREA)
        pil_img = pil_img.resize((new_w, new_h), Image.LANCZOS)

    loop = asyncio.get_event_loop()

    # Run all three engines in parallel via thread pool
    sdxl_future = loop.run_in_executor(_executor, _run_sdxl_classifier, pil_img)
    liveness_future = loop.run_in_executor(_executor, _run_liveness, pil_img)
    doc_forensics_future = loop.run_in_executor(_executor, _run_document_forensics, cv_image)

    sdxl_result, liveness_result, doc_forensics_result = await asyncio.gather(
        sdxl_future, liveness_future, doc_forensics_future
    )

    return {
        "sdxlClassifier": sdxl_result,
        "liveness": liveness_result,
        "documentForensics": doc_forensics_result,
    }
