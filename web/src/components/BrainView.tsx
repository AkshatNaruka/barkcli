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
import { fetchBrain, fetchBrainNode, type BrainNode, type BrainEdge } from "../lib/api";
import { navigate } from "../lib/hashnav";
import { Icon } from "./Icon";
import { LabelChip } from "./LabelChip";
import { QuietSelect } from "./QuietSelect";
import { GraphNodeCard, type BrainNodeData } from "./brain/GraphNodeCard";
import { layoutGraph, TIER, KIND_ICON, NODE_W, NODE_H } from "./brain/layout";

export function BrainView({ boardName }: { boardName: string | null }) {
  const [nodes, setNodes] = useState<BrainNode[]>([]);
  const [edges, setEdges] = useState<BrainEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<BrainNode[]>([]);

  useEffect(() => {
    fetchBrain(boardName || undefined).then((g) => {
      setNodes(g.nodes);
      setEdges(g.edges);
      setLoading(false);
    });
  }, [boardName]);

  // Resolve the selected node's neighbors (labels, not ids) for the inspector
  useEffect(() => {
    if (!selectedId) { setNeighbors([]); return; }
    const local = edges
      .filter((e) => e.from === selectedId || e.to === selectedId)
      .map((e) => (e.from === selectedId ? e.to : e.from))
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is BrainNode => Boolean(n));
    if (local.length > 0) { setNeighbors(local); return; }
    fetchBrainNode(selectedId, boardName || undefined).then((r) => {
      setNeighbors(r?.neighbors ?? []);
    });
  }, [selectedId, edges, nodes, boardName]);

  const searchHit = (n: BrainNode) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q));
  };

  // Tier/kind filters REMOVE nodes (graph relayouts); search only highlights.
  const filteredNodeMap = useMemo(() => {
    const m = new Map<string, BrainNode>();
    for (const n of nodes) {
      if (tierFilter && n.tier !== tierFilter) continue;
      if (kindFilter && n.kind !== kindFilter) continue;
      m.set(n.id, n);
    }
    return m;
  }, [nodes, tierFilter, kindFilter]);

  // Stable layout — recomputes only when the membership or edges change,
  // NOT on selection/search (so the graph never jumps under the cursor).
  const layouted = useMemo(() => {
    const kept = [...filteredNodeMap.values()].map<BrainNode>((n) => n);
    const nodeMap = new Map(kept.map((n) => [n.id, n]));
    const keptEdges = edges.filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to));
    const rfNodes: Node[] = kept.map((n) => ({
      id: n.id,
      position: { x: 0, y: 0 },
      // Explicit size: card already renders at NODE_W/H (GraphNodeCard pins
      // width); RF v12's MiniMap needs these to project node rectangles.
      width: NODE_W,
      height: NODE_H,
      data: {
        label: n.label,
        kind: n.kind,
        tier: n.tier,
        importance: n.importance,
      } satisfies BrainNodeData,
      type: "brainNode",
    }));
    const rfEdges: Edge[] = keptEdges.map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      animated: false,
      style: {
        stroke: "var(--border-strong)",
        strokeWidth: 0.6 + e.weight * 1.6,
        opacity: 0.35 + e.weight * 0.45,
      },
    }));
    return layoutGraph(rfNodes, rfEdges);
  }, [filteredNodeMap, edges]);

  // Render pass: layer search/selection dimming on top without re-layouting
  const rfNodes = useMemo(() => {
    const searching = Boolean(search.trim());
    return layouted.nodes.map((n) => {
      const d = { ...(n.data as unknown as BrainNodeData) };
      const hit = !searching || searchHit({ id: n.id, label: d.label, tags: [], tier: d.tier, kind: d.kind } as unknown as BrainNode);
      d.dimmed = searching && !hit;
      d.focus = selectedId === n.id;
      return { ...n, data: d };
    });
  }, [layouted.nodes, search, selectedId]);

  const rfEdges = useMemo(() => {
    return layouted.edges.map((e) => ({ ...e }));
  }, [layouted.edges]);

  const selected = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;
  const q = search.trim().toLowerCase();
  const visibleHits = q
    ? [...filteredNodeMap.values()].filter((n) =>
        n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q))
      ).length
    : 0;

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    const id = node.id;
    if (selectedId === id) setSelectedId(null);
    else setSelectedId(id);
  };

  return (
    <div className="h-full flex flex-col p-4 gap-3">
      {/* Command header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="font-medium text-text text-sm">Brain</span>
          <span>
            {filteredNodeMap.size} nodes · {layouted.edges.length} links
          </span>
        </div>
        {/* Field style shared with Mind composer — bordered only on focus */}
        <div className="flex gap-2 items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-48 bg-card border border-transparent focus-within:border-accent/40 px-3 py-1.5 rounded-md text-sm text-text placeholder:text-muted/70 focus:outline-none"
          />
          <QuietSelect
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            title="Memory layer"
            className="bg-card px-2.5 py-1.5"
          >
            <option value="">Layer</option>
            {Object.entries(TIER).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </QuietSelect>
          <QuietSelect
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            title="Node kind"
            className="bg-card px-2.5 py-1.5"
          >
            <option value="">Kind</option>
            {["memory", "fact", "session", "card", "agent"].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </QuietSelect>
        </div>
      </div>

      {/* Legend — quiet dots */}
      <div className="flex items-center gap-4 text-[10px] text-muted shrink-0">
        {Object.entries(TIER).map(([k, v]) => (
          <button key={k} onClick={() => setTierFilter(tierFilter === k ? "" : k)} className="flex items-center gap-1 hover:text-text transition-colors" title={`Filter: ${v.label}`}>
            <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />
            {v.label}
          </button>
        ))}
        {q !== "" && (
          <span className="ml-auto">{visibleHits} match{visibleHits === 1 ? "" : "es"}</span>
        )}
      </div>

      {/* Canvas + inspector */}
      <div className="flex-1 flex min-h-0 gap-3">
        <div className="flex-1 bg-surface rounded-xl overflow-hidden min-h-0">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted">Loading graph…</div>
          ) : filteredNodeMap.size === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-1 text-sm text-muted">
              <span className="text-text">No nodes match</span>
              <span className="text-xs">Adjust layer or kind filters</span>
            </div>
          ) : (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={{ brainNode: GraphNodeCard }}
              onNodeClick={onNodeClick}
              onPaneClick={() => setSelectedId(null)}
              nodesDraggable={true}
              nodesConnectable={false}
              zoomOnDoubleClick={false}
              minZoom={0.2}
              maxZoom={2.2}
              proOptions={{ hideAttribution: false }}
              fitView
              fitViewOptions={{ padding: 0.18, maxZoom: 1.05 }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
              <Controls position="bottom-left" showInteractive={false} />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeColor={(n) => {
                  // SVG fill attributes can't resolve CSS variables — use
                  // literal colors: tier hues exist, slate as the fallback.
                  const d = (n.data ?? {}) as unknown as BrainNodeData;
                  const hex = d.tier ? TIER[d.tier]?.color : undefined;
                  return hex || "#64748b";
                }}
                nodeStrokeWidth={0}
                style={{ width: 150, height: 92, background: "var(--card)", borderRadius: 10 }}
                maskColor="rgba(120, 120, 130, 0.30)"
              />
            </ReactFlow>
          )}
        </div>

        {/* Inspector — resolved labels, click-through neighbors */}
        {selected && (
          <div className="w-72 shrink-0 overflow-y-auto">
            <div className="flex items-center gap-1.5">
              <span className="text-muted flex" title={selected.kind}>
                <Icon name={(KIND_ICON[selected.kind] || "layers") as any} size={12} />
              </span>
              {selected.tier && (
                <span className="w-2 h-2 rounded-full" style={{ background: TIER[selected.tier]?.color }} title={TIER[selected.tier]?.label} />
              )}
              <span className="text-[10px] uppercase tracking-wider text-muted">{selected.kind}</span>
              <button onClick={() => setSelectedId(null)} className="ml-auto text-muted hover:text-text" title="Close"><Icon name="x" size={12} /></button>
            </div>
            <p className="text-sm text-text font-medium mt-2 leading-snug">{selected.label}</p>
            <div className="mt-2.5 text-[11px] text-muted space-y-1">
              <div className="flex justify-between"><span>Importance</span><span className="text-text">{((selected.importance || 0) * 100).toFixed(0)}%</span></div>
              <div className="flex justify-between"><span>Accessed</span><span className="text-text">{selected.access_count}×</span></div>
              {selected.tier && <div className="flex justify-between"><span>Layer</span><span className="text-text">{TIER[selected.tier]?.label ?? selected.tier}</span></div>}
            </div>
            {selected.tags.length > 0 && (
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
                neighbors.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setSelectedId(n.id)}
                    className="w-full text-left flex items-center gap-1.5 py-1.5 group"
                    title={`Go to ${n.label}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: (n.tier ? TIER[n.tier]?.color : undefined) ?? "var(--muted)" }} />
                    <span className="text-xs text-text group-hover:text-accent transition-colors truncate">{n.label}</span>
                    <span className="text-[10px] text-muted ml-auto shrink-0">{n.kind}</span>
                  </button>
                ))
              )}
            </div>
            {selected.kind === "card" && (
              <button
                onClick={() => navigate("board")}
                className="mt-3 w-full text-xs py-1.5 rounded-md text-accent hover:bg-accent-soft transition-colors"
              >
                Open in Board
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
