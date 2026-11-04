import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutomationsView } from "./AutomationsView";

const api = vi.hoisted(() => ({
  fetchSchedules: vi.fn(),
  createSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  runDueSchedules: vi.fn(),
}));

vi.mock("../lib/api", () => api);

describe("AutomationsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders automations schedules and allows running due", async () => {
    api.fetchSchedules.mockResolvedValueOnce([
      {
        id: "sched-1",
        intent: "Review stale pull requests",
        board: "dev",
        backend: "opencode",
        every_secs: 3600,
        enabled: true,
        created_at: new Date().toISOString(),
        last_run: null,
        next_run: new Date(Date.now() + 3600000).toISOString(),
      },
    ]);

    render(<AutomationsView boardName="dev" />);

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
      expect(screen.getByText("Review stale pull requests")).toBeInTheDocument();
      expect(screen.getByText(/every 1h/i)).toBeInTheDocument();
    });

    const runDueBtn = screen.getByRole("button", { name: /Run due now/i });
    expect(runDueBtn).toBeInTheDocument();
  });
});
