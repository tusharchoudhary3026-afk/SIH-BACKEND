"""
officer_anomaly_engine.py
----------------------------
Section 13 detection logic: loads officer_action_logs.json and flags
officers whose HIGH/CRITICAL-risk approval rate and review speed look
suspicious -- a simple, explainable rule-based insider-threat detector
(deliberately not a black-box ML score, to match the project's
explainability design goal).

Run order:
  1. python3 officer_log_generator.py
  2. python3 officer_anomaly_engine.py
"""

import json
import statistics
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HIGH_RISK_LEVELS = {"HIGH", "CRITICAL"}

APPROVAL_RATE_THRESHOLD = 0.5
FAST_REVIEW_THRESHOLD_SEC = 90
MIN_HIGH_RISK_REVIEWS = 2


def load_data():
    with open(DATA_DIR / "officers.json", encoding="utf-8") as f:
        officers = json.load(f)
    with open(DATA_DIR / "officer_action_logs.json", encoding="utf-8") as f:
        logs = json.load(f)
    with open(DATA_DIR / "insider_threat_ground_truth.json", encoding="utf-8") as f:
        ground_truth = json.load(f)
    return officers, logs, ground_truth


def compute_officer_stats(officers, logs):
    by_officer = defaultdict(list)
    for log in logs:
        by_officer[log["officer_id"]].append(log)

    stats = []
    for officer in officers:
        oid = officer["officer_id"]
        officer_logs = by_officer.get(oid, [])
        high_risk_logs = [l for l in officer_logs if l["risk_level_at_review"] in HIGH_RISK_LEVELS]

        total_high_risk = len(high_risk_logs)
        approved_high_risk = len([l for l in high_risk_logs if l["action"] == "APPROVED"])
        approval_rate = approved_high_risk / total_high_risk if total_high_risk else 0.0

        avg_duration_high_risk = (
            statistics.mean(l["review_duration_seconds"] for l in high_risk_logs)
            if high_risk_logs else None
        )

        stats.append({
            "officer_id": oid,
            "name": officer["name"],
            "station": officer["station"],
            "total_reviews": len(officer_logs),
            "total_high_risk_reviews": total_high_risk,
            "high_risk_approval_rate": round(approval_rate, 3),
            "avg_review_duration_high_risk_sec": (
                round(avg_duration_high_risk, 1) if avg_duration_high_risk is not None else None
            ),
        })
    return stats


def flag_anomalies(stats, min_high_risk_reviews=MIN_HIGH_RISK_REVIEWS):
    eligible = [s for s in stats if s["total_high_risk_reviews"] >= min_high_risk_reviews]
    rates = [s["high_risk_approval_rate"] for s in eligible] or [0]
    durations = [s["avg_review_duration_high_risk_sec"] for s in eligible
                 if s["avg_review_duration_high_risk_sec"] is not None] or [0]
    rate_mean = statistics.mean(rates)
    dur_mean = statistics.mean(durations)

    for s in stats:
        s["is_flagged"] = False
        s["flag_reason"] = None
        s["peer_avg_approval_rate"] = round(rate_mean, 3)
        s["peer_avg_review_duration_sec"] = round(dur_mean, 1)

        if s["total_high_risk_reviews"] < min_high_risk_reviews:
            continue

        rate_high = s["high_risk_approval_rate"] >= APPROVAL_RATE_THRESHOLD
        duration_fast = (
            s["avg_review_duration_high_risk_sec"] is not None
            and s["avg_review_duration_high_risk_sec"] <= FAST_REVIEW_THRESHOLD_SEC
        )

        if rate_high and duration_fast:
            s["is_flagged"] = True
            s["flag_reason"] = (
                f"Approved {s['high_risk_approval_rate']:.0%} of {s['total_high_risk_reviews']} "
                f"HIGH/CRITICAL-risk cases reviewed (peer avg {rate_mean:.0%}), averaging just "
                f"{s['avg_review_duration_high_risk_sec']:.0f}s per review (peer avg {dur_mean:.0f}s) "
                f"-- pattern consistent with rubber-stamping / collusion."
            )

    return stats


def evaluate(stats, ground_truth):
    gt_insiders = set(ground_truth["insider_officer_ids"])
    flagged = {s["officer_id"] for s in stats if s.get("is_flagged")}

    tp = len(gt_insiders & flagged)
    fp = len(flagged - gt_insiders)
    fn = len(gt_insiders - flagged)
    tn = len(stats) - len(gt_insiders | flagged)

    precision = tp / (tp + fp) if (tp + fp) else 0
    recall = tp / (tp + fn) if (tp + fn) else 0

    print("=" * 60)
    print("OFFICER ANOMALY / INSIDER-THREAT ENGINE -- EVALUATION")
    print("=" * 60)
    print(f"Ground-truth insider officers: {sorted(gt_insiders)}")
    print(f"Flagged officers:              {sorted(flagged)}")
    print(f"TP: {tp}  FP: {fp}  FN: {fn}  TN: {tn}")
    print(f"Precision: {precision:.2%}  Recall: {recall:.2%}")
    print("-" * 60)
    for s in sorted(stats, key=lambda x: -x["high_risk_approval_rate"]):
        marker = "🚩" if s.get("is_flagged") else "  "
        print(f"{marker} {s['officer_id']} ({s['name']}): "
              f"high-risk approval rate={s['high_risk_approval_rate']:.0%}, "
              f"avg duration={s['avg_review_duration_high_risk_sec']}s, "
              f"n={s['total_high_risk_reviews']}")
    print("=" * 60)


def main():
    officers, logs, ground_truth = load_data()
    stats = compute_officer_stats(officers, logs)
    stats = flag_anomalies(stats)

    with open(DATA_DIR / "officer_anomaly_report.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    evaluate(stats, ground_truth)
    print("Full report written to: data/officer_anomaly_report.json")


if __name__ == "__main__":
    main()