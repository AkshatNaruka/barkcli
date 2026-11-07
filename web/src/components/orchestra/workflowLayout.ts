import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { PlanTask } from "../../lib/types";

export const TASK_NODE_W = 248;
export const TASK_NODE_H = 108;

export function layoutWorkflow(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges: [] };
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 96, nodesep: 38, edgesep: 14, marginx: 24, marginy: 24 });
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: TASK_NODE_W, height: TASK_NODE_H });
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const p = g.node(n.id);
      return p
        ? { ...n, position: { x: p.x - TASK_NODE_W / 2, y: p.y - TASK_NODE_H / 2 } }
        : n;
    }),
    edges,
  };
}

export function buildWorkflowGraph(tasks: PlanTask[]): { nodes: Node[]; edges: Edge[] } {
  const ids = new Set(tasks.map((t) => t.id));
  const nodes: Node[] = tasks.map((task) => ({
    id: task.id,
    type: "orchestraTask",
    position: { x: 0, y: 0 },
    width: TASK_NODE_W,
    height: TASK_NODE_H,
    data: { task },
  }));
  const edges: Edge[] = [];
  for (const task of tasks) {
    for (const dep of task.depends_on || []) {
      if (!ids.has(dep)) continue;
      edges.push({
        id: `${dep}->${task.id}`,
        source: dep,
        target: task.id,
        type: "smoothstep",
        animated: task.status === "running" || task.status === "ready",
        style: {
          stroke: "var(--border-strong)",
          strokeWidth: 1.25,
          opacity: task.status === "waiting" || task.status === "cancelled" ? 0.35 : 0.7,
        },
      });
    }
  }
  // Independent tasks: no edges, layout still places them.
  return layoutWorkflow(nodes, edges);
}
