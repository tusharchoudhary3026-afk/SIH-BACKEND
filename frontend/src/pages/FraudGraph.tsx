import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import cytoscape, { Core, EventObject } from 'cytoscape';
import {
  Network,
  ArrowLeft,
  Search,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  FileText,
  User,
  AlertTriangle,
  X,
  Layers
} from 'lucide-react';
import { ApiService } from '../services/apiService';

interface GraphSummary {
  totalPersons: number;
  totalDocuments: number;
  totalEdges: number;
  suspiciousLinks: number;
  fraudRingsCount: number;
  clusters: Array<{
    cluster_id: string;
    person_ids: string[];
    size: number;
    dominant_relation: string;
    inferred_type: string;
    risk_score: number;
    risk_level: string;
  }>;
}

interface PersonDetail {
  person: {
    person_id: string;
    name: string;
    gender?: string;
    dob?: string;
    address?: string;
    face_ref?: string;
    ring?: string;
  };
  documents: Array<{
    document_id: string;
    doc_type: string;
    name_on_doc?: string;
    document_number?: string;
  }>;
  cluster: {
    cluster_id: string;
    size: number;
    dominant_relation: string;
    inferred_type: string;
    risk_score: number;
    risk_level: string;
    person_ids: string[];
  } | null;
  in_fraud_cluster: boolean;
  findings: Array<{
    check: string;
    severity: string;
    detail: string;
  }>;
}

