"""
generate_id_images.py
-----------------------
Engine 1/2/3 dataset: renders MOCK Indian ID card images (Aadhaar-style,
PAN-style, Voter-ID-style, Driving-License-style) for every document in
documents.json (the Engine 4 dataset), so the same identities now have
both structured JSON records AND document images to run OCR/forgery/
recapture pipelines on.

Every image is clearly watermarked as a mock/sample document -- these are
NOT real government templates and use placeholder emblems, not official
seals -- so this dataset can never be mistaken for (or misused as) an
actual ID document.

Run:  python3 generate_id_images.py
Output: backend/data/images/genuine/<document_id>.png
"""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUT_DIR = DATA_DIR / "images" / "genuine"
OUT_DIR.mkdir(parents=True, exist_ok=True)

CANVAS_SIZE = {
    "AADHAAR": (1000, 630),
    "PAN": (1000, 630),
    "VOTER_ID": (1000, 630),
    "DRIVING_LICENSE": (1000, 630),
    "PASSPORT": (1000, 700),
}

THEME = {
    "AADHAAR":          {"bg": (255, 250, 240), "band": (255, 153, 51)},
    "PAN":              {"bg": (240, 248, 255), "band": (25, 61, 105)},
    "VOTER_ID":         {"bg": (245, 255, 245), "band": (0, 102, 51)},
    "DRIVING_LICENSE":  {"bg": (255, 255, 240), "band": (153, 0, 0)},
    "PASSPORT":         {"bg": (235, 235, 250), "band": (0, 0, 102)},
}

TITLE = {
    "AADHAAR": "GOVERNMENT OF INDIA -- AADHAAR (MOCK)",
    "PAN": "INCOME TAX DEPARTMENT -- PAN CARD (MOCK)",
    "VOTER_ID": "ELECTION COMMISSION -- VOTER ID (MOCK)",
    "DRIVING_LICENSE": "TRANSPORT DEPT -- DRIVING LICENCE (MOCK)",
    "PASSPORT": "REPUBLIC OF INDIA -- PASSPORT (MOCK)",
}


def load_font(size, bold=False):
    candidates = ["arialbd.ttf", "arial.ttf"] if bold else ["arial.ttf"]
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def load_hindi_font(size):
    # Nirmala UI / Mangal ship with Windows and cover Devanagari; Arial does not.
    for name in ["Nirmala.ttf", "NirmalaUI.ttf", "mangal.ttf", "Mangal.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


FONT_TITLE = load_font(22, bold=True)
FONT_LABEL = load_font(16, bold=True)
FONT_VALUE = load_font(18)
FONT_VALUE_HI = load_hindi_font(18)
FONT_WATERMARK = load_font(46, bold=True)
FONT_SMALL = load_font(13)


def avatar_color_from_face(face_ref: str):
    h = hashlib.md5(face_ref.encode()).hexdigest()
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (100 + r % 120, 100 + g % 120, 100 + b % 120)


def initials_from_name(name: str):
    parts = [p for p in name.split() if p]
    if not parts:
        return "??"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def draw_photo_placeholder(draw: ImageDraw.ImageDraw, box, face_ref, name):
    x0, y0, x1, y1 = box
    color = avatar_color_from_face(face_ref)
    draw.rectangle(box, fill=color, outline=(60, 60, 60), width=2)
    initials = initials_from_name(name)
    bbox = draw.textbbox((0, 0), initials, font=FONT_TITLE)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    draw.text((cx - tw / 2, cy - th / 2 - bbox[1]), initials, fill=(255, 255, 255), font=FONT_TITLE)
    draw.text((x0 + 4, y1 - 18), "PHOTO", fill=(255, 255, 255), font=FONT_SMALL)


def draw_qr_placeholder(draw: ImageDraw.ImageDraw, box):
    x0, y0, x1, y1 = box
    draw.rectangle(box, fill=(255, 255, 255), outline=(0, 0, 0), width=2)
    cell = (x1 - x0) / 8
    import random as _r
    rng = _r.Random(42)
    for i in range(8):
        for j in range(8):
            if rng.random() > 0.5:
                cx0, cy0 = x0 + i * cell, y0 + j * cell
                draw.rectangle([cx0, cy0, cx0 + cell, cy0 + cell], fill=(0, 0, 0))
    draw.text((x0, y1 + 4), "QR (placeholder)", fill=(0, 0, 0), font=FONT_SMALL)


def draw_emblem_placeholder(draw: ImageDraw.ImageDraw, center, radius):
    cx, cy = center
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius],
                 outline=(0, 0, 0), width=2)
    draw.text((cx - radius + 6, cy - 8), "EMBLEM", fill=(0, 0, 0), font=FONT_SMALL)
    draw.text((cx - radius + 2, cy + 6), "(placeholder)", fill=(0, 0, 0), font=FONT_SMALL)


