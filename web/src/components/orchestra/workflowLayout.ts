import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { PlanTask } from "../../lib/types";

export const TASK_NODE_W = 248;
export const TASK_NODE_H = 108;
export const TERMINAL_NODE_W = 200;
export const TERMINAL_NODE_H = 78;

/** Synthetic start/end nodes so a plan reads like a pipeline, not a loose graph. */
export const WORKFLOW_START_ID = "__workflow_intent";
export const WORKFLOW_END_ID = "__workflow_merge";

export interface WorkflowTerminalLabel {
  title: string;
  subtitle?: string;
  tone?: "idle" | "active" | "done" | "warn";
}

export interface WorkflowGraphOptions {
  start?: WorkflowTerminalLabel;
  end?: WorkflowTerminalLabel;
}

function nodeSize(node: Node): { width: number; height: number } {
  return {
    width: typeof node.width === "number" ? node.width : TASK_NODE_W,
    height: typeof node.height === "number" ? node.height : TASK_NODE_H,
  };
}

export function layoutWorkflow(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges: [] };
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 96, nodesep: 38, edgesep: 14, marginx: 24, marginy: 24 });
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, nodeSize(n));
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const p = g.node(n.id);
      if (!p) return n;
      const { width, height } = nodeSize(n);
      return { ...n, position: { x: p.x - width / 2, y: p.y - height / 2 } };
    }),
    edges,
  };
}

export function buildWorkflowGraph(
  tasks: PlanTask[],
  options: WorkflowGraphOptions = {},
): { nodes: Node[]; edges: Edge[] } {
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

  // The pipeline edges: intent feeds every root task, and every leaf task
  // drains into the merge train. Densities stay readable because roots/leaves
  // are the only ones wired up.
  const roots = tasks.filter((task) => (task.depends_on || []).every((dep) => !ids.has(dep)));
  const leaves = tasks.filter(
    (task) => !tasks.some((other) => (other.depends_on || []).includes(task.id)),
  );

  if (options.start) {
    nodes.push({
      id: WORKFLOW_START_ID,
      type: "orchestraTerminal",
      position: { x: 0, y: 0 },
      width: TERMINAL_NODE_W,
      height: TERMINAL_NODE_H,
      data: { variant: "start", ...options.start },
    });
    for (const task of roots) {
      edges.push({
        id: `${WORKFLOW_START_ID}->${task.id}`,
        source: WORKFLOW_START_ID,
        target: task.id,
        type: "smoothstep",
        style: {
          stroke: "color-mix(in srgb, var(--accent) 45%, var(--border-strong))",
          strokeWidth: 1.25,
          strokeDasharray: "4 4",
          opacity: 0.75,
        },
      });
    }
  }

  if (options.end) {
    nodes.push({
      id: WORKFLOW_END_ID,
      type: "orchestraTerminal",
      position: { x: 0, y: 0 },
      width: TERMINAL_NODE_W,
      height: TERMINAL_NODE_H,
      data: { variant: "end", ...options.end },
    });
    for (const task of leaves) {
      const landed = task.status === "merged" || task.gate_passed;
      edges.push({
        id: `${task.id}->${WORKFLOW_END_ID}`,
        source: task.id,
        target: WORKFLOW_END_ID,
        type: "smoothstep",
        style: {
          stroke: landed
            ? "color-mix(in srgb, var(--success) 55%, var(--border-strong))"
            : "var(--border-strong)",
          strokeWidth: 1.25,
          strokeDasharray: landed ? undefined : "4 4",
          opacity: landed ? 0.85 : 0.5,
        },
      });
    }
  }

  // Independent tasks: no edges, layout still places them.
  return layoutWorkflow(nodes, edges);
}
