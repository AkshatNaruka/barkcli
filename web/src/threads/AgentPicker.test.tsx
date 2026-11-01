import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentSelection } from "../lib/useAgentSelection";
import { AgentPicker } from "./AgentPicker";

const fetchProviderModels = vi.hoisted(() =>
  vi.fn(async (id: string) => {
    if (id === "opencode") return ["openai/gpt-5", "deepseek/v4.1-flash", "anthropic/claude-sonnet-4-6"];
    if (id === "claude") return ["sonnet", "opus"];
    if (id === "codex") return ["gpt-5"];
    return [];
  })
);

vi.mock("../lib/api", () => ({ fetchProviderModels }));

function provider(id: string, name: string, available = true, authenticated: boolean | null = true) {
  return {
    id,
    name,
    available,
    authenticated,
    command: id,
    capabilities: {
      resume: false, stream_json: true, tool_events: true, approvals: false,
      questions: false, fork: false, usage: false, skills: true, mcp: false, headless: true,
    },
  };
}

function makeAgent(overrides: Partial<AgentSelection> = {}): AgentSelection {
  const providers = [
    provider("opencode", "OpenCode"),
    provider("claude", "Claude Code", true, false),
    provider("codex", "Codex", false, null),
  ];
  const selectChoice = vi.fn();
  return {
    backend: "opencode",
    model: "",
    selected: providers[0],
    providers,
    modelOptions: [],
    roles: [{ id: "builder", name: "Builder" }],
    role: "builder",
    testCommand: "",
    readiness: "Ready",
    loading: false,
    ready: true,
    setBackend: vi.fn(),
    setModel: vi.fn(),
    setRole: vi.fn(),
    setTestCommand: vi.fn(),
    selectChoice,
    recheck: vi.fn(),
    restoreChoice: vi.fn(),
    choice: { backend: "opencode", model: "", role: "builder", testCommand: "" },
    ...overrides,
  } as unknown as AgentSelection;
}

function renderPicker(agent = makeAgent(), mode: "ask" | "build" = "build") {
  render(<AgentPicker agent={agent} mode={mode} />);
  return { agent };
}

describe("AgentPicker", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    localStorage.clear();
    fetchProviderModels.mockClear();
  });

  it("opens with one click, toggles closed, and closes on outside click", async () => {
    const user = userEvent.setup();
    renderPicker();
    const trigger = screen.getByRole("button", { name: /^Agent and model/ });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Agent and model" })).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByRole("dialog", { name: "Agent and model" })).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(document.body);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Agent and model" })).not.toBeInTheDocument()
    );
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: /^Agent and model/ }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Agent and model" })).not.toBeInTheDocument();
  });

  it("lets a provider use its CLI default even when it advertises no model list", async () => {
    const user = userEvent.setup();
    const empty = provider("empty", "Local CLI");
    const agent = makeAgent({ providers: [empty], backend: "empty", selected: empty });
    renderPicker(agent);
    await user.click(screen.getByRole("button", { name: /^Agent and model/ }));
    await user.click(await screen.findByRole("button", { name: /^CLI default/ }));
    expect(agent.selectChoice).toHaveBeenCalledWith("empty", "");
  });

  it("lists models for the selected provider and selects one", async () => {
    const user = userEvent.setup();
    const { agent } = renderPicker();
    await user.click(screen.getByRole("button", { name: /^Agent and model/ }));

    await screen.findByText("v4.1-flash");
    await user.click(screen.getByRole("button", { name: /^v4\.1-flash/ }));

    expect(agent.selectChoice).toHaveBeenCalledWith("opencode", "deepseek/v4.1-flash");
    expect(screen.queryByRole("dialog", { name: "Agent and model" })).not.toBeInTheDocument();
  });

  it("switches providers from the rail and keeps the panel open until a model is chosen", async () => {
    const user = userEvent.setup();
    const { agent } = renderPicker();
    await user.click(screen.getByRole("button", { name: /^Agent and model/ }));

    await user.click(screen.getByRole("button", { name: /Claude Code: Sign-in needed/ }));
    expect(screen.getByRole("dialog", { name: "Agent and model" })).toBeInTheDocument();
    await screen.findByText("sonnet");
    await user.click(screen.getByRole("button", { name: /^sonnet/ }));

    expect(agent.selectChoice).toHaveBeenCalledWith("claude", "sonnet");
  });

  it("filters models and keeps favorites", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: /^Agent and model/ }));
    await screen.findByText("v4.1-flash");

    await user.type(screen.getByLabelText("Search models"), "deep");
    expect(screen.getByText("v4.1-flash")).toBeInTheDocument();
    expect(screen.queryByText("gpt-5")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search models"));
    await user.click(screen.getByRole("button", { name: "Star openai/gpt-5" }));
    expect(localStorage.getItem("bark:model-favorites:v1")).toContain("opencode::openai/gpt-5");

    await user.click(screen.getByRole("button", { name: "Favorite models" }));
    expect(screen.getByText("gpt-5")).toBeInTheDocument();
  });

  it("uses scoped ⌘1 shortcuts only while open", async () => {
    const user = userEvent.setup();
    const { agent } = renderPicker();
    await user.click(screen.getByRole("button", { name: /^Agent and model/ }));
    await screen.findByText("gpt-5");

    fireEvent.keyDown(document, { key: "1", metaKey: true });
    expect(agent.selectChoice).toHaveBeenCalledWith("opencode", "openai/gpt-5");
  });

  it("shows build options only in build mode", async () => {
    const user = userEvent.setup();
    renderPicker(makeAgent(), "build");
    await user.click(screen.getByRole("button", { name: /^Agent and model/ }));
    await user.click(screen.getByText("Build options"));
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
    expect(screen.getByLabelText("Verification command")).toBeInTheDocument();
  });
});
