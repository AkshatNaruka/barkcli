import dagre from "@dagrejs/dagre";
import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";

// ── Brain graph module: layout engine ─────────────────────────────────────
// Knowledge graphs are sparse: most memory nodes have no edges, so a naive
// left→right ragre collapses every island into one long column.
// Strategy here: dagre per connected component, then shelf-pack the
// component bounding boxes into a readable grid.

export const NODE_W = 208;
export const NODE_H = 84;

const ROW_W = 2200; // virtual shelf width for packing knowledge clusters
const COMP_GAP = 56; // gutter between clusters
// Dagre is great for small hierarchies and catastrophic for a hub with 900
// leaves (one rank → a 100k-pixel column). Large clusters fall back to a
// tier-sorted grid: less semantic, always visible.
const GRID_MAX = 80;

interface PlacedBox {
  ids: string[];
  placed: { id: string; x: number; y: number }[];
  w: number;
  h: number;
}

// A hub with dozens of leaves has no good dagre orientation (one rank becomes
// a 10k-pixel column). Concentric rings keep the hub central and stay compact.
function layoutRadial(ids: string[], edges: RFEdge[], members: Set<string>): {
  placed: { id: string; x: number; y: number }[];
  w: number;
  h: number;
} {
  const degree = new Map<string, number>();
  for (const e of edges) {
    if (!members.has(e.source) || !members.has(e.target)) continue;
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const hub = [...ids].sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0))[0];
  const rest = ids.filter((id) => id !== hub);
  const step = NODE_W * 1.02;
  const centers: { id: string; x: number; y: number }[] = [{ id: hub, x: 0, y: 0 }];
  let idx = 0;
  let ring = 0;
  while (idx < rest.length) {
    ring += 1;
    const radius = ring * step;
    // Chord between adjacent cards must clear NODE_W, or rings overlap.
    const capacity = Math.max(3, Math.floor((2 * Math.PI * radius) / (NODE_W + 30)));
    for (let slot = 0; slot < capacity && idx < rest.length; slot += 1, idx += 1) {
      const angle = (2 * Math.PI * slot) / capacity + ring * 0.45;
      centers.push({
        id: rest[idx],
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
  }
  const raw = centers.map((p) => ({ id: p.id, x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 }));
  const minX = Math.min(...raw.map((p) => p.x));
  const minY = Math.min(...raw.map((p) => p.y));
  const placed = raw.map((p) => ({ id: p.id, x: p.x - minX, y: p.y - minY }));
  return {
    placed,
    w: Math.max(...placed.map((p) => p.x)) + NODE_W,
    h: Math.max(...placed.map((p) => p.y)) + NODE_H,
  };
}

function layoutGrid(ids: string[]): {
  placed: { id: string; x: number; y: number }[];
  w: number;
  h: number;
} {
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length * 1.4)));
  const gapX = 28;
  const gapY = 18;
  const placed = ids.map((id, i) => ({
    id,
    x: (i % cols) * (NODE_W + gapX),
    y: Math.floor(i / cols) * (NODE_H + gapY),
  }));
  const rows = Math.ceil(ids.length / cols);
  return {
    placed,
    w: cols * NODE_W + (cols - 1) * gapX,
    h: rows * NODE_H + (rows - 1) * gapY,
  };
}

function layoutComponent(ids: string[], edges: RFEdge[], members: Set<string>): {
  placed: { id: string; x: number; y: number }[];
  w: number;
  h: number;
} {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 110, nodesep: 44, edgesep: 12, marginx: 24, marginy: 24 });
  for (const id of ids) g.setNode(id, { width: NODE_W, height: NODE_H });
  for (const e of edges) {
    if (members.has(e.source) && members.has(e.target)) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const raw = ids.map((id) => {
    const p = g.node(id);
    return { id, x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 };
  });
  for (const p of raw) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_W); maxY = Math.max(maxY, p.y + NODE_H);
  }
  // Re-base to the component's own (0,0) so shelf-packing math stays exact
  const placed = raw.map((p) => ({ id: p.id, x: p.x - minX, y: p.y - minY }));
  return { placed, w: maxX - minX, h: maxY - minY };
}

export function layoutGraph(
  nodes: RFNode[],
  edges: RFEdge[],
): { nodes: RFNode[]; edges: RFEdge[] } {
  // Union-find over node ids → connected components
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = parent.get(x) || x;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    let c = x;
    while (parent.get(c) !== c) {
      const nx = parent.get(c) as string;
      parent.set(c, r);
      c = nx;
    }
    return r;
  };
  for (const n of nodes) parent.set(n.id, n.id);
  for (const e of edges) {
    if (!parent.has(e.source) || !parent.has(e.target)) continue;
    const a = find(e.source);
    const b = find(e.target);
    if (a !== b) parent.set(a, b);
  }

  const compIds: string[][] = [];
  const compOf = new Map<string, number>();
  for (const n of nodes) {
    const root = find(n.id);
    let idx = compOf.get(root);
    if (idx === undefined) { idx = compIds.length; compOf.set(root, idx); compIds.push([]); }
    compIds[idx].push(n.id);
  }

  // Keep similar nodes together in grid mode.
  const meta = new Map(nodes.map((n) => [n.id, n.data as any]));
  const boxes: PlacedBox[] = compIds.map((ids) => {
    const sorted = [...ids].sort((a, b) => {
      const da = meta.get(a) ?? {};
      const db = meta.get(b) ?? {};
      const tier = String(da.tier ?? "").localeCompare(String(db.tier ?? ""));
      if (tier !== 0) return tier;
      return String(da.kind ?? "").localeCompare(String(db.kind ?? ""));
    });
    const members = new Set(sorted);
    const { placed, w, h } =
      sorted.length > GRID_MAX
        ? layoutGrid(sorted)
        : sorted.length > 8
          ? layoutRadial(sorted, edges, members)
          : layoutComponent(sorted, edges, members);
    return { ids: sorted, placed, w, h };
  });

  // Shelf-pack: biggest clusters first, rows wrap at ROW_W
  boxes.sort((a, b) => b.w * b.h - a.w * a.h);
  const pos = new Map<string, { x: number; y: number }>();
  let ox = 0, oy = 0, rowH = 0;
  for (const b of boxes) {
    if (ox > 0 && ox + b.w > ROW_W) { ox = 0; oy += rowH + COMP_GAP; rowH = 0; }
    for (const p of b.placed) pos.set(p.id, { x: p.x + ox, y: p.y + oy });
    ox += b.w + COMP_GAP;
    rowH = Math.max(rowH, b.h);
  }
  return {
    nodes: nodes.map((n) => ({ ...n, position: pos.get(n.id) || { x: 0, y: 0 } })),
    edges,
  };
}

// Tier = memory layer (human-meaningful color dot)
export const TIER: Record<string, { color: string; label: string }> = {
  working: { color: "#60a5fa", label: "Working" },
  short_term: { color: "#facc15", label: "Short-term" },
  long_term: { color: "#4ade80", label: "Long-term" },
  external: { color: "#94a3b8", label: "External" },
};

// Kind = what the node IS (icon, resolved by our Icon set)
export const KIND_ICON: Record<string, string> = {
  memory: "db",
  fact: "doc",
  session: "clock",
  card: "board",
  agent: "users",
};
