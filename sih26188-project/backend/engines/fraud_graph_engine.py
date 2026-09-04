# """
# fraud_graph_engine.py
# ------------------------
# Engine 8 detection logic: loads the fraud graph dataset and uses NetworkX
# to AUTO-DETECT the fraud rings (connected-component clustering on suspicious
# edges), scores each cluster's risk, and evaluates against ground truth.

# Run order:
#   1. python3 fraud_graph_generator.py
#   2. python3 fraud_graph_engine.py
# """

# import json
# from pathlib import Path
# from collections import defaultdict

# import networkx as nx

# DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# SUSPICIOUS_RELATIONS = {"SAME_FACE", "SAME_DOCUMENT_NUMBER", "SAME_ADDRESS"}
# RELATION_WEIGHT = {"SAME_FACE": 3, "SAME_DOCUMENT_NUMBER": 3, "SAME_ADDRESS": 1}


# def load_data():
#     with open(DATA_DIR / "fraud_graph_persons.json", encoding="utf-8") as f:
#         persons = json.load(f)
#     with open(DATA_DIR / "fraud_graph_edges.json", encoding="utf-8") as f:
#         edges = json.load(f)
#     with open(DATA_DIR / "fraud_rings_ground_truth.json", encoding="utf-8") as f:
#         ground_truth = json.load(f)
#     return persons, edges, ground_truth


# def build_graph(persons, edges):
#     G = nx.Graph()
#     for p in persons:
#         G.add_node(p["person_id"], name=p["name"])
#     for e in edges:
#         if e["relation"] in SUSPICIOUS_RELATIONS:
#             if G.has_edge(e["source"], e["target"]):
#                 G[e["source"]][e["target"]]["weight"] += RELATION_WEIGHT[e["relation"]]
#                 G[e["source"]][e["target"]]["relations"].append(e["relation"])
#             else:
#                 G.add_edge(e["source"], e["target"], weight=RELATION_WEIGHT[e["relation"]],
#                            relations=[e["relation"]])
#     return G


# def detect_clusters(G):
#     clusters = []
#     for component in nx.connected_components(G):
#         if len(component) < 2:
#             continue
#         subgraph = G.subgraph(component)
#         relation_counts = defaultdict(int)
#         for _, _, data in subgraph.edges(data=True):
#             for r in data["relations"]:
#                 relation_counts[r] += 1

#         dominant_relation = max(relation_counts, key=relation_counts.get)
#         cluster_type = {
#             "SAME_FACE": "shared_face",
#             "SAME_DOCUMENT_NUMBER": "document_reuse",
#             "SAME_ADDRESS": "synthetic_farm",
#         }.get(dominant_relation, "mixed")

#         density = nx.density(subgraph)
#         avg_weight = sum(d["weight"] for _, _, d in subgraph.edges(data=True)) / subgraph.number_of_edges()
#         risk_score = min(100, int(avg_weight * 10 + len(component) * 5 + density * 20))

#         clusters.append({
#             "cluster_id": f"CLUSTER_{len(clusters)+1}",
#             "person_ids": sorted(component),
#             "size": len(component),
#             "dominant_relation": dominant_relation,
#             "inferred_type": cluster_type,
#             "relation_counts": dict(relation_counts),
#             "density": round(density, 3),
#             "risk_score": risk_score,
#             "risk_level": "HIGH" if risk_score >= 60 else "MEDIUM" if risk_score >= 30 else "LOW",
#         })
#     return clusters


# def evaluate(clusters, ground_truth, all_person_ids):
#     gt_members = set()
#     for ring in ground_truth:
#         gt_members.update(ring["person_ids"])

#     detected_members = set()
#     for c in clusters:
#         detected_members.update(c["person_ids"])

#     tp = len(gt_members & detected_members)
#     fp = len(detected_members - gt_members)
#     fn = len(gt_members - detected_members)
#     tn = len(all_person_ids) - len(gt_members | detected_members)

#     precision = tp / (tp + fp) if (tp + fp) else 0
#     recall = tp / (tp + fn) if (tp + fn) else 0
#     f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0

#     print("=" * 60)
#     print("FRAUD RELATIONSHIP GRAPH ENGINE -- EVALUATION")
#     print("=" * 60)
#     print(f"Ground-truth ring members : {len(gt_members)}")
#     print(f"Detected cluster members  : {len(detected_members)}")
#     print(f"TP: {tp}  FP: {fp}  FN: {fn}  TN: {tn}")
#     print(f"Precision: {precision:.2%}  Recall: {recall:.2%}  F1: {f1:.2%}")
#     print("-" * 60)
#     for c in clusters:
#         print(f"{c['cluster_id']}: {c['size']} people, type={c['inferred_type']}, "
#               f"risk={c['risk_level']} ({c['risk_score']})")
#     print("=" * 60)


# def main():
#     persons, edges, ground_truth = load_data()
#     G = build_graph(persons, edges)
#     clusters = detect_clusters(G)

#     with open(DATA_DIR / "fraud_graph_report.json", "w", encoding="utf-8") as f:
#         json.dump(clusters, f, ensure_ascii=False, indent=2)

#     evaluate(clusters, ground_truth, [p["person_id"] for p in persons])
#     print("Full report written to: data/fraud_graph_report.json")


# if __name__ == "__main__":
#     main()

