import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UniversalComposer } from "./UniversalComposer";

const { createThread, fetchProviders, fetchProviderModels, fetchRoles, startThreadChat } = vi.hoisted(() => ({
  createThread: vi.fn(),
  fetchProviders: vi.fn(async () => [
    { id: "opencode", name: "OpenCode", available: true, authenticated: true },
  ]),
  fetchProviderModels: vi.fn(async () => []),
  fetchRoles: vi.fn(async () => []),
  startThreadChat: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  createThread,
  fetchProviders,
  fetchProviderModels,
  fetchRoles,
  startThreadChat,
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
      mode: "plan_first",
      board: "dev",
    });
    expect(onClose).toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith("thread-1");
  });

  it("keeps the dialog open and explains a failed start", async () => {
    createThread.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<UniversalComposer isOpen onClose={vi.fn()} onCreated={vi.fn()} />);

    await user.type(screen.getByTestId("thread-composer"), "A failing intent");
    await user.click(screen.getByRole("button", { name: /Plan changes/ }));

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
    await user.click(screen.getByRole("button", { name: "Ask" }));
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
});
