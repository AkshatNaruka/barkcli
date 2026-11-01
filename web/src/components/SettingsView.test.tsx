import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsView } from "./SettingsView";
import type { Board, ProviderStatus } from "../lib/types";

vi.mock("../lib/api", () => ({
  apiAccess: () => ({ base: "http://127.0.0.1:4399", token: "" }),
  fetchConfig: vi.fn(async () => ({ ai: { base_url: "", model: "" } })),
  fetchHooks: vi.fn(async () => ({ installed: true })),
  fetchProject: vi.fn(async () => ({ root: "/tmp/project", is_git: true, setup: { complete: true } })),
  fetchProviders: vi.fn(async () => []),
  validateBoards: vi.fn(async () => ({ all_valid: true })),
}));

vi.mock("../lib/desktop", () => ({
  isDesktop: () => false,
  openLogs: vi.fn(async () => true),
  openProviderLogin: vi.fn(async () => true),
  openTerminal: vi.fn(async () => true),
}));

vi.mock("../lib/theme", () => ({
  useTheme: () => ({ theme: "black", setTheme: vi.fn() }),
}));

vi.mock("../lib/hashnav", () => ({
  navigate: vi.fn(),
}));

const board: Board = {
  title: "dev",
  description: "",
  columns: [
    { id: "todo", name: "Todo" },
    { id: "doing", name: "Doing" },
  ],
  cards: [],
};

function provider(overrides: Partial<ProviderStatus> = {}): ProviderStatus {
  return {
    id: "opencode",
    name: "OpenCode",
    available: true,
    command: "opencode",
    capabilities: {
      plan: true,
      build: true,
      read_only: true,
      streaming: true,
      worktree: true,
    },
    ...overrides,
  } as ProviderStatus;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SettingsView", () => {
  it("keeps focus while typing a board title", async () => {
    const user = userEvent.setup();
    render(<SettingsView board={board} onSaveBoard={vi.fn()} />);

    const title = screen.getByRole("textbox", { name: "Title" });
    await user.click(title);
    await user.type(title, "X");

    expect(title).toHaveFocus();
    expect(title).toHaveValue("devX");
  });

  it("saves the edited title once", async () => {
    const user = userEvent.setup();
    const onSaveBoard = vi.fn();
    render(<SettingsView board={board} onSaveBoard={onSaveBoard} />);

    const title = screen.getByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Release");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSaveBoard).toHaveBeenCalledTimes(1);
    expect(onSaveBoard.mock.calls[0][0].title).toBe("Release");
  });

  it("shows each settings section exactly once", async () => {
    const user = userEvent.setup();
    render(<SettingsView board={board} onSaveBoard={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Diagnostics/ }));
    expect(await screen.findByRole("heading", { name: "Remote access" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Remote access" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Diagnostics" })).toHaveLength(1);
  });

  it("shows provider sign-in only when auth is required", async () => {
    const { fetchProviders } = await import("../lib/api");
    vi.mocked(fetchProviders).mockResolvedValue([
      provider({ id: "claude-code", name: "Claude Code", authenticated: false, auth_command: "claude auth login" }),
      provider({ id: "codex", name: "Codex", authenticated: true }),
    ]);
    const user = userEvent.setup();
    render(<SettingsView board={board} onSaveBoard={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Agents/ }));
    const claude = await screen.findByText("Claude Code");
    const row = claude.closest(".settings-agent");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Codex").closest(".settings-agent")).not.toHaveTextContent("Sign in");
  });
});
