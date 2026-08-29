"""
fraud_graph_engine.py
------------------------
Engine 8 detection logic: loads the fraud graph dataset and uses NetworkX
to AUTO-DETECT the fraud rings (connected-component clustering on suspicious
edges), scores each cluster's risk, and evaluates against ground truth.

Run order:
  1. python3 fraud_graph_generator.py
  2. python3 fraud_graph_engine.py
"""

import json
from pathlib import Path
from collections import defaultdict

import networkx as nx

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

SUSPICIOUS_RELATIONS = {"SAME_FACE", "SAME_DOCUMENT_NUMBER", "SAME_ADDRESS"}
RELATION_WEIGHT = {"SAME_FACE": 3, "SAME_DOCUMENT_NUMBER": 3, "SAME_ADDRESS": 1}


def load_data():
    with open(DATA_DIR / "fraud_graph_persons.json", encoding="utf-8") as f:
        persons = json.load(f)
    with open(DATA_DIR / "fraud_graph_edges.json", encoding="utf-8") as f:
        edges = json.load(f)
    with open(DATA_DIR / "fraud_rings_ground_truth.json", encoding="utf-8") as f:
        ground_truth = json.load(f)
    return persons, edges, ground_truth


def build_graph(persons, edges):
    G = nx.Graph()
    for p in persons:
        G.add_node(p["person_id"], name=p["name"])
    for e in edges:
        if e["relation"] in SUSPICIOUS_RELATIONS:
            if G.has_edge(e["source"], e["target"]):
                G[e["source"]][e["target"]]["weight"] += RELATION_WEIGHT[e["relation"]]
                G[e["source"]][e["target"]]["relations"].append(e["relation"])
            else:
                G.add_edge(e["source"], e["target"], weight=RELATION_WEIGHT[e["relation"]],
                           relations=[e["relation"]])
    return G


def detect_clusters(G):
    clusters = []
    for component in nx.connected_components(G):
        if len(component) < 2:
            continue
        subgraph = G.subgraph(component)
        relation_counts = defaultdict(int)
        for _, _, data in subgraph.edges(data=True):
            for r in data["relations"]:
                relation_counts[r] += 1

        dominant_relation = max(relation_counts, key=relation_counts.get)
        cluster_type = {
            "SAME_FACE": "shared_face",
            "SAME_DOCUMENT_NUMBER": "document_reuse",
            "SAME_ADDRESS": "synthetic_farm",
        }.get(dominant_relation, "mixed")

        density = nx.density(subgraph)
        avg_weight = sum(d["weight"] for _, _, d in subgraph.edges(data=True)) / subgraph.number_of_edges()
        risk_score = min(100, int(avg_weight * 10 + len(component) * 5 + density * 20))

        clusters.append({
            "cluster_id": f"CLUSTER_{len(clusters)+1}",
            "person_ids": sorted(component),
            "size": len(component),
            "dominant_relation": dominant_relation,
            "inferred_type": cluster_type,
            "relation_counts": dict(relation_counts),
            "density": round(density, 3),
            "risk_score": risk_score,
            "risk_level": "HIGH" if risk_score >= 60 else "MEDIUM" if risk_score >= 30 else "LOW",
        })
    return clusters


def evaluate(clusters, ground_truth, all_person_ids):
    gt_members = set()
    for ring in ground_truth:
        gt_members.update(ring["person_ids"])

    detected_members = set()
    for c in clusters:
        detected_members.update(c["person_ids"])

    tp = len(gt_members & detected_members)
    fp = len(detected_members - gt_members)
    fn = len(gt_members - detected_members)
    tn = len(all_person_ids) - len(gt_members | detected_members)

    precision = tp / (tp + fp) if (tp + fp) else 0
    recall = tp / (tp + fn) if (tp + fn) else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0

    print("=" * 60)
    print("FRAUD RELATIONSHIP GRAPH ENGINE -- EVALUATION")
    print("=" * 60)
    print(f"Ground-truth ring members : {len(gt_members)}")
    print(f"Detected cluster members  : {len(detected_members)}")
    print(f"TP: {tp}  FP: {fp}  FN: {fn}  TN: {tn}")
    print(f"Precision: {precision:.2%}  Recall: {recall:.2%}  F1: {f1:.2%}")
    print("-" * 60)
    for c in clusters:
        print(f"{c['cluster_id']}: {c['size']} people, type={c['inferred_type']}, "
              f"risk={c['risk_level']} ({c['risk_score']})")
    print("=" * 60)


def main():
    persons, edges, ground_truth = load_data()
    G = build_graph(persons, edges)
    clusters = detect_clusters(G)

    with open(DATA_DIR / "fraud_graph_report.json", "w", encoding="utf-8") as f:
        json.dump(clusters, f, ensure_ascii=False, indent=2)

    evaluate(clusters, ground_truth, [p["person_id"] for p in persons])
    print("Full report written to: data/fraud_graph_report.json")


if __name__ == "__main__":
    main()