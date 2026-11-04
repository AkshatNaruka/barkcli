import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RulesView } from "./RulesView";

const api = vi.hoisted(() => ({
  fetchRules: vi.fn(),
  createRule: vi.fn(),
  deleteRule: vi.fn(),
}));

vi.mock("../lib/api", () => api);

describe("RulesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders rules and allows adding a new rule", async () => {
    api.fetchRules.mockResolvedValueOnce([
      { title: "Isolated Worktrees", body: "Every agent runs in a worktree" },
      { title: "Acceptance Gate", body: "cargo test must pass" },
    ]);
    api.createRule.mockResolvedValueOnce(true);

    render(<RulesView />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rules" })).toBeInTheDocument();
      expect(screen.getByText("Isolated Worktrees")).toBeInTheDocument();
      expect(screen.getByText("Acceptance Gate")).toBeInTheDocument();
    });

    // Test filter
    const searchInput = screen.getByPlaceholderText(/Filter rules/i);
    await userEvent.type(searchInput, "Gate");
    expect(screen.getByText("Acceptance Gate")).toBeInTheDocument();
    expect(screen.queryByText("Isolated Worktrees")).not.toBeInTheDocument();
  });
});
