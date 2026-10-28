import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { QueueItem, RiskTier } from "../lib/types";
import {
  ReviewQueueButton,
  ReviewQueuePanel,
  sortQueue,
} from "./ReviewQueuePanel";

const { fetchReviewQueue } = vi.hoisted(() => ({
  fetchReviewQueue: vi.fn(),
}));

vi.mock("../lib/api", () => ({ fetchReviewQueue }));

function item(
  cardId: string,
  tier: RiskTier,
  score: number,
  reason: string
): QueueItem {
  return {
    card_id: cardId,
    title: `Card ${cardId}`,
    column: "review",
    branch: `bark/${cardId}`,
    receipt_id: null,
    files: 3,
    additions: 40,
    deletions: 2,
    risk: {
      score,
      tier,
      reasons: [{ signal: "size", points: score, detail: reason }],
    },
  };
}

const unsorted = [
  item("skim", "skim", 20, "Small diff."),
  item("must", "must", 80, "Touches auth."),
  item("should", "should", 50, "Missing tests."),
];

describe("ReviewQueuePanel", () => {
  it("renders items sorted by tier", async () => {
    fetchReviewQueue.mockResolvedValue({ items: unsorted });
    render(
      <ReviewQueuePanel open boardName="dev" onClose={vi.fn()} />
    );

    await waitFor(() =>
      expect(screen.getAllByTestId("review-queue-item")).toHaveLength(3)
    );
    const rows = screen.getAllByTestId("review-queue-item");
    expect(rows[0].textContent).toContain("Touches auth.");
    expect(rows[1].textContent).toContain("Missing tests.");
    expect(rows[2].textContent).toContain("Small diff.");
    expect(fetchReviewQueue).toHaveBeenCalledWith("dev");
  });

  it("shows empty state", async () => {
    fetchReviewQueue.mockResolvedValue({ items: [] });
    render(<ReviewQueuePanel open boardName="dev" onClose={vi.fn()} />);
    expect(await screen.findByText(/Nothing to review/)).toBeInTheDocument();
  });

  it("button badges must count", async () => {
    fetchReviewQueue.mockResolvedValue({
      items: [
        item("must-a", "must", 90, "Auth."),
        item("must-b", "must", 75, "Payments."),
        item("should", "should", 50, "Tests."),
      ],
    });
    render(<ReviewQueueButton boardName="dev" onOpen={vi.fn()} />);
    expect(await screen.findByLabelText("2 must-review")).toHaveTextContent("2");
  });

  it("sorts unknown tiers last", () => {
    const sorted = sortQueue([
      item("unknown", "unknown", 0, "No diff."),
      item("must", "must", 80, "Auth."),
    ]);
    expect(sorted.map((row) => row.card_id)).toEqual(["must", "unknown"]);
  });
});
