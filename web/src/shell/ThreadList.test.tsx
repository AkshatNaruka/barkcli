import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThreadList } from "./ThreadList";
import type { ThreadSummary } from "../lib/types";

const threads: ThreadSummary[] = [
  {
    id: "thread-1",
    title: "Integration tests",
    status_group: "needs_you",
    column: "review",
    updated_at: new Date().toISOString(),
    backend: "opencode",
    pinned: false,
  } as ThreadSummary,
  {
    id: "thread-2",
    title: "History logging",
    status_group: "running",
    column: "doing",
    updated_at: new Date().toISOString(),
    backend: "codex",
    pinned: true,
  } as ThreadSummary,
];

const fetchThreads = vi.fn(async () => threads);
const navigate = vi.fn();

vi.mock("../lib/api", () => ({
  fetchThreads: () => fetchThreads(),
  connectWs: () => () => {},
}));

vi.mock("../lib/hashnav", () => ({
  navigate: (route: string, state?: Record<string, string>) => navigate(route, state),
  useRouteState: () => ({ route: "chat", thread: "thread-1" }),
}));

describe("ThreadList", () => {
  it("docks the threads and marks the current one", async () => {
    render(<ThreadList boardName="dev" />);
    expect(await screen.findByText("Integration tests")).toBeInTheDocument();
    const current = screen.getByText("Integration tests").closest("button");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("History logging")).toBeInTheDocument();
  });

  it("switches to a thread", async () => {
    const user = userEvent.setup();
    render(<ThreadList boardName="dev" />);
    await screen.findByText("History logging");

    await user.click(screen.getByText("History logging"));
    expect(navigate).toHaveBeenCalledWith("chat", { board: "dev", thread: "thread-2" });
  });

  it("filters the docked list", async () => {
    const user = userEvent.setup();
    render(<ThreadList boardName="dev" />);
    await screen.findByText("Integration tests");
    await user.type(screen.getByRole("textbox", { name: "Search threads" }), "history");
    await waitFor(() => expect(screen.queryByText("Integration tests") ).not.toBeInTheDocument());
    expect(screen.getByText("History logging")).toBeInTheDocument();
  });

  it("displays per-thread project badges and filters across projects", async () => {
    fetchThreads.mockResolvedValueOnce([
      {
        ...threads[0],
        project_name: "barkcli",
        project_root: "/Users/dev/barkcli",
        workspace_strategy: "root",
      },
      {
        ...threads[1],
        project_name: "acme-web",
        project_root: "/Users/dev/acme-web",
        workspace_strategy: "worktree",
      },
    ]);
    const user = userEvent.setup();
    render(<ThreadList boardName="dev" />);
    expect(await screen.findByText("Integration tests")).toBeInTheDocument();
    expect(screen.getByText("worktree")).toBeInTheDocument();
    const filterGroup = screen.getByRole("group", { name: "Filter threads by project" });
    expect(filterGroup).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "acme-web" }));
    await waitFor(() => expect(screen.queryByText("Integration tests")).not.toBeInTheDocument());
    expect(screen.getByText("History logging")).toBeInTheDocument();
  });
});
