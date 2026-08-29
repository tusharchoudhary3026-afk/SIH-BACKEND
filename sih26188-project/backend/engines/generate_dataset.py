"""
generate_dataset.py
--------------------
Generates a synthetic identity + document dataset for SIH26188 Engine 4
(Identity Consistency & Synthetic Identity Detection).
"""

import json
import random
import string
import uuid
from datetime import date, timedelta
from pathlib import Path

from faker import Faker

from name_bank import random_person_name, noisy_transliteration, swap_similar_name

random.seed(42)  # reproducible dataset
fake = Faker("en_IN")
Faker.seed(42)

OUT_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR.mkdir(exist_ok=True)

NUM_PERSONS = 90
ANOMALY_FRACTION = 0.18  # ~16 of 90 persons will carry an injected contradiction

DOC_TYPES = ["AADHAAR", "PAN", "VOTER_ID", "DRIVING_LICENSE", "PASSPORT"]

CONTRADICTION_TYPES = [
    "dob_mismatch",
    "shared_document_number",
    "transliteration_mismatch",
    "name_swap_conflict",
    "address_discrepancy",
]

def gen_aadhaar():
    return " ".join("".join(random.choices(string.digits, k=4)) for _ in range(3))

def gen_pan():
    letters1 = "".join(random.choices(string.ascii_uppercase, k=5))
    digits = "".join(random.choices(string.digits, k=4))
    letter2 = random.choice(string.ascii_uppercase)
    return f"{letters1}{digits}{letter2}"

def gen_voter_id():
    letters = "".join(random.choices(string.ascii_uppercase, k=3))
    digits = "".join(random.choices(string.digits, k=7))
    return f"{letters}{digits}"

def gen_driving_license(state_code="MH"):
    rto = f"{random.randint(1, 50):02d}"
    year = random.randint(2005, 2023)
    serial = "".join(random.choices(string.digits, k=7))
    return f"{state_code}{rto} {year}{serial}"

def gen_passport():
    letter = random.choice(string.ascii_uppercase)
    digits = "".join(random.choices(string.digits, k=7))
    return f"{letter}{digits}"

DOC_NUMBER_GENERATORS = {
    "AADHAAR": gen_aadhaar,
    "PAN": gen_pan,
    "VOTER_ID": gen_voter_id,
    "DRIVING_LICENSE": gen_driving_license,
    "PASSPORT": gen_passport,
}

def random_dob(min_age=18, max_age=65):
    today = date.today()
    age_days = random.randint(min_age * 365, max_age * 365)
    return today - timedelta(days=age_days)

def shifted_dob(dob: date):
    shift_years = random.choice([-5, -3, -2, -1, 1, 2, 3, 5])
    try:
        return dob.replace(year=dob.year + shift_years)
    except ValueError:
        return dob.replace(year=dob.year + shift_years, day=28)

def random_issue_expiry(doc_type, dob):
    today = date.today()
    issue = today - timedelta(days=random.randint(30, 365 * 8))
    if doc_type == "PASSPORT":
        expiry = issue + timedelta(days=365 * 10)
    elif doc_type == "DRIVING_LICENSE":
        expiry = issue + timedelta(days=365 * 20)
    else:
        expiry = None
    return issue, expiry

def make_person(person_id: str):
    gender = random.choice(["M", "F"])
    names = random_person_name(gender)
    dob = random_dob()
    address = fake.address().replace("\n", ", ")
    face_ref = f"face_{person_id}"

    return {
        "person_id": person_id,
        "canonical_name_en": names["full_en"],
        "canonical_name_hi": names["full_hi"],
        "abbrev_name_en": names["abbrev_en"],
        "gender": gender,
        "dob": dob.isoformat(),
        "address": address,
        "face_ref": face_ref,
        "is_anomalous": False,
        "anomaly_types": [],
    }


def make_document(person: dict, doc_type: str, override: dict = None):
    override = override or {}
    dob = date.fromisoformat(person["dob"])
    issue, expiry = random_issue_expiry(doc_type, dob)

    doc = {
        "document_id": f"D-{uuid.uuid4().hex[:8].upper()}",
        "person_id": person["person_id"],
        "doc_type": doc_type,
        "name_on_doc": override.get("name_on_doc", person["canonical_name_en"]),
        "name_on_doc_hi": override.get("name_on_doc_hi", person["canonical_name_hi"]),
        "dob_on_doc": override.get("dob_on_doc", person["dob"]),
        "gender_on_doc": override.get("gender_on_doc", person["gender"]),
        "address_on_doc": override.get("address_on_doc", person["address"]),
        "document_number": override.get("document_number") or DOC_NUMBER_GENERATORS[doc_type](),
        "issue_date": issue.isoformat(),
        "expiry_date": expiry.isoformat() if expiry else None,
        "photo_ref": person["face_ref"],
    }

    if doc_type in ("PAN", "VOTER_ID", "PASSPORT"):
        parent_names = random_person_name(random.choice(["M", "F"]))
        doc["relative_name"] = override.get("relative_name", parent_names["full_en"])

    return doc


