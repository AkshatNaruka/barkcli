import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UniversalComposer } from "./UniversalComposer";

const { createThread, fetchProviders, fetchProviderModels, startThreadChat } = vi.hoisted(() => ({
  createThread: vi.fn(),
  fetchProviders: vi.fn(async () => []),
  fetchProviderModels: vi.fn(async () => []),
  startThreadChat: vi.fn(),
}));
vi.mock("../lib/api", () => ({ createThread, fetchProviders, fetchProviderModels, startThreadChat }));

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

    await user.type(screen.getByLabelText("Intent"), "Make the demo real");
    await user.click(screen.getByRole("button", { name: /Start/ }));

    await waitFor(() => expect(createThread).toHaveBeenCalledTimes(1));
    expect(createThread).toHaveBeenCalledWith({
      text: "Make the demo real",
      kind: "feature",
      backend: "opencode",
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

    await user.type(screen.getByLabelText("Intent"), "A failing intent");
    await user.click(screen.getByRole("button", { name: /Start/ }));

    expect(
      await screen.findByText("Could not start the intent. Check that the server is running.")
    ).toBeInTheDocument();
  });

  it("starts a read-only conversation in chat mode", async () => {
    createThread.mockResolvedValue({ thread_id: "thread-chat" });
    startThreadChat.mockResolvedValue({ ok: true, turn_id: "chat_1" });
    const user = userEvent.setup();
    render(
      <UniversalComposer isOpen onClose={vi.fn()} onCreated={vi.fn()} boardName="dev" />
    );

    await user.type(screen.getByLabelText("Intent"), "Where is auth?");
    await user.selectOptions(screen.getByLabelText("Execution mode"), "chat");
    await user.click(screen.getByRole("button", { name: /Start/ }));

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
