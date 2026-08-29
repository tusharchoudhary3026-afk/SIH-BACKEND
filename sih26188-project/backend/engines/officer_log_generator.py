"""
officer_log_generator.py
--------------------------
Section 13 dataset: self-generated mock officer-action logs, built on top
of Engine 4 (consistency_report.json) and Engine 8 (fraud_rings_ground_truth.json)
so the insider-threat pattern is genuinely demonstrable rather than random.

Design:
  - ~12 NORMAL officers who reject/escalate HIGH-risk and fraud-ring cases
    at a high rate (as expected behaviour).
  - 2 INSIDER-THREAT officers who approve a suspicious share of HIGH-risk
    and fraud-ring cases anyway, and review them unusually fast
    (rubber-stamping / collusion signal).

Run order:
  1. python3 generate_dataset.py              (Engine 4)
  2. python3 identity_consistency_engine.py   (Engine 4)
  3. python3 fraud_graph_generator.py         (Engine 8)
  4. python3 officer_log_generator.py         (this file)

Output (in backend/data/):
  officers.json
  officer_action_logs.json
  insider_threat_ground_truth.json
"""

import json
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from name_bank import random_person_name

random.seed(21)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

STATIONS = ["Indore Verification Cell", "Bhopal Border Post", "Delhi Central Desk",
            "Mumbai Airport Immigration", "Chennai Port Desk", "Kolkata Regional Office"]

NUM_NORMAL_OFFICERS = 12
NUM_INSIDER_OFFICERS = 2

HIGH_RISK_LEVELS = {"HIGH", "CRITICAL"}


def load_case_pool():
    """Builds the pool of 'cases' officers will review: every Engine-4 person
    (with their risk_level) plus every Engine-8 fraud-ring member (forced HIGH)."""
    cases = []

    report_path = DATA_DIR / "consistency_report.json"
    if report_path.exists():
        with open(report_path, encoding="utf-8") as f:
            report = json.load(f)
        for r in report:
            cases.append({
                "person_id": r["person_id"],
                "risk_level": r["risk_level"] if r["risk_level"] != "NONE" else "LOW",
                "source": "identity_consistency",
            })

    rings_path = DATA_DIR / "fraud_rings_ground_truth.json"
    if rings_path.exists():
        with open(rings_path, encoding="utf-8") as f:
            rings = json.load(f)
        for ring in rings:
            for pid in ring["person_ids"]:
                cases.append({
                    "person_id": pid,
                    "risk_level": "CRITICAL",
                    "source": f"fraud_graph:{ring['ring_id']}",
                })

    return cases


def make_officer(officer_id, is_insider):
    gender = random.choice(["M", "F"])
    name = random_person_name(gender)["full_en"]
    return {
        "officer_id": officer_id,
        "name": name,
        "station": random.choice(STATIONS),
        "role": "Senior Verification Officer" if is_insider else random.choice(
            ["Verification Officer", "Senior Verification Officer"]),
        "join_date": (datetime.now() - timedelta(days=random.randint(200, 2000))).date().isoformat(),
    }


def random_timestamp():
    days_ago = random.randint(0, 90)
    dt = datetime.now() - timedelta(days=days_ago,
                                     hours=random.randint(0, 23),
                                     minutes=random.randint(0, 59))
    return dt


def normal_officer_decision(risk_level):
    """Normal, expected behaviour: reject/escalate the risky cases."""
    if risk_level in HIGH_RISK_LEVELS:
        action = random.choices(["REJECTED", "ESCALATED", "APPROVED"], weights=[65, 30, 5])[0]
        duration = random.randint(180, 600)   # 3-10 min -- careful review
    else:
        action = random.choices(["APPROVED", "ESCALATED", "REJECTED"], weights=[90, 5, 5])[0]
        duration = random.randint(60, 240)
    return action, duration


def insider_officer_decision(risk_level):
    """Suspicious behaviour: approves risky cases anyway, reviews them fast."""
    if risk_level in HIGH_RISK_LEVELS:
        action = random.choices(["APPROVED", "REJECTED", "ESCALATED"], weights=[75, 15, 10])[0]
        duration = random.randint(15, 60)     # rubber-stamped, 15-60 sec
    else:
        action = random.choices(["APPROVED", "REJECTED"], weights=[92, 8])[0]
        duration = random.randint(45, 200)
    return action, duration


def build_logs(officers, cases):
    logs = []
    normal_officers = [o for o in officers if not o["is_insider"]]
    insider_officers = [o for o in officers if o["is_insider"]]

    for case in cases:
        if case["risk_level"] in HIGH_RISK_LEVELS and random.random() < 0.35:
            officer = random.choice(insider_officers)
        else:
            officer = random.choice(normal_officers)

        decide = insider_officer_decision if officer["is_insider"] else normal_officer_decision
        action, duration = decide(case["risk_level"])

        logs.append({
            "log_id": f"LOG-{uuid.uuid4().hex[:8].upper()}",
            "officer_id": officer["officer_id"],
            "person_id": case["person_id"],
            "case_source": case["source"],
            "risk_level_at_review": case["risk_level"],
            "action": action,
            "review_duration_seconds": duration,
            "timestamp": random_timestamp().isoformat(timespec="seconds"),
        })

    logs.sort(key=lambda l: l["timestamp"])
    return logs


def main():
    cases = load_case_pool()
    if not cases:
        print("No cases found -- run generate_dataset.py + identity_consistency_engine.py "
              "and fraud_graph_generator.py first.")
        return

    officers = []
    for i in range(NUM_NORMAL_OFFICERS):
        officers.append({**make_officer(f"OFF{str(i+1).zfill(3)}", False), "is_insider": False})
    for i in range(NUM_INSIDER_OFFICERS):
        officers.append({**make_officer(f"OFF{str(NUM_NORMAL_OFFICERS+i+1).zfill(3)}", True), "is_insider": True})

    logs = build_logs(officers, cases)

    insider_ground_truth = {
        "insider_officer_ids": [o["officer_id"] for o in officers if o["is_insider"]],
        "description": "These officers were deliberately configured to approve a suspicious "
                        "share of HIGH/CRITICAL-risk and fraud-ring cases, with unusually short "
                        "review durations (rubber-stamping), simulating collusion/insider threat.",
    }

    officers_out = [{k: v for k, v in o.items() if k != "is_insider"} for o in officers]

    with open(DATA_DIR / "officers.json", "w", encoding="utf-8") as f:
        json.dump(officers_out, f, ensure_ascii=False, indent=2)
    with open(DATA_DIR / "officer_action_logs.json", "w", encoding="utf-8") as f:
        json.dump(logs, f, ensure_ascii=False, indent=2)
    with open(DATA_DIR / "insider_threat_ground_truth.json", "w", encoding="utf-8") as f:
        json.dump(insider_ground_truth, f, ensure_ascii=False, indent=2)

    print(f"Officers: {len(officers)} ({NUM_NORMAL_OFFICERS} normal, {NUM_INSIDER_OFFICERS} insider)")
    print(f"Total action logs: {len(logs)}")
    print(f"Insider officer IDs (ground truth): {insider_ground_truth['insider_officer_ids']}")
    print(f"Written to: {DATA_DIR.resolve()}")


if __name__ == "__main__":
    main()