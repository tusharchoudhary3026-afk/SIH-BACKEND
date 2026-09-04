"""
main.py -- Backend API entrypoint
-----------------------------------
Run with:  uvicorn main:app --reload --port 8000
"""

import json
import logging
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
ENGINES_DIR = BASE_DIR / "engines"

app = FastAPI(title="SIH26188 - Identity Screening API")
LOGGER = logging.getLogger(__name__)

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


def run_batch_engine(engine_filename: str, engine_name: str):
    """Run a batch engine and keep internal failure details in server logs."""
    result = subprocess.run(
        [sys.executable, str(ENGINES_DIR / engine_filename)],
        capture_output=True,
        text=True,
        cwd=str(ENGINES_DIR),
    )
    if result.returncode != 0:
        LOGGER.error(
            "%s failed with exit code %s. stdout=%s stderr=%s",
            engine_name,
            result.returncode,
            result.stdout,
            result.stderr,
        )
        raise HTTPException(
            status_code=500,
            detail=f"{engine_name} failed. Check the server logs.",
        )
    return {"status": "completed", "log": result.stdout}


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


@app.get("/document-intelligence-report")
def get_document_intelligence_report():
    return load_json("document_intelligence_report.json")


@app.post("/engine/run-document-intelligence")
def run_document_intelligence():
    return run_batch_engine(
        "document_intelligence_engine.py",
        "Document intelligence engine",
    )


@app.get("/document-forensics-report")
def get_document_forensics_report():
    return load_json("document_forensics_report.json")


@app.post("/engine/run-document-forensics")
def run_document_forensics():
    return run_batch_engine(
        "document_forensics_engine.py",
        "Document forensics engine",
    )


@app.get("/capture-presentation-report")
def get_capture_presentation_report():
    return load_json("capture_presentation_report.json")


@app.post("/engine/run-capture-presentation")
def run_capture_presentation():
    return run_batch_engine(
        "capture_presentation_engine.py",
        "Capture presentation engine",
    )


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
    return run_batch_engine(
        "face_verification_engine.py",
        "Face verification engine",
    )

@app.get("/ai-forgery-report")
def get_ai_forgery_report():
    return load_json("ai_forgery_report.json")


@app.post("/engine/run-ai-forgery")
def run_ai_forgery():
    return run_batch_engine(
        "ai_forgery_engine.py",
        "AI forgery engine",
    )
# --------------------------------------------------------------------------
# ENGINE 8 -- Fraud Relationship Graph endpoints
# --------------------------------------------------------------------------

@app.get("/graph/clusters")
def get_graph_clusters():
    """All detected fraud clusters (identity collisions, shared faces, etc.)"""
    return load_json("graph_clusters.json")


@app.get("/graph/cytoscape-elements")
def get_cytoscape_elements():
    """
    Nodes + edges in Cytoscape.js format, ready to feed straight into
    the frontend graph visualization page.
    """
    return load_json("graph_cytoscape.json")


@app.get("/graph/person/{person_id}")
def get_person_cluster(person_id: str):
    """
    Investigation lookup: is this person connected to a fraud ring?
    Returns cluster info if yes, or {"in_fraud_cluster": false} if not.
    """
    index = load_json("graph_person_index.json")
    if person_id not in index:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")

    entry = index[person_id]
    if entry is None:
        return {"person_id": person_id, "in_fraud_cluster": False}
    return {"person_id": person_id, "in_fraud_cluster": True, **entry}


@app.get("/graph/search")
def search_graph(q: str):
    """
    Simple investigation search: matches on person_id (exact/partial)
    or canonical name (case-insensitive substring).
    """
    persons = load_json("persons.json")
    q_lower = q.lower()
    matches = [
        p for p in persons
        if q_lower in p["person_id"].lower() or q_lower in p["canonical_name_en"].lower()
    ]
    return {"query": q, "results": matches}


@app.post("/engine/run-graph-analysis")
def run_graph_analysis():
    """
    Re-runs fraud_graph_engine.py as a subprocess. Call this after
    re-running the dataset generator or consistency engine.
    """
    result = subprocess.run(
        [sys.executable, str(ENGINES_DIR / "fraud_graph_engine.py")],
        capture_output=True, text=True, cwd=str(ENGINES_DIR),
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr)
    return {"status": "completed", "log": result.stdout}
