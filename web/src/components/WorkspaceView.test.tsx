import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectSnapshot, ProviderStatus, SessionEntry } from "../lib/types";
import { WorkspaceView } from "./WorkspaceView";

const api = vi.hoisted(() => ({
  fetchProject: vi.fn(),
  fetchProviders: vi.fn(),
  fetchSessions: vi.fn(),
  installHooks: vi.fn(),
  initGit: vi.fn(),
  onboardProject: vi.fn(),
}));

vi.mock("../lib/api", () => api);
vi.mock("../lib/desktop", () => ({
  isDesktop: () => false,
  openProjectDialog: vi.fn(),
  openProviderLogin: vi.fn(),
  recentProjects: vi.fn(async () => []),
  revealProject: vi.fn(),
  switchProject: vi.fn(),
}));

const project: ProjectSnapshot = {
  root: "/tmp/real-project",
  name: "real-project",
  board_dir: "/tmp/real-project/.board",
  boards: ["work"],
  active_board: "work",
  is_git: true,
  git: {
    branch: "main",
    head: "abc123",
    upstream: null,
    ahead: 0,
    behind: 0,
    clean: true,
    changes: 0,
  },
  context: {
    exists: true,
    file: "/tmp/real-project/project_context.md",
    tokens: 900,
    blocks: 4,
    stale_blocks: 0,
    last_run: new Date().toISOString(),
  },
  hooks: { opencode: true, claude_code: true, spec_sync: false },
  setup: {
    board: true,
    context: true,
    team: true,
    hooks: true,
    complete: true,
  },
  counts: {
    cards: 7,
    done: 3,
    doing: 2,
    specs: 1,
    sessions: 2,
    agents: 4,
  },
};

const providers: ProviderStatus[] = [
  {
    id: "opencode",
    name: "OpenCode",
    available: true,
    version: "1.0.0",
    command: "opencode",
    authenticated: true,
    capabilities: {
      resume: true,
      stream_json: true,
      tool_events: true,
      approvals: false,
      questions: false,
      fork: true,
      usage: true,
      skills: true,
      mcp: true,
      headless: true,
    },
  },
  {
    id: "claude-code",
    name: "Claude Code",
    available: true,
    version: "2.0.0",
    command: "claude",
    authenticated: false,
    auth_command: "claude auth login",
    capabilities: {
      resume: true,
      stream_json: true,
      tool_events: true,
      approvals: false,
      questions: false,
      fork: false,
      usage: true,
      skills: true,
      mcp: true,
      headless: true,
    },
  },
  {
    id: "human",
    name: "Human",
    available: true,
    command: "human",
    authenticated: true,
    capabilities: {
      resume: false,
      stream_json: false,
      tool_events: false,
      approvals: false,
      questions: false,
      fork: false,
      usage: false,
      skills: false,
      mcp: false,
      headless: false,
    },
  },
];

const sessions: SessionEntry[] = [
  {
    id: "run_abc",
    agent: "opencode",
    model: "anthropic/claude-opus-4-5",
    board: "work",
    prompt: "Ship the real app",
    summary: "Ship the real app · merged · cargo test passed",
    at: new Date().toISOString(),
  } as SessionEntry,
];

function renderView(overrides: Partial<ComponentProps<typeof WorkspaceView>> = {}) {
  return render(
    <WorkspaceView
      boardName="work"
      onNewIntent={vi.fn()}
      onOpenBoard={vi.fn()}
      onOpenBrain={vi.fn()}
      onOpenContext={vi.fn()}
      onOpenHistory={vi.fn()}
      onOpenSettings={vi.fn()}
      {...overrides}
    />
  );
}

describe("WorkspaceView", () => {
  beforeEach(() => {
    api.fetchProject.mockReset();
    api.fetchProviders.mockReset();
    api.fetchSessions.mockReset();
    api.fetchProject.mockResolvedValue(project);
    api.fetchProviders.mockResolvedValue(providers);
    api.fetchSessions.mockResolvedValue(sessions);
  });

  it("renders only real project, provider, and session state", async () => {
    renderView();

    await waitFor(() => expect(screen.getByText("real-project")).toBeTruthy());
    expect(screen.getByText("/tmp/real-project")).toBeTruthy();
    expect(screen.getByText("Local agents")).toBeTruthy();
    expect(screen.getByText("Sign-in needed")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.queryByText("Human")).toBeNull();
    expect(screen.getByText("Ship the real app · merged · cargo test passed")).toBeTruthy();
    expect(api.fetchSessions).toHaveBeenCalledWith(6, undefined, undefined, undefined, "work");
  });

  it("shows an empty session state instead of seeded history", async () => {
    api.fetchSessions.mockResolvedValue([]);
    renderView();

    await waitFor(() => expect(screen.getByText("No agent sessions yet.")).toBeTruthy());
    expect(screen.getByText("Start an intent in Chat. Completed runs will appear here and feed the brain.")).toBeTruthy();
  });

  it("offers git initialization for a non-git folder and runs it explicitly", async () => {
    const nonGit = {
      ...project,
      is_git: false,
      git: null,
      setup: { ...project.setup, complete: false },
    };
    api.fetchProject.mockResolvedValue(nonGit);
    api.initGit.mockResolvedValue({ ok: true, already: false, root: nonGit.root });
    const user = userEvent.setup();
    renderView();

    const button = await screen.findByRole("button", { name: /Initialize Git for this folder/i });
    await user.click(button);
    expect(api.initGit).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByText(/Git repository initialized/)).toBeTruthy()
    );
  });

  it("runs real onboarding and renders the server's steps", async () => {
    api.onboardProject.mockResolvedValue({
      ok: true,
      steps: [
        { id: "board", label: "Board", ok: true, detail: "1 board(s) ready" },
        { id: "providers", label: "Local agents", ok: true, detail: "1 local agent(s) ready to run" },
      ],
      project,
    });
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: /Run setup/i }));
    expect(api.onboardProject).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("1 board(s) ready")).toBeTruthy());
    expect(screen.getByText("1 local agent(s) ready to run")).toBeTruthy();
  });
});
