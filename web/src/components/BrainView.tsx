import React, { useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY, type SimulationNodeDatum, type SimulationLinkDatum } from "d3-force";
import { select } from "d3-selection";
import { zoom } from "d3-zoom";
import { fetchBrain, type BrainNode, type BrainEdge } from "../lib/api";

const TIER_COLORS: Record<string, string> = {
  working: "#60a5fa",
  short_term: "#facc15",
  long_term: "#4ade80",
  external: "#c084fc",
};

const KIND_STROKE: Record<string, string> = {
  memory: "transparent",
  fact: "#f97316",
  session: "#38bdf8",
  card: "#94a3b8",
  agent: "#f472b6",
};

interface SimNode extends BrainNode, SimulationNodeDatum {}
interface SimLink extends SimulationLinkDatum<SimNode> {
  kind: string;
  weight: number;
}

export function BrainView({ boardName }: { boardName: string | null }) {
  const [nodes, setNodes] = useState<BrainNode[]>([]);
  const [edges, setEdges] = useState<BrainEdge[]>([]);
  const [selected, setSelected] = useState<BrainNode | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    fetchBrain(boardName || undefined).then((g) => {
      setNodes(g.nodes);
      setEdges(g.edges);
    });
  }, [boardName]);

  const filtered = useMemo(() => {
    const nodeMap = new Map<string, BrainNode>();
    for (const n of nodes) {
      if (tierFilter && n.tier !== tierFilter) continue;
      if (kindFilter && n.kind !== kindFilter) continue;
      if (search && !n.label.toLowerCase().includes(search.toLowerCase()) && !n.id.toLowerCase().includes(search.toLowerCase())) continue;
      nodeMap.set(n.id, n);
    }
    const keptEdges = edges.filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to));
    return { nodeMap, keptEdges };
  }, [nodes, edges, tierFilter, kindFilter, search]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    const degree = new Map<string, number>();
    for (const e of filtered.keptEdges) {
      degree.set(e.from, (degree.get(e.from) || 0) + 1);
      degree.set(e.to, (degree.get(e.to) || 0) + 1);
    }

    const simNodes: SimNode[] = [...filtered.nodeMap.values()].map((n) => ({ ...n }));
    const index = new Map(simNodes.map((n, i) => [n.id, i]));
    const simLinks: SimLink[] = filtered.keptEdges
      .map((e) => ({ source: index.get(e.from)!, target: index.get(e.to)!, kind: e.kind, weight: e.weight }))
      .filter((l) => l.source !== undefined && l.target !== undefined);

    const g = svg.append("g");

    const sim = forceSimulation<SimNode>(simNodes)
      .force("link", forceLink<SimNode, SimLink>(simLinks).distance(90).strength(0.4))
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(width / 2, height / 2))
      .force("x", forceX(width / 2).strength(0.04))
      .force("y", forceY(height / 2).strength(0.04))
      .force("collide", forceCollide(26));

    const link = g.append("g")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", "var(--border, #3f3f46)")
      .attr("stroke-opacity", (d) => 0.15 + d.weight * 0.5)
      .attr("stroke-width", (d) => 0.6 + d.weight * 1.6);

    const node = g.append("g")
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(simNodes)
      .join("circle")
      .attr("r", (d) => 4 + d.importance * 8 + Math.min(degree.get(d.id) || 0, 10) * 0.8)
      .attr("fill", (d) => TIER_COLORS[d.tier || "external"] || "#94a3b8")
      .attr("stroke", (d) => KIND_STROKE[d.kind] || "transparent")
      .attr("stroke-width", 2)
      .attr("cursor", "pointer")
      .on("click", (_event, d) => setSelected(d))
      .on("mouseover", function () { select(this).attr("stroke", "#fff").attr("stroke-width", 2.5); })
      .on("mouseout", function (_event, d) { select(this).attr("stroke", KIND_STROKE[d.kind] || "transparent").attr("stroke-width", 2); });

    const label = g.append("g")
      .selectAll("text")
      .data(simNodes)
      .join("text")
      .text((d) => (d.label.length > 24 ? d.label.slice(0, 24) + "…" : d.label))
      .attr("font-size", 10)
      .attr("fill", "var(--text, #e4e4e7)")
      .attr("dx", 12)
      .attr("dy", 3)
      .style("pointer-events", "none");

    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!);
      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
    });

    svg.call(
      zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]).on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
      }) as any,
    );

    return () => { sim.stop(); };
  }, [filtered]);

  return (
    <div className="h-full flex flex-col p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-text">Brain</h2>
          <p className="text-xs text-muted">Knowledge graph — memories, facts, sessions, cards and agents linked by relations</p>
        </div>
        <div className="text-xs text-muted">
          {filtered.nodeMap.size} nodes · {filtered.keptEdges.length} edges
        </div>
      </div>

      <div className="flex gap-2 shrink-0 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes..."
          className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent"
        />
        <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-text">
          <option value="">All layers</option>
          <option value="working">Working</option>
          <option value="short_term">Short-term</option>
          <option value="long_term">Long-term</option>
          <option value="external">External</option>
        </select>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-text">
          <option value="">All kinds</option>
          <option value="memory">memory</option>
          <option value="fact">fact</option>
          <option value="session">session</option>
          <option value="card">card</option>
          <option value="agent">agent</option>
        </select>
      </div>

      <div className="flex items-center gap-4 text-[10px] text-muted shrink-0">
        {Object.entries(TIER_COLORS).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
            {k}
          </span>
        ))}
      </div>

      <div className="flex-1 flex min-h-0 gap-3">
        <div className="flex-1 bg-surface border border-border rounded-lg overflow-hidden">
          <svg ref={svgRef} className="w-full h-full" />
        </div>

        {selected && (
          <div className="w-72 bg-surface border border-border rounded-lg p-3 overflow-y-auto shrink-0">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-card text-muted uppercase">{selected.kind}</span>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-text text-xs">x</button>
            </div>
            <p className="text-sm text-text mt-2">{selected.label}</p>
            <div className="mt-2 text-[11px] text-muted space-y-0.5">
              <div>id: <span className="font-mono">{selected.id}</span></div>
              <div>importance: {(selected.importance * 100).toFixed(0)}%</div>
              <div>accessed: {selected.access_count}x</div>
              {selected.tier && <div>layer: {selected.tier}</div>}
              {selected.tags.length > 0 && <div>tags: {selected.tags.join(", ")}</div>}
            </div>
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Connections</div>
              {edges
                .filter((e) => e.from === selected.id || e.to === selected.id)
                .map((e, i) => {
                  const other = e.from === selected.id ? e.to : e.from;
                  return (
                    <div key={i} className="text-xs text-muted truncate">
                      {e.from === selected.id ? "→" : "←"} {other} · {e.kind}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
