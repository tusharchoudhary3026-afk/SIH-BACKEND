"""Shared, deterministic utilities for Engines 1–3 mock-document analysis."""

import json
import sys
from pathlib import Path

import cv2
import numpy as np


BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
DOCUMENTS_PATH = DATA_DIR / "documents.json"
IMAGES_DIR = DATA_DIR / "images" / "genuine"
IMAGES_ROOT_DIR = DATA_DIR / "images"
SUPPORTED_SUFFIXES = {".png", ".jpg", ".jpeg"}

HEADER_COLOURS_BGR = {
    "AADHAAR": np.array([51, 153, 255]),
    "PAN": np.array([105, 61, 25]),
    "VOTER_ID": np.array([51, 102, 0]),
    "DRIVING_LICENSE": np.array([0, 0, 153]),
    "PASSPORT": np.array([102, 0, 0]),
}


def load_documents():
    try:
        with open(DOCUMENTS_PATH, encoding="utf-8") as source:
            documents = json.load(source)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read {DOCUMENTS_PATH}: {exc}")
        sys.exit(1)

    if not isinstance(documents, list):
        print(f"ERROR: {DOCUMENTS_PATH} must contain a JSON list.")
        sys.exit(1)
    return documents


def build_cases():
    documents = load_documents()
    by_id = {item.get("document_id"): item for item in documents}
    cases = []
    for image_path in sorted(IMAGES_DIR.glob("*")):
        if image_path.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        document_id = image_path.stem
        metadata = by_id.get(document_id, {})
        cases.append({
            "document_id": document_id,
            "person_id": metadata.get("person_id"),
            "expected_doc_type": metadata.get("doc_type"),
            "image_path": str(image_path.relative_to(BACKEND_DIR)).replace("\\", "/"),
        })
    return cases


def read_image(relative_path):
    path = (BACKEND_DIR / relative_path).resolve()
    try:
        path.relative_to(IMAGES_ROOT_DIR.resolve())
    except ValueError:
        return None, "PATH_OUTSIDE_INPUT_DIRECTORY"
    if not path.exists():
        return None, "IMAGE_NOT_FOUND"
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        return None, "IMAGE_UNREADABLE"
    return image, None


def classify_mock_document(image):
    """Classify the rendered mock templates from their fixed top colour band."""
    if image.shape[0] < 15 or image.shape[1] < 15:
        return None, 0.0
    observed = image[8:15, 8:15].mean(axis=(0, 1)).astype(float)
    distances = {
        name: float(np.linalg.norm(observed - colour))
        for name, colour in HEADER_COLOURS_BGR.items()
    }
    doc_type, distance = min(distances.items(), key=lambda item: item[1])
    confidence = max(0.0, min(1.0, 1.0 - distance / 180.0))
    return doc_type, round(confidence, 4)


def image_quality(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape
    brightness = float(np.mean(gray))
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    glare_fraction = float(np.mean(gray >= 245))
    resolution_ok = width >= 640 and height >= 400
    brightness_ok = 35 <= brightness <= 250
    blur_ok = blur >= 35
    glare_ok = glare_fraction <= 0.12
    score = sum((resolution_ok, brightness_ok, blur_ok, glare_ok)) / 4
    return {
        "width": width,
        "height": height,
        "brightness": round(brightness, 2),
        "blur_score": round(blur, 2),
        "glare_fraction": round(glare_fraction, 4),
        "resolution_ok": resolution_ok,
        "brightness_ok": brightness_ok,
        "blur_ok": blur_ok,
        "glare_ok": glare_ok,
        "quality_score": round(score, 4),
    }


def write_report(path, results):
    with open(path, "w", encoding="utf-8") as target:
        json.dump(results, target, indent=2)
