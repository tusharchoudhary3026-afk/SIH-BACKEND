"""Evaluate Engine 2 against the labeled mock-ID validation manifest."""

import json
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
REPORT_PATH = DATA_DIR / "document_forensics_report.json"
OUT_PATH = DATA_DIR / "document_forensics_evaluation.json"


def metrics(rows, threshold):
    tp = fp = tn = fn = 0
    for row in rows:
        actual = row["expected_label"] == "TAMPERED"
        predicted = row["risk_score"] >= threshold
        tp += actual and predicted
        fp += not actual and predicted
        tn += not actual and not predicted
        fn += actual and not predicted
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"threshold": threshold, "true_positive": tp, "false_positive": fp, "true_negative": tn, "false_negative": fn, "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4)}


def main():
    with open(REPORT_PATH, encoding="utf-8") as source:
        rows = json.load(source)
    labeled = [row for row in rows if row.get("expected_label") in {"GENUINE", "TAMPERED"}]
    candidates = sorted({row["risk_score"] for row in labeled})
    results = [metrics(labeled, threshold) for threshold in candidates]
    best = max(results, key=lambda result: (result["f1"], result["recall"], -result["threshold"]))
    by_attack = {}
    for attack in sorted({row.get("attack_type") or "genuine" for row in labeled}):
        group = [row for row in labeled if (row.get("attack_type") or "genuine") == attack]
        by_attack[attack] = {
            "cases": len(group),
            "risk_min": min(row["risk_score"] for row in group),
            "risk_max": max(row["risk_score"] for row in group),
            "flagged_at_best_threshold": sum(row["risk_score"] >= best["threshold"] for row in group),
        }
    output = {"dataset": "controlled mock-ID variants", "labeled_cases": len(labeled), "best_observed_threshold": best, "note": "Threshold is descriptive on this synthetic set and is not a production calibration."}
    output["attack_breakdown"] = by_attack
    with open(OUT_PATH, "w", encoding="utf-8") as target:
        json.dump(output, target, indent=2)
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
