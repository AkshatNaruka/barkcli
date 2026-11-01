import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectsDashboard } from "./ProjectsDashboard";
import type { ProjectSummary } from "../lib/types";

const summaries: ProjectSummary[] = [
  {
    path: "/Users/me/work/barkcli",
    name: "barkcli",
    current: true,
    available: true,
    board_files: 1,
    boards: [{ name: "dev", cards: 16, todo: 4, doing: 2, review: 1, done: 9 }],
    active_board: "dev",
    agents: 4,
    threads: 7,
    last_active: Math.floor(Date.now() / 1000) - 60,
    git: { branch: "main", clean: true, changes: 0, last_commit: "Ship checks" },
  },
  {
    path: "/Users/me/work/other",
    name: "other",
    current: false,
    available: true,
    board_files: 1,
    boards: [{ name: "main", cards: 5, todo: 5, doing: 0, review: 0, done: 0 }],
    active_board: "main",
    agents: 0,
    threads: 0,
    last_active: Math.floor(Date.now() / 1000) - 7200,
    git: { branch: "feat/x", clean: false, changes: 3, last_commit: "WIP" },
  },
];

const projectSummaries = vi.fn(async () => summaries);
const switchProject = vi.fn(async (_path?: string) => ({ path: "/Users/me/work/other", name: "other" }));

vi.mock("../lib/desktop", () => ({
  isDesktop: () => true,
  projectSummaries: () => projectSummaries(),
  switchProject: (path: string) => switchProject(path),
  revealProject: vi.fn(async () => true),
}));

vi.mock("../lib/hashnav", () => ({
  navigate: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDashboard() {
  return render(
    <ProjectsDashboard
      currentRoot="/Users/me/work/barkcli"
      currentName="barkcli"
      onOpenFolder={vi.fn()}
      onNotify={vi.fn()}
    />
  );
}

describe("ProjectsDashboard", () => {
  it("renders real project state and attention reasons", async () => {
    renderDashboard();
    expect(await screen.findByTestId("project-card-barkcli")).toBeInTheDocument();
    expect(screen.getByTestId("project-card-other")).toBeInTheDocument();
    expect(screen.getByText("1 to review")).toBeInTheDocument();
    expect(screen.getAllByText("No agents hired").length).toBeGreaterThan(0);
  });

  it("filters to projects that need review", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByTestId("project-card-barkcli");
    await user.click(screen.getByRole("button", { name: /Needs review/ }));
    expect(screen.getByTestId("project-card-barkcli")).toBeInTheDocument();
    expect(screen.queryByTestId("project-card-other")).not.toBeInTheDocument();
  });

  it("searches by path and branch", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByTestId("project-card-barkcli");
    await user.type(screen.getByRole("textbox", { name: "Search projects" }), "feat/x");
    expect(screen.getByTestId("project-card-other")).toBeInTheDocument();
    expect(screen.queryByTestId("project-card-barkcli")).not.toBeInTheDocument();
  });

  it("switches to another project after confirmation", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByTestId("project-card-other");
    await user.click(screen.getByTestId("project-card-other"));
    expect(await screen.findByRole("heading", { name: "Open other?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open project" }));
    await waitFor(() => expect(switchProject).toHaveBeenCalledWith("/Users/me/work/other"));
  });
});
