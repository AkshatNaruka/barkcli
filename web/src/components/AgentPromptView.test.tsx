import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentPromptView } from "./AgentPromptView";

const api = vi.hoisted(() => ({
  apiAccess: vi.fn(async () => ({
    url: "http://127.0.0.1:4321",
    curl: "curl http://127.0.0.1:4321/api/board",
    env: "BARKCLI_SERVER=http://127.0.0.1:4321",
  })),
  ping: vi.fn(async () => ({
    status: "ok",
    version: "0.8.0",
    port: 4321,
    time: "2026-11-04T12:00:00Z",
  })),
}));

vi.mock("../lib/api", () => api);

describe("AgentPromptView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Agent API contract prompt and test button", async () => {
    render(<AgentPromptView />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Agent API" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Copy Prompt/i })).toBeInTheDocument();
      expect(screen.getByText(/ok · v0.8.0/i)).toBeInTheDocument();
    });
  });
});
