import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Card, ThreadDetail } from "../lib/types";
import { SurfacesPanel } from "./SurfacesPanel";

vi.mock("../lib/api", () => ({
  fetchReview: vi.fn(async () => null),
  fetchRunGate: vi.fn(async () => null),
  fetchWorktrees: vi.fn(async () => []),
  gitCommit: vi.fn(async () => null),
  gitPush: vi.fn(async () => null),
  openInEditor: vi.fn(async () => null),
  runProjectCommand: vi.fn(async () => null),
}));

function renderPanel(overrides: Partial<ComponentProps<typeof SurfacesPanel>> = {}) {
  const handlers = {
    onSelectThread: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <SurfacesPanel
      boardName="dev"
      showThread
      {...handlers}
      {...overrides}
    />
  );
  return handlers;
}

const card: Card = {
  id: "card-1",
  title: "Thread title",
  description: "",
  column: "todo",
  priority: "medium",
  labels: [],
  checklist: [],
  comments: [],
  attachments: [],
  links: [],
  acceptance_criteria: [],
  pinned: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const threadWithData: ThreadDetail = {
  id: "card-1",
  card,
  events: [
    {
      id: "e1",
      card_id: "card-1",
      kind: "plan_proposed",
      author: "barkcli",
      text: "plan",
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "e2",
      card_id: "card-1",
      kind: "assistant",
      author: "coder",
      text: "working",
      created_at: "2026-01-01T00:01:00Z",
    },
  ] as ThreadDetail["events"],
  runs: [
    {
      id: "run-1",
      thread_id: "card-1",
      card_id: "card-1",
      ordinal: 1,
      title: "Attempt 1",
      provider: "opencode",
      status: "passed",
      permission_mode: "default",
      started_at: "2026-01-01T00:00:00Z",
      diff_stats: { files_changed: 0, insertions: 0, deletions: 0 },
      gate: { passed: true, command: "cargo test" },
      usage: { input_tokens: 0, output_tokens: 0 },
    } as any,
  ],
};

describe("SurfacesPanel", () => {
  it("shows only thread surfaces, never project tools", () => {
    renderPanel();

    expect(screen.getByText("Surfaces")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Checks")).toBeInTheDocument();
    expect(screen.queryByText("Board")).not.toBeInTheDocument();
    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
    expect(screen.queryByText("Project tools")).not.toBeInTheDocument();
    expect(screen.queryByText("Rules")).not.toBeInTheDocument();
  });

  it("opens a thread surface", async () => {
    const handlers = renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Checks/ }));
    expect(handlers.onSelectThread).toHaveBeenCalledWith("gate");
  });

  it("explains the missing thread surfaces before a thread is selected", () => {
    renderPanel({ showThread: false });

    expect(screen.queryByText("Surfaces")).not.toBeInTheDocument();
    expect(screen.getByText(/Start a thread to see/)).toBeInTheDocument();
    expect(screen.queryByText("Project tools")).not.toBeInTheDocument();
  });

  it("supports surface letter activation and Escape", () => {
    const handlers = renderPanel();
    const body = screen
      .getByLabelText("Thread surfaces")
      .querySelector(".surfaces-list-body")!;

    fireEvent.keyDown(body, { key: "K" });
    expect(handlers.onSelectThread).toHaveBeenCalledWith("gate");

    fireEvent.keyDown(body, { key: "Escape" });
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("closes from the header button", async () => {
    const handlers = renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Close thread panel" }));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("renders quick actions: Terminal and Browser (without Review or Open File)", async () => {
    renderPanel();
    const user = userEvent.setup();

    expect(screen.queryByText("Review")).not.toBeInTheDocument();
    expect(screen.queryByText("Open File")).not.toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Browser")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Terminal/i }));
    expect(screen.getByLabelText("Terminal command input")).toBeInTheDocument();
  });

  it("does not render attempt cards, artifacts, subagents, or background tasks in launcher mode", () => {
    renderPanel({ thread: threadWithData });

    // Streamlined minimal view: no noisy attempt boxes, artifacts, subagents, or tasks
    expect(screen.queryByText("Now")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Thread status")).not.toBeInTheDocument();
    expect(screen.queryByText("Artifacts")).not.toBeInTheDocument();
    expect(screen.queryByText("Subagents")).not.toBeInTheDocument();
    expect(screen.queryByText("Background Tasks")).not.toBeInTheDocument();
    expect(screen.queryByText(/No thread artifacts yet/i)).not.toBeInTheDocument();

    // Renders the clean "Open a surface" header and all 8 items
    expect(screen.getByRole("heading", { name: "Open a surface" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Browser/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Terminal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Files/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Diff/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pull request[A-Z]?$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Linked pull requests/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Device/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Side chat/i })).toBeInTheDocument();
  });

  it("triggers actions when clicking launcher items", async () => {
    const handlers = renderPanel({ thread: threadWithData });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^Files/i }));
    expect(handlers.onSelectThread).toHaveBeenCalledWith("context");

    await user.click(screen.getByRole("button", { name: /^Diff/i }));
    expect(handlers.onSelectThread).toHaveBeenCalledWith("diff");

    await user.click(screen.getByRole("button", { name: /^Pull request[A-Z]?$/i }));
    expect(handlers.onSelectThread).toHaveBeenCalledWith("receipt");

    await user.click(screen.getByRole("button", { name: /^Device/i }));
    expect(handlers.onSelectThread).toHaveBeenCalledWith("eval");
  });
});
