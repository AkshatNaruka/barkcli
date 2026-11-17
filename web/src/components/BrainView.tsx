import React, { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react";
import { fetchBrain, fetchBrainNode, fetchFacts, fetchMemory, fetchThreads, type BrainNode, type BrainEdge } from "../lib/api";
import { navigate } from "../lib/hashnav";
import { Icon } from "./Icon";
import { LabelChip } from "./LabelChip";
import { QuietSelect } from "./QuietSelect";
import { GraphNodeCard, type BrainNodeData } from "./brain/GraphNodeCard";
import {
  buildEgo,
  layoutGraph,
  layoutOverview,
  pickAnchors,
  TIER,
  KIND_ICON,
  NODE_W,
  NODE_H,
} from "./brain/layout";
import { ContributionsPanel } from "./ContributionsPanel";
import { Brain3DGraph } from "./brain/Brain3DGraph";

export function BrainView({
  boardName,
  initialMode = "3d",
}: {
  boardName: string | null;
  initialMode?: "3d" | "2d" | "graph" | "contributions";
}) {
  const [mode, setMode] = useState<"3d" | "2d" | "contributions">(() => {
    if (initialMode === "2d") return "2d";
    if (initialMode === "contributions") return "contributions";
    return "3d";
  });
  const [nodes, setNodes] = useState<BrainNode[]>([]);
  const [edges, setEdges] = useState<BrainEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 2D flow has three depths: a small anchor map, one node's neighbourhood,
  // and the full graph. Anything wider than the anchor map is opt-in.
  const [egoId, setEgoId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [neighbors, setNeighbors] = useState<BrainNode[]>([]);
  const [neighborsExpanded, setNeighborsExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const g = await fetchBrain(boardName || undefined);
        if (!active) return;
        setNodes(g.nodes || []);
        setEdges(g.edges || []);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadData();
    return () => {
      active = false;
    };
  }, [boardName]);

  // Resolve the selected node's neighbors for the 2D inspector
  useEffect(() => {
    if (!selectedId) {
      setNeighbors([]);
      return;
    }
    const local = edges
      .filter((e) => e.from === selectedId || e.to === selectedId)
      .map((e) => (e.from === selectedId ? e.to : e.from))
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is BrainNode => Boolean(n));
    if (local.length > 0) {
      setNeighbors(local);
      return;
    }
    fetchBrainNode(selectedId, boardName || undefined).then((r) => {
      setNeighbors(r?.neighbors ?? []);
    });
  }, [selectedId, edges, nodes, boardName]);

  const searchHit = (n: BrainNode) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      n.label.toLowerCase().includes(q) ||
      n.id.toLowerCase().includes(q) ||
      (n.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  };

  // Filters are the only thing that removes nodes outright; the 2D view then
  // decides how many of the survivors to draw.
  const filteredNodeMap = useMemo(() => {
    const m = new Map<string, BrainNode>();
    for (const n of nodes) {
      if (tierFilter && n.tier !== tierFilter) continue;
      if (kindFilter && n.kind !== kindFilter) continue;
      m.set(n.id, n);
    }
    return m;
  }, [nodes, tierFilter, kindFilter]);

  const filteredNodes = useMemo(() => Array.from(filteredNodeMap.values()), [filteredNodeMap]);
  const filteredEdges = useMemo(() => {
    return edges.filter((e) => filteredNodeMap.has(e.from) && filteredNodeMap.has(e.to));
  }, [edges, filteredNodeMap]);

  const rfBase = useMemo<Node[]>(
    () =>
      filteredNodes.map((n) => ({
        id: n.id,
        type: "brainNode",
        position: { x: 0, y: 0 },
        width: NODE_W,
        height: NODE_H,
        data: {
          label: n.label,
          kind: n.kind,
          tier: n.tier,
          importance: n.importance ?? 0,
          tags: n.tags ?? [],
        } satisfies BrainNodeData,
      })),
    [filteredNodes]
  );

  const rfEdgesBase = useMemo<Edge[]>(
    () =>
      filteredEdges.map((e) => ({
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        type: "straight",
        data: { weight: e.weight, kind: e.kind },
      })),
    [filteredEdges]
  );

  const view = useMemo(() => {
    if (showAll) {
      const laid = layoutGraph(rfBase, rfEdgesBase);
      return { kind: "all" as const, nodes: laid.nodes, edges: laid.edges, connections: 0, shown: 0 };
    }
    if (egoId) {
      const ego = buildEgo(egoId, rfBase, rfEdgesBase);
      if (ego) return { kind: "ego" as const, ...ego };
    }
    const anchors = pickAnchors(rfBase, rfEdgesBase, { search });
    return { kind: "overview" as const, ...layoutOverview(anchors, rfEdgesBase), connections: 0, shown: 0 };
  }, [showAll, egoId, rfBase, rfEdgesBase, search]);

  // Drop a drilled-in or selected node if a filter hides it.
  useEffect(() => {
    if (egoId && !filteredNodeMap.has(egoId)) setEgoId(null);
    if (selectedId && !filteredNodeMap.has(selectedId)) setSelectedId(null);
  }, [egoId, selectedId, filteredNodeMap]);

  useEffect(() => {
    setNeighborsExpanded(false);
  }, [selectedId]);

  const rfNodes = useMemo(
    () =>
      view.nodes.map((n) => ({
        ...n,
        data: { ...(n.data as unknown as BrainNodeData), focus: selectedId === n.id },
      })),
    [view.nodes, selectedId]
  );

  const rfEdges = useMemo(() => {
    // The full map is a 64-node texture. Drawing its 200 links by default is
    // noise; selecting a node reveals just that node's links.
    const source =
      view.kind === "all"
        ? selectedId
          ? view.edges.filter((e) => e.source === selectedId || e.target === selectedId)
          : []
        : view.edges;
    return source.map((e) => {
      const weight = Number((e.data as any)?.weight ?? 0.6);
      const adjacent = !selectedId || e.source === selectedId || e.target === selectedId;
      return {
        ...e,
        type: "straight",
        style: {
          stroke: adjacent && selectedId ? "var(--muted)" : "var(--border-strong)",
          strokeWidth: adjacent && selectedId ? 1.4 : 0.9,
          opacity: selectedId
            ? adjacent
              ? 0.85
              : 0.1
            : view.kind === "all"
              ? 0.16 + weight * 0.2
              : 0.4 + weight * 0.35,
        },
      };
    });
  }, [view.edges, view.kind, selectedId]);

  const selected = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;
  const egoFocus = egoId ? nodes.find((n) => n.id === egoId) ?? null : null;
  const q = search.trim().toLowerCase();
  const matchCount = q
    ? [...filteredNodeMap.values()].filter((n) =>
        n.label.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        (n.tags ?? []).some((t) => t.toLowerCase().includes(q))
      ).length
    : 0;

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedId(node.id);
    // From the anchor map, a click expands that node's neighbourhood.
    if (!showAll) setEgoId(node.id);
  };

  // Search re-ranks the anchor map, so typing leaves a drilled-in view.
  const handleSearch = (value: string) => {
    setSearch(value);
    if (!value.trim()) return;
    setEgoId(null);
    setShowAll(false);
    setSelectedId(null);
  };

  const backToOverview = () => {
    setEgoId(null);
    setShowAll(false);
    setSelectedId(null);
  };

  const countLabel =
    mode === "contributions"
      ? "Run ancestry and evidence links."
      : mode === "2d"
        ? `${view.nodes.length} of ${filteredNodeMap.size} nodes${rfEdges.length ? ` · ${rfEdges.length} links` : ""}`
        : `${filteredNodeMap.size} of ${nodes.length} nodes · ${edges.length} links`;

  return (
    <div className="h-full flex flex-col p-4 gap-3 bg-bg">
      {/* Command header */}
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        {/* Mode Selector: fixed left-aligned position just like SkillsView */}
        <div className="flex items-center rounded-lg border border-border/80 bg-surface/60 p-0.5 shadow-sm shrink-0 w-fit">
          <button
            type="button"
            onClick={() => setMode("3d")}
            className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              mode === "3d" ? "bg-accent/20 text-accent border border-accent/30 shadow-xs" : "text-muted hover:text-text"
            }`}
            title="Interactive 3D Knowledge Graph"
          >
            <Icon name="spark" size={12} />
            <span>3D Orbit</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("2d")}
            className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              mode === "2d" ? "bg-card text-text border border-border/60 shadow-xs" : "text-muted hover:text-text"
            }`}
            title="2D Flow Cards Diagram"
          >
            <Icon name="layers" size={12} />
            <span>2D Flow</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("contributions")}
            className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              mode === "contributions" ? "bg-card text-text border border-border/60 shadow-xs" : "text-muted hover:text-text"
            }`}
            title="Activity & Contributions Analysis"
          >
            <Icon name="clock" size={12} />
            <span>Contributions</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted min-w-0">
          <span>{countLabel}</span>
        </div>

        {mode !== "contributions" && (
          <div className="flex gap-2 items-center flex-wrap ml-auto">
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search graph…"
              className="w-44 bg-card border border-border/60 focus:border-accent/60 px-3 py-1.5 rounded-md text-xs text-text placeholder:text-muted/60 focus:outline-none"
            />
            <QuietSelect
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              title="Memory layer"
              className="bg-card px-2.5 py-1.5 text-xs"
            >
              <option value="">All Layers</option>
              {Object.entries(TIER).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </QuietSelect>
            <QuietSelect
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              title="Node kind"
              className="bg-card px-2.5 py-1.5 text-xs"
            >
              <option value="">All Kinds</option>
              {[
                "subsystem",
                "module",
                "service",
                "api",
                "model",
                "invariant",
                "convention",
                "decision",
                "pitfall",
                "fact",
                "memory",
              ].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </QuietSelect>
            <button
              onClick={() => {
                setShowAll((v) => !v);
                setEgoId(null);
              }}
              title={showAll ? "Back to the anchor map" : "Draw every node and link"}
              className={`px-2.5 py-1.5 rounded-md text-xs border transition-colors cursor-pointer ${
                showAll
                  ? "border-accent/40 text-accent bg-accent/15"
                  : "border-border/60 text-muted hover:text-text"
              }`}
            >
              {showAll ? "Overview" : `All (${filteredNodeMap.size})`}
            </button>
          </div>
        )}
      </div>

      {/* Legend & Filter Dots */}
      {mode !== "contributions" && (
        <div className="flex items-center gap-3 text-[11px] text-muted shrink-0 flex-wrap">
          <span className="text-[10px] uppercase font-mono tracking-wider text-muted-dim">Layers:</span>
          {Object.entries(TIER).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTierFilter(tierFilter === k ? "" : k)}
              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                tierFilter === k ? "bg-accent/15 text-accent font-medium" : "hover:text-text"
              }`}
              title={`Filter: ${v.label}`}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />
              <span>{v.label}</span>
            </button>
          ))}
          {q !== "" && (
            <span className="ml-auto text-[11px]">
              {matchCount} match{matchCount === 1 ? "" : "es"} · showing {view.nodes.length}
            </span>
          )}
        </div>
      )}

      {/* Main View Area */}
      {mode === "contributions" ? (
        <ContributionsPanel />
      ) : mode === "3d" ? (
        /* 3D Force-Directed Knowledge Graph (Second Brain OS 3D) */
        <div className="flex-1 bg-surface rounded-xl overflow-hidden min-h-0 border border-border/50 shadow-inner">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted">
              Loading 3D knowledge graph…
            </div>
          ) : (
            <Brain3DGraph
              nodes={filteredNodes}
              edges={filteredEdges}
              selectedId={selectedId}
              onSelectNode={(n) => setSelectedId(n ? n.id : null)}
              searchQuery={search}
              tierFilter={tierFilter}
              kindFilter={kindFilter}
              boardName={boardName}
            />
          )}
        </div>
      ) : (
        /* 2D ReactFlow Diagram */
        <div className="flex-1 flex min-h-0 gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {/* Depth breadcrumb: where you are, and the way back up. */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-0.5 text-[11px] text-muted">
              {view.kind === "overview" ? (
                <>
                  <span className="font-medium text-text">Overview</span>
                  <span className="text-muted-dim">—</span>
                  <span>click a node to open its neighbourhood</span>
                </>
              ) : view.kind === "ego" && egoFocus ? (
                <>
                  <button
                    type="button"
                    onClick={backToOverview}
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 -ml-1 transition-colors hover:bg-surface hover:text-text cursor-pointer"
                    aria-label="Back to overview"
                  >
                    <Icon name="arrowLeft" size={11} />
                    Overview
                  </button>
                  <span className="text-muted-dim">/</span>
                  <span className="max-w-[320px] truncate font-medium text-text" title={egoFocus.label}>
                    {egoFocus.label}
                  </span>
                  <span className="text-muted-dim">·</span>
                  <span>
                    {view.shown} of {view.connections} connection{view.connections === 1 ? "" : "s"}
                  </span>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={backToOverview}
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 -ml-1 transition-colors hover:bg-surface hover:text-text cursor-pointer"
                    aria-label="Back to overview"
                  >
                    <Icon name="arrowLeft" size={11} />
                    Overview
                  </button>
                  <span className="text-muted-dim">/</span>
                  <span className="font-medium text-text">Full map</span>
                  <span className="text-muted-dim">·</span>
                  <span>
                    {selectedId
                      ? `links for ${selected?.label ?? "this node"}`
                      : "select a node to see its links"}
                  </span>
                </>
              )}
            </div>

            <div className="flex-1 bg-surface rounded-xl overflow-hidden min-h-0 border border-border/50">
              {loading ? (
                <div className="h-full flex items-center justify-center text-sm text-muted">Loading graph…</div>
              ) : view.nodes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-1 text-sm text-muted">
                  <span className="text-text">No nodes match</span>
                  <span className="text-xs">
                    {q && filteredNodeMap.size > 0
                      ? `Nothing found for “${search.trim()}”`
                      : "Adjust layer or kind filters"}
                  </span>
                </div>
              ) : (
                <ReactFlow
                  key={view.nodes.map((n) => n.id).join("|")}
                  nodes={rfNodes}
                  edges={rfEdges}
                  nodeTypes={{ brainNode: GraphNodeCard }}
                  onNodeClick={handleNodeClick}
                  onPaneClick={() => {
                    setSelectedId(null);
                    if (!showAll) setEgoId(null);
                  }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  onlyRenderVisibleElements={true}
                  zoomOnDoubleClick={false}
                  minZoom={showAll ? 0.15 : 0.45}
                  maxZoom={2.2}
                  proOptions={{ hideAttribution: false }}
                  fitView
                  fitViewOptions={{ padding: 0.16, maxZoom: 1.15 }}
                >
                  <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
                  <Controls position="bottom-left" showInteractive={false} />
                  {showAll && (
                    <MiniMap
                      position="bottom-right"
                      pannable
                      zoomable
                      nodeColor={(n) => {
                        const d = (n.data ?? {}) as unknown as BrainNodeData;
                        const hex = d.tier ? TIER[d.tier]?.color : undefined;
                        return hex || "#64748b";
                      }}
                      nodeStrokeWidth={0}
                      style={{ width: 150, height: 92, background: "var(--card)", borderRadius: 10 }}
                      maskColor="rgba(120, 120, 130, 0.30)"
                    />
                  )}
                </ReactFlow>
              )}
            </div>
          </div>

          {/* 2D Inspector Drawer */}
          {selected && (
            <div className="w-72 shrink-0 overflow-y-auto p-3 rounded-xl bg-surface border border-border/50">
              <div className="flex items-center gap-1.5">
                <span className="text-muted flex" title={selected.kind}>
                  <Icon name={(KIND_ICON[selected.kind] || "layers") as any} size={12} />
                </span>
                {selected.tier && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: TIER[selected.tier]?.color }}
                    title={TIER[selected.tier]?.label}
                  />
                )}
                <span className="text-[10px] uppercase tracking-wider text-muted">{selected.kind}</span>
                <button
                  onClick={backToOverview}
                  className="ml-auto text-muted hover:text-text cursor-pointer"
                  title="Close and return to overview"
                  aria-label="Close details"
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
              <p className="text-sm text-text font-medium mt-2 leading-snug">{selected.label}</p>
              {selected.description && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{selected.description}</p>
              )}
              <div className="mt-2.5 text-[11px] text-muted space-y-1">
                <div className="flex justify-between">
                  <span>Importance</span>
                  <span className="text-text">{((selected.importance || 0) * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Accessed</span>
                  <span className="text-text">{selected.access_count}×</span>
                </div>
                {selected.tier && (
                  <div className="flex justify-between">
                    <span>Layer</span>
                    <span className="text-text">{TIER[selected.tier]?.label ?? selected.tier}</span>
                  </div>
                )}
                {selected.evidence?.files?.length ? (
                  <div className="flex justify-between">
                    <span>Evidence</span>
                    <span className="text-text">
                      {selected.evidence.files.length} file{selected.evidence.files.length === 1 ? "" : "s"}
                    </span>
                  </div>
                ) : null}
              </div>
              {(selected.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-2.5">
                  {selected.tags.map((t) => (
                    <LabelChip key={t} name={t} />
                  ))}
                </div>
              )}
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
                  Connections · {neighbors.length}
                </div>
                {neighbors.length === 0 ? (
                  <p className="text-xs text-muted">No connections</p>
                ) : (
                  <>
                    {neighbors
                      .slice(0, neighborsExpanded ? neighbors.length : 8)
                      .map((n) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            setSelectedId(n.id);
                            if (!showAll) setEgoId(n.id);
                          }}
                          className="w-full text-left flex items-center gap-1.5 py-1.5 group cursor-pointer"
                          title={`Go to ${n.label}`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                              background: (n.tier ? TIER[n.tier]?.color : undefined) ?? "var(--muted)",
                            }}
                          />
                          <span className="text-xs text-text group-hover:text-accent transition-colors truncate">
                            {n.label}
                          </span>
                          <span className="text-[10px] text-muted ml-auto shrink-0">{n.kind}</span>
                        </button>
                      ))}
                    {!neighborsExpanded && neighbors.length > 8 && (
                      <button
                        onClick={() => setNeighborsExpanded(true)}
                        className="mt-1 w-full rounded py-1 text-left text-[11px] text-muted transition-colors hover:text-text cursor-pointer"
                      >
                        +{neighbors.length - 8} more
                      </button>
                    )}
                  </>
                )}
              </div>
              {selected.kind === "card" && (
                <button
                  onClick={() => navigate("board")}
                  className="mt-3 w-full text-xs py-1.5 rounded-md text-accent hover:bg-accent/15 transition-colors"
                >
                  Open in Board
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
