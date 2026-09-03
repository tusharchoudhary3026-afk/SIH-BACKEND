"""Measure Engine 1 OCR recovery against the project's synthetic metadata."""

import json
import re
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
REPORT_PATH = DATA_DIR / "document_intelligence_report.json"
DOCUMENTS_PATH = DATA_DIR / "documents.json"
OUT_PATH = DATA_DIR / "document_intelligence_evaluation.json"


def normalized(value):
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())


def name_recovered(name, text):
    tokens = [normalized(token) for token in name.split() if len(normalized(token)) >= 3]
    document = normalized(text)
    return bool(tokens) and sum(token in document for token in tokens) >= max(1, len(tokens) - 1)


def main():
    with open(REPORT_PATH, encoding="utf-8") as source:
        report = json.load(source)
    with open(DOCUMENTS_PATH, encoding="utf-8") as source:
        documents = {row["document_id"]: row for row in json.load(source)}

    totals = {"name": 0, "dob": 0, "document_number": 0}
    matched = {key: 0 for key in totals}
    for row in report:
        metadata = documents.get(row["document_id"])
        text = row.get("extracted_fields", {}).get("raw_text", "")
        if not metadata or row.get("ocr_status") != "OCR_COMPLETED":
            continue
        totals["name"] += 1
        totals["dob"] += 1
        totals["document_number"] += 1
        matched["name"] += name_recovered(metadata["name_on_doc"], text)
        matched["dob"] += normalized(metadata["dob_on_doc"]) in normalized(text)
        matched["document_number"] += normalized(metadata["document_number"]) in normalized(text)

    output = {
        "dataset": "269 synthetic mock IDs",
        "ocr_completed": sum(1 for row in report if row.get("ocr_status") == "OCR_COMPLETED"),
        "field_recovery": {
            field: {"matched": matched[field], "total": totals[field], "rate": round(matched[field] / totals[field], 4) if totals[field] else 0.0}
            for field in totals
        },
        "note": "Exact normalized matching on the project's rendered English fields; Hindi OCR is not evaluated because Hindi language data is not installed.",
    }
    with open(OUT_PATH, "w", encoding="utf-8") as target:
        json.dump(output, target, indent=2)
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
