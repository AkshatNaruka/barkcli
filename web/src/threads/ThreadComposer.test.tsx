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

  it("renders attach button and voice dictation button", () => {
    render(
      <ThreadComposer
        value=""
        onChange={vi.fn()}
        mode="build"
        onModeChange={vi.fn()}
        agent={dummyAgent}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /attach files/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /voice dictation/i })).toBeInTheDocument();
    expect(screen.getByTestId("file-attachment-input")).toBeInTheDocument();
  });

  it("renders attachment chips and calls removeAttachment", async () => {
    const onAttachmentsChange = vi.fn();
    const attachments = [
      {
        id: "att-1",
        name: "test-code.ts",
        size: 1024,
        type: "text/typescript",
        isImage: false,
      },
    ];

    render(
      <ThreadComposer
        value=""
        onChange={vi.fn()}
        mode="build"
        onModeChange={vi.fn()}
        agent={dummyAgent}
        attachments={attachments}
        onAttachmentsChange={onAttachmentsChange}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText("test-code.ts")).toBeInTheDocument();
    expect(screen.getByText("1.0 KB")).toBeInTheDocument();

    const removeBtn = screen.getByRole("button", { name: /remove test-code.ts/i });
    await userEvent.click(removeBtn);
    expect(onAttachmentsChange).toHaveBeenCalled();
  });

  it("enables submit when attachments exist even if prompt text is blank", () => {
    const attachments = [
      {
        id: "att-img",
        name: "screenshot.png",
        size: 2048,
        type: "image/png",
        isImage: true,
      },
    ];

    render(
      <ThreadComposer
        value=""
        onChange={vi.fn()}
        mode="build"
        onModeChange={vi.fn()}
        agent={dummyAgent}
        attachments={attachments}
        onSubmit={vi.fn()}
      />
    );

    const submitBtn = screen.getByTestId("composer-submit");
    expect(submitBtn).not.toBeDisabled();
  });
});
