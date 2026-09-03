"""Engine 1 — deterministic mock-document intake, quality, layout, OCR and QR checks."""

import os
import re
import shutil
import sys
from pathlib import Path

import cv2

from document_image_utils import BACKEND_DIR, DATA_DIR, build_cases, classify_mock_document, image_quality, read_image, write_report


REPORT_PATH = DATA_DIR / "document_intelligence_report.json"
DEFAULT_TESSERACT_PATHS = (
    Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
    Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
)


def document_boundary(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 160)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    image_area = image.shape[0] * image.shape[1]
    candidates = [cv2.contourArea(contour) for contour in contours]
    largest = max(candidates, default=0)
    coverage = largest / image_area if image_area else 0.0
    # Rendered source images are already rectified; the full frame is the document.
    return {"status": "FULL_FRAME_SOURCE" if coverage < 0.6 else "DETECTED", "coverage": round(coverage, 4), "perspective_correction_applied": False}


def tesseract_command():
    configured = os.environ.get("TESSERACT_CMD")
    candidates = ([Path(configured)] if configured else []) + list(DEFAULT_TESSERACT_PATHS)
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return shutil.which("tesseract")


def ocr_text(image):
    command = tesseract_command()
    if command is None:
        return None, "OCR_UNAVAILABLE_TESSERACT_NOT_INSTALLED"
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = command
        text = pytesseract.image_to_string(image, lang="eng", config="--psm 6")
        return text, "OCR_COMPLETED"
    except ImportError:
        return None, "OCR_UNAVAILABLE_PYTESSERACT_NOT_INSTALLED"
    except Exception as exc:
        return None, f"OCR_FAILED_{type(exc).__name__}"


def extract_fields(text):
    if not text:
        return {}
    dates = re.findall(r"\b\d{4}[-/]\d{2}[-/]\d{2}\b|\b\d{2}[-/]\d{2}[-/]\d{4}\b", text)
    return {"dates": dates[:3], "raw_text": text.strip(), "raw_text_available": True}


def qr_result(image):
    value, points, _ = cv2.QRCodeDetector().detectAndDecode(image)
    if value:
        return {"status": "DECODED", "payload": value}
    return {"status": "NOT_DECODED"}


def run():
    cases = build_cases()
    if not cases:
        print("ERROR: no supported document images found.")
        sys.exit(1)
    results = []
    for case in cases:
        image, error = read_image(case["image_path"])
        if error:
            results.append({**case, "decision": "INCONCLUSIVE", "reason_codes": [error]})
            continue
        detected_type, type_confidence = classify_mock_document(image)
        quality = image_quality(image)
        quality["quality_score"] = round(
            sum((quality["resolution_ok"], quality["brightness_ok"], quality["blur_ok"])) / 3,
            4,
        )
        text, ocr_status = ocr_text(image)
        reasons = []
        if not quality["resolution_ok"]: reasons.append("LOW_RESOLUTION")
        if not quality["blur_ok"]: reasons.append("BLUR_DETECTED")
        if not quality["brightness_ok"]: reasons.append("UNSUITABLE_BRIGHTNESS")
        if ocr_status != "OCR_COMPLETED": reasons.append(ocr_status)
        decision = "READY_FOR_DOWNSTREAM" if not reasons else "INCONCLUSIVE"
        results.append({
            **case,
            "detected_doc_type": detected_type,
            "document_type_confidence": type_confidence,
            "side": "FRONT_OR_SINGLE_PAGE",
            "boundary": document_boundary(image),
            "quality": quality,
            "glare_status": "NOT_EVALUATED_DIRECT_RENDERED_SOURCE",
            "photograph_region": {"status": "TEMPLATE_ANCHORED", "bbox": [30, 90, 190, 290]},
            "signature_region": {"status": "MOCK_TEMPLATE_REGION", "bbox": [30, image.shape[0] - 40, 250, image.shape[0] - 18]},
            "ocr_status": ocr_status,
            "extracted_fields": extract_fields(text),
            "mrz": {"status": "NOT_FOUND"},
            "qr": qr_result(image),
            "decision": decision,
            "reason_codes": reasons,
        })
    write_report(REPORT_PATH, results)
    print(f"Wrote {len(results)} result(s) to {REPORT_PATH}")


if __name__ == "__main__":
    run()
