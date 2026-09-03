"""Engine 3 — deterministic screen/print-recapture artifact analysis.

The available input set contains directly rendered PNGs, not camera captures.
It therefore produces INCONCLUSIVE capture-origin results rather than claiming
that a direct digital file passed presentation-attack checks.
"""

import json
import sys

import cv2
import numpy as np

from document_image_utils import DATA_DIR, IMAGES_DIR, build_cases, read_image, write_report


REPORT_PATH = DATA_DIR / "capture_presentation_report.json"
CASES_PATH = DATA_DIR / "capture_presentation_cases.json"
REFERENCE_DIFFERENCE_THRESHOLD = 0.001


def build_capture_cases():
    genuine = build_cases()
    metadata = {case["document_id"]: case for case in genuine}
    cases = [
        {
            **case,
            "case_id": f"CAPTURE-DIRECT-{case['document_id']}",
            "expected_label": "DIRECT",
            "attack_type": None,
        }
        for case in genuine
    ]
    if not CASES_PATH.exists():
        return cases
    try:
        with open(CASES_PATH, encoding="utf-8") as source:
            variants = json.load(source)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read {CASES_PATH}: {exc}")
        sys.exit(1)
    if not isinstance(variants, list):
        print(f"ERROR: {CASES_PATH} must contain a JSON list.")
        sys.exit(1)
    return cases + [
        {**case, "expected_doc_type": metadata.get(case.get("document_id"), {}).get("expected_doc_type")}
        for case in variants
    ]


def periodic_artifact_score(gray):
    spectrum = np.abs(np.fft.fftshift(np.fft.fft2(gray.astype(np.float32))))
    h, w = spectrum.shape
    centre = spectrum[h // 2 - 8:h // 2 + 9, w // 2 - 8:w // 2 + 9].mean()
    off_centre = spectrum.mean()
    return round(float(min(1.0, off_centre / (centre + 1e-8))), 4)


def line_artifact_score(gray):
    horizontal = float(np.mean(np.abs(np.diff(gray.astype(np.float32), axis=0))))
    vertical = float(np.mean(np.abs(np.diff(gray.astype(np.float32), axis=1))))
    return round(min(1.0, abs(horizontal - vertical) / (max(horizontal, vertical) + 1e-8)), 4)


def reference_difference(image, document_id):
    reference = cv2.imread(
        str(IMAGES_DIR / f"{document_id}.png"),
        cv2.IMREAD_COLOR,
    )
    if reference is None or reference.shape != image.shape:
        return None
    return round(float(np.mean(cv2.absdiff(image, reference))) / 255.0, 6)


def run():
    cases = build_capture_cases()
    if not cases:
        print("ERROR: no supported document images found.")
        sys.exit(1)
    results = []
    for case in cases:
        image, error = read_image(case["image_path"])
        if error:
            results.append({**case, "decision": "INCONCLUSIVE", "risk_score": 50, "reason_codes": [error]})
            continue
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        periodic = periodic_artifact_score(gray)
        line = line_artifact_score(gray)
        difference = reference_difference(image, case["document_id"])
        recapture = difference is not None and difference >= REFERENCE_DIFFERENCE_THRESHOLD
        risk = 75 if recapture else 0
        results.append({
            **case,
            "source_format": "PNG",
            "metadata_status": "NO_CAMERA_EXIF_PROVENANCE",
            "screenshot_artifact_score": periodic,
            "screen_recapture_artifact_score": line,
            "moire_artifact_score": periodic,
            "print_recapture_artifact_score": line,
            "trusted_reference_difference_score": difference,
            "trusted_reference_threshold": REFERENCE_DIFFERENCE_THRESHOLD,
            "capture_origin": "RECAPTURE_SUSPECTED" if recapture else "DIRECT_RENDERED_OR_UNKNOWN",
            "risk_score": risk,
            "decision": "RECAPTURE_SUSPECTED" if recapture else "INCONCLUSIVE",
            "reason_codes": ["TRUSTED_REFERENCE_CAPTURE_DIFFERENCE"] if recapture else ["CAPTURE_PROVENANCE_UNAVAILABLE", "DIRECT_RENDERED_MOCK_INPUT"],
        })
    write_report(REPORT_PATH, results)
    print(f"Wrote {len(results)} result(s) to {REPORT_PATH}")


if __name__ == "__main__":
    run()
