import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InboxPane } from "./InboxPane";
import type { ThreadSummary } from "../lib/types";

vi.mock("../components/ServerStatus", () => ({
  ServerStatus: () => <span>demo</span>,
}));

const threads: ThreadSummary[] = [
  {
    id: "demo-mode",
    title: "Static demo hosting",
    status_group: "running",
    event_count: 4,
    updated_at: "2026-10-27T11:30:00Z",
    column: "doing",
    backend: "opencode-1",
  },
  {
    id: "store-tokens",
    title: "Store tokens securely",
    status_group: "needs_you",
    event_count: 2,
    updated_at: "2026-10-27T07:00:00Z",
    column: "review",
    backend: "codex-1",
  },
  {
    id: "kiosk-mode",
    title: "Kiosk mode for wall displays",
    status_group: "settled",
    event_count: 3,
    updated_at: "2026-10-25T11:30:00Z",
    column: "done",
    backend: "opencode",
  },
];

function renderInbox(overrides: Partial<React.ComponentProps<typeof InboxPane>> = {}) {
  const onSelect = vi.fn();
  const onNew = vi.fn();
  const onSwitchBoard = vi.fn();
  const onOpenPalette = vi.fn();
  const onCustomize = vi.fn();
  render(
    <InboxPane
      threads={threads}
      selectedId="demo-mode"
      onSelect={onSelect}
      onNew={onNew}
      boardName="dev"
      boards={["dev", "roadmap"]}
      onSwitchBoard={onSwitchBoard}
      onOpenPalette={onOpenPalette}
      onCustomize={onCustomize}
      {...overrides}
    />
  );
  return { onSelect, onNew, onSwitchBoard, onOpenPalette, onCustomize };
}

describe("InboxPane", () => {
  it("groups threads by state, marks the selection, and keeps counts visible", () => {
    renderInbox();

    expect(screen.getByText("Needs you")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Settled")).toBeInTheDocument();
    expect(screen.getByTestId("thread-row-demo-mode")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("thread-row-store-tokens")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Static demo hosting")).toBeInTheDocument();
    expect(screen.getByText("opencode-1")).toBeInTheDocument();
  });

  it("filters by title, id, and backend and clears without losing data", async () => {
    const user = userEvent.setup();
    renderInbox();
    const search = screen.getByTestId("thread-search");

    await user.type(search, "kiosk");
    expect(screen.getByText("Kiosk mode for wall displays")).toBeInTheDocument();
    expect(screen.queryByText("Static demo hosting")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "codex");
    expect(screen.getByText("Store tokens securely")).toBeInTheDocument();
    expect(screen.queryByText("Kiosk mode for wall displays")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "nothing here");
    expect(screen.getByText("No threads match that search.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("Kiosk mode for wall displays")).toBeInTheDocument();
  });

  it("selects a thread and dispatches new intent and board actions", async () => {
    const user = userEvent.setup();
    const handlers = renderInbox();

    await user.click(screen.getByTestId("thread-row-store-tokens"));
    expect(handlers.onSelect).toHaveBeenCalledWith("store-tokens");

    await user.click(screen.getByTestId("new-intent"));
    expect(handlers.onNew).toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Board"), "roadmap");
    expect(handlers.onSwitchBoard).toHaveBeenCalledWith("roadmap");
  });

  it("focuses search with '/' and supports the empty state", async () => {
    const { rerender } = render(
      <InboxPane
        threads={[]}
        selectedId={null}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        boardName="dev"
        boards={["dev"]}
        onSwitchBoard={vi.fn()}
      />
    );

    expect(screen.getByText("No threads on this board yet.")).toBeInTheDocument();
    const search = screen.getByTestId("thread-search");
    fireEvent.keyDown(window, { key: "/" });
    await waitFor(() => expect(search).toHaveFocus());
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
  });
});
