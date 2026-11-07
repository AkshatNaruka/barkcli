import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Card, ThreadDetail } from "../lib/types";
import { SurfacesPanel } from "./SurfacesPanel";

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

  it("renders quick actions: Review, Open File, Terminal, Browser", async () => {
    const handlers = renderPanel();
    const user = userEvent.setup();

    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Open File")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Browser")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Review/i }));
    expect(handlers.onSelectThread).toHaveBeenCalledWith("diff");

    await user.click(screen.getByRole("button", { name: /Terminal/i }));
    expect(handlers.onSelectThread).toHaveBeenCalledWith("eval");
  });

  it("renders real artifacts, subagents, and background tasks from thread data without mocks", () => {
    renderPanel({ thread: threadWithData });

    expect(screen.queryByText("Mac App Ui Ux Modernization Plan")).not.toBeInTheDocument();
    expect(screen.getByText("Artifacts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Thread title plan/i })).toBeInTheDocument();
    expect(screen.getAllByText("Changes").length).toBeGreaterThan(0);
    expect(screen.getByText("Subagents")).toBeInTheDocument();
    expect(screen.getByText("Coder")).toBeInTheDocument();
    expect(screen.getByText("Background Tasks")).toBeInTheDocument();
    expect(screen.getAllByText(/Attempt 1/).length).toBeGreaterThan(0);
  });

  it("shows an honest empty state when the thread has no artifacts yet", () => {
    renderPanel({ thread: { id: "card-1", card, events: [], runs: [] } });
    expect(screen.queryByText("Mac App Ui Ux Modernization Plan")).not.toBeInTheDocument();
    expect(screen.getByText(/No thread artifacts yet/i)).toBeInTheDocument();
  });

  it("filters items when typing in the search bar", async () => {
    renderPanel({ thread: threadWithData });
    const user = userEvent.setup();

    const searchInput = screen.getByPlaceholderText("Search surfaces or enter a URL");
    await user.type(searchInput, "plan");

    expect(screen.getByRole("button", { name: /Thread title plan/i })).toBeInTheDocument();
    expect(screen.queryByText("Checks")).not.toBeInTheDocument();
  });
});
