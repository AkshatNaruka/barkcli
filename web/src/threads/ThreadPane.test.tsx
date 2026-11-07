import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ThreadDetail, RunRecord } from "../lib/types";
import { ThreadPane, clearThreadDetailCache } from "./ThreadPane";

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
  startThreadBuild: vi.fn(),
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

const run: RunRecord = {
  id: "run_1", thread_id: detail.id, card_id: detail.id, ordinal: 1,
  provider: "opencode", model: "chosen-model", status: "passed", permission_mode: "auto",
  worktree: "/isolated/worktree", branch: "bark/private-branch", started_at: "2026-11-02T08:00:00Z",
  diff_stats: { files: 2, additions: 8, deletions: 0 }, usage: { input_tokens: 100, output_tokens: 20 },
  gate: { passed: true, command: "npm test", finished_at: "2026-11-02T08:01:00Z",
    verification: { outcome: "passed", tested_head: "tested", target_head: "target", exit_code: 0 } },
};

describe("ThreadPane", () => {
  beforeEach(() => {
    clearThreadDetailCache();
  });
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
    await user.click(screen.getByRole("combobox", { name: "Composer mode" }));
    await user.click(screen.getByRole("option", { name: /^Plan/ }));
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

  it("asks the local agent when Ask is selected", async () => {
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
    await user.click(screen.getByRole("combobox", { name: "Composer mode" }));
    await user.click(screen.getByRole("option", { name: /^Ask/ }));
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

  it("sends coding follow-ups to the build runtime by default", async () => {
    api.fetchThread.mockResolvedValue(detail);
    api.postThreadMessage.mockResolvedValue({ id: "followup", kind: "user", text: "Now add tests" });
    api.startThreadBuild.mockResolvedValue({ id: "run_followup", status: "running", diff_stats: { files: 0, additions: 0, deletions: 0 } });
    const user = userEvent.setup();
    render(<ThreadPane threadId="demo-mode" boardName="dev" />);
    await screen.findByText("Static demo hosting");
    await user.type(screen.getByTestId("thread-composer"), "Now add tests");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.startThreadBuild).toHaveBeenCalledWith("demo-mode",
      expect.objectContaining({ prompt: "Now add tests", provider: "opencode", board: "dev" })));
    expect(api.startThreadChat).not.toHaveBeenCalled();
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
    await user.click(screen.getByRole("button", { name: "Hide thread panel" }));
    expect(onOpenInspector).toHaveBeenCalled();
  });
  it("keeps technical evidence behind Details and opens changes contextually", async () => {
    api.fetchThread.mockResolvedValue({ ...detail, runs: [run], events: [...detail.events, {
      id: "log-1", card_id: detail.id, kind: "log", text: "private diagnostic", author: "agent", created_at: run.started_at,
    }, { id: "done-1", card_id: detail.id, kind: "run_completed", text: "Run completed (exit 0)", author: "agent", created_at: run.started_at }] });
    const onReview = vi.fn();
    const user = userEvent.setup();
    render(<ThreadPane threadId={detail.id} boardName="dev" onReview={onReview} />);
    await screen.findByText("Static demo hosting");
    expect(screen.getByText("Checks passed")).toBeInTheDocument();
    expect(screen.queryByText("dev.board")).not.toBeInTheDocument();
    expect(screen.queryByText(run.worktree!)).not.toBeInTheDocument();
    expect(screen.queryByText("private diagnostic")).not.toBeInTheDocument();
    expect(screen.queryByText("Run completed (exit 0)")).not.toBeInTheDocument();
    expect(screen.queryByText(/operations/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2 files changed" }));
    expect(onReview).toHaveBeenCalledOnce();
    const detailsSummary = document.querySelector("details.thread-details > summary");
    expect(detailsSummary).toBeTruthy();
    await user.click(detailsSummary!);
    expect(await screen.findByText(run.worktree!)).toBeInTheDocument();
    // Activity log events render as labeled details rows inside the opened Details section.
    expect(screen.getAllByText("private diagnostic").length).toBeGreaterThan(0);
  });

  it("keeps failed checks and actionable errors visible while details stay closed", async () => {
    api.fetchThread.mockResolvedValue({ ...detail, runs: [{ ...run, status: "failed", error: "The verification command exited with code 1", gate: {
      ...run.gate, passed: false, verification: { ...run.gate!.verification, outcome: "failed", exit_code: 1 },
    } }] });
    render(<ThreadPane threadId={detail.id} />);
    expect(await screen.findByText("Checks failed")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("verification command exited with code 1");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(run.worktree!)).not.toBeInTheDocument();
  });

  it("offers one Stop even with Details open and keeps the next draft editable", async () => {
    const active = { ...run, status: "running", gate: undefined };
    api.fetchThread.mockResolvedValue({ ...detail, runs: [active] });
    api.stopRun.mockResolvedValue({ ...active, status: "interrupted" });
    const user = userEvent.setup();
    render(<ThreadPane threadId={detail.id} />);
    await screen.findByText("Building");
    const details = document.querySelector("details.thread-details");
    const detailsSummary = details?.querySelector("summary");
    expect(detailsSummary).toBeTruthy();
    if (details instanceof HTMLDetailsElement && !details.open) {
      await user.click(detailsSummary!);
    }
    await screen.findByText(run.worktree!);
    expect(screen.getAllByRole("button", { name: "Stop" })).toHaveLength(1);
    await user.type(screen.getByTestId("thread-composer"), "Keep this next prompt");
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(api.stopRun).toHaveBeenCalledWith("run_1"));
    expect(screen.getByTestId("thread-composer")).toHaveValue("Keep this next prompt");
    expect(await screen.findByText("Stopped")).toBeInTheDocument();
  });

  it("renders reply code and lists as Markdown without executing HTML or loading images", async () => {
    api.fetchThread.mockResolvedValue({ ...detail, events: [{ ...detail.events[1], text:
      "Use `hello.txt`.\n\n```js\nconsole.log('hello');\n```\n\n1. Read it\n2. Run tests\n\n<script>alert('no')</script>\n\n![tracker](https://example.invalid/pixel)" }] });
    const { container } = render(<ThreadPane threadId={detail.id} />);
    await screen.findByText("hello.txt");
    expect(container.querySelector("code")).toHaveTextContent("hello.txt");
    expect(container.querySelector("pre code")).toHaveTextContent("console.log('hello');");
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    expect(container.querySelector("script, img")).toBeNull();
  });

  it("provides copy and reuse actions on user messages and copies text", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    api.fetchThread.mockResolvedValue(detail);

    render(<ThreadPane threadId={detail.id} />);
    await screen.findByText("Static demo hosting");

    const copyBtn = screen.getByRole("button", { name: "Copy prompt" });
    await user.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith("Make the static demo a real surface.");

    const reuseBtn = screen.getByRole("button", { name: "Reuse prompt" });
    await user.click(reuseBtn);
    expect(screen.getByTestId("thread-composer")).toHaveValue("Make the static demo a real surface.");
  });

  it("offers prompt suggestion chips that populate the composer", async () => {
    api.fetchThread.mockResolvedValue(detail);
    const user = userEvent.setup();

    render(<ThreadPane threadId={detail.id} />);
    await screen.findByText("Static demo hosting");

    const chip = screen.getByRole("button", { name: "Add regression test" });
    expect(chip).toBeInTheDocument();
    await user.click(chip);
    expect(screen.getByTestId("thread-composer")).toHaveValue("Add regression test");
  });

});