"""
fraud_graph_engine.py
-----------------------
Engine 8: Fraud Relationship Graph.

Consumes:
  data/graph_edges.csv
  data/persons.json
  data/consistency_report.json (if present)

Produces:
  data/graph_clusters.json
  data/graph_cytoscape.json
  data/graph_person_index.json
"""

import csv
import json
from collections import defaultdict
from pathlib import Path

import networkx as nx

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

SUSPICIOUS_RELATIONS = {"SAME_FACE", "SAME_DOCUMENT_NUMBER"}


def load_edges():
    with open(DATA_DIR / "graph_edges.csv", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_json(filename):
    path = DATA_DIR / filename
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_full_graph(edges):
    g = nx.MultiDiGraph()
    for e in edges:
        g.add_edge(
            e["source"], e["target"],
            relation=e["relation"],
            confidence=float(e["confidence"]),
            note=e["note"],
        )
    return g


def build_suspicious_subgraph(edges):
    g = nx.Graph()
    for e in edges:
        if e["relation"] in SUSPICIOUS_RELATIONS:
            g.add_edge(e["source"], e["target"], relation=e["relation"])
    return g


def detect_clusters(suspicious_graph):
    clusters = []
    for i, component in enumerate(nx.connected_components(suspicious_graph)):
        if len(component) < 2:
            continue

        subgraph = suspicious_graph.subgraph(component)
        relation_types = {data["relation"] for _, _, data in subgraph.edges(data=True)}

        if len(component) >= 3 or len(relation_types) >= 2:
            severity = "HIGH"
        else:
            severity = "MEDIUM"

        clusters.append({
            "cluster_id": f"CLUSTER-{i+1:03d}",
            "member_person_ids": sorted(component),
            "cluster_size": len(component),
            "relation_types": sorted(relation_types),
            "severity": severity,
            "edges": [
                {"source": u, "target": v, "relation": d["relation"]}
                for u, v, d in subgraph.edges(data=True)
            ],
        })
    return clusters


def build_person_index(clusters, persons):
    index = {}
    for cluster in clusters:
        for pid in cluster["member_person_ids"]:
            index[pid] = {
                "cluster_id": cluster["cluster_id"],
                "cluster_size": cluster["cluster_size"],
                "severity": cluster["severity"],
                "relation_types": cluster["relation_types"],
            }

    all_person_ids = {p["person_id"] for p in persons}
    for pid in all_person_ids:
        if pid not in index:
            index[pid] = None

    return index


def build_cytoscape_elements(full_graph, persons, person_index, consistency_report):
    persons_by_id = {p["person_id"]: p for p in persons}
    risk_by_person = {}
    if consistency_report:
        risk_by_person = {r["person_id"]: r["risk_level"] for r in consistency_report}

    nodes = []
    seen_nodes = set()

    for node_id in full_graph.nodes():
        if node_id in seen_nodes:
            continue
        seen_nodes.add(node_id)

        is_person = node_id in persons_by_id
        cluster_info = person_index.get(node_id) if is_person else None

        node_data = {
            "id": node_id,
            "label": persons_by_id[node_id]["canonical_name_en"] if is_person else node_id,
            "type": "person" if is_person else "document",
            "risk_level": risk_by_person.get(node_id, "NONE") if is_person else None,
            "in_fraud_cluster": cluster_info is not None,
            "cluster_id": cluster_info["cluster_id"] if cluster_info else None,
            "cluster_severity": cluster_info["severity"] if cluster_info else None,
        }
        nodes.append({"data": node_data})

    edges = []
    edge_counter = 0
    for u, v, data in full_graph.edges(data=True):
        edge_counter += 1
        edges.append({
            "data": {
                "id": f"e{edge_counter}",
                "source": u,
                "target": v,
                "relation": data["relation"],
                "confidence": data["confidence"],
                "suspicious": data["relation"] in SUSPICIOUS_RELATIONS,
            }
        })

    return {"nodes": nodes, "edges": edges}


def main():
    edges = load_edges()
    persons = load_json("persons.json") or []
    consistency_report = load_json("consistency_report.json")

    full_graph = build_full_graph(edges)
    suspicious_graph = build_suspicious_subgraph(edges)

    clusters = detect_clusters(suspicious_graph)
    person_index = build_person_index(clusters, persons)
    cytoscape_elements = build_cytoscape_elements(full_graph, persons, person_index, consistency_report)

    with open(DATA_DIR / "graph_clusters.json", "w", encoding="utf-8") as f:
        json.dump(clusters, f, ensure_ascii=False, indent=2)

    with open(DATA_DIR / "graph_person_index.json", "w", encoding="utf-8") as f:
        json.dump(person_index, f, ensure_ascii=False, indent=2)

    with open(DATA_DIR / "graph_cytoscape.json", "w", encoding="utf-8") as f:
        json.dump(cytoscape_elements, f, ensure_ascii=False, indent=2)

    print("=" * 60)
    print("ENGINE 8 -- FRAUD RELATIONSHIP GRAPH")
    print("=" * 60)
    print(f"Total nodes in graph: {full_graph.number_of_nodes()}")
    print(f"Total edges in graph: {full_graph.number_of_edges()}")
    print(f"Suspicious clusters (fraud rings) found: {len(clusters)}")
    for c in clusters:
        print(f"  {c['cluster_id']} | severity={c['severity']} | "
              f"size={c['cluster_size']} | types={c['relation_types']} | "
              f"members={c['member_person_ids']}")
    print("=" * 60)
    print(f"Written to: {DATA_DIR.resolve()}")


if __name__ == "__main__":
    main()

