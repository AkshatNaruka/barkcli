import dagre from "@dagrejs/dagre";
import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";

// ── Brain graph module: layout engine ─────────────────────────────────────
// Knowledge graphs are sparse: most memory nodes have no edges, so a naive
// left→right ragre collapses every island into one long column.
// Strategy here: dagre per connected component, then shelf-pack the
// component bounding boxes into a readable grid.

export const NODE_W = 208;
export const NODE_H = 58;

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
  const placedNodes = nodes.map((n) => ({ ...n, position: pos.get(n.id) || { x: 0, y: 0 } }));
  return { nodes: placedNodes, edges: applyHandles(placedNodes, edges) };
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
  subsystem: "grid",
  module: "folder",
  service: "code",
  api: "terminal",
  model: "layers",
  decision: "branch",
  convention: "spark",
  pitfall: "warn",
  invariant: "flag",
  fact: "doc",
  memory: "db",
  session: "clock",
  card: "board",
  agent: "users",
};

// ── Progressive disclosure ────────────────────────────────────────────────
// Fitting 64 nodes and 200 edges into one viewport produces a texture, not a
// map. The default view is a small, representative set of anchors; clicking
// one opens its neighbourhood. The full map stays one click away.

export const OVERVIEW_LIMIT = 15;
export const EGO_LIMIT = 8;

const OVERVIEW_COLS = 3;
const OVERVIEW_GAP_X = 56;
const OVERVIEW_GAP_Y = 40;
const OVERVIEW_EDGES = 28;

export const KIND_ORDER = [
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
  "session",
  "card",
  "agent",
];

// Anchors are chosen by kind, not by raw degree: session memories dominate a
// degree ranking (each links to everything it touched) and would otherwise
// fill the whole overview with near-identical cards.
const KIND_QUOTA: Record<string, number> = {
  subsystem: 4,
  module: 4,
  service: 2,
  api: 1,
  model: 1,
  invariant: 1,
  convention: 1,
  pitfall: 1,
};

const kindOf = (node: RFNode) => String((node.data as any)?.kind ?? "");
const labelOf = (node: RFNode) => String((node.data as any)?.label ?? node.id);
const importanceOf = (node: RFNode) => Number((node.data as any)?.importance ?? 0);
const weightOf = (edge: RFEdge) => Number((edge.data as any)?.weight ?? 0.6);

export function nodeDegree(edges: RFEdge[]): Map<string, number> {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}

export function nodeScore(node: RFNode, degree: Map<string, number>): number {
  return (degree.get(node.id) ?? 0) * 2 + importanceOf(node) * 10;
}

function matchesSearch(node: RFNode, q: string): boolean {
  const tags = (node.data as any)?.tags;
  return (
    labelOf(node).toLowerCase().includes(q) ||
    node.id.toLowerCase().includes(q) ||
    (Array.isArray(tags) && tags.some((tag: string) => tag.toLowerCase().includes(q)))
  );
}

export function pickAnchors(
  nodes: RFNode[],
  edges: RFEdge[],
  { search = "", limit = OVERVIEW_LIMIT }: { search?: string; limit?: number } = {}
): RFNode[] {
  const degree = nodeDegree(edges);
  const q = search.trim().toLowerCase();
  const pool = q ? nodes.filter((node) => matchesSearch(node, q)) : nodes;
  const byScore = (a: RFNode, b: RFNode) =>
    nodeScore(b, degree) - nodeScore(a, degree) || labelOf(a).localeCompare(labelOf(b));

  // A search is already a narrow pool: rank it directly, or the kind quotas
  // would hide the very node the user is looking for.
  if (q) return [...pool].sort(byScore).slice(0, limit);

  const picked: RFNode[] = [];
  const used = new Set<string>();
  for (const kind of KIND_ORDER) {
    const quota = KIND_QUOTA[kind] ?? 0;
    if (!quota) continue;
    for (const node of pool.filter((n) => kindOf(n) === kind).sort(byScore).slice(0, quota)) {
      picked.push(node);
      used.add(node.id);
    }
  }
  if (picked.length < limit) {
    for (const node of pool.filter((n) => !used.has(n.id)).sort(byScore)) {
      if (picked.length >= limit) break;
      picked.push(node);
      used.add(node.id);
    }
  }
  return picked.slice(0, limit);
}

// Dock each edge on the side of a card that faces the other card, so straight
// edges stay straight instead of wrapping around the node.
export function facingHandles(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { source: "s-right", target: "t-left" }
      : { source: "s-left", target: "t-right" };
  }
  return dy >= 0
    ? { source: "s-bottom", target: "t-top" }
    : { source: "s-top", target: "t-bottom" };
}

export function applyHandles(nodes: RFNode[], edges: RFEdge[]): RFEdge[] {
  const centers = new Map(
    nodes.map((n) => [n.id, { x: n.position.x + NODE_W / 2, y: n.position.y + NODE_H / 2 }] as const)
  );
  return edges.map((edge) => {
    const a = centers.get(edge.source);
    const b = centers.get(edge.target);
    if (!a || !b) return edge;
    const handles = facingHandles(a, b);
    return { ...edge, sourceHandle: handles.source, targetHandle: handles.target };
  });
}

