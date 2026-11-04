import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextView } from "./ContextView";

const api = vi.hoisted(() => ({
  fetchContextFile: vi.fn(),
  digestContextFile: vi.fn(),
}));

vi.mock("../lib/api", () => api);

describe("ContextView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no context file exists", async () => {
    api.fetchContextFile.mockResolvedValueOnce({
      exists: false,
      file: "",
      total_tokens: 0,
      budget_tokens: 4000,
      blocks: [],
      hint: "Run barkcli context prime in this repo.",
    });

    render(<ContextView boardName="dev" />);
    expect(screen.getByText("Loading context file…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("No context file yet")).toBeInTheDocument();
    });
  });

  it("renders context file blocks without crashing (rules of hooks verified)", async () => {
    api.fetchContextFile.mockResolvedValueOnce({
      exists: true,
      file: "/Users/test/project/project_context.md",
      total_tokens: 1020,
      budget_tokens: 4000,
      blocks: [
        {
          id: "snapshot",
          heading: "Snapshot",
          body: "- Cards: 9 total\n- Last commit: 904d078",
          src: "board+sessions+git",
          updated: "2026-10-24T09:46Z",
          tokens: 51,
          staleness: 0.0,
          manual: true,
        },
        {
          id: "conventions",
          heading: "Conventions & gotchas",
          body: "- Rule: Mac app is non-Swift",
          src: "memory-facts",
          updated: "2026-10-26T12:01Z",
          tokens: 120,
          staleness: 0.5,
          manual: false,
        },
      ],
    });

    render(<ContextView boardName="dev" />);
    expect(screen.getByText("Loading context file…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Context")).toBeInTheDocument();
      expect(screen.getByText("Snapshot")).toBeInTheDocument();
      expect(screen.getByText("Conventions & gotchas")).toBeInTheDocument();
    });

    // Verify copy button works
    const copyBtn = screen.getByRole("button", { name: /Copy Context Pack/i });
    expect(copyBtn).toBeInTheDocument();

    // Verify block expansion
    expect(screen.getByText(/- Cards: 9 total/i)).toBeInTheDocument();
  });

  it("regenerates digest when regenerate button clicked", async () => {
    api.fetchContextFile.mockResolvedValue({
      exists: true,
      file: "/Users/test/project/project_context.md",
      total_tokens: 1000,
      budget_tokens: 4000,
      blocks: [],
    });
    api.digestContextFile.mockResolvedValueOnce({
      tokens: 1000,
      rewritten: ["active"],
      evicted: [],
      preserved_manual: ["snapshot"],
      flagged_stale: [],
    });

    render(<ContextView boardName="dev" />);
    await waitFor(() => {
      expect(screen.getByText("Context")).toBeInTheDocument();
    });

    const regenBtn = screen.getByRole("button", { name: /Regenerate digest/i });
    await userEvent.click(regenBtn);

    await waitFor(() => {
      expect(api.digestContextFile).toHaveBeenCalled();
      expect(screen.getByText(/Regenerated — ~1000 tokens · 1 rewritten/i)).toBeInTheDocument();
    });
  });
});
