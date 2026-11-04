import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThreadList } from "./ThreadList";
import type { ThreadSummary } from "../lib/types";
import * as api from "../lib/api";

const mockThreads: ThreadSummary[] = [
  {
    id: "thread-1",
    title: "Auth bugfix",
    status_group: "needs_you",
    column: "review",
    updated_at: new Date().toISOString(),
    backend: "opencode",
    pinned: false,
  } as ThreadSummary,
  {
    id: "thread-2",
    title: "Database schema migration",
    status_group: "running",
    column: "doing",
    updated_at: new Date().toISOString(),
    backend: "codex",
    pinned: true,
  } as ThreadSummary,
  {
    id: "thread-3",
    title: "Frontend refactoring",
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

describe("ThreadList Management & Multi-Select", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("creates a new folder and renders it", async () => {
    const user = userEvent.setup();
    render(<ThreadList boardName="dev" />);
    await screen.findByText("Auth bugfix");

    // Click + Folder button in header
    const addFolderBtn = screen.getByTitle("Create new folder");
    await user.click(addFolderBtn);

    const folderInput = screen.getByPlaceholderText("Folder name…");
    await user.type(folderInput, "Sprint Features{enter}");

    expect(await screen.findByText("Sprint Features")).toBeInTheDocument();
  });

  it("allows selecting multiple threads and shows bulk delete confirmation", async () => {
    const user = userEvent.setup();
    render(<ThreadList boardName="dev" />);
    await screen.findByText("Auth bugfix");

    // Toggle multi-select mode
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

    const pinBtn = screen.getAllByTitle("Pin thread")[0];
    await user.click(pinBtn);

    expect(api.updateThread).toHaveBeenCalledWith("thread-1", {
      board: "dev",
      pinned: true,
    });
  });
});
