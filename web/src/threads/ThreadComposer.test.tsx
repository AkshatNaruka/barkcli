import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThreadComposer } from "./ThreadComposer";
import type { AgentSelection } from "../lib/useAgentSelection";

const dummyAgent: AgentSelection = {
  backend: "opencode",
  model: "pulse-alpha-free",
  role: "builder",
  testCommand: "cargo test",
  ready: true,
  loading: false,
  readiness: "Ready",
  providers: [],
  roles: [],
  modelOptions: [],
  selected: undefined,
  setBackend: vi.fn(),
  setModel: vi.fn(),
  setRole: vi.fn(),
  setTestCommand: vi.fn(),
  selectChoice: vi.fn(),
  restoreChoice: vi.fn(),
  recheck: vi.fn(),
  choice: { backend: "opencode", model: "pulse-alpha-free", role: "builder", testCommand: "cargo test" },
};

describe("ThreadComposer", () => {
  it("renders composer and allows clicking Context Primed", async () => {
    const onChange = vi.fn();
    const onModeChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ThreadComposer
        value="hello"
        onChange={onChange}
        mode="build"
        onModeChange={onModeChange}
        agent={dummyAgent}
        onSubmit={onSubmit}
      />
    );

    const contextBtn = screen.getByRole("button", { name: /Context Primed/i });
    expect(contextBtn).toBeInTheDocument();

    await userEvent.click(contextBtn);
    expect(window.location.hash).toContain("context");
  });

  it("displays slash command palette when user types '/'", () => {
    const onChange = vi.fn();
    const onModeChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ThreadComposer
        value="/"
        onChange={onChange}
        mode="build"
        onModeChange={onModeChange}
        agent={dummyAgent}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByRole("listbox", { name: /slash commands/i })).toBeInTheDocument();
    expect(screen.getByText("/build")).toBeInTheDocument();
    expect(screen.getByText("/plan")).toBeInTheDocument();
    expect(screen.getByText("/tdd")).toBeInTheDocument();
  });

  it("navigates and selects slash command with keyboard", async () => {
    const onChange = vi.fn();
    const onModeChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ThreadComposer
        value="/build"
        onChange={onChange}
        mode="plan"
        onModeChange={onModeChange}
        agent={dummyAgent}
        onSubmit={onSubmit}
      />
    );

    const textarea = screen.getByTestId("thread-composer");
    await userEvent.type(textarea, "{enter}");

    expect(onModeChange).toHaveBeenCalledWith("build");
    expect(onChange).toHaveBeenCalledWith("/build ");
  });
});
