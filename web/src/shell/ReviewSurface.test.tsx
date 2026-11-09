import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewSurface } from "./ReviewSurface";
import type { PullRequestItem, QueueItem } from "../lib/types";

const { fetchReviewQueue, fetchThreadRuns, fetchPullRequests, fetchPullRequestDetail, connectWs } = vi.hoisted(() => ({
  fetchReviewQueue: vi.fn(),
  fetchThreadRuns: vi.fn(async () => [] as any[]),
  fetchPullRequests: vi.fn(async () => [] as any[]),
  fetchPullRequestDetail: vi.fn(async () => null as any),
  connectWs: vi.fn(() => () => {}),
}));

vi.mock("../lib/api", () => ({ fetchReviewQueue, fetchThreadRuns, fetchPullRequests, fetchPullRequestDetail, connectWs }));

const risk = { score: 0, tier: "unknown" as const, reasons: [] };

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    card_id: "integration-tests",
    title: "Integration tests",
    column: "review",
    branch: null,
    receipt_id: null,
    files: 0,
    additions: 0,
    deletions: 0,
    risk,
    ...overrides,
  };
}

function samplePr(overrides: Partial<PullRequestItem> = {}): PullRequestItem {
  return {
    number: 42,
    title: "feat: add merge request review support",
    head_ref: "feat/mrs-review",
    base_ref: "master",
    state: "OPEN",
    is_draft: false,
    url: "https://github.com/org/repo/pull/42",
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    author: { login: "testdev", name: "Test Dev" },
    additions: 120,
    deletions: 15,
    changed_files: 3,
    review_decision: "REVIEW_REQUIRED",
    ...overrides,
  };
}

function samplePrDetail(overrides: any = {}) {
  return {
    ...samplePr(),
    body: "Closes #12. Implement full pull request detail view in review surface.",
    diff: "diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n context\n+new line\n",
    files: [
      { path: "file.ts", additions: 1, deletions: 0, status: "modified" },
    ],
    commits: [
      { oid: "abc1234", message: "feat: add pr detail", author: { name: "Test Dev", login: "testdev" }, committed_date: new Date().toISOString() },
    ],
    comments: [
      { id: "c1", body: "Looks great to me!", author: { login: "reviewer" }, created_at: new Date().toISOString() },
    ],
    ...overrides,
  };
}

