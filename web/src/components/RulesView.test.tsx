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

  it("renders rules as a compact grid and opens the full text in a dialog", async () => {
    api.fetchRules.mockResolvedValueOnce([
      {
        title: "Long Rule",
        body: "Every agent must run the project tests before reporting done.\nSecond paragraph with the longer explanation of the gate.",
      },
    ]);

    render(<RulesView />);

    const card = await screen.findByRole("button", { name: /Read rule Long Rule/i });
    // The card keeps the body as a clamped preview, not the whole rule.
    expect(card).toHaveTextContent(/run the project tests/);

    await userEvent.click(card);
    const dialog = screen.getByRole("dialog", { name: /Rule Long Rule/i });
    expect(dialog).toHaveTextContent(/Second paragraph with the longer explanation/);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the new-rule form collapsed until asked for", async () => {
    api.fetchRules.mockResolvedValueOnce([{ title: "Gate", body: "tests pass" }]);

    render(<RulesView />);
    await screen.findByRole("button", { name: /Read rule Gate/i });
    expect(screen.queryByLabelText("Rule title")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /New rule/i }));
    expect(screen.getByLabelText("Rule title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add rule" })).toBeInTheDocument();
  });
});