export const FraudGraph: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const [summary, setSummary] = useState<GraphSummary | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonDetail | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'suspicious' | 'cluster_1' | 'cluster_2' | 'cluster_3'>('all');
  const [isLoading, setIsLoading] = useState(true);

  const [showEdgeLabels, setShowEdgeLabels] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<{
    sourceName: string;
    targetName: string;
    relation: string;
    rawRelation: string;
  } | null>(null);

  // Helper to get clean human-readable relation label
  const cleanRelationName = (rel?: string) => {
    if (!rel || rel === 'SUBMITTED') return '';
    switch (rel) {
      case 'SAME_DOCUMENT_NUMBER':
        return 'Same Document';
      case 'SAME_FACE':
        return 'Same Face';
      case 'SAME_ADDRESS':
        return 'Same Address';
      default:
        return rel.replace(/_/g, ' ');
    }
  };

  // Dynamically toggle edge labels on cytoscape graph
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (showEdgeLabels) {
      cy.edges('[label != "SUBMITTED"]').addClass('show-labels');
    } else {
      cy.edges().removeClass('show-labels');
    }
  }, [showEdgeLabels]);

  // Initialize Cytoscape graph
  useEffect(() => {
    let isMounted = true;

    async function initGraph() {
      if (!containerRef.current) return;
      setIsLoading(true);

      try {
        const [elementsData, summaryData] = await Promise.all([
          ApiService.getGraphElements(),
          ApiService.getGraphSummary()
        ]);

        if (!isMounted) return;
        setSummary(summaryData);

        const cy = cytoscape({
          container: containerRef.current,
          elements: [
            ...(elementsData.nodes || []).map((n: any) => ({ data: n.data })),
            ...(elementsData.edges || []).map((e: any) => ({
              data: {
                ...e.data,
                cleanLabel: cleanRelationName(e.data?.label),
                fullLabel: e.data?.label || ''
              }
            }))
          ],
          style: [
            // Base Node Style - Clean Sleek Dark Pill Label with High Contrast
            {
              selector: 'node',
              style: {
                'label': 'data(label)',
                'font-size': 11,
                'color': '#f8fafc',
                'font-family': 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                'font-weight': 'bold',
                'text-valign': 'bottom',
                'text-margin-y': 7,
                'text-background-color': '#0B0D14',
                'text-background-opacity': 0.94,
                'text-background-padding': '4px',
                'text-background-shape': 'roundrectangle',
                'text-border-color': 'rgba(255, 255, 255, 0.16)',
                'text-border-width': 1,
                'text-border-opacity': 0.8,
                'text-max-width': '125px',
                'text-wrap': 'ellipsis',
                'min-zoomed-font-size': 6,
                'z-index': 20,
                'transition-property': 'background-color, border-color, border-width, width, height, opacity',
                'transition-duration': 250
              }
            },
            // Person nodes (Genuine profiles)
            {
              selector: 'node[type = "person"]',
              style: {
                'width': 24,
                'height': 24,
                'background-color': '#10b981', // Genuine green
                'border-width': 2.5,
                'border-color': '#059669',
                'text-border-color': 'rgba(16, 185, 129, 0.3)'
              }
            },
            // Document nodes
            {
              selector: 'node[type = "document"]',
              style: {
                'width': 15,
                'height': 15,
                'background-color': '#38bdf8', // Cyan blue
                'border-width': 1.5,
                'border-color': '#0284c7',
                'font-size': 9,
                'color': '#94a3b8',
                'text-background-color': '#08121e',
                'text-border-color': 'rgba(56, 189, 248, 0.25)',
                'text-margin-y': 5,
                'z-index': 10
              }
            },
            // High-risk fraud cluster person
            {
              selector: 'node[?in_fraud_cluster]',
              style: {
                'background-color': '#ef4444', // Alert red
                'border-color': '#ffffff',
                'border-width': 2.5,
                'width': 30,
                'height': 30,
                'color': '#ffffff',
                'font-weight': 'bold',
                'text-background-color': '#1a0a0f',
                'text-background-opacity': 0.96,
                'text-border-color': 'rgba(239, 68, 68, 0.6)',
                'text-border-width': 1.5,
                'z-index': 30
              }
            },
            // Edges general (Document submissions)
            {
              selector: 'edge',
              style: {
                'width': 1.2,
                'line-color': '#2a3142',
                'target-arrow-shape': 'none',
                'curve-style': 'bezier',
                'opacity': 0.35,
                'z-index': 1
              }
            },
            // Suspicious collision edges base (no repetitive text clutter by default!)
            {
              selector: 'edge[label != "SUBMITTED"]',
              style: {
                'width': 2.5,
                'line-color': '#f87171',
                'target-arrow-shape': 'none',
                'curve-style': 'bezier',
                'control-point-step-size': 28,
                'opacity': 0.8,
                'line-style': 'solid',
                'label': '',
                'z-index': 5
              }
            },
            // Specific collision color by relation type
            {
              selector: 'edge[label = "SAME_FACE"]',
              style: {
                'line-color': '#ef4444' // Rose red
              }
            },
            {
              selector: 'edge[label = "SAME_DOCUMENT_NUMBER"]',
              style: {
                'line-color': '#f59e0b' // Amber/orange
              }
            },
            {
              selector: 'edge[label = "SAME_ADDRESS"]',
              style: {
                'line-color': '#a855f7' // Purple
              }
            },
            // When show-labels is toggled ON
            {
              selector: 'edge.show-labels',
              style: {
                'label': 'data(cleanLabel)',
                'font-size': 8,
                'color': '#fed7aa',
                'font-family': 'Inter, system-ui, sans-serif',
                'font-weight': 'bold',
                'text-background-color': '#0B0D14',
                'text-background-opacity': 0.95,
                'text-background-padding': '3px',
                'text-background-shape': 'roundrectangle',
                'text-border-color': 'rgba(245, 158, 11, 0.4)',
                'text-border-width': 1,
                'text-rotation': 'autorotate',
                'min-zoomed-font-size': 9,
                'z-index': 40
              }
            },
            // Hovered or selected edge
            {
              selector: 'edge.edge-hover, edge:selected',
              style: {
                'width': 4.5,
                'opacity': 1.0,
                'label': 'data(cleanLabel)',
                'font-size': 10,
                'color': '#ffffff',
                'font-family': 'Inter, system-ui, sans-serif',
                'font-weight': 'bold',
                'text-background-color': '#0B0D14',
                'text-background-opacity': 0.98,
                'text-background-padding': '4px',
                'text-background-shape': 'roundrectangle',
                'text-border-color': '#fbbf24',
                'text-border-width': 1.5,
                'text-rotation': 'autorotate',
                'z-index': 100
              }
            },
            // Selected node highlight (sleek double-ring halo, NO ugly square box overlay)
            {
              selector: 'node:selected',
              style: {
                'border-color': '#f59e0b',
                'border-width': 4,
                'overlay-opacity': 0,
                'text-border-color': '#f59e0b',
                'text-border-width': 2,
                'z-index': 50
              }
            }
          ],
          layout: {
            name: 'cose',
            animate: false,
            idealEdgeLength: 140, // Increased spacing so nodes have breathing room
            nodeRepulsion: 26000, // Strong repulsion to prevent crowding
            gravity: 0.18,
            edgeElasticity: 100,
            componentSpacing: 120,
            numIter: 800,
            nodeDimensionsIncludeLabels: true // Ensures node labels don't collide with neighboring nodes
          }
        });

        // Hover on edge highlights it and shows tooltip label
        cy.on('mouseover', 'edge', (evt: EventObject) => {
          const edge = evt.target;
          if (edge.data('label') !== 'SUBMITTED') {
            edge.addClass('edge-hover');
          }
        });
        cy.on('mouseout', 'edge', (evt: EventObject) => {
          const edge = evt.target;
          edge.removeClass('edge-hover');
        });

        // Click on edge listener
        cy.on('tap', 'edge', (evt: EventObject) => {
          const edge = evt.target;
          if (edge.data('label') !== 'SUBMITTED') {
            const sourceNode = edge.source();
            const targetNode = edge.target();
            setSelectedEdge({
              sourceName: sourceNode.data('label') || sourceNode.data('id'),
              targetName: targetNode.data('label') || targetNode.data('id'),
              relation: edge.data('cleanLabel') || edge.data('label'),
              rawRelation: edge.data('label')
            });
          }
        });

        // Click on node listener
        cy.on('tap', 'node', async (evt: EventObject) => {
          const node = evt.target;
          const nodeType = node.data('type');
          const nodeId = node.data('id');
          setSelectedEdge(null);

          if (nodeType === 'person') {
            setSelectedDocId(null);
            try {
              const res = await ApiService.getGraphPerson(nodeId);
              if (res.success) {
                setSelectedPerson(res);
              }
            } catch (err) {
              console.error('Failed to load person:', err);
            }
          } else {
            setSelectedPerson(null);
            setSelectedDocId(nodeId);
          }
        });

        // Click on canvas background dismisses drawer and edge popup
        cy.on('tap', (evt: EventObject) => {
          if (evt.target === cy) {
            setSelectedPerson(null);
            setSelectedDocId(null);
            setSelectedEdge(null);
          }
        });

        cyRef.current = cy;
      } catch (err) {
        console.error('Failed to load graph elements:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initGraph();

    return () => {
      isMounted = false;
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, []);

  // Filter clusters or focus on fraud rings
  const applyFilter = useCallback((filter: 'all' | 'suspicious' | 'cluster_1' | 'cluster_2' | 'cluster_3') => {
    const cy = cyRef.current;
    if (!cy || !summary) return;
    setActiveFilter(filter);

    if (filter === 'all') {
      cy.elements().removeClass('hidden').style('opacity', 1);
      cy.animate({ fit: { eles: cy.elements(), padding: 40 } }, { duration: 400 });
      return;
    }

    if (filter === 'suspicious') {
      const suspiciousEdges = cy.edges('[label != "SUBMITTED"]');
      const connectedNodes = suspiciousEdges.connectedNodes();
      const highlightSet = suspiciousEdges.union(connectedNodes);

      cy.elements().style('opacity', 0.08);
      highlightSet.style('opacity', 1);
      cy.animate({ fit: { eles: highlightSet, padding: 50 } }, { duration: 500 });
      return;
    }

    // Specific cluster filtering
    const clusterMap: Record<string, string> = {
      'cluster_1': 'CLUSTER_1',
      'cluster_2': 'CLUSTER_2',
      'cluster_3': 'CLUSTER_3'
    };

    const targetClusterId = clusterMap[filter];
    const targetCluster = summary.clusters.find(c => c.cluster_id === targetClusterId);

    if (targetCluster) {
      const memberNodeSelectors = targetCluster.person_ids.map(id => `node[id = "${id}"]`).join(', ');
      const memberNodes = cy.nodes(memberNodeSelectors);
      const memberEdges = memberNodes.edgesWith(memberNodes);
      const clusterEles = memberNodes.union(memberEdges);

      cy.elements().style('opacity', 0.06);
      clusterEles.style('opacity', 1);
      cy.elements().unselect();
      if (memberNodes.length > 0) {
        memberNodes[0].select();
      }

      cy.animate({
        fit: { eles: clusterEles, padding: 90 }
      }, { duration: 500 });

      // Automatically inspect the first person in this cluster
      if (targetCluster.person_ids.length > 0) {
        ApiService.getGraphPerson(targetCluster.person_ids[0]).then(res => {
          if (res.success) setSelectedPerson(res);
        });
      }
    }
  }, [summary]);

  // Isolate a specific syndicate from the side drawer
  const isolateCluster = useCallback((personIds: string[]) => {
    const cy = cyRef.current;
    if (!cy) return;

    const selectors = personIds.map(id => `node[id = "${id}"]`).join(', ');
    const memberNodes = cy.nodes(selectors);
    const memberEdges = memberNodes.edgesWith(memberNodes);
    const clusterEles = memberNodes.union(memberEdges);

    cy.elements().style('opacity', 0.06);
    clusterEles.style('opacity', 1);
    cy.elements().unselect();
    if (memberNodes.length > 0) {
      memberNodes[0].select();
    }

    cy.animate({
      fit: { eles: clusterEles, padding: 90 }
    }, { duration: 400 });
  }, []);

  // Search handler
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const res = await ApiService.searchGraph(searchQuery.trim());
      if (res.results && res.results.length > 0) {
        setSearchResults(res.results);
        const firstMatch = res.results[0];
        focusPerson(firstMatch.person_id || firstMatch.id);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const focusPerson = async (personId: string) => {
    const cy = cyRef.current;
    if (!cy) return;

    const node = cy.getElementById(personId);
    if (node && node.length > 0) {
      cy.elements().style('opacity', 1);
      cy.animate({
        center: { eles: node },
        zoom: 1.8
      }, { duration: 400 });
      node.select();

      const res = await ApiService.getGraphPerson(personId);
      if (res.success) {
        setSelectedPerson(res);
      }
      setSearchResults([]);
    }
  };

  const resetView = () => {
    const cy = cyRef.current;
    if (cy) {
      cy.elements().style('opacity', 1).unselect();
      cy.edges().removeClass('edge-hover');
      cy.animate({ fit: { eles: cy.elements(), padding: 40 } }, { duration: 400 });
      setActiveFilter('all');
      setSelectedPerson(null);
      setSelectedDocId(null);
      setSelectedEdge(null);
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  return (
    <div className="bg-[#090A0E] min-h-screen flex flex-col text-gray-100 selection:bg-orange-600 selection:text-white">
      {/* Top Header & Metrics Bar */}
      <header className="border-b border-white/10 bg-[#0F121C]/90 backdrop-blur-md sticky top-0 z-20 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/analyze"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-white bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Deepfake Scanner</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-400">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                Fraud Relationship Graph
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  Syndicate Ring Detection
                </span>
              </h1>
              <p className="text-[11px] text-gray-400 hidden sm:block">
                Multi-identity collision analysis discovering shared biometric faces, document reuse, and synthetic farms.
              </p>
            </div>
          </div>
        </div>

        {/* Live Syndicate Stats Chips */}
        {summary && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <div className="bg-[#141824] border border-white/10 px-3 py-1.5 rounded-xl hidden md:flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-gray-400">Identities:</span>
              <span className="text-white font-bold">{summary.totalPersons}</span>
            </div>

            <div className="bg-[#141824] border border-white/10 px-3 py-1.5 rounded-xl hidden md:flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-gray-400">Documents:</span>
              <span className="text-white font-bold">{summary.totalDocuments}</span>
            </div>

            <div className="bg-red-500/15 border border-red-500/30 px-3 py-1.5 rounded-xl flex items-center gap-2 text-red-400">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Fraud Rings:</span>
              <span className="font-bold">{summary.fraudRingsCount} Identified</span>
            </div>

            <div className="bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 rounded-xl hidden lg:flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Suspicious Links:</span>
              <span className="font-bold">{summary.suspiciousLinks} Collisions</span>
            </div>
          </div>
        )}
      </header>

      {/* Action Toolbar & Filters */}
      <div className="bg-[#0B0D14] border-b border-white/5 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 z-10">
        {/* Quick Syndicate Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono text-gray-400 uppercase mr-1">Rings:</span>

          <button
            onClick={() => applyFilter('all')}
            className={`text-xs px-3 py-1.5 rounded-full font-mono transition-colors cursor-pointer border ${
              activeFilter === 'all'
                ? 'bg-white/20 text-white border-white/30 font-bold'
                : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
            }`}
          >
            All Entities
          </button>

          <button
            onClick={() => applyFilter('cluster_1')}
            className={`text-xs px-3 py-1.5 rounded-full font-mono transition-colors cursor-pointer border flex items-center gap-1.5 ${
              activeFilter === 'cluster_1'
                ? 'bg-red-500/30 text-red-300 border-red-500/60 font-bold'
                : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span>Cluster 1: Shared Face (4 IDs)</span>
          </button>

          <button
            onClick={() => applyFilter('cluster_2')}
            className={`text-xs px-3 py-1.5 rounded-full font-mono transition-colors cursor-pointer border flex items-center gap-1.5 ${
              activeFilter === 'cluster_2'
                ? 'bg-amber-500/30 text-amber-300 border-amber-500/60 font-bold'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Cluster 2: Document Reuse (5 IDs)</span>
          </button>

          <button
            onClick={() => applyFilter('cluster_3')}
            className={`text-xs px-3 py-1.5 rounded-full font-mono transition-colors cursor-pointer border flex items-center gap-1.5 ${
              activeFilter === 'cluster_3'
                ? 'bg-yellow-500/30 text-yellow-300 border-yellow-500/60 font-bold'
                : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            <span>Cluster 3: Address Farm (6 IDs)</span>
          </button>

          <button
            onClick={() => applyFilter('suspicious')}
            className={`text-xs px-3 py-1.5 rounded-full font-mono transition-colors cursor-pointer border ${
              activeFilter === 'suspicious'
                ? 'bg-orange-500/30 text-orange-300 border-orange-500/60 font-bold'
                : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
            }`}
          >
            Suspicious Links
          </button>

          {/* Toggle Connection Labels */}
          <button
            onClick={() => setShowEdgeLabels(!showEdgeLabels)}
            className={`text-xs px-3 py-1.5 rounded-full font-mono transition-colors cursor-pointer border flex items-center gap-1.5 ${
              showEdgeLabels
                ? 'bg-purple-500/30 text-purple-300 border-purple-500/60 font-bold'
                : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
            }`}
            title="Toggle connection relationship labels on edges"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Labels: {showEdgeLabels ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Search Input & View Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) setSearchResults([]);
              }}
              placeholder="Search person or ID (e.g. Rahul, RA001)..."
              className="bg-[#141824] border border-white/10 text-xs text-white pl-8 pr-3 py-1.5 rounded-xl w-60 focus:outline-none focus:border-orange-500"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />

            {searchResults.length > 0 && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-[#141824] border border-white/10 rounded-xl shadow-2xl p-1.5 z-30 space-y-1">
                {searchResults.map((m: any, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => focusPerson(m.person_id || m.id)}
                    className="w-full text-left p-2 rounded-lg hover:bg-white/10 transition-colors flex items-center justify-between text-xs cursor-pointer"
                  >
                    <span className="font-bold text-white truncate">{m.name || m.canonical_name_en}</span>
                    <span className="text-[10px] font-mono text-gray-400">{m.person_id || m.id}</span>
                  </button>
                ))}
              </div>
            )}
          </form>

          <button
            onClick={resetView}
            title="Reset View"
            className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Canvas + Side Drawer Container */}
      <div className="flex-1 relative overflow-hidden flex">
        {/* Cytoscape Canvas */}
        <div ref={containerRef} className="w-full h-[calc(100vh-130px)] bg-[#08090D]" />

        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
            <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-xs font-mono text-gray-300">Constructing Identity Network Graph...</span>
          </div>
        )}

        {/* Edge Selection Banner */}
        {selectedEdge && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#111420]/95 backdrop-blur-xl border border-amber-500/40 px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <div className="text-xs font-mono">
              <span className="text-gray-400">Suspicious Collision: </span>
              <span className="text-white font-bold">{selectedEdge.sourceName}</span>
              <span className="text-amber-400 font-bold mx-2">↔ {selectedEdge.relation} ↔</span>
              <span className="text-white font-bold">{selectedEdge.targetName}</span>
            </div>
            <button
              onClick={() => setSelectedEdge(null)}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors ml-2 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Interactive Legend Bar (Bottom Left) */}
        <div className="absolute bottom-4 left-4 z-10 bg-[#121622]/90 backdrop-blur-md border border-white/10 p-3 rounded-2xl shadow-2xl text-[11px] font-mono space-y-1.5 pointer-events-none">
          <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Legend</div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
            <span className="text-gray-300">Genuine Citizen Profile</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ef4444] border border-white" />
            <span className="text-red-400 font-bold">Fraud Ring Member</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-[#38bdf8]" />
            <span className="text-sky-300">Document Node</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
            <span className="w-3 h-0.5 bg-[#f59e0b] rounded-full" />
            <span className="text-amber-300 text-[10px]">Same Document Link</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-[#ef4444] rounded-full" />
            <span className="text-red-300 text-[10px]">Same Face Link</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-[#a855f7] rounded-full" />
            <span className="text-purple-300 text-[10px]">Same Address Link</span>
          </div>
        </div>

        {/* Syndicate Inspector Slide-Out Drawer */}
        {selectedPerson && (
          <aside className="absolute top-0 right-0 h-full w-full sm:w-96 bg-[#111420]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-20 flex flex-col animate-slide-left overflow-y-auto">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedPerson.person.name}</h3>
                  <span className="text-xs font-mono text-gray-400">{selectedPerson.person.person_id}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPerson(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 flex-1">
              {/* Syndicate Alert Banner */}
              {selectedPerson.in_fraud_cluster && selectedPerson.cluster ? (
                <div className="bg-red-500/15 border-2 border-red-500/40 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase text-red-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Fraud Syndicate Detected
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-red-900 text-red-200 font-bold">
                      {selectedPerson.cluster.risk_level} RISK
                    </span>
                  </div>

                  <h4 className="text-sm font-black text-white">
                    {selectedPerson.cluster.cluster_id}: {selectedPerson.cluster.inferred_type.toUpperCase().replace('_', ' ')}
                  </h4>

                  <p className="text-xs text-red-200 leading-relaxed">
                    This identity is cross-referenced with {selectedPerson.cluster.size - 1} other identities sharing{' '}
                    <span className="font-bold underline">{selectedPerson.cluster.dominant_relation}</span>.
                  </p>

                  <button
                    onClick={() => isolateCluster(selectedPerson.cluster?.person_ids || [])}
                    className="w-full mt-2 text-xs font-mono font-bold text-white bg-red-600 hover:bg-red-500 py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Focus Entire Fraud Ring ({selectedPerson.cluster.size} Profiles)</span>
                  </button>
                </div>
              ) : (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-white">Isolated Clean Identity</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      No cross-identity biometric or document reuse collisions found in the database.
                    </p>
                  </div>
                </div>
              )}

              {/* Profile Details */}
              <div className="bg-[#0B0D15] rounded-2xl p-4 border border-white/5 space-y-3">
                <span className="text-[10px] font-mono font-bold uppercase text-gray-400 block mb-1">
                  Identity Attributes
                </span>

                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Gender:</span>
                  <span className="font-mono text-white">{selectedPerson.person.gender || 'N/A'}</span>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Date of Birth:</span>
                  <span className="font-mono text-white">{selectedPerson.person.dob || 'N/A'}</span>
                </div>

                <div className="text-xs space-y-1">
                  <span className="text-gray-400 block">Registered Address:</span>
                  <p className="font-mono text-gray-300 text-[11px] bg-white/[0.02] p-2 rounded-lg border border-white/5">
                    {selectedPerson.person.address || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Associated Documents */}
              <div className="bg-[#0B0D15] rounded-2xl p-4 border border-white/5 space-y-3">
                <span className="text-[10px] font-mono font-bold uppercase text-gray-400 block">
                  Associated KYC Documents ({selectedPerson.documents.length})
                </span>

                <div className="space-y-2">
                  {selectedPerson.documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-sky-400" />
                        <div>
                          <span className="font-bold text-white block">{doc.doc_type}</span>
                          <span className="text-[10px] font-mono text-gray-400">{doc.document_number || doc.document_id}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        {doc.document_id}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Document Quick View Drawer */}
        {selectedDocId && (
          <aside className="absolute top-0 right-0 h-full w-full sm:w-80 bg-[#111420]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-20 p-5 animate-slide-left">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-bold text-white">Document Node</h3>
              </div>
              <button onClick={() => setSelectedDocId(null)} className="text-gray-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-[#0B0D15] p-3 rounded-xl border border-white/5 space-y-2">
              <span className="text-[10px] font-mono text-gray-400 uppercase">Document Identifier</span>
              <p className="text-xs font-mono font-bold text-white">{selectedDocId}</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