describe("ReviewSurface", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    fetchReviewQueue.mockReset();
    fetchThreadRuns.mockReset();
    fetchThreadRuns.mockResolvedValue([]);
    fetchPullRequests.mockReset();
    fetchPullRequests.mockResolvedValue([]);
    fetchPullRequestDetail.mockReset();
    fetchPullRequestDetail.mockResolvedValue(null);
  });

  it("states when nothing has been built instead of showing a zero-file diff", async () => {
    fetchReviewQueue.mockResolvedValue({ items: [item()] });
    render(<ReviewSurface boardName="dev" />);

    expect(await screen.findByText("No build yet · plan only")).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been built for this thread yet/)).toBeInTheDocument();
    expect(screen.getByText("Open thread")).toBeInTheDocument();
    expect(screen.queryByText("Review priority")).not.toBeInTheDocument();
  });

  it("opens the plan for a plan-only thread and the changes for a built thread", async () => {
    const user = userEvent.setup();
    fetchReviewQueue.mockResolvedValue({
      items: [item(), item({ card_id: "built", title: "Built thread", branch: "bark/built", files: 2, additions: 9, deletions: 1 })],
    });
    render(<ReviewSurface boardName="dev" />);

    await user.click(await screen.findByRole("button", { name: /Integration tests/ }));
    await waitFor(() => expect(window.location.hash).toContain("panel=plan"));
    expect(window.location.hash).toContain("thread=integration-tests");

    await user.click(screen.getByRole("button", { name: /Built thread/ }));
    await waitFor(() => expect(window.location.hash).toContain("panel=changes"));
    expect(screen.getByText("2 files · +9 −1")).toBeInTheDocument();
    expect(screen.getByText("Review changes")).toBeInTheDocument();
  });

  it("renders pending repository merge requests with branch info and diff stats", async () => {
    const user = userEvent.setup();
    const browserSpy = vi.fn();
    window.addEventListener("bark-open-browser", browserSpy);

    fetchReviewQueue.mockResolvedValue({ items: [] });
    fetchPullRequests.mockResolvedValue([samplePr()]);

    render(<ReviewSurface boardName="dev" />);

    expect(await screen.findByText("#42")).toBeInTheDocument();
    expect(screen.getByText("feat: add merge request review support")).toBeInTheDocument();
    expect(screen.getByText("feat/mrs-review")).toBeInTheDocument();
    expect(screen.getByText("+120")).toBeInTheDocument();
    expect(screen.getByText("−15")).toBeInTheDocument();
    expect(screen.getByText("@testdev", { exact: false })).toBeInTheDocument();

    const openBrowserBtn = screen.getByRole("button", { name: /Open in Browser/i });
    await user.click(openBrowserBtn);

    expect(browserSpy).toHaveBeenCalled();
    const event = browserSpy.mock.calls[0][0] as CustomEvent;
    expect(event.detail.url).toBe("https://github.com/org/repo/pull/42");

    window.removeEventListener("bark-open-browser", browserSpy);
  });

  it("filters between tabs and subfilters correctly", async () => {
    const user = userEvent.setup();
    fetchReviewQueue.mockResolvedValue({
      items: [item({ card_id: "built", title: "Built thread", branch: "bark/built", files: 2, additions: 5, deletions: 2 })],
    });
    fetchPullRequests.mockResolvedValue([
      samplePr({ number: 101, title: "Open MR", state: "OPEN" }),
      samplePr({ number: 102, title: "Merged MR", state: "MERGED" }),
    ]);

    render(<ReviewSurface boardName="dev" />);

    // Initially "all" tab is active and shows both
    expect(await screen.findByText(/Open MR/)).toBeInTheDocument();
    expect(screen.getByText(/Built thread/)).toBeInTheDocument();

    // Switch to "Ready to review" tab
    await user.click(screen.getByRole("tab", { name: /Ready to review/i }));
    expect(screen.getByText(/Built thread/)).toBeInTheDocument();
    expect(screen.queryByText(/Open MR/)).not.toBeInTheDocument();

    // Switch to "Merge Requests" tab
    await user.click(screen.getByRole("tab", { name: /Merge Requests/i }));
    expect(screen.getByText(/Open MR/)).toBeInTheDocument();
    expect(screen.queryByText(/Built thread/)).not.toBeInTheDocument();

    // Switch subfilter to "All MRs"
    await user.click(screen.getByRole("button", { name: /All MRs/i }));
    expect(screen.getByText(/Merged MR/)).toBeInTheDocument();
  });

  it("opens pull request detail view on inspect and returns on back click", async () => {
    const user = userEvent.setup();
    fetchReviewQueue.mockResolvedValue({ items: [] });
    fetchPullRequests.mockResolvedValue([samplePr({ number: 42, title: "feat: add merge request review support" })]);
    fetchPullRequestDetail.mockResolvedValue(samplePrDetail({ number: 42 }));

    render(<ReviewSurface boardName="dev" />);

    expect(await screen.findByText("#42")).toBeInTheDocument();

    const inspectBtn = screen.getByRole("button", { name: "Inspect pull request #42" });
    await user.click(inspectBtn);

    // Should render detail view
    expect(await screen.findByRole("heading", { level: 1, name: /feat: add merge request review support/ })).toBeInTheDocument();
    expect(screen.getByText(/Closes #12/)).toBeInTheDocument();
    expect(screen.getByText("file.ts")).toBeInTheDocument();

    // Check tabs: Code diff and Timeline
    const codeTab = screen.getByRole("tab", { name: /Changes & Diff/ });
    await user.click(codeTab);
    expect(screen.getByText("new line")).toBeInTheDocument();

    const timelineTab = screen.getByRole("tab", { name: /Commits & Discussion/ });
    await user.click(timelineTab);
    expect(screen.getByText("Looks great to me!")).toBeInTheDocument();
    expect(screen.getByText("abc1234")).toBeInTheDocument();

    // Back to review
    const backBtn = screen.getByRole("button", { name: /Back to review list/ });
    await user.click(backBtn);

    expect(await screen.findByText("Work that needs your review")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
  });
});
