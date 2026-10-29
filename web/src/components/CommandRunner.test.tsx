import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandRunner } from "./CommandRunner";

const api = vi.hoisted(() => ({
  fetchProject: vi.fn(),
  runProjectCommand: vi.fn(),
}));
vi.mock("../lib/api", () => api);
vi.mock("../lib/desktop", () => ({
  isDesktop: () => false,
  openTerminal: vi.fn(async () => false),
}));

describe("CommandRunner", () => {
  it("runs a discovered project command and shows its output", async () => {
    api.fetchProject.mockResolvedValue({
      root: "/tmp/project",
      commands: [{ id: "pwd", label: "Show project root", command: "pwd" }],
    });
    api.runProjectCommand.mockResolvedValue({
      ok: true,
      command: "pwd",
      exit_code: 0,
      stdout: "/tmp/project\n",
      stderr: "",
      duration_ms: 4,
      timed_out: false,
      cwd: "/tmp/project",
    });
    const user = userEvent.setup();

    render(<CommandRunner open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Show project root")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => expect(api.runProjectCommand).toHaveBeenCalledWith("pwd"));
    expect((await screen.findAllByText("/tmp/project")).length).toBeGreaterThan(0);
  });
});
