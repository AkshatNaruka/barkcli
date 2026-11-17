import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentPromptView } from "./AgentPromptView";

const api = vi.hoisted(() => ({
  apiAccess: vi.fn(() => ({
    base: "http://127.0.0.1:4321",
    token: "",
    tokenSet: false,
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
  fetchProject: vi.fn(async () => null),
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

  it("scopes the MCP config and endpoints to the open project", async () => {
    render(<AgentPromptView projectName="barkcli" boardName="dev" projectRoot="/tmp/barkcli" />);

    await waitFor(() => {
      expect(screen.getByText("http://127.0.0.1:4321/api/board?name=dev")).toBeInTheDocument();
    });

    const config = document.querySelector("pre");
    expect(config?.textContent).toContain('"BARKCLI_PROJECT": "/tmp/barkcli"');
    expect(config?.textContent).toContain('"mcp"');

    // Every endpoint is absolute, so an agent can call it from anywhere.
    expect(screen.getByText("http://127.0.0.1:4321/api/project")).toBeInTheDocument();
    expect(screen.getByText("http://127.0.0.1:4321/ws")).toBeInTheDocument();
  });

  it("falls back to the server's active project and board when props are absent", async () => {
    api.fetchProject.mockResolvedValueOnce({
      root: "/Users/me/barkcli",
      name: "barkcli",
      board_dir: "/Users/me/barkcli/.board",
      boards: ["dev"],
      active_board: "dev",
      is_git: true,
      context: {} as never,
      hooks: {} as never,
      setup: {} as never,
      counts: {} as never,
    } as never);

    render(<AgentPromptView />);

    expect(
      await screen.findByText("http://127.0.0.1:4321/api/board?name=dev")
    ).toBeInTheDocument();
    const config = document.querySelector("pre");
    expect(config?.textContent).toContain('"BARKCLI_PROJECT": "/Users/me/barkcli"');
  });
});
