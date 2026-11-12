import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkingTreeDiffView } from "./WorkingTreeDiffView";
import type { WorkingTreeDiff } from "../lib/types";

const api = vi.hoisted(() => ({ fetchWorkingTreeDiff: vi.fn(), openInEditor: vi.fn() }));
vi.mock("../lib/api", () => api);

const diff: WorkingTreeDiff = {
  branch: "master",
  head: "abc1234",
  clean: false,
  diff: [
    "diff --git a/src/app.ts b/src/app.ts",
    "index 111..222 100644",
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -1,2 +1,3 @@",
    " const a = 1;",
    "+const b = 2;",
    " const c = 3;",
    "",
  ].join("\n"),
  files: ["src/app.ts"],
  additions: 1,
  deletions: 0,
  truncated: false,
  changes: [{ status: "M", path: "src/app.ts" }],
};

describe("WorkingTreeDiffView", () => {
  beforeEach(() => {
    api.fetchWorkingTreeDiff.mockReset();
  });

  it("renders uncommitted changes with branch and stats", async () => {
    api.fetchWorkingTreeDiff.mockResolvedValue(diff);
    render(<WorkingTreeDiffView />);
    expect(await screen.findByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("master")).toBeInTheDocument();
    expect(screen.getByText("1 file")).toBeInTheDocument();
    expect(screen.getAllByText("+1").length).toBeGreaterThan(0);
  });

  it("shows a clean state when the patch is empty", async () => {
    api.fetchWorkingTreeDiff.mockResolvedValue({ ...diff, diff: "", clean: true, files: [], additions: 0 });
    render(<WorkingTreeDiffView />);
    expect(await screen.findByText("Working tree clean")).toBeInTheDocument();
  });

  it("recovers from a failed read", async () => {
    api.fetchWorkingTreeDiff.mockResolvedValueOnce(null).mockResolvedValueOnce(diff);
    const user = userEvent.setup();
    render(<WorkingTreeDiffView />);
    expect(await screen.findByText("Could not read working tree changes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("src/app.ts")).toBeInTheDocument();
  });
});
