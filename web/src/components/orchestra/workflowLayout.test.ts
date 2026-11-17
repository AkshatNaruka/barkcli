import { describe, expect, it } from "vitest";
import type { PlanTask } from "../../lib/types";
import {
  WORKFLOW_END_ID,
  WORKFLOW_START_ID,
  buildWorkflowGraph,
} from "./workflowLayout";

function task(overrides: Partial<PlanTask> & Pick<PlanTask, "id">): PlanTask {
  return {
    title: overrides.id,
    role: "builder",
    description: "",
    acceptance_criteria: [],
    files: [],
    depends_on: [],
    estimate: "1h",
    priority: "medium",
    labels: [],
    status: "waiting",
    previous_run_ids: [],
    gate_passed: false,
    ...overrides,
  };
}

describe("buildWorkflowGraph", () => {
  it("wires dependency edges and keeps the dagre layout left-to-right", () => {
    const tasks = [
      task({ id: "a" }),
      task({ id: "b", depends_on: ["a"], status: "running" }),
      task({ id: "c", depends_on: ["b"] }),
    ];
    const { nodes, edges } = buildWorkflowGraph(tasks);

    expect(edges.map((edge) => edge.id)).toEqual(["a->b", "b->c"]);
    const x = (id: string) => nodes.find((node) => node.id === id)!.position.x;
    expect(x("a")).toBeLessThan(x("b"));
    expect(x("b")).toBeLessThan(x("c"));
  });

  it("bookends the pipeline with intent and merge-train nodes", () => {
    const tasks = [
      task({ id: "review", depends_on: [] }),
      task({ id: "ship", depends_on: ["review"], status: "merged", gate_passed: true }),
    ];
    const { nodes, edges } = buildWorkflowGraph(tasks, {
      start: { title: "Ship OAuth", subtitle: "card intent" },
      end: { title: "Merge train", subtitle: "1/2 merged", tone: "warn" },
    });

    const start = nodes.find((node) => node.id === WORKFLOW_START_ID);
    const end = nodes.find((node) => node.id === WORKFLOW_END_ID);
    expect(start?.type).toBe("orchestraTerminal");
    expect(end?.data).toMatchObject({ variant: "end", title: "Merge train", tone: "warn" });

    // Intent feeds the roots; leaves drain into the merge train.
    expect(edges.some((edge) => edge.source === WORKFLOW_START_ID && edge.target === "review")).toBe(
      true
    );
    expect(edges.some((edge) => edge.source === "ship" && edge.target === WORKFLOW_END_ID)).toBe(
      true
    );
    expect(start!.position.x).toBeLessThan(nodes.find((n) => n.id === "review")!.position.x);
    expect(end!.position.x).toBeGreaterThan(nodes.find((n) => n.id === "ship")!.position.x);
  });

  it("treats an independent task as both a root and a leaf", () => {
    const { edges } = buildWorkflowGraph([task({ id: "solo" })], {
      start: { title: "Intent" },
      end: { title: "Merge train" },
    });
    expect(edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      `${WORKFLOW_START_ID}->solo`,
      `solo->${WORKFLOW_END_ID}`,
    ]);
  });
});
