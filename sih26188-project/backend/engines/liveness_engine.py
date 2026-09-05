"""
liveness_engine.py
--------------------
Engine 6: Face Liveness / Presentation-Attack Detection (PAD).

HONEST SCOPE NOTE: public PAD datasets (CASIA-FASD, Replay-Attack/Idiap)
require a signed research-access request form -- they can't be
downloaded during a hackathon. So this engine implements REAL classic
anti-spoofing signal analysis (blur, moire/frequency, color diversity),
validated against synthetic genuine-vs-recapture test images we
generate ourselves.

Feature #88 (deepfake detection) is a genuine MOCK -- needs a trained
CNN (FaceForensics++), out of scope for this build.
"""

import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TEST_IMAGES_DIR = Path(__file__).resolve().parent / "test_images"


def blur_score(img: Image.Image) -> float:
    gray = np.array(img.convert("L"), dtype=float)
    lap = (
        -4 * gray
        + np.roll(gray, 1, axis=0) + np.roll(gray, -1, axis=0)
        + np.roll(gray, 1, axis=1) + np.roll(gray, -1, axis=1)
    )
    variance = lap.var()
    return float(min(100, variance / 8))


def moire_score(img: Image.Image) -> float:
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


def color_diversity_score(img: Image.Image) -> float:
    small = img.convert("RGB").resize((64, 64))
    arr = np.array(small).reshape(-1, 3)
    unique_colors = len(np.unique(arr, axis=0))
    return float(min(100, unique_colors / 20))


def analyze_liveness(img: Image.Image) -> dict:
    sharpness = blur_score(img)
    moire = moire_score(img)
    color_div = color_diversity_score(img)

    liveness_consistency = (
        0.4 * sharpness
        + 0.4 * (100 - moire)
        + 0.2 * color_div
    )
    liveness_consistency = round(min(100, max(0, liveness_consistency)), 1)

    if liveness_consistency >= 70:
        verdict = "LIVE"
    elif liveness_consistency <= 65:
        verdict = "SPOOF_SUSPECTED"
    else:
        verdict = "UNCERTAIN_NEEDS_REVIEW"

    reasons = []
    if sharpness < 40:
        reasons.append(f"Low sharpness ({sharpness:.1f}/100) -- consistent with a "
                        f"recaptured/re-photographed image rather than a direct live shot.")
    if moire > 40:
        reasons.append(f"Elevated mid-frequency periodicity ({moire:.1f}/100) -- "
                        f"consistent with a screen-recapture moire pattern.")
    if color_div < 30:
        reasons.append(f"Compressed color diversity ({color_div:.1f}/100) -- "
                        f"consistent with print/screen color banding.")
    if not reasons:
        reasons.append("No presentation-attack indicators detected across "
                        "sharpness, frequency, or color-diversity checks.")

    return {
        "liveness_consistency_score": liveness_consistency,
        "verdict": verdict,
        "signals": {
            "sharpness_score": round(sharpness, 1),
            "moire_score": round(moire, 1),
            "color_diversity_score": round(color_div, 1),
        },
        "reasons": reasons,
        "deepfake_check": {
            "status": "MOCK_NOT_IMPLEMENTED",
            "note": "Real deepfake/face-swap detection requires a CNN trained on "
                    "FaceForensics++ or similar -- out of scope for this hackathon "
                    "build. Roadmap item.",
        },
    }


def _draw_face_like_blob(size=256, seed=0):
    rng = np.random.default_rng(seed)
    img = Image.new("RGB", (size, size), (30, 30, 35))
    draw = ImageDraw.Draw(img)

    base_color = tuple(int(c) for c in rng.integers(140, 220, size=3))
    draw.ellipse([size*0.25, size*0.2, size*0.75, size*0.8], fill=base_color)

    arr = np.array(img).astype(int)
    noise = rng.normal(0, 12, arr.shape).astype(int)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    return img


def generate_genuine_sample(seed=0):
    return _draw_face_like_blob(seed=seed)


def generate_spoof_sample(seed=0):
    img = _draw_face_like_blob(seed=seed)
    img = img.filter(ImageFilter.GaussianBlur(radius=2.2))

    overlay = Image.new("L", img.size, 0)
    odraw = ImageDraw.Draw(overlay)
    for x in range(0, img.size[0], 4):
        odraw.line([(x, 0), (x, img.size[1])], fill=40)
    overlay_rgb = Image.merge("RGB", (overlay, overlay, overlay))
    img = Image.blend(img, overlay_rgb, alpha=0.15)

    img = img.convert("P", palette=Image.ADAPTIVE, colors=16).convert("RGB")
    return img


def main():
    TEST_IMAGES_DIR.mkdir(exist_ok=True)

    results = []
    for i in range(5):
        genuine = generate_genuine_sample(seed=i)
        spoof = generate_spoof_sample(seed=i)

        genuine.save(TEST_IMAGES_DIR / f"genuine_{i}.png")
        spoof.save(TEST_IMAGES_DIR / f"spoof_{i}.png")

        genuine_result = analyze_liveness(genuine)
        spoof_result = analyze_liveness(spoof)

        results.append({"sample": f"genuine_{i}", "ground_truth": "LIVE", **genuine_result})
        results.append({"sample": f"spoof_{i}", "ground_truth": "SPOOF", **spoof_result})

    correct = sum(
        1 for r in results
        if (r["ground_truth"] == "LIVE" and r["verdict"] == "LIVE")
        or (r["ground_truth"] == "SPOOF" and r["verdict"] == "SPOOF_SUSPECTED")
    )

    with open(DATA_DIR / "liveness_test_report.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print("=" * 60)
    print("ENGINE 6 -- FACE LIVENESS / PRESENTATION-ATTACK DETECTION")
    print("=" * 60)
    for r in results:
        print(f"  {r['sample']:14s} | ground_truth={r['ground_truth']:6s} | "
              f"verdict={r['verdict']:22s} | score={r['liveness_consistency_score']}")
    print("-" * 60)
    print(f"Correct on synthetic self-test: {correct}/{len(results)}")
    print("=" * 60)
    print(f"Test images written to: {TEST_IMAGES_DIR}")
    print(f"Report written to: {DATA_DIR / 'liveness_test_report.json'}")


if __name__ == "__main__":
    main()