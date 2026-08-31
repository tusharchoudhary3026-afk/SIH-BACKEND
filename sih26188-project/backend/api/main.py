"""
main.py -- Backend API entrypoint
-----------------------------------
Run with:  uvicorn main:app --reload --port 8000
"""

import json
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
ENGINES_DIR = BASE_DIR / "engines"

app = FastAPI(title="SIH26188 - Identity Screening API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_json(filename: str):
    path = DATA_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{filename} not found. Run generate_dataset.py first.")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@app.get("/")
def root():
    return {"status": "ok", "service": "SIH26188 Identity Screening API"}


@app.get("/persons")
def get_persons():
    return load_json("persons.json")


@app.get("/persons/{person_id}")
def get_person_detail(person_id: str):
    persons = load_json("persons.json")
    documents = load_json("documents.json")

    person = next((p for p in persons if p["person_id"] == person_id), None)
    if not person:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")

    person_docs = [d for d in documents if d["person_id"] == person_id]

    findings = []
    report_path = DATA_DIR / "consistency_report.json"
    if report_path.exists():
        report = load_json("consistency_report.json")
        entry = next((r for r in report if r["person_id"] == person_id), None)
        if entry:
            findings = entry["findings"]

    return {"person": person, "documents": person_docs, "findings": findings}


@app.get("/documents")
def get_documents():
    return load_json("documents.json")


@app.get("/graph-edges")
def get_graph_edges():
    import csv
    path = DATA_DIR / "graph_edges.csv"
    if not path.exists():
        raise HTTPException(status_code=404, detail="graph_edges.csv not found")
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


@app.get("/consistency-report")
def get_consistency_report():
    return load_json("consistency_report.json")


@app.post("/engine/run-consistency-check")
def run_consistency_check():
    result = subprocess.run(
        [sys.executable, str(ENGINES_DIR / "identity_consistency_engine.py")],
        capture_output=True, text=True, cwd=str(ENGINES_DIR),
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr)
    return {"status": "completed", "log": result.stdout}


@app.get("/face-verification-report")
def get_face_verification_report():
    return load_json("face_verification_report.json")


@app.post("/engine/run-face-verification")
def run_face_verification():
    result = subprocess.run(
        [sys.executable, str(ENGINES_DIR / "face_verification_engine.py")],
        capture_output=True, text=True, cwd=str(ENGINES_DIR),
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr)
    return {"status": "completed", "log": result.stdout}