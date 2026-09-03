"""Create labeled, visibly watermarked forensic test variants from mock IDs only."""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from document_image_utils import DATA_DIR, IMAGES_DIR, load_documents


OUT_DIR = DATA_DIR / "images" / "tampered"
CASES_PATH = DATA_DIR / "document_forensics_cases.json"
ATTACKS = ("field_edit", "photo_swap", "recompression", "noise_injection")
PHOTO_BOX = (30, 90, 190, 290)


def font(size):
    for candidate in ("arialbd.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def field_edit(image):
    result = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(result)
    draw.rectangle((220, 105, 690, 145), fill=(255, 250, 240))
    draw.text((224, 110), "Name: TAMPERED DEMO", fill=(20, 20, 20), font=font(18))
    return cv2.cvtColor(np.array(result), cv2.COLOR_RGB2BGR)


def photo_swap(image, donor):
    result = image.copy()
    x1, y1, x2, y2 = PHOTO_BOX
    result[y1:y2, x1:x2] = donor[y1:y2, x1:x2]
    return result


def recompression(image):
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 35])
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR) if ok else image


def noise_injection(image, seed):
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, 18, image.shape).astype(np.int16)
    return np.clip(image.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def main():
    documents = load_documents()
    source_paths = [IMAGES_DIR / f"{doc['document_id']}.png" for doc in documents]
    sources = [(doc, path, cv2.imread(str(path))) for doc, path in zip(documents, source_paths) if path.exists()]
    cases = []
    for index, (document, path, image) in enumerate(sources):
        if image is None:
            continue
        donor = next(
            candidate[2]
            for candidate in sources[index + 1:] + sources[:index]
            if candidate[0]["person_id"] != document["person_id"]
        )
        variants = {
            "field_edit": field_edit(image),
            "photo_swap": photo_swap(image, donor),
            "recompression": recompression(image),
            "noise_injection": noise_injection(image, index),
        }
        for attack, variant in variants.items():
            folder = OUT_DIR / attack
            folder.mkdir(parents=True, exist_ok=True)
            output = folder / f"{document['document_id']}.png"
            cv2.imwrite(str(output), variant)
            cases.append({
                "case_id": f"FORENSIC-{attack}-{document['document_id']}",
                "document_id": document["document_id"],
                "person_id": document["person_id"],
                "image_path": str(output.relative_to(DATA_DIR.parent)).replace("\\", "/"),
                "expected_label": "TAMPERED",
                "attack_type": attack,
            })
    with open(CASES_PATH, "w", encoding="utf-8") as target:
        json.dump(cases, target, indent=2)
    print(f"Wrote {len(cases)} labeled mock-ID variants to {OUT_DIR}")


if __name__ == "__main__":
    main()
