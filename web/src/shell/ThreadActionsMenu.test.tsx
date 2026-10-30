import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThreadActionsMenu, type ThreadActionTarget } from "./ThreadActionsMenu";

const api = vi.hoisted(() => ({
  updateThread: vi.fn(),
  forkThread: vi.fn(),
  deleteThread: vi.fn(),
}));

vi.mock("../lib/api", () => api);

const target: ThreadActionTarget = {
  id: "add-health-check",
  title: "Add health check",
  pinned: false,
  settled: false,
};

function open(overrides: Partial<ThreadActionTarget> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onChanged: vi.fn(),
    onForked: vi.fn(),
    onDeleted: vi.fn(),
  };
  render(
    <ThreadActionsMenu
      target={{ ...target, ...overrides }}
      boardName="dev"
      position={{ x: 120, y: 160 }}
      {...handlers}
    />
  );
  return handlers;
}

describe("ThreadActionsMenu", () => {
  beforeEach(() => {
    api.updateThread.mockReset().mockResolvedValue({ ok: true });
    api.forkThread.mockReset().mockResolvedValue({ ok: true, threadId: "add-health-check-2" });
    api.deleteThread.mockReset().mockResolvedValue({ ok: true });
  });

  it("pins and settles through the real thread update endpoint", async () => {
    const handlers = open();
    const user = userEvent.setup();

    await user.click(screen.getByRole("menuitem", { name: "Pin thread" }));
    expect(api.updateThread).toHaveBeenCalledWith("add-health-check", {
      board: "dev",
      pinned: true,
    });
    expect(handlers.onChanged).toHaveBeenCalled();
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("renames a thread in a dialog", async () => {
    const handlers = open();
    const user = userEvent.setup();

    await user.click(screen.getByRole("menuitem", { name: "Rename thread…" }));
    const input = screen.getByLabelText("Thread title");
    await user.clear(input);
    await user.type(input, "Add uptime check");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.updateThread).toHaveBeenCalledWith("add-health-check", {
        board: "dev",
        title: "Add uptime check",
      })
    );
    expect(handlers.onChanged).toHaveBeenCalled();
  });

  it("forks a thread and opens the new copy", async () => {
    const handlers = open();
    const user = userEvent.setup();

    await user.click(screen.getByRole("menuitem", { name: "Fork thread" }));

    await waitFor(() =>
      expect(handlers.onForked).toHaveBeenCalledWith("add-health-check-2")
    );
    expect(api.forkThread).toHaveBeenCalledWith("add-health-check", { board: "dev" });
  });

  it("requires confirmation before deleting and surfaces a server refusal", async () => {
    api.deleteThread.mockResolvedValueOnce({
      ok: false,
      error: "Stop the active build before deleting this thread.",
    });
    const handlers = open();
    const user = userEvent.setup();

    await user.click(screen.getByRole("menuitem", { name: "Delete thread…" }));
    expect(screen.getByText(/Run records and worktrees stay on disk/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete thread" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Stop the active build");
    expect(handlers.onDeleted).not.toHaveBeenCalled();

    api.deleteThread.mockResolvedValueOnce({ ok: true });
    await user.click(screen.getByRole("button", { name: "Delete thread" }));
    await waitFor(() => expect(handlers.onDeleted).toHaveBeenCalled());
  });
});
