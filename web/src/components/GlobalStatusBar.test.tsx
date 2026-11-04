import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { GlobalStatusBar } from "./GlobalStatusBar";

vi.mock("../lib/api", () => ({
  ping: vi.fn().mockResolvedValue({ status: "ok" }),
  fetchGitStatus: vi.fn().mockResolvedValue({ branch: "feature/auth", clean: true }),
  fetchWorktrees: vi.fn().mockResolvedValue([{ path: "/wt/1" }, { path: "/wt/2" }]),
  connectWs: vi.fn().mockReturnValue(() => {}),
}));

describe("GlobalStatusBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders daemon port, branch, worktrees, and acceptance gate info", async () => {
    render(
      <GlobalStatusBar
        project={
          {
            root: "/test",
            name: "test",
            board_dir: "/test/.board",
            boards: ["dev"],
            is_git: true,
            verification_command: "npm test",
          } as any
        }
      />
    );

    expect(screen.getByText(/daemon:/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/branch: feature\/auth \(clean\)/i)).toBeInTheDocument();
      expect(screen.getByText(/worktrees: 2 active/i)).toBeInTheDocument();
      expect(screen.getByText(/acceptance gate: passing \(npm test\)/i)).toBeInTheDocument();
    });
  });
});
