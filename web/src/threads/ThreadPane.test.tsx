import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ThreadDetail } from "../lib/types";
import { ThreadPane } from "./ThreadPane";

const api = vi.hoisted(() => ({
  fetchThread: vi.fn(),
  postThreadMessage: vi.fn(),
  approvePlan: vi.fn(),
  rejectPlan: vi.fn(),
  streamThreadUrl: vi.fn(() => "/api/thread/stream"),
  fetchSessionTranscript: vi.fn(),
  stopSession: vi.fn(),
  steerSession: vi.fn(),
  forkSession: vi.fn(),
  raceTask: vi.fn(),
  startThreadRun: vi.fn(),
  stopRun: vi.fn(),
  mergeRun: vi.fn(),
  fetchProviders: vi.fn(async () => []),
  fetchProviderModels: vi.fn(async () => []),
  fetchRoles: vi.fn(async () => [
    { id: "builder", name: "Builder" },
    { id: "reviewer", name: "Reviewer" },
  ]),
}));

vi.mock("../lib/api", () => api);
vi.mock("../lib/demo", () => ({ isDemoMode: () => true }));

const detail: ThreadDetail = {
  id: "demo-mode",
  card: {
    id: "demo-mode",
    title: "Static demo hosting",
    column: "doing",
    description: "",
    priority: "high",
    labels: [],
    checklist: [],
    comments: [],
    attachments: [],
    links: [],
    acceptance_criteria: [],
    pinned: false,
    created_at: "2026-10-27T08:00:00Z",
    updated_at: "2026-10-27T11:00:00Z",
  },
  events: [
    {
      id: "ev-1",
      card_id: "demo-mode",
      kind: "user",
      author: "you",
      text: "Make the static demo a real surface.",
      created_at: "2026-10-27T09:00:00Z",
    },
    {
      id: "ev-2",
      card_id: "demo-mode",
      kind: "assistant",
      author: "orbiter",
      text: "Implemented it.\n\n- local store\n- seven surfaces",
      created_at: "2026-10-27T09:30:00Z",
    },
  ],
};

describe("ThreadPane", () => {
  it("loads the thread, renders prose, and sends a message", async () => {
    api.fetchThread.mockResolvedValue(detail);
    api.postThreadMessage.mockResolvedValue({
      id: "ev-3",
      card_id: "demo-mode",
      kind: "user",
      author: "you",
      text: "Please add a regression test.",
      created_at: "2026-10-27T12:00:00Z",
    });
    const onSelectCard = vi.fn();
    const onRefreshInbox = vi.fn();
    const user = userEvent.setup();

    render(
      <ThreadPane
        threadId="demo-mode"
        boardName="dev"
        onSelectCard={onSelectCard}
        onRefreshInbox={onRefreshInbox}
      />
    );

    expect(await screen.findByText("Static demo hosting")).toBeInTheDocument();
    expect(screen.getByText("Make the static demo a real surface.")).toBeInTheDocument();
    expect(screen.getByText("Implemented it.")).toBeInTheDocument();
    expect(onSelectCard).toHaveBeenCalled();

    const composer = screen.getByLabelText("Thread message");
    await user.type(composer, "Please add a regression test.{enter}");

    await waitFor(() =>
      expect(api.postThreadMessage).toHaveBeenCalledWith(
        "demo-mode",
        "Please add a regression test.",
        { author: "you", backend: "opencode", board: "dev" }
      )
    );
    expect(await screen.findByText("Please add a regression test.")).toBeInTheDocument();
    expect(onRefreshInbox).toHaveBeenCalled();
  });

  it("offers a retry when the thread cannot be loaded", async () => {
    api.fetchThread.mockRejectedValueOnce(new Error("server starting")).mockResolvedValue(detail);
    const user = userEvent.setup();

    render(<ThreadPane threadId="demo-mode" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this thread");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Static demo hosting")).toBeInTheDocument();
    expect(api.fetchThread).toHaveBeenCalledTimes(2);
  });

  it("toggles the workbench and starts a new intent from the empty state", async () => {
    api.fetchThread.mockResolvedValue(detail);
    const onOpenInspector = vi.fn();
    const onNewIntent = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <ThreadPane threadId="demo-mode" inspectorOpen onOpenInspector={onOpenInspector} />
    );
    expect(await screen.findByText("Static demo hosting")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide workbench" }));
    expect(onOpenInspector).toHaveBeenCalled();

    rerender(<ThreadPane threadId={null} onNewIntent={onNewIntent} />);
    expect(screen.getByText("What should we ship?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add a health check endpoint/ }));
    expect(onNewIntent).toHaveBeenCalledWith("Add a health check endpoint");
  });
});
