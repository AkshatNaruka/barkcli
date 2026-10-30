import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewSurface } from "./ReviewSurface";
import type { QueueItem } from "../lib/types";

const { fetchReviewQueue, fetchThreadRuns, connectWs } = vi.hoisted(() => ({
  fetchReviewQueue: vi.fn(),
  fetchThreadRuns: vi.fn(async () => [] as any[]),
  connectWs: vi.fn(() => () => {}),
}));

vi.mock("../lib/api", () => ({ fetchReviewQueue, fetchThreadRuns, connectWs }));

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

describe("ReviewSurface", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    fetchReviewQueue.mockReset();
    fetchThreadRuns.mockReset();
    fetchThreadRuns.mockResolvedValue([]);
  });

  it("states when nothing has been built instead of showing a zero-file diff", async () => {
    fetchReviewQueue.mockResolvedValue({ items: [item()] });
    render(<ReviewSurface boardName="dev" />);

    expect(await screen.findByText("No build yet · plan only")).toBeInTheDocument();
    expect(screen.getByText("Nothing has been built for this thread yet.")).toBeInTheDocument();
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
});
