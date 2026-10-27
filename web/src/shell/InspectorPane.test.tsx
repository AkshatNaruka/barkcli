import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Card, ThreadEvent } from "../lib/types";
import { InspectorPane } from "./InspectorPane";

const { fetchTaskDiff, evalSession } = vi.hoisted(() => ({
  fetchTaskDiff: vi.fn(),
  evalSession: vi.fn(),
}));

vi.mock("../lib/api", () => ({ fetchTaskDiff, evalSession }));

const card: Card = {
  id: "demo-mode",
  title: "Static demo hosting",
  column: "doing",
  description: "Make the static demo a real product surface.",
  priority: "high",
  labels: ["web", "demo"],
  checklist: [],
  comments: [],
  attachments: [],
  links: [],
  acceptance_criteria: ["A refresh keeps board edits"],
  pinned: false,
  created_at: "2026-10-27T08:00:00Z",
  updated_at: "2026-10-27T11:00:00Z",
};

const events: ThreadEvent[] = [
  {
    id: "plan",
    card_id: card.id,
    kind: "plan_proposed",
    author: "scrum-master-1",
    text: "A plan",
    created_at: "2026-10-27T09:00:00Z",
    data: {
      rationale: "Three slices keep the local write path honest.",
      children: [
        { title: "Demo store", description: "Persist writes", effort: 2, priority: "high" },
        { title: "Fixtures", effort: 3, priority: "medium" },
      ],
    },
  },
  {
    id: "task",
    card_id: card.id,
    kind: "task_spawned",
    author: "opencode-1",
    text: "Worker running",
    created_at: "2026-10-27T09:30:00Z",
    data: { task_id: "task-demo-mode", branch: "bark/static-demo-host" },
  },
  {
    id: "gate",
    card_id: card.id,
    kind: "gate",
    author: "merge-train",
    text: "Acceptance gate passed.",
    created_at: "2026-10-27T10:00:00Z",
    data: { passed: true, command: "npm run test", output: "51 passed" },
  },
];

describe("InspectorPane", () => {
  it("opens on the diff, loads it for the current task, and renders a unified diff", async () => {
    fetchTaskDiff.mockResolvedValue({
      task_id: "task-demo-mode",
      branch: "bark/static-demo-host",
      files: ["web/src/demo.ts"],
      diff: "diff --git a/web/src/demo.ts b/web/src/demo.ts\n--- a/web/src/demo.ts\n+++ b/web/src/demo.ts\n@@ -1 +1,2 @@\n-old\n+new\n+line\n",
    });

    render(<InspectorPane card={card} events={events} onClose={vi.fn()} />);

    expect(await screen.findByText("bark/static-demo-host")).toBeInTheDocument();
    await waitFor(() => expect(fetchTaskDiff).toHaveBeenCalledWith("task-demo-mode"));
    expect(screen.getByText("web/src/demo.ts")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Diff/ })).toHaveAttribute("aria-selected", "true");
  });

  it("switches to the plan and gate artifacts without leaving the thread", async () => {
    fetchTaskDiff.mockResolvedValue({
      task_id: "task-demo-mode",
      branch: "bark/static-demo-host",
      files: [],
      diff: "",
    });
    const user = userEvent.setup();
    render(<InspectorPane card={card} events={events} onClose={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: /Plan/ }));
    expect(screen.getByText("Three slices keep the local write path honest.")).toBeInTheDocument();
    expect(screen.getByText("Demo store")).toBeInTheDocument();
    expect(screen.getByText("A refresh keeps board edits")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Gate/ }));
    expect(screen.getByText("Gate passed")).toBeInTheDocument();
    expect(screen.getByText("$ npm run test")).toBeInTheDocument();
    expect(screen.getByText("51 passed")).toBeInTheDocument();
  });

  it("closes the workbench from its header", async () => {
    fetchTaskDiff.mockResolvedValue({
      task_id: "task-demo-mode",
      branch: "",
      files: [],
      diff: "",
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<InspectorPane card={card} events={events} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close workbench" }));
    expect(onClose).toHaveBeenCalled();
  });
});
