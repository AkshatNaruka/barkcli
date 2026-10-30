import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ThreadDetail } from "../lib/types";
import { ThreadPane } from "./ThreadPane";

const api = vi.hoisted(() => ({
  fetchThread: vi.fn(),
  postThreadMessage: vi.fn(),
  startThreadChat: vi.fn(),
  stopThreadChat: vi.fn(),
  approveRun: vi.fn(),
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
  fetchProviders: vi.fn(async () => [
    { id: "opencode", name: "OpenCode", available: true, authenticated: true },
  ]),
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

    const composer = screen.getByTestId("thread-composer");
    await user.click(screen.getByRole("button", { name: "Build" }));
    await user.type(composer, "Please add a regression test.");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    await waitFor(() =>
      expect(api.postThreadMessage).toHaveBeenCalledWith(
        "demo-mode",
        "Please add a regression test.",
        {
          author: "you",
          backend: "opencode",
          model: undefined,
          mode: "plan_first",
          board: "dev",
        }
      )
    );
    expect(await screen.findByText("Please add a regression test.")).toBeInTheDocument();
    expect(onRefreshInbox).toHaveBeenCalled();
  });

  it("asks the local agent in read-only mode by default", async () => {
    api.fetchThread.mockResolvedValue(detail);
    api.startThreadChat.mockResolvedValue({
      ok: true,
      turn_id: "chat_1",
      provider: "opencode",
      board: "dev",
      mode: "ask",
    });
    const user = userEvent.setup();

    render(<ThreadPane threadId="demo-mode" boardName="dev" />);
    await screen.findByText("Static demo hosting");

    const composer = screen.getByTestId("thread-composer");
    await user.type(composer, "Where is the auth middleware?");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    await waitFor(() =>
      expect(api.startThreadChat).toHaveBeenCalledWith("demo-mode", {
        text: "Where is the auth middleware?",
        provider: "opencode",
        model: undefined,
        board: "dev",
      })
    );
    expect(api.postThreadMessage).not.toHaveBeenCalledWith(
      "demo-mode",
      "Where is the auth middleware?",
      expect.anything()
    );
  });

  it("renders streamed assistant deltas as one bubble", async () => {
    api.fetchThread.mockResolvedValue({
      ...detail,
      events: [
        ...detail.events,
        {
          id: "d1",
          card_id: "demo-mode",
          kind: "assistant_delta",
          author: "opencode",
          text: "The answer ",
          created_at: "2026-10-27T10:00:00Z",
          turn_id: "chat_1",
        },
        {
          id: "d2",
          card_id: "demo-mode",
          kind: "assistant_delta",
          author: "opencode",
          text: "is in the middleware.",
          created_at: "2026-10-27T10:00:01Z",
          turn_id: "chat_1",
        },
      ],
    });

    render(<ThreadPane threadId="demo-mode" boardName="dev" />);
    expect(
      await screen.findByText("The answer is in the middleware.")
    ).toBeInTheDocument();
    expect(screen.queryByText("The answer ")).not.toBeInTheDocument();
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

  it("toggles the workbench from the thread header", async () => {
    api.fetchThread.mockResolvedValue(detail);
    const onOpenInspector = vi.fn();
    const user = userEvent.setup();

    render(
      <ThreadPane threadId="demo-mode" inspectorOpen onOpenInspector={onOpenInspector} />
    );
    expect(await screen.findByText("Static demo hosting")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide surfaces" }));
    expect(onOpenInspector).toHaveBeenCalled();
  });
});
