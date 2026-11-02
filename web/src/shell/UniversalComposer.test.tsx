import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UniversalComposer } from "./UniversalComposer";

const { createThread, fetchProviders, fetchProviderModels, fetchRoles, startThreadChat, startThreadBuild } = vi.hoisted(() => ({
  createThread: vi.fn(),
  fetchProviders: vi.fn(async () => [
    { id: "opencode", name: "OpenCode", available: true, authenticated: true },
  ]),
  fetchProviderModels: vi.fn(async () => []),
  fetchRoles: vi.fn(async () => []),
  startThreadChat: vi.fn(),
  startThreadBuild: vi.fn(async () => ({ id: "run_1" })),
}));
vi.mock("../lib/api", () => ({
  createThread,
  fetchProviders,
  fetchProviderModels,
  fetchRoles,
  startThreadChat,
  startThreadBuild,
}));

describe("UniversalComposer", () => {
  it("starts an intent with the selected defaults", async () => {
    createThread.mockResolvedValue({ thread_id: "thread-1" });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <UniversalComposer
        isOpen
        onClose={onClose}
        onCreated={onCreated}
        boardName="dev"
      />
    );

    await user.type(screen.getByTestId("thread-composer"), "Make the demo real");
    await waitFor(() =>
      expect(screen.getByTestId("composer-submit")).toBeEnabled()
    );
    await user.click(screen.getByTestId("composer-submit"));

    await waitFor(() => expect(createThread).toHaveBeenCalledTimes(1));
    expect(createThread).toHaveBeenCalledWith({
      text: "Make the demo real",
      kind: "feature",
      backend: "opencode",
      model: undefined,
      mode: "build",
      board: "dev",
    });
    expect(startThreadBuild).toHaveBeenCalledWith("thread-1", expect.objectContaining({
      provider: "opencode", prompt: "Make the demo real", board: "dev",
    }));
    expect(onClose).toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith("thread-1");
  });

  it("keeps the dialog open and explains a failed start", async () => {
    createThread.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<UniversalComposer isOpen initialMode="plan_first" onClose={vi.fn()} onCreated={vi.fn()} />);

    await user.type(screen.getByTestId("thread-composer"), "A failing intent");
    await user.click(screen.getByRole("button", { name: "Prepare plan" }));

    expect(
      await screen.findByText(
        "Could not create the thread. Check the server and try again."
      )
    ).toBeInTheDocument();
  });

  it("starts a read-only conversation in ask mode", async () => {
    createThread.mockResolvedValue({ thread_id: "thread-chat" });
    startThreadChat.mockResolvedValue({ ok: true, turn_id: "chat_1" });
    const user = userEvent.setup();
    render(
      <UniversalComposer isOpen onClose={vi.fn()} onCreated={vi.fn()} boardName="dev" />
    );

    await user.type(screen.getByTestId("thread-composer"), "Where is auth?");
    await user.click(screen.getByRole("combobox", { name: "Composer mode" }));
    await user.click(screen.getByRole("option", { name: /^Ask/ }));
    await waitFor(() =>
      expect(screen.getByTestId("composer-submit")).toBeEnabled()
    );
    await user.click(screen.getByTestId("composer-submit"));

    await waitFor(() => expect(createThread).toHaveBeenCalled());
    expect(createThread).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "chat", board: "dev" })
    );
    expect(startThreadChat).toHaveBeenCalledWith("thread-chat", {
      text: "Where is auth?",
      provider: "opencode",
      model: undefined,
      board: "dev",
      skip_user_event: true,
    });
  });

  it("dismisses with Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<UniversalComposer isOpen onClose={onClose} onCreated={vi.fn()} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("retries a failed build start in the same saved thread and preserves the prompt", async () => {
    createThread.mockResolvedValue({ thread_id: "saved-thread" });
    startThreadBuild.mockRejectedValueOnce(new Error("The selected provider is unavailable"));
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<UniversalComposer isOpen onClose={vi.fn()} onCreated={onCreated} boardName="dev" />);
    await user.type(screen.getByTestId("thread-composer"), "Implement this feature");
    await waitFor(() => expect(screen.getByTestId("composer-submit")).toBeEnabled());
    await user.click(screen.getByTestId("composer-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent("selected provider is unavailable");
    expect(screen.getByTestId("thread-composer")).toHaveValue("Implement this feature");
    expect(onCreated).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("composer-submit"));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("saved-thread"));
    expect(createThread).toHaveBeenCalledTimes(1);
  });
  it("keeps mode choices tucked away and preserves newline and IME input", async () => {
    createThread.mockResolvedValue({ thread_id: "compact-thread" });
    const user = userEvent.setup();
    const { container } = render(<UniversalComposer isOpen inline onClose={vi.fn()} onCreated={vi.fn()} />);
    const composer = screen.getByTestId("thread-composer");
    expect(screen.getByRole("combobox", { name: "Composer mode" })).toHaveTextContent("Build");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask" })).not.toBeInTheDocument();
    expect(container.querySelector(".composer-hint")).toBeNull();
    await user.type(composer, "First line");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(composer, "Second line");
    expect(composer).toHaveValue("First line\nSecond line");
    fireEvent.keyDown(composer, { key: "Enter", isComposing: true });
    expect(createThread).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(createThread).toHaveBeenCalledWith(expect.objectContaining({ text: "First line\nSecond line" })));
  });

});