// Compact, evenly spaced grid: every anchor is readable without zooming out.
export function layoutOverview(
  anchors: RFNode[],
  edges: RFEdge[]
): { nodes: RFNode[]; edges: RFEdge[] } {
  const degree = nodeDegree(edges);
  const order = new Map(KIND_ORDER.map((kind, i) => [kind, i]));
  const sorted = [...anchors].sort(
    (a, b) =>
      (order.get(kindOf(a)) ?? 99) - (order.get(kindOf(b)) ?? 99) ||
      nodeScore(b, degree) - nodeScore(a, degree) ||
      labelOf(a).localeCompare(labelOf(b))
  );
  const nodes = sorted.map((node, i) => ({
    ...node,
    position: {
      x: (i % OVERVIEW_COLS) * (NODE_W + OVERVIEW_GAP_X),
      y: Math.floor(i / OVERVIEW_COLS) * (NODE_H + OVERVIEW_GAP_Y),
    },
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const kept = edges
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .sort((a, b) => weightOf(b) - weightOf(a))
    .slice(0, OVERVIEW_EDGES);
  return { nodes, edges: applyHandles(nodes, kept) };
}

export interface EgoGraph {
  nodes: RFNode[];
  edges: RFEdge[];
  /** Unique neighbours in the whole graph, not just the ones drawn. */
  connections: number;
  /** How many neighbours this view draws. */
  shown: number;
}

// Focus in the middle, strongest neighbours on one ellipse. The ellipse grows
// only until no two cards touch, so fitView has the smallest box to scale.
export function buildEgo(
  focusId: string,
  nodes: RFNode[],
  edges: RFEdge[],
  limit = EGO_LIMIT
): EgoGraph | null {
  const focus = nodes.find((n) => n.id === focusId);
  if (!focus) return null;

  const incident = edges
    .filter((edge) => edge.source === focusId || edge.target === focusId)
    .sort((a, b) => weightOf(b) - weightOf(a));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>([focusId]);
  const chosen: { node: RFNode; edge: RFEdge }[] = [];
  for (const edge of incident) {
    const otherId = edge.source === focusId ? edge.target : edge.source;
    if (seen.has(otherId)) continue;
    const node = byId.get(otherId);
    if (!node) continue;
    seen.add(otherId);
    chosen.push({ node, edge });
  }

  const count = Math.min(chosen.length, limit);
  // A ring sized by a fixed radius either overlaps (too small) or wastes the
  // viewport (too big). Grow an ellipse just until no two cards touch, then
  // let fitView scale the smallest possible box.
  const angles =
    count === 1
      ? [0]
      : Array.from({ length: count }, (_, i) => -Math.PI / 2 + (2 * Math.PI * i) / count);
  const minDx = NODE_W + 28;
  const minDy = NODE_H + 16;
  let rx = count === 1 ? NODE_W + 96 : 220;
  let ry = count === 1 ? 0 : 150;
  let points = angles.map((angle) => ({ x: Math.cos(angle) * rx, y: Math.sin(angle) * ry }));
  for (let pass = 0; pass < 40; pass += 1) {
    const boxes = [{ x: 0, y: 0 }, ...points];
    let clear = true;
    for (let i = 0; i < boxes.length && clear; i += 1) {
      for (let j = i + 1; j < boxes.length && clear; j += 1) {
        clear =
          Math.abs(boxes[i].x - boxes[j].x) >= minDx ||
          Math.abs(boxes[i].y - boxes[j].y) >= minDy;
      }
    }
    if (clear) break;
    rx += 10;
    ry += 8;
    points = angles.map((angle) => ({ x: Math.cos(angle) * rx, y: Math.sin(angle) * ry }));
  }

  const raw = new Map<string, { x: number; y: number }>([[focusId, { x: 0, y: 0 }]]);
  chosen.slice(0, count).forEach(({ node }, i) => raw.set(node.id, points[i]));

  // Re-base to (0,0): keeps fitView and the minimap predictable.
  const corners = [...raw.entries()].map(
    ([id, p]) => [id, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 }] as const
  );
  const minX = Math.min(...corners.map(([, p]) => p.x));
  const minY = Math.min(...corners.map(([, p]) => p.y));
  const positioned = new Map(corners.map(([id, p]) => [id, { x: p.x - minX, y: p.y - minY }]));

  const drawn = chosen.slice(0, count);
  const egoNodes = [focus, ...drawn.map((c) => c.node)].map((n) => ({
    ...n,
    position: positioned.get(n.id)!,
  }));
  return {
    nodes: egoNodes,
    edges: applyHandles(egoNodes, drawn.map((c) => c.edge)),
    connections: seen.size - 1,
    shown: count,
  };
}
