"""
Engine 7: AI/GenAI Forgery Detection
Analyzes mock-ID document images for AI-generation artifacts using:
  - a pretrained real-vs-AI image classifier (Organika/sdxl-detector)
  - FFT/DCT frequency-domain artifact signals
  - texture/noise consistency signals
Weighted fusion produces a risk score and CLEAR/REVIEW/AI_FORGERY_SUSPECTED/INCONCLUSIVE decision.

Operates only on backend/data/images/genuine (and, once created, ai_generated/ai_manipulated).
Does NOT use face_demo photos or any Engine 5/6 data.
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
IMAGES_GENUINE_DIR = DATA_DIR / "images" / "genuine"
IMAGES_AI_GENERATED_DIR = DATA_DIR / "images" / "ai_generated"
IMAGES_AI_MANIPULATED_DIR = DATA_DIR / "images" / "ai_manipulated"
DOCUMENTS_PATH = DATA_DIR / "documents.json"
REPORT_PATH = DATA_DIR / "ai_forgery_report.json"
SUPPORTED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg"}

MODEL_NAME = "Organika/sdxl-detector"

WEIGHT_CLASSIFIER = 0.55
WEIGHT_FFT = 0.20
WEIGHT_TEXTURE = 0.15
WEIGHT_NOISE = 0.10

CLEAR_MAX = 35
REVIEW_MAX = 64


def load_documents():
    if not DOCUMENTS_PATH.exists():
        print(f"ERROR: {DOCUMENTS_PATH} not found.")
        sys.exit(1)
    try:
        with open(DOCUMENTS_PATH, "r", encoding="utf-8") as f:
            documents = json.load(f)
    except json.JSONDecodeError as exc:
        print(f"ERROR: invalid JSON in {DOCUMENTS_PATH}: {exc}")
        sys.exit(1)

    if not isinstance(documents, list):
        print(f"ERROR: {DOCUMENTS_PATH} must contain a JSON list.")
        sys.exit(1)

    return documents


def build_cases():
    """
    Build the case list directly from documents.json + images/genuine,
    plus any images present in ai_generated/ and ai_manipulated/ if those
    folders exist and contain files.
    """
    documents = load_documents()
    doc_by_id = {d["document_id"]: d for d in documents}
    cases = []

    if IMAGES_GENUINE_DIR.exists():
        for img_path in sorted(IMAGES_GENUINE_DIR.glob("*")):
            if img_path.suffix.lower() not in SUPPORTED_IMAGE_SUFFIXES:
                continue
            document_id = img_path.stem
            doc = doc_by_id.get(document_id, {})
            cases.append({
                "case_id": f"AI-{document_id}",
                "document_id": document_id,
                "person_id": doc.get("person_id"),
                "image_path": str(img_path.relative_to(BACKEND_DIR)).replace("\\", "/"),
                "source_type": "synthetic_mock_template",
                "expected_label": "GENUINE_MOCK",
            })

    for folder, source_type, expected_label in [
        (IMAGES_AI_GENERATED_DIR, "ai_generated_mock", "AI_GENERATED"),
        (IMAGES_AI_MANIPULATED_DIR, "ai_manipulated_mock", "AI_MANIPULATED"),
    ]:
        if folder.exists():
            for img_path in sorted(folder.glob("*")):
                if img_path.suffix.lower() not in SUPPORTED_IMAGE_SUFFIXES:
                    continue
                document_id = img_path.stem
                cases.append({
                    "case_id": f"AI-{source_type}-{document_id}",
                    "document_id": document_id,
                    "person_id": None,
                    "image_path": str(img_path.relative_to(BACKEND_DIR)).replace("\\", "/"),
                    "source_type": source_type,
                    "expected_label": expected_label,
                })

    return cases


# ---------------------------------------------------------------------------
# Pretrained AI-image classifier
# ---------------------------------------------------------------------------

_classifier = None


def get_classifier():
    global _classifier
    if _classifier is None:
        try:
            from transformers import pipeline
            print(f"Loading classifier model: {MODEL_NAME} ...")
            _classifier = pipeline("image-classification", model=MODEL_NAME)
        except Exception as e:
            print(f"ERROR: Failed to load classifier model: {e}")
            return None
    return _classifier


def ai_image_probability(pil_image):
    """
    Returns probability the image is AI-generated, based on the model's
    label scores. Falls back gracefully if the label names differ from
    what's expected -- retains raw output for transparency.
    """
    classifier = get_classifier()
    if classifier is None:
        return None, {"error": "classifier_unavailable"}

    try:
        results = classifier(pil_image)
    except Exception as e:
        return None, {"error": f"{type(e).__name__}: {e}"}

    ai_labels = {"artificial", "ai", "fake", "synthetic", "ai-generated", "generated"}
    prob = None
    for r in results:
        label = r["label"].strip().lower()
        if label in ai_labels or "artificial" in label or "ai" in label:
            prob = float(r["score"])
            break

    if prob is None and results:
        # Unknown label scheme -- keep raw scores for manual inspection,
        # do not guess which one means "AI".
        prob = None

    return prob, {"raw_output": results}


# ---------------------------------------------------------------------------
# FFT / DCT frequency-domain signals
# ---------------------------------------------------------------------------

def fft_score(gray):
    f = np.fft.fft2(gray)
    fshift = np.fft.fftshift(f)
    magnitude = np.log(np.abs(fshift) + 1e-8)

    h, w = magnitude.shape
    cy, cx = h // 2, w // 2
    radius = min(cy, cx)

    y, x = np.ogrid[:h, :w]
    dist = np.sqrt((y - cy) ** 2 + (x - cx) ** 2)

    high_freq_mask = dist > (radius * 0.6)
    low_freq_mask = dist <= (radius * 0.6)

    high_energy = float(np.mean(magnitude[high_freq_mask])) if high_freq_mask.any() else 0.0
    low_energy = float(np.mean(magnitude[low_freq_mask])) if low_freq_mask.any() else 1e-8

    ratio = high_energy / (low_energy + 1e-8)
    return ratio


def dct_score(gray):
    gray_f = np.float32(gray) / 255.0
    h, w = gray_f.shape
    block = 8
    h_trim = (h // block) * block
    w_trim = (w // block) * block
    gray_f = gray_f[:h_trim, :w_trim]

    high_freq_energies = []
    for y0 in range(0, h_trim, block):
        for x0 in range(0, w_trim, block):
            b = gray_f[y0:y0 + block, x0:x0 + block]
            d = cv2.dct(b)
            high = d[4:, 4:]
            high_freq_energies.append(float(np.mean(np.abs(high))))

    return float(np.mean(high_freq_energies)) if high_freq_energies else 0.0


def normalize_against_baseline(value, baseline_mean, baseline_std):
    if baseline_std <= 1e-8:
        return 0.0
    z = abs(value - baseline_mean) / baseline_std
    return float(min(1.0, z / 3.0))  # z-score of 3 -> fully anomalous


# ---------------------------------------------------------------------------
# Texture / noise signals
# ---------------------------------------------------------------------------

def texture_inconsistency(gray):
    h, w = gray.shape
    regions = [
        gray[0:h // 3, :],
        gray[h // 3:2 * h // 3, :],
        gray[2 * h // 3:, :],
    ]
    variances = [float(np.var(cv2.Laplacian(r, cv2.CV_64F))) for r in regions if r.size > 0]
    if len(variances) < 2:
        return 0.0
    spread = np.std(variances) / (np.mean(variances) + 1e-8)
    return float(min(1.0, spread))


def noise_inconsistency(gray):
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    residual = cv2.absdiff(gray, blurred)
    h, w = residual.shape
    top = residual[:h // 2, :]
    bottom = residual[h // 2:, :]
    top_var = float(np.var(top))
    bottom_var = float(np.var(bottom))
    if max(top_var, bottom_var) < 1e-8:
        return 0.0
    spread = abs(top_var - bottom_var) / (max(top_var, bottom_var) + 1e-8)
    return float(min(1.0, spread))


def compression_status(image_path: Path):
    if image_path.suffix.lower() == ".png":
        return "NOT_APPLICABLE_PNG"
    if image_path.suffix.lower() in (".jpg", ".jpeg"):
        return "JPEG_ANALYSIS_UNSUPPORTED"
    return "UNKNOWN_FORMAT"


def inconclusive_result(case, reason_code, detail=None, compression="UNKNOWN"):
    """Build a schema-consistent result when a single case cannot be processed."""
    result = {
        "case_id": case["case_id"],
        "person_id": case.get("person_id"),
        "document_id": case.get("document_id"),
        "image_path": case.get("image_path"),
        "source_type": case.get("source_type"),
        "expected_label": case.get("expected_label"),
        "model_name": MODEL_NAME,
        "classifier_evidence": None,
        "ai_image_probability": None,
        "fft_artifact_score": None,
        "dct_artifact_score": None,
        "texture_inconsistency_score": None,
        "noise_inconsistency_score": None,
        "compression_status": compression,
        "risk_score": 50,
        "decision": "INCONCLUSIVE",
        "reason_codes": [reason_code],
    }
    if detail:
        result["processing_error"] = detail
    return result


# ---------------------------------------------------------------------------
# Decision logic
# ---------------------------------------------------------------------------

def decide(ai_prob, fft_anomaly, texture_score, noise_score, classifier_failed, unreadable):
    reason_codes = []

    if unreadable:
        return "INCONCLUSIVE", 50, ["IMAGE_UNREADABLE"]

    if classifier_failed or ai_prob is None:
        reason_codes.append("CLASSIFIER_OUTPUT_MISSING")
        ai_prob_for_fusion = 0.0
    else:
        ai_prob_for_fusion = ai_prob
        if ai_prob >= 0.5:
            reason_codes.append("HIGH_AI_CLASSIFIER_PROBABILITY")
        else:
            reason_codes.append("LOW_AI_CLASSIFIER_PROBABILITY")

    if fft_anomaly >= 0.5:
        reason_codes.append("FFT_FREQUENCY_ANOMALY")
    if texture_score >= 0.5:
        reason_codes.append("TEXTURE_INCONSISTENCY")
    if noise_score >= 0.5:
        reason_codes.append("NOISE_PROFILE_ANOMALY")

    risk = (
        WEIGHT_CLASSIFIER * ai_prob_for_fusion
        + WEIGHT_FFT * fft_anomaly
        + WEIGHT_TEXTURE * texture_score
        + WEIGHT_NOISE * noise_score
    ) * 100
    risk = round(risk, 1)

    if classifier_failed or ai_prob is None:
        return "INCONCLUSIVE", risk, reason_codes

    if risk < CLEAR_MAX:
        decision = "CLEAR"
    elif risk < REVIEW_MAX:
        decision = "REVIEW"
    else:
        decision = "AI_FORGERY_SUSPECTED"

    return decision, risk, reason_codes


# ---------------------------------------------------------------------------
# Main run
# ---------------------------------------------------------------------------

def compute_baseline(cases):
    """
    Computes baseline mean/std for FFT and DCT scores across all
    synthetic_mock_template cases, so anomaly scores are relative,
    not absolute.
    """
    fft_values = []
    dct_values = []

    for case in cases:
        if case["source_type"] != "synthetic_mock_template":
            continue
        full_path = BACKEND_DIR / case["image_path"]
        img = cv2.imread(str(full_path))
        if img is None or img.size == 0 or min(img.shape[:2]) < 8:
            continue
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        fft_values.append(fft_score(gray))
        dct_values.append(dct_score(gray))

    fft_mean = float(np.mean(fft_values)) if fft_values else 0.0
    fft_std = float(np.std(fft_values)) if fft_values else 1.0
    dct_mean = float(np.mean(dct_values)) if dct_values else 0.0
    dct_std = float(np.std(dct_values)) if dct_values else 1.0

    return {
        "fft_mean": fft_mean, "fft_std": fft_std,
        "dct_mean": dct_mean, "dct_std": dct_std,
    }


def run():
    cases = build_cases()
    if not cases:
        print("No cases found. Check images/genuine and documents.json.")
        sys.exit(1)

    print(f"Found {len(cases)} case(s). Computing baseline from synthetic_mock_template images...")
    baseline = compute_baseline(cases)
    print(f"Baseline: {baseline}")

    results = []

    for case in cases:
        case_id = case["case_id"]
        full_path = BACKEND_DIR / case["image_path"]

        if not full_path.exists():
            results.append(inconclusive_result(case, "IMAGE_NOT_FOUND"))
            continue

        img = cv2.imread(str(full_path))
        if img is None:
            results.append(inconclusive_result(
                case,
                "IMAGE_UNREADABLE",
                compression=compression_status(full_path),
            ))
            continue

        if img.size == 0 or min(img.shape[:2]) < 8:
            results.append(inconclusive_result(
                case,
                "IMAGE_TOO_SMALL",
                compression=compression_status(full_path),
            ))
            continue

        try:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            with Image.open(full_path) as opened_image:
                pil_img = opened_image.convert("RGB")

            ai_prob, classifier_debug = ai_image_probability(pil_img)
            classifier_failed = ai_prob is None

            raw_fft = fft_score(gray)
            raw_dct = dct_score(gray)
            fft_anomaly = normalize_against_baseline(raw_fft, baseline["fft_mean"], baseline["fft_std"])
            dct_anomaly = normalize_against_baseline(raw_dct, baseline["dct_mean"], baseline["dct_std"])
            combined_freq_anomaly = (fft_anomaly + dct_anomaly) / 2

            texture_score = texture_inconsistency(gray)
            noise_score = noise_inconsistency(gray)
            comp_status = compression_status(full_path)

            decision, risk, reason_codes = decide(
                ai_prob, combined_freq_anomaly, texture_score, noise_score,
                classifier_failed, unreadable=False,
            )

            if comp_status == "NOT_APPLICABLE_PNG":
                reason_codes.append("COMPRESSION_NOT_APPLICABLE_PNG")
            elif comp_status == "JPEG_ANALYSIS_UNSUPPORTED":
                reason_codes.append("JPEG_COMPRESSION_ANALYSIS_UNSUPPORTED")

            results.append({
                "case_id": case_id,
                "person_id": case.get("person_id"),
                "document_id": case["document_id"],
                "image_path": case["image_path"],
                "source_type": case["source_type"],
                "expected_label": case.get("expected_label"),
                "model_name": MODEL_NAME,
                "classifier_evidence": classifier_debug,
                "ai_image_probability": None if ai_prob is None else round(ai_prob, 4),
                "fft_artifact_score": round(fft_anomaly, 4),
                "dct_artifact_score": round(dct_anomaly, 4),
                "texture_inconsistency_score": round(texture_score, 4),
                "noise_inconsistency_score": round(noise_score, 4),
                "compression_status": comp_status,
                "risk_score": risk,
                "decision": decision,
                "reason_codes": reason_codes,
            })

            print(f"  {case_id}: {decision} (risk={risk})")
        except Exception as exc:
            results.append(inconclusive_result(
                case,
                "PROCESSING_ERROR",
                detail=f"{type(exc).__name__}: {exc}",
                compression=compression_status(full_path),
            ))
            print(f"  {case_id}: INCONCLUSIVE (processing error)")

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nWrote {len(results)} result(s) to {REPORT_PATH}")


if __name__ == "__main__":
    run()
