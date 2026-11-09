import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ReportsView } from "./ReportsView";
import type { Board as BoardType, Sprint } from "../lib/types";

vi.mock("../lib/api", () => ({
  fetchReportsData: vi.fn(async () => ({
    board_name: "Test Board",
    total_cards: 6,
    completed_cards: 2,
    in_progress_cards: 1,
    blocked_cards: 0,
    todo_cards: 3,
    completion_rate: 33.3,
    total_effort: 18,
    completed_effort: 6,
    by_priority: { high: 2, medium: 3, low: 1 },
    by_column: { todo: 3, doing: 1, done: 2 },
  })),
}));

const mockBoard: BoardType = {
  title: "Test Board",
  columns: [
    { id: "todo", name: "Todo" },
    { id: "doing", name: "Doing" },
    { id: "review", name: "Review" },
    { id: "done", name: "Done" },
  ],
  cards: [
    {
      id: "c1",
      title: "Card 1",
      description: "",
      column: "todo",
      priority: "high",
      effort: 5,
      labels: [],
      checklist: [],
      comments: [],
      attachments: [],
      links: [],
      acceptance_criteria: [],
      pinned: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "c2",
      title: "Card 2",
      description: "",
      column: "done",
      priority: "medium",
      effort: 6,
      labels: [],
      checklist: [],
      comments: [],
      attachments: [],
      links: [],
      acceptance_criteria: [],
      pinned: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
};

const mockSprints: Sprint[] = [];

describe("ReportsView", () => {
  it("renders executive delivery metrics and chart sections", async () => {
    await act(async () => {
      render(<ReportsView board={mockBoard} sprints={mockSprints} />);
    });

    expect(screen.getByText("Completion Rate")).toBeInTheDocument();
    expect(screen.getByText("Effort Delivered")).toBeInTheDocument();
    expect(screen.getByText("In Flight Execution")).toBeInTheDocument();
    expect(screen.getByText("Ready For Dispatch")).toBeInTheDocument();

    // Chart header
    expect(screen.getByText("Column Throughput & Effort Chart")).toBeInTheDocument();
    expect(screen.getByText("Priority Distribution")).toBeInTheDocument();

    // Recharts test containers
    expect(screen.getByTestId("reports-column-rechart")).toBeInTheDocument();
    expect(screen.getByTestId("reports-priority-pie")).toBeInTheDocument();
  });

  it("toggles chart view mode between All, Cards, and Effort", async () => {
    await act(async () => {
      render(<ReportsView board={mockBoard} sprints={mockSprints} />);
    });

    const allBtn = screen.getByRole("button", { name: "All" });
    const cardsBtn = screen.getByRole("button", { name: /Cards/i });
    const effortBtn = screen.getByRole("button", { name: /Effort/i });

    expect(allBtn).toBeInTheDocument();
    expect(cardsBtn).toBeInTheDocument();
    expect(effortBtn).toBeInTheDocument();

    // Switch to Cards only
    await act(async () => {
      fireEvent.click(cardsBtn);
    });

    // Switch to Effort only
    await act(async () => {
      fireEvent.click(effortBtn);
    });

    // Switch back to All
    await act(async () => {
      fireEvent.click(allBtn);
    });
  });

  it("renders priority distribution breakdown", async () => {
    await act(async () => {
      render(<ReportsView board={mockBoard} sprints={mockSprints} />);
    });

    expect(screen.getByText(/High \(/i)).toBeInTheDocument();
    expect(screen.getByText(/Med \(/i)).toBeInTheDocument();
    expect(screen.getByText(/Low \(/i)).toBeInTheDocument();
  });
});
