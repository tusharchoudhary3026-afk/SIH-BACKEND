"""Create labeled simulated capture-attack variants from watermarked mock IDs.

These are controlled simulations for pipeline validation, not claims that they
replace real camera recapture samples.
"""

import json

import cv2
import numpy as np

from document_image_utils import DATA_DIR, IMAGES_DIR, load_documents


OUT_DIR = DATA_DIR / "images" / "capture_variants"
CASES_PATH = DATA_DIR / "capture_presentation_cases.json"


def screen_recapture(image):
    h, w = image.shape[:2]
    yy, xx = np.mgrid[:h, :w]
    pattern = 9 * np.sin(xx * 0.18) + 7 * np.sin(yy * 0.26)
    result = np.clip(image.astype(np.float32) + pattern[..., None], 0, 255).astype(np.uint8)
    result[::4] = (result[::4] * 0.82).astype(np.uint8)
    return cv2.GaussianBlur(result, (3, 3), 0)


def print_recapture(image, seed):
    rng = np.random.default_rng(seed)
    blurred = cv2.GaussianBlur(image, (3, 3), 0)
    noise = rng.normal(0, 10, image.shape).astype(np.int16)
    result = np.clip(blurred.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    ok, encoded = cv2.imencode(".jpg", result, [cv2.IMWRITE_JPEG_QUALITY, 55])
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR) if ok else result


def main():
    cases = []
    for index, document in enumerate(load_documents()):
        source = IMAGES_DIR / f"{document['document_id']}.png"
        image = cv2.imread(str(source), cv2.IMREAD_COLOR)
        if image is None:
            continue
        variants = {
            "screen_recapture_simulated": screen_recapture(image),
            "print_recapture_simulated": print_recapture(image, index),
        }
        for attack, variant in variants.items():
            folder = OUT_DIR / attack
            folder.mkdir(parents=True, exist_ok=True)
            output = folder / f"{document['document_id']}.png"
            cv2.imwrite(str(output), variant)
            cases.append({
                "case_id": f"CAPTURE-{attack}-{document['document_id']}",
                "document_id": document["document_id"],
                "person_id": document["person_id"],
                "image_path": str(output.relative_to(DATA_DIR.parent)).replace("\\", "/"),
                "expected_label": "RECAPTURE",
                "attack_type": attack,
            })
    with open(CASES_PATH, "w", encoding="utf-8") as target:
        json.dump(cases, target, indent=2)
    print(f"Wrote {len(cases)} labeled simulated capture variants to {OUT_DIR}")


if __name__ == "__main__":
    main()
