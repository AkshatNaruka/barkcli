import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThreadList } from "./ThreadList";
import type { ThreadSummary } from "../lib/types";
import * as api from "../lib/api";

const mockThreads: ThreadSummary[] = [
  {
    id: "thread-1",
    title: "Auth bugfix",
    project_name: "barkcli",
    project_root: "/Users/dev/barkcli",
    status_group: "needs_you",
    column: "review",
    updated_at: new Date().toISOString(),
    backend: "opencode",
    pinned: false,
  } as ThreadSummary,
  {
    id: "thread-2",
    title: "Database schema migration",
    project_name: "ses",
    project_root: "/Users/dev/ses",
    status_group: "running",
    column: "doing",
    updated_at: new Date().toISOString(),
    backend: "codex",
    pinned: true,
  } as ThreadSummary,
  {
    id: "thread-3",
    title: "Frontend refactoring",
    project_name: "barkcli",
    project_root: "/Users/dev/barkcli",
    status_group: "settled",
    column: "done",
    updated_at: new Date().toISOString(),
    backend: "claude-code",
    pinned: false,
  } as ThreadSummary,
];

vi.mock("../lib/api", () => ({
  fetchThreads: vi.fn(async () => mockThreads),
  deleteThread: vi.fn(async () => ({ ok: true })),
  updateThread: vi.fn(async () => ({ ok: true })),
  connectWs: () => () => {},
}));

vi.mock("../lib/hashnav", () => ({
  navigate: vi.fn(),
  useRouteState: () => ({ route: "chat", thread: "thread-1" }),
}));

describe("ThreadList Management & Project Grouping", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("groups threads by project name in collapsible sections", async () => {
    const user = userEvent.setup();
    render(<ThreadList boardName="dev" />);
    await screen.findByText("Auth bugfix");

    // Both project groups should be rendered with headers
    expect(screen.getByRole("button", { name: /barkcli project, 2 threads/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ses project, 1 threads/i })).toBeInTheDocument();

    // Collapse the 'ses' project group
    const sesHeader = screen.getByRole("button", { name: /ses project, 1 threads/i });
    await user.click(sesHeader);

    // Threads in ses should now be hidden
    expect(screen.queryByText("Database schema migration")).not.toBeInTheDocument();

    // Click again to re-expand
    await user.click(sesHeader);
    expect(screen.getByText("Database schema migration")).toBeInTheDocument();
  });

  it("opens project sources modal when clicking Add project button in header", async () => {
    const user = userEvent.setup();
    render(<ThreadList boardName="dev" />);
    await screen.findByText("Auth bugfix");

    // Click Add project icon in header
    const addProjectBtn = screen.getByTitle("Add project / Sources");
    await user.click(addProjectBtn);

    // Sources modal appears
    expect(screen.getByText("New project")).toBeInTheDocument();
    expect(screen.getByText("Local folder")).toBeInTheDocument();
  });

  it("allows selecting multiple threads and shows bulk delete confirmation", async () => {
    const user = userEvent.setup();
    render(<ThreadList boardName="dev" />);
    await screen.findByText("Auth bugfix");

    // Toggle multi-select mode from toolbar near search
    const selectToggleBtn = screen.getByTitle("Select multiple threads");
    await user.click(selectToggleBtn);

    expect(screen.getByText(/0 of 3 selected/i)).toBeInTheDocument();

    // Select all
    const selectAllBtn = screen.getByRole("button", { name: /select all/i });
    await user.click(selectAllBtn);

    expect(screen.getByText(/3 of 3 selected/i)).toBeInTheDocument();

    // Click Delete (3)
    const deleteBtn = screen.getByRole("button", { name: /delete \(3\)/i });
    await user.click(deleteBtn);

    // Confirmation dialog appears
    expect(screen.getByText(/Delete 3 Threads\?/i)).toBeInTheDocument();

    // Confirm deletion
    const confirmBtn = screen.getByRole("button", { name: /delete 3 threads/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(api.deleteThread).toHaveBeenCalledTimes(3);
    });
  });

  it("toggles pin status when clicking the pin button", async () => {
    const user = userEvent.setup();
    render(<ThreadList boardName="dev" />);
    await screen.findByText("Auth bugfix");

    const row = screen.getByText("Auth bugfix").closest(".thread-list-row-wrap")!;
    const pinBtn = row.querySelector('button[title="Pin thread"]') as HTMLButtonElement;
    await user.click(pinBtn);

    expect(api.updateThread).toHaveBeenCalledWith("thread-1", {
      board: "dev",
      pinned: true,
    });
  });
});