def inject_dob_mismatch(person, documents, labels):
    target_doc = random.choice(documents)
    original_dob = target_doc["dob_on_doc"]
    wrong_dob = shifted_dob(date.fromisoformat(original_dob)).isoformat()
    target_doc["dob_on_doc"] = wrong_dob
    person["anomaly_types"].append("dob_mismatch")
    labels.append({
        "type": "dob_mismatch",
        "person_id": person["person_id"],
        "document_id": target_doc["document_id"],
        "detail": f"DOB on {target_doc['doc_type']} is {wrong_dob}, "
                  f"conflicts with person record / other documents ({original_dob})."
    })


def inject_transliteration_mismatch(person, documents, labels):
    target_doc = random.choice(documents)
    wrong_hi = noisy_transliteration(swap_similar_name(person["canonical_name_en"]))
    target_doc["name_on_doc_hi"] = wrong_hi
    person["anomaly_types"].append("transliteration_mismatch")
    labels.append({
        "type": "transliteration_mismatch",
        "person_id": person["person_id"],
        "document_id": target_doc["document_id"],
        "detail": f"Hindi name on {target_doc['doc_type']} ('{wrong_hi}') does not "
                  f"transliterate back to canonical name ('{person['canonical_name_hi']}')."
    })


def inject_name_swap_conflict(person, documents, labels):
    target_doc = random.choice(documents)
    wrong_name = swap_similar_name(person["canonical_name_en"])
    target_doc["name_on_doc"] = wrong_name
    person["anomaly_types"].append("name_swap_conflict")
    labels.append({
        "type": "name_swap_conflict",
        "person_id": person["person_id"],
        "document_id": target_doc["document_id"],
        "detail": f"Name on {target_doc['doc_type']} is '{wrong_name}', a phonetically "
                  f"similar but different name from canonical '{person['canonical_name_en']}'."
    })


def inject_address_discrepancy(person, documents, labels):
    target_doc = random.choice(documents)
    new_address = fake.address().replace("\n", ", ")
    target_doc["address_on_doc"] = new_address
    person["anomaly_types"].append("address_discrepancy")
    labels.append({
        "type": "address_discrepancy",
        "person_id": person["person_id"],
        "document_id": target_doc["document_id"],
        "detail": f"Address on {target_doc['doc_type']} differs from person record "
                  f"(may be legitimate move -> should be MEDIUM risk, not HIGH)."
    })


SINGLE_PERSON_INJECTORS = {
    "dob_mismatch": inject_dob_mismatch,
    "transliteration_mismatch": inject_transliteration_mismatch,
    "name_swap_conflict": inject_name_swap_conflict,
    "address_discrepancy": inject_address_discrepancy,
}


def inject_shared_document_number(person_a, docs_a, person_b, docs_b, labels):
    common_types = list({d["doc_type"] for d in docs_a} & {d["doc_type"] for d in docs_b})
    if not common_types:
        doc_type = random.choice(DOC_TYPES)
        docs_a.append(make_document(person_a, doc_type))
        docs_b.append(make_document(person_b, doc_type))
        common_types = [doc_type]

    doc_type = random.choice(common_types)
    doc_a = next(d for d in docs_a if d["doc_type"] == doc_type)
    doc_b = next(d for d in docs_b if d["doc_type"] == doc_type)
    shared_number = DOC_NUMBER_GENERATORS[doc_type]()
    doc_a["document_number"] = shared_number
    doc_b["document_number"] = shared_number

    for p in (person_a, person_b):
        p["anomaly_types"].append("shared_document_number")

    labels.append({
        "type": "shared_document_number",
        "person_ids": [person_a["person_id"], person_b["person_id"]],
        "document_ids": [doc_a["document_id"], doc_b["document_id"]],
        "detail": f"Both '{person_a['canonical_name_en']}' and '{person_b['canonical_name_en']}' "
                  f"hold a {doc_type} with identical document_number {shared_number} "
                  f"-> identity collision / possible fraud ring."
    })


def build_dataset():
    persons = [make_person(f"P{str(i+1).zfill(4)}") for i in range(NUM_PERSONS)]

    documents_by_person = {}
    for person in persons:
        n_docs = random.randint(2, 4)
        chosen_types = random.sample(DOC_TYPES, k=n_docs)
        documents_by_person[person["person_id"]] = [
            make_document(person, dt) for dt in chosen_types
        ]

    labels = []
    n_anomalous = int(NUM_PERSONS * ANOMALY_FRACTION)

    n_collision_pairs = max(2, n_anomalous // 5)
    all_person_indices = list(range(NUM_PERSONS))
    random.shuffle(all_person_indices)

    collision_indices = all_person_indices[: n_collision_pairs * 2]
    remaining_indices = all_person_indices[n_collision_pairs * 2 :]

    for i in range(0, len(collision_indices), 2):
        idx_a, idx_b = collision_indices[i], collision_indices[i + 1]
        person_a, person_b = persons[idx_a], persons[idx_b]
        person_a["is_anomalous"] = True
        person_b["is_anomalous"] = True
        inject_shared_document_number(
            person_a, documents_by_person[person_a["person_id"]],
            person_b, documents_by_person[person_b["person_id"]],
            labels,
        )

    n_single_person_anomalies = max(0, n_anomalous - n_collision_pairs)
    single_targets = remaining_indices[:n_single_person_anomalies]

    for idx in single_targets:
        person = persons[idx]
        person["is_anomalous"] = True
        contradiction = random.choice(list(SINGLE_PERSON_INJECTORS.keys()))
        SINGLE_PERSON_INJECTORS[contradiction](
            person, documents_by_person[person["person_id"]], labels
        )

    all_documents = [doc for docs in documents_by_person.values() for doc in docs]

    return persons, all_documents, labels


def build_graph_edges(persons, documents, labels):
    edges = []

    for doc in documents:
        edges.append({
            "source": doc["person_id"],
            "relation": "SUBMITTED",
            "target": doc["document_id"],
            "confidence": 1.0,
            "note": doc["doc_type"],
        })

    face_map = {}
    for p in persons:
        face_map.setdefault(p["face_ref"], []).append(p["person_id"])
    for face_ref, owners in face_map.items():
        if len(owners) > 1:
            for i in range(len(owners)):
                for j in range(i + 1, len(owners)):
                    edges.append({
                        "source": owners[i],
                        "relation": "SAME_FACE",
                        "target": owners[j],
                        "confidence": 0.97,
                        "note": face_ref,
                    })

    for label in labels:
        if label["type"] == "shared_document_number":
            pid_a, pid_b = label["person_ids"]
            edges.append({
                "source": pid_a,
                "relation": "SAME_DOCUMENT_NUMBER",
                "target": pid_b,
                "confidence": 0.99,
                "note": label["detail"],
            })

    return edges


def main():
    persons, documents, labels = build_dataset()
    edges = build_graph_edges(persons, documents, labels)

    with open(OUT_DIR / "persons.json", "w", encoding="utf-8") as f:
        json.dump(persons, f, ensure_ascii=False, indent=2)

    with open(OUT_DIR / "documents.json", "w", encoding="utf-8") as f:
        json.dump(documents, f, ensure_ascii=False, indent=2)

    with open(OUT_DIR / "ground_truth_labels.json", "w", encoding="utf-8") as f:
        json.dump(labels, f, ensure_ascii=False, indent=2)

    import csv
    with open(OUT_DIR / "graph_edges.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["source", "relation", "target", "confidence", "note"])
        writer.writeheader()
        writer.writerows(edges)

    summary = {
        "total_persons": len(persons),
        "anomalous_persons": sum(1 for p in persons if p["is_anomalous"]),
        "total_documents": len(documents),
        "total_contradictions_injected": len(labels),
        "contradiction_type_counts": {},
        "docs_per_person_distribution": {},
    }
    for label in labels:
        summary["contradiction_type_counts"][label["type"]] = (
            summary["contradiction_type_counts"].get(label["type"], 0) + 1
        )
    from collections import Counter
    per_person_doc_count = Counter()
    for doc in documents:
        per_person_doc_count[doc["person_id"]] += 1
    dist = Counter(per_person_doc_count.values())
    summary["docs_per_person_distribution"] = dict(sorted(dist.items()))

    with open(OUT_DIR / "dataset_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"\nWritten to: {OUT_DIR.resolve()}")


if __name__ == "__main__":
    main()