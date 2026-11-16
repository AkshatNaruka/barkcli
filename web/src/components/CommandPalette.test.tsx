import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "./CommandPalette";

const { fetchThreads } = vi.hoisted(() => ({ fetchThreads: vi.fn() }));
vi.mock("../lib/api", () => ({ fetchThreads }));

const threads = [
  {
    id: "t1",
    title: "Create ping uptime endpoint",
    status_group: "running",
    event_count: 3,
    updated_at: new Date().toISOString(),
    column: "doing",
  },
  {
    id: "t2",
    title: "History logging",
    status_group: "settled",
    event_count: 1,
    updated_at: new Date().toISOString(),
    column: "done",
  },
];

function renderPalette(onClose = vi.fn()) {
  render(
    <CommandPalette
      board={null}
      onClose={onClose}
      onNavigate={vi.fn()}
      onAddCard={vi.fn()}
      onEditCard={vi.fn()}
      onCustomize={vi.fn()}
      onCommand={vi.fn()}
    />
  );
  return onClose;
}

describe("CommandPalette", () => {
  beforeEach(() => {
    window.location.hash = "";
    fetchThreads.mockResolvedValue(threads);
  });

  it("lists recent threads alongside commands", async () => {
    renderPalette();

    expect(await screen.findByText("Create ping uptime endpoint")).toBeInTheDocument();
    expect(screen.getByText("History logging")).toBeInTheDocument();
    expect(screen.getByText("Threads")).toBeInTheDocument();
    expect(screen.getByText("Commands")).toBeInTheDocument();
  });

  it("filters threads and opens the highlighted one with Enter", async () => {
    const user = userEvent.setup();
    const onClose = renderPalette();
    await screen.findByText("Create ping uptime endpoint");

    await user.type(screen.getByRole("combobox"), "ping");
    await waitFor(() =>
      expect(screen.queryByText("History logging")).not.toBeInTheDocument()
    );

    await user.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalled();
    expect(window.location.hash).toBe("#/chat?thread=t1");
  });

  it("moves the highlight with the arrow keys", async () => {
    const user = userEvent.setup();
    renderPalette();
    await screen.findByText("Create ping uptime endpoint");

    await user.keyboard("{ArrowDown}");
    const rows = screen.getAllByRole("option");
    expect(rows[1]).toHaveAttribute("aria-selected", "true");
  });

  it("shows an empty state and closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = renderPalette();
    await screen.findByText("Create ping uptime endpoint");

    await user.type(screen.getByRole("combobox"), "zzzz");
    expect(screen.getByText(/No matches for/)).toBeInTheDocument();
    expect(screen.getByText("0 results")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
