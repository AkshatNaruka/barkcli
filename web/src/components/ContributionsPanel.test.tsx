import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContributionsPanel } from "./ContributionsPanel";

const api = vi.hoisted(() => ({
  fetchContributions: vi.fn(),
  fetchContributionDuplicates: vi.fn(async () => []),
  createContribution: vi.fn(),
}));
vi.mock("../lib/api", () => api);

const leadingNode = {
  id: "run_leading",
      title: "Compress donor statistics",
      summary: "A strong result",
      kind: "result",
      status: "passed",
      provider: "opencode",
      model: "opencode-go/deepseek-v4.1-flash",
      author: "builder",
      thread_id: "thread-1",
      card_id: "card-1",
      parents: [],
      children: ["run_child"],
      gate_passed: true,
      verified: true,
      verified_by: ["reviewer"],
      verifications: [{ verifier: "reviewer", passed: true, at: "2026-10-29T00:00:00Z" }],
      evidence_score: 1.4,
      reuse_count: 1,
      files_touched: ["src/lib.rs"],
      started_at: "2026-10-29T00:00:00Z",
      ended_at: "2026-10-29T00:10:00Z",
};

const analysis: any = {
  nodes: [leadingNode],
  edges: [],
  leading: [leadingNode],
  neglected: [],
  contested: [],
  open_hypotheses: [],
  recommendations: [
    {
      run_id: "run_leading",
      title: "Compress donor statistics",
      lane: "leading",
      score: 1.5,
      reason: "Highest evidence right now.",
    },
  ],
  metrics: {
    total_nodes: 1,
    edges: 0,
    verified_nodes: 1,
    verification_rate: 1,
    neglected_nodes: 0,
    contested_nodes: 0,
    open_hypotheses: 0,
    reuse_rate: 0,
    largest_lineage_share: 1,
    contributions_last_7d: 1,
    active_authors: 1,
  },
  generated_at: "2026-10-29T00:00:00Z",
};

describe("ContributionsPanel", () => {
  beforeEach(() => {
    api.fetchContributions.mockReset();
    api.fetchContributionDuplicates.mockReset();
    api.createContribution.mockReset();
    api.fetchContributionDuplicates.mockResolvedValue([]);
  });

  it("renders leading contributions and opens their thread", async () => {
    api.fetchContributions.mockResolvedValue(analysis);
    const user = userEvent.setup();
    render(<ContributionsPanel />);

    expect((await screen.findAllByText("Compress donor statistics")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("verified").length).toBeGreaterThan(0);
    expect(screen.getByText("Next experiments")).toBeInTheDocument();

    const nodeButton = screen
      .getAllByText("Compress donor statistics")
      .map((element) => element.closest("button"))
      .find((element) => Boolean(element));
    expect(nodeButton).toBeTruthy();
    await user.click(nodeButton!);
    expect(window.sessionStorage.getItem("bark:thread")).toBe("thread-1");
  });

  it("shows an honest empty state", async () => {
    api.fetchContributions.mockResolvedValue({
      ...analysis,
      nodes: [],
      leading: [],
      recommendations: [],
      metrics: { ...analysis.metrics, total_nodes: 0, verified_nodes: 0 },
    });
    render(<ContributionsPanel />);
    expect(await screen.findByText(/No contributions yet/i)).toBeInTheDocument();
  });

  it("publishes a manual insight", async () => {
    api.fetchContributions.mockResolvedValue(analysis);
    api.createContribution.mockResolvedValue({ id: "run_new" });
    const user = userEvent.setup();
    render(<ContributionsPanel />);
    await screen.findAllByText("Compress donor statistics");
    await user.click(screen.getByRole("button", { name: /New/ }));
    await user.type(screen.getByPlaceholderText("What did you learn?"), "A new insight");
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(api.createContribution).toHaveBeenCalledWith(
        expect.objectContaining({ title: "A new insight", kind: "insight" })
      )
    );
  });
});