def add_watermark(img: Image.Image):
    overlay = Image.new("RGBA", img.size, (255, 255, 255, 0))
    odraw = ImageDraw.Draw(overlay)
    text = "MOCK / SAMPLE -- SIH 2026 DEMO -- NOT A GOVERNMENT DOCUMENT"
    bbox = odraw.textbbox((0, 0), text, font=FONT_WATERMARK)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    rotated = Image.new("RGBA", (tw + 40, th + 40), (255, 255, 255, 0))
    rdraw = ImageDraw.Draw(rotated)
    rdraw.text((20, 20), text, font=FONT_WATERMARK, fill=(200, 0, 0, 115))
    rotated = rotated.rotate(28, expand=True)
    px = (img.width - rotated.width) // 2
    py = (img.height - rotated.height) // 2
    overlay.paste(rotated, (px, py), rotated)
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def draw_field(draw, xy, label, value, hindi=False):
    x, y = xy
    draw.text((x, y), label, fill=(80, 80, 80), font=FONT_LABEL)
    font = FONT_VALUE_HI if hindi else FONT_VALUE
    draw.text((x, y + 20), str(value), fill=(20, 20, 20), font=font)


def render_document(doc: dict):
    doc_type = doc["doc_type"]
    size = CANVAS_SIZE.get(doc_type, (1000, 630))
    theme = THEME.get(doc_type, {"bg": (255, 255, 255), "band": (50, 50, 50)})

    img = Image.new("RGB", size, theme["bg"])
    draw = ImageDraw.Draw(img)

    draw.rectangle([0, 0, size[0], 60], fill=theme["band"])
    draw.text((20, 18), TITLE.get(doc_type, doc_type), fill=(255, 255, 255), font=FONT_TITLE)
    draw_emblem_placeholder(draw, (size[0] - 45, 30), 25)

    photo_box = (30, 90, 190, 290)
    draw_photo_placeholder(draw, photo_box, doc["photo_ref"], doc["name_on_doc"])

    fx, fy = 220, 90
    line_gap = 48
    draw_field(draw, (fx, fy), "Name", doc["name_on_doc"]); fy += line_gap
    if doc.get("name_on_doc_hi"):
        draw_field(draw, (fx, fy), "Name (Hindi)", doc["name_on_doc_hi"], hindi=True); fy += line_gap
    draw_field(draw, (fx, fy), "Date of Birth", doc["dob_on_doc"]); fy += line_gap
    draw_field(draw, (fx, fy), "Gender", doc.get("gender_on_doc", "-")); fy += line_gap
    if doc.get("relative_name"):
        label = "Father's/Husband's Name" if doc_type in ("PAN", "VOTER_ID") else "Guardian Name"
        draw_field(draw, (fx, fy), label, doc["relative_name"]); fy += line_gap

    number_label = {
        "AADHAAR": "Aadhaar Number", "PAN": "PAN Number", "VOTER_ID": "Voter ID Number",
        "DRIVING_LICENSE": "DL Number", "PASSPORT": "Passport Number",
    }.get(doc_type, "Document Number")
    draw_field(draw, (fx, fy), number_label, doc["document_number"]); fy += line_gap

    body_bottom = max(fy, 290) + 20
    draw.text((30, body_bottom), "Address:", fill=(80, 80, 80), font=FONT_LABEL)
    draw.text((30, body_bottom + 20), doc.get("address_on_doc", "-"), fill=(20, 20, 20), font=FONT_VALUE)

    iy = body_bottom + 55
    if doc.get("issue_date"):
        draw_field(draw, (30, iy), "Issue Date", doc["issue_date"])
    if doc.get("expiry_date"):
        draw_field(draw, (300, iy), "Expiry Date", doc["expiry_date"])

    draw_qr_placeholder(draw, (size[0] - 140, size[1] - 170, size[0] - 40, size[1] - 70))

    draw.line([(30, size[1] - 40), (250, size[1] - 40)], fill=(0, 0, 0), width=1)
    draw.text((30, size[1] - 35), "Signature (placeholder)", fill=(80, 80, 80), font=FONT_SMALL)

    draw.text((30, size[1] - 18),
              "SYNTHETIC DOCUMENT GENERATED FOR SIH 2026 HACKATHON -- NOT VALID FOR ANY OFFICIAL USE",
              fill=(150, 0, 0), font=FONT_SMALL)

    img = add_watermark(img)
    return img


def main():
    with open(DATA_DIR / "documents.json", encoding="utf-8") as f:
        documents = json.load(f)

    count = 0
    for doc in documents:
        img = render_document(doc)
        out_path = OUT_DIR / f"{doc['document_id']}.png"
        img.save(out_path)
        count += 1

    print(f"Rendered {count} mock ID images -> {OUT_DIR.resolve()}")


if __name__ == "__main__":
    main()