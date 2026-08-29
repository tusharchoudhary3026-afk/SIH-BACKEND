"""
fraud_graph_generator.py
--------------------------
Engine 8: Fraud Relationship Graph -- SELF-GENERATED graph dataset.

Builds a synthetic identity + document universe (separate from Engine 4's
dataset) specifically designed to contain 3 clean, demonstrable fraud rings:

  RING A - "Shared Face Ring"       : one photo reused across multiple fake identities
  RING B - "Document Reuse Ring"    : one document number reused across multiple identities
  RING C - "Synthetic Farm Cluster" : a cluster of look-alike identities sharing
                                        address + near-identical names + overlapping DOB

Everything else in the dataset is CLEAN (no relationship to any ring) so the
fraud rings stand out clearly in the graph visualization.

Run:  python3 fraud_graph_generator.py
Output (in backend/data/):
  fraud_graph_persons.json
  fraud_graph_documents.json
  fraud_graph_edges.json
  fraud_graph_cytoscape.json      <- ready for Cytoscape.js / React Flow
  fraud_rings_ground_truth.json   <- answer key: which persons are in which ring
"""

import json
import random
import string
import uuid
from pathlib import Path
from datetime import date, timedelta

from faker import Faker
from name_bank import random_person_name, swap_similar_name

random.seed(7)
fake = Faker("en_IN")
Faker.seed(7)

OUT_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR.mkdir(exist_ok=True)

TOTAL_CLEAN_PERSONS = 65
DOC_TYPES = ["AADHAAR", "PAN", "VOTER_ID", "DRIVING_LICENSE", "PASSPORT"]


def gen_aadhaar():
    return " ".join("".join(random.choices(string.digits, k=4)) for _ in range(3))

def gen_pan():
    return ("".join(random.choices(string.ascii_uppercase, k=5)) +
             "".join(random.choices(string.digits, k=4)) +
             random.choice(string.ascii_uppercase))

def gen_voter_id():
    return "".join(random.choices(string.ascii_uppercase, k=3)) + "".join(random.choices(string.digits, k=7))

def gen_dl():
    return f"MH{random.randint(1,50):02d} {random.randint(2005,2023)}{''.join(random.choices(string.digits, k=7))}"

def gen_passport():
    return random.choice(string.ascii_uppercase) + "".join(random.choices(string.digits, k=7))

DOC_NUMBER_GENERATORS = {
    "AADHAAR": gen_aadhaar, "PAN": gen_pan, "VOTER_ID": gen_voter_id,
    "DRIVING_LICENSE": gen_dl, "PASSPORT": gen_passport,
}


def random_dob(min_age=18, max_age=60):
    days = random.randint(min_age * 365, max_age * 365)
    return (date.today() - timedelta(days=days)).isoformat()


def make_person(pid, face_ref=None, address=None, name_override=None, dob_override=None):
    gender = random.choice(["M", "F"])
    names = random_person_name(gender)
    return {
        "person_id": pid,
        "name": name_override or names["full_en"],
        "gender": gender,
        "dob": dob_override or random_dob(),
        "address": address or fake.address().replace("\n", ", "),
        "face_ref": face_ref or f"face_{pid}",
        "ring": None,
    }


def make_document(person, doc_type, doc_number=None):
    return {
        "document_id": f"D-{uuid.uuid4().hex[:8].upper()}",
        "person_id": person["person_id"],
        "doc_type": doc_type,
        "name_on_doc": person["name"],
        "document_number": doc_number or DOC_NUMBER_GENERATORS[doc_type](),
        "photo_ref": person["face_ref"],
    }


def build_clean_population(n):
    persons, documents = [], []
    for i in range(n):
        pid = f"F{str(i+1).zfill(4)}"
        person = make_person(pid)
        persons.append(person)
        for doc_type in random.sample(DOC_TYPES, k=random.randint(2, 3)):
            documents.append(make_document(person, doc_type))
    return persons, documents


def inject_ring_a_shared_face(persons, documents, ring_size=4):
    shared_face = f"face_RINGA_{uuid.uuid4().hex[:6]}"
    ids = []
    for k in range(ring_size):
        pid = f"RA{str(k+1).zfill(3)}"
        person = make_person(pid, face_ref=shared_face)
        person["ring"] = "RING_A_SHARED_FACE"
        persons.append(person)
        ids.append(pid)
        for doc_type in random.sample(DOC_TYPES, k=random.randint(2, 3)):
            documents.append(make_document(person, doc_type))
    return {
        "ring_id": "RING_A_SHARED_FACE", "type": "shared_face",
        "description": f"{ring_size} distinct identities (different names/DOB/address) all use "
                        f"the identical photo '{shared_face}' -- one-person-many-identities pattern.",
        "person_ids": ids, "shared_value": shared_face,
    }


def inject_ring_b_document_reuse(persons, documents, ring_size=5):
    doc_type = "PAN"
    shared_number = DOC_NUMBER_GENERATORS[doc_type]()
    ids = []
    for k in range(ring_size):
        pid = f"RB{str(k+1).zfill(3)}"
        person = make_person(pid)
        person["ring"] = "RING_B_DOC_REUSE"
        persons.append(person)
        ids.append(pid)
        documents.append(make_document(person, doc_type, doc_number=shared_number))
        for extra in random.sample([t for t in DOC_TYPES if t != doc_type], k=1):
            documents.append(make_document(person, extra))
    return {
        "ring_id": "RING_B_DOC_REUSE", "type": "document_reuse",
        "description": f"{ring_size} different identities all hold a {doc_type} with the identical "
                        f"document_number '{shared_number}' -- a reused/stolen number backing multiple fakes.",
        "person_ids": ids, "shared_value": shared_number,
    }


def inject_ring_c_synthetic_farm(persons, documents, ring_size=6):
    shared_address = fake.address().replace("\n", ", ")
    base_gender = random.choice(["M", "F"])
    base_names = random_person_name(base_gender)
    base_dob = random_dob(25, 35)
    ids = []
    for k in range(ring_size):
        pid = f"RC{str(k+1).zfill(3)}"
        varied_name = base_names["full_en"] if k == 0 else swap_similar_name(base_names["full_en"])
        dob = base_dob if k == 0 else (
            date.fromisoformat(base_dob) + timedelta(days=random.randint(-60, 60))
        ).isoformat()
        person = make_person(pid, address=shared_address, name_override=varied_name, dob_override=dob)
        person["ring"] = "RING_C_SYNTHETIC_FARM"
        persons.append(person)
        ids.append(pid)
        for doc_type in random.sample(DOC_TYPES, k=random.randint(2, 3)):
            documents.append(make_document(person, doc_type))
    return {
        "ring_id": "RING_C_SYNTHETIC_FARM", "type": "synthetic_farm",
        "description": f"{ring_size} identities share address '{shared_address}', near-identical "
                        f"names (variants of '{base_names['full_en']}'), and DOBs within ~4 months -- "
                        f"pattern of a synthetic identity farm.",
        "person_ids": ids, "shared_value": shared_address,
    }


def build_edges(persons, documents):
    edges = []
    for d in documents:
        edges.append({"source": d["person_id"], "target": d["document_id"],
                       "relation": "SUBMITTED", "confidence": 1.0})

    by_face, by_docnum, by_address = {}, {}, {}
    for p in persons:
        by_face.setdefault(p["face_ref"], []).append(p["person_id"])
        by_address.setdefault(p["address"], []).append(p["person_id"])
    for d in documents:
        by_docnum.setdefault((d["doc_type"], d["document_number"]), []).append(d["person_id"])

    def pairwise(ids):
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                yield ids[i], ids[j]

    for face, ids in by_face.items():
        if len(ids) > 1:
            for a, b in pairwise(ids):
                edges.append({"source": a, "target": b, "relation": "SAME_FACE",
                              "confidence": 0.97, "note": face})

    for (doc_type, number), ids in by_docnum.items():
        unique_ids = list(set(ids))
        if len(unique_ids) > 1:
            for a, b in pairwise(unique_ids):
                edges.append({"source": a, "target": b, "relation": "SAME_DOCUMENT_NUMBER",
                              "confidence": 0.99, "note": f"{doc_type}:{number}"})

    for addr, ids in by_address.items():
        if len(ids) > 1:
            for a, b in pairwise(ids):
                edges.append({"source": a, "target": b, "relation": "SAME_ADDRESS",
                              "confidence": 0.6, "note": addr})

    return edges


def to_cytoscape(persons, documents, edges):
    nodes = [{"data": {"id": p["person_id"], "label": p["name"], "type": "person", "ring": p["ring"]}}
             for p in persons]
    nodes += [{"data": {"id": d["document_id"], "label": d["doc_type"], "type": "document"}}
              for d in documents]
    cy_edges = [{"data": {"source": e["source"], "target": e["target"],
                           "label": e["relation"], "confidence": e["confidence"]}} for e in edges]
    return {"nodes": nodes, "edges": cy_edges}


def main():
    persons, documents = build_clean_population(TOTAL_CLEAN_PERSONS)
    rings = [
        inject_ring_a_shared_face(persons, documents),
        inject_ring_b_document_reuse(persons, documents),
        inject_ring_c_synthetic_farm(persons, documents),
    ]

    edges = build_edges(persons, documents)
    cytoscape = to_cytoscape(persons, documents, edges)

    with open(OUT_DIR / "fraud_graph_persons.json", "w", encoding="utf-8") as f:
        json.dump(persons, f, ensure_ascii=False, indent=2)
    with open(OUT_DIR / "fraud_graph_documents.json", "w", encoding="utf-8") as f:
        json.dump(documents, f, ensure_ascii=False, indent=2)
    with open(OUT_DIR / "fraud_graph_edges.json", "w", encoding="utf-8") as f:
        json.dump(edges, f, ensure_ascii=False, indent=2)
    with open(OUT_DIR / "fraud_graph_cytoscape.json", "w", encoding="utf-8") as f:
        json.dump(cytoscape, f, ensure_ascii=False, indent=2)
    with open(OUT_DIR / "fraud_rings_ground_truth.json", "w", encoding="utf-8") as f:
        json.dump(rings, f, ensure_ascii=False, indent=2)

    print(f"Total persons: {len(persons)} (clean: {TOTAL_CLEAN_PERSONS}, in rings: {len(persons)-TOTAL_CLEAN_PERSONS})")
    print(f"Total documents: {len(documents)}")
    print(f"Total suspicious edges: {len([e for e in edges if e['relation'] != 'SUBMITTED'])}")
    print(f"Rings injected: {[r['ring_id'] for r in rings]}")
    print(f"Written to: {OUT_DIR.resolve()}")


if __name__ == "__main__":
    main()