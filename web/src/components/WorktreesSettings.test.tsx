import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatAge, formatBytes, WorktreesSettings } from "./WorktreesSettings";
import type { ManagedWorktree, WorktreeInventory } from "../lib/api";

const fetchWorktreeInventory = vi.fn();
const cleanupWorktrees = vi.fn();

vi.mock("../lib/api", () => ({
  fetchWorktreeInventory: () => fetchWorktreeInventory(),
  cleanupWorktrees: (slugs: string[], dryRun?: boolean) => cleanupWorktrees(slugs, dryRun),
}));

function worktree(patch: Partial<ManagedWorktree>): ManagedWorktree {
  return {
    slug: "merged-1",
    path: "/repo/.board/worktrees/merged-1",
    branch: "bark/merged-1",
    status: "merged",
    category: "merged",
    size_bytes: 1_500_000,
    age_secs: 3 * 86_400,
    registered: true,
    exists: true,
    merged: true,
    dirty: false,
    active: false,
    removable: true,
    reason: "merged into the base branch",
    ...patch,
  };
}

function inventory(entries: ManagedWorktree[]): WorktreeInventory {
  return {
    base_branch: "master",
    entries,
    total_bytes: entries.reduce((total, entry) => total + entry.size_bytes, 0),
    reclaimable_bytes: entries
      .filter((entry) => entry.removable)
      .reduce((total, entry) => total + entry.size_bytes, 0),
    removable_count: entries.filter((entry) => entry.removable).length,
  };
}

describe("WorktreesSettings", () => {
  beforeEach(() => {
    fetchWorktreeInventory.mockReset();
    cleanupWorktrees.mockReset();
  });

  it("shows disk usage and protects worktrees that are in use", async () => {
    fetchWorktreeInventory.mockResolvedValue(
      inventory([
        worktree({}),
        worktree({
          slug: "stale-1",
          path: "/repo/.board/worktrees/stale-1",
          branch: "bark/stale-1",
          category: "stale",
          merged: false,
          size_bytes: 500_000,
          reason: "stale: no run is using it",
        }),
        worktree({
          slug: "running-1",
          path: "/repo/.board/worktrees/running-1",
          branch: "bark/running-1",
          category: "active",
          active: true,
          removable: false,
          reason: "a run is still using this worktree",
        }),
      ])
    );

    render(<WorktreesSettings />);

    expect(await screen.findByText("3 worktrees · 3.3 MB")).toBeInTheDocument();
    expect(screen.getByText("1.9 MB across 2 worktrees")).toBeInTheDocument();

    const running = screen.getByLabelText("Select bark/running-1 for cleanup");
    expect(running).toBeDisabled();
    expect(screen.getByLabelText("Select bark/merged-1 for cleanup")).toBeEnabled();
  });

  it("asks with the exact size before removing, then reports what was freed", async () => {
    const user = userEvent.setup();
    fetchWorktreeInventory.mockResolvedValue(
      inventory([
        worktree({}),
        worktree({
          slug: "stale-1",
          path: "/repo/.board/worktrees/stale-1",
          branch: "bark/stale-1",
          category: "stale",
          merged: false,
          size_bytes: 500_000,
          reason: "stale: no run is using it",
        }),
      ])
    );
    cleanupWorktrees.mockResolvedValue({
      dry_run: false,
      planned: [],
      skipped: [],
      outcomes: [],
      removed_count: 2,
      reclaimed_bytes: 2_000_000,
      inventory: inventory([]),
    });

    render(<WorktreesSettings />);
    await screen.findByText("2 worktrees · 1.9 MB");

    const review = screen.getByRole("button", { name: "Review cleanup" });
    expect(review).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Select 2 reclaimable/ }));

    // Nothing is removed until the confirmation is accepted.
    expect(cleanupWorktrees).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Review cleanup" }));
    expect(screen.getByText(/Remove 2 worktrees and free 1.9 MB\?/)).toBeInTheDocument();
    expect(cleanupWorktrees).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Remove 2 and free 1.9 MB/ }));

    await waitFor(() =>
      expect(cleanupWorktrees).toHaveBeenCalledWith(["merged-1", "stale-1"], false)
    );
    expect(
      await screen.findByText("Removed 2 worktrees and freed 1.9 MB.")
    ).toBeInTheDocument();
    expect(await screen.findByText(/No agent worktrees/)).toBeInTheDocument();
  });

  it("says nothing was removed when the request fails", async () => {
    const user = userEvent.setup();
    fetchWorktreeInventory.mockResolvedValue(inventory([worktree({})]));
    cleanupWorktrees.mockResolvedValue(null);

    render(<WorktreesSettings />);
    await screen.findByText("1 worktree · 1.4 MB");

    await user.click(screen.getByRole("button", { name: /Select 1 reclaimable/ }));
    await user.click(screen.getByRole("button", { name: "Review cleanup" }));
    await user.click(screen.getByRole("button", { name: /Remove 1 and free 1.4 MB/ }));

    expect(
      await screen.findByText("The cleanup request failed. Nothing was removed.")
    ).toBeInTheDocument();
  });

  it("formats sizes and ages for people, not bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(1_500_000)).toBe("1.4 MB");
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.0 GB");
    expect(formatAge(30)).toBe("just now");
    expect(formatAge(3 * 3600)).toBe("3h ago");
    expect(formatAge(3 * 86_400)).toBe("3d ago");
  });
});
