"""Engine 2 — deterministic visual-forensics signals for mock document images.

Signals are evidence, not proof of fraud.  Unvalidated QR/security-feature
claims are deliberately reported as unavailable rather than inferred.
"""

import json
import sys

import cv2
import numpy as np

from document_image_utils import DATA_DIR, IMAGES_DIR, build_cases, classify_mock_document, read_image, write_report


REPORT_PATH = DATA_DIR / "document_forensics_report.json"
CASES_PATH = DATA_DIR / "document_forensics_cases.json"
REFERENCE_DIFFERENCE_THRESHOLD = 0.001


def build_forensics_cases():
    genuine_cases = build_cases()
    metadata_by_id = {case["document_id"]: case for case in genuine_cases}
    cases = [
        {**case, "case_id": f"FORENSIC-GENUINE-{case['document_id']}", "expected_label": "GENUINE", "attack_type": None}
        for case in genuine_cases
    ]
    if not CASES_PATH.exists():
        return cases
    try:
        with open(CASES_PATH, encoding="utf-8") as source:
            tampered_cases = json.load(source)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read {CASES_PATH}: {exc}")
        sys.exit(1)
    if not isinstance(tampered_cases, list):
        print(f"ERROR: {CASES_PATH} must contain a JSON list.")
        sys.exit(1)
    for case in tampered_cases:
        original = metadata_by_id.get(case.get("document_id"), {})
        cases.append({**case, "expected_doc_type": original.get("expected_doc_type")})
    return cases


def ela_score(image):
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        return None
    recompressed = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    difference = cv2.absdiff(image, recompressed)
    return round(float(np.mean(difference)) / 255.0, 4)


def noise_score(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    residual = cv2.absdiff(gray, cv2.GaussianBlur(gray, (5, 5), 0))
    h = residual.shape[0]
    upper = float(np.var(residual[:h // 2]))
    lower = float(np.var(residual[h // 2:]))
    return round(abs(upper - lower) / (max(upper, lower) + 1e-8), 4)


def frequency_score(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
    spectrum = np.log1p(np.abs(np.fft.fftshift(np.fft.fft2(gray))))
    h, w = spectrum.shape
    y, x = np.ogrid[:h, :w]
    radius = min(h, w) * 0.25
    high = spectrum[(x - w / 2) ** 2 + (y - h / 2) ** 2 > radius ** 2]
    low = spectrum[(x - w / 2) ** 2 + (y - h / 2) ** 2 <= radius ** 2]
    return round(float(np.mean(high) / (np.mean(low) + 1e-8)), 4)


def copy_move_score(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(nfeatures=400)
    keypoints, descriptors = orb.detectAndCompute(gray, None)
    if descriptors is None or len(keypoints) < 8:
        return 0.0
    matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(descriptors, descriptors)
    suspicious = 0
    for match in matches:
        if match.queryIdx == match.trainIdx:
            continue
        first, second = keypoints[match.queryIdx].pt, keypoints[match.trainIdx].pt
        if np.hypot(first[0] - second[0], first[1] - second[1]) > 35 and match.distance < 25:
            suspicious += 1
    return round(min(1.0, suspicious / 20), 4)


def reference_difference_score(image, document_id):
    """Compare to the trusted original mock template for controlled demo data."""
    reference_path = IMAGES_DIR / f"{document_id}.png"
    reference = cv2.imread(str(reference_path), cv2.IMREAD_COLOR)
    if reference is None or reference.shape != image.shape:
        return None
    return round(float(np.mean(cv2.absdiff(image, reference))) / 255.0, 6)


def run():
    cases = build_forensics_cases()
    if not cases:
        print("ERROR: no supported document images found.")
        sys.exit(1)
    results = []
    for case in cases:
        image, error = read_image(case["image_path"])
        if error:
            results.append({**case, "decision": "INCONCLUSIVE", "risk_score": 50, "reason_codes": [error]})
            continue
        doc_type, template_confidence = classify_mock_document(image)
        ela = ela_score(image)
        noise = noise_score(image)
        frequency = frequency_score(image)
        copy_move = copy_move_score(image)
        reference_difference = reference_difference_score(image, case["document_id"])
        # Conservative heuristic: no single non-validated signal can declare a forgery.
        risk = round(min(100.0, ela * 45 + noise * 25 + copy_move * 25 + max(0.0, frequency - 0.8) * 15), 1)
        reasons = []
        if ela >= 0.12: reasons.append("ELEVATED_RECOMPRESSION_DIFFERENCE")
        if noise >= 0.45: reasons.append("NOISE_PROFILE_INCONSISTENCY")
        if copy_move >= 0.3: reasons.append("POSSIBLE_COPY_MOVE_PATTERN")
        if doc_type != case.get("expected_doc_type"): reasons.append("TEMPLATE_TYPE_MISMATCH")
        if reference_difference is None:
            reasons.append("TRUSTED_REFERENCE_UNAVAILABLE")
        elif reference_difference >= REFERENCE_DIFFERENCE_THRESHOLD:
            reasons.append("TRUSTED_REFERENCE_DIFFERENCE")
            risk = max(risk, 75.0)
        decision = "REVIEW" if risk >= 35 else "CLEAR"
        results.append({
            **case,
            "detected_doc_type": doc_type,
            "template_confidence": template_confidence,
            "ela_recompression_score": ela,
            "noise_inconsistency_score": noise,
            "frequency_artifact_score": frequency,
            "copy_move_score": copy_move,
            "trusted_reference_difference_score": reference_difference,
            "trusted_reference_threshold": REFERENCE_DIFFERENCE_THRESHOLD,
            "splicing_status": "NO_LOCALIZATION_MODEL_CONFIGURED",
            "photo_tampering_status": "NOT_APPLICABLE_PLACEHOLDER_PHOTO",
            "qr_barcode_mrz_validation": "NOT_APPLICABLE_PLACEHOLDER_OR_UNREADABLE_CODE",
            "security_feature_analysis": "ROADMAP_NOT_INFERRED",
            "risk_score": risk,
            "decision": decision,
            "reason_codes": reasons or ["NO_STRONG_VISUAL_ANOMALY"],
        })
    write_report(REPORT_PATH, results)
    print(f"Wrote {len(results)} result(s) to {REPORT_PATH}")


if __name__ == "__main__":
    run()
