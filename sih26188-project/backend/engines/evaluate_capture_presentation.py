"""Evaluate Engine 3 on controlled simulated capture variants."""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def main():
    with open(DATA_DIR / "capture_presentation_report.json", encoding="utf-8") as source:
        rows = json.load(source)
    tp = sum(row["expected_label"] == "RECAPTURE" and row["decision"] == "RECAPTURE_SUSPECTED" for row in rows)
    fp = sum(row["expected_label"] == "DIRECT" and row["decision"] == "RECAPTURE_SUSPECTED" for row in rows)
    tn = sum(row["expected_label"] == "DIRECT" and row["decision"] != "RECAPTURE_SUSPECTED" for row in rows)
    fn = sum(row["expected_label"] == "RECAPTURE" and row["decision"] != "RECAPTURE_SUSPECTED" for row in rows)
    output = {"dataset": "controlled simulated screen/print recaptures", "true_positive": tp, "false_positive": fp, "true_negative": tn, "false_negative": fn, "precision": round(tp / (tp + fp), 4) if tp + fp else 0.0, "recall": round(tp / (tp + fn), 4) if tp + fn else 0.0, "note": "Validation covers synthetic simulations; real camera-captured screen/print samples remain required for real-world claims."}
    with open(DATA_DIR / "capture_presentation_evaluation.json", "w", encoding="utf-8") as target:
        json.dump(output, target, indent=2)
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
