import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectNavbar } from "./ProjectNavbar";

vi.mock("../lib/hashnav", () => ({ navigate: vi.fn() }));
vi.mock("../lib/api", () => ({
  openInEditor: vi.fn(async () => true),
  fetchReviewQueue: vi.fn(async () => ({ items: [] })),
  fetchGitStatus: vi.fn(async () => null),
  runProjectCommand: vi.fn(async () => ({ exit_code: 0, stdout: "", stderr: "" })),
}));
vi.mock("../lib/drafts", () => ({ readLocal: () => null, writeLocal: vi.fn() }));
vi.mock("../lib/inbuiltBrowser", () => ({ openInbuiltBrowser: vi.fn() }));
vi.mock("../lib/desktop", () => ({
  isDesktop: () => true,
  isMac: () => true,
  switchProject: vi.fn(async () => null),
  openTerminal: vi.fn(async () => true),
  revealProject: vi.fn(async () => true),
  projectDisplayName: (name?: string | null, path?: string | null) => name || path || "project",
  currentProject: vi.fn(async () => null),
  recentProjects: vi.fn(async () => []),
}));

const base = {
  projectName: "barkcli",
  projectRoot: "/work/barkcli",
  boardName: "dev",
  currentRoute: "chat" as const,
  onOpenProject: vi.fn(),
  onNewThread: vi.fn(),
};

describe("ProjectNavbar scope", () => {
  it("keeps global surfaces project-free and leaves navigation to the left rail", () => {
    render(<ProjectNavbar {...base} scope="global" />);

    // The project switcher used to live in the top bar; it must be gone here.
    expect(screen.queryByTitle("Switch project (⌘1…)")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /barkcli/ })).not.toBeInTheDocument();

    // Navigation is the rail's job: no tab strip, no duplicate Projects button.
    expect(screen.queryByRole("navigation", { name: "Global navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Threads/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Review/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Projects" })).not.toBeInTheDocument();

    // The header still names the scope it speaks for.
    expect(screen.getByText("Threads")).toBeInTheDocument();
    expect(screen.getByText("Every project's threads")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Project tools" })).not.toBeInTheDocument();
    // Project-scoped git and editor controls are not part of a global surface.
    expect(screen.queryByTitle(/Git branch:/)).not.toBeInTheDocument();
    expect(screen.queryByText("Open in VS Code")).not.toBeInTheDocument();
  });

  it("moves the project switcher into the top bar for project tools", () => {
    render(<ProjectNavbar {...base} currentRoute="board" scope="project" />);

    // Project tools keep the switcher, so branch and counts follow the choice.
    expect(screen.getByTitle("Switch project (⌘1…)")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Project tools" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Global navigation" })).not.toBeInTheDocument();
    // Project tools still own their git/editor affordances.
    expect(screen.getByTitle(/Git branch:/)).toBeInTheDocument();
    expect(screen.getByText("Open in VS Code")).toBeInTheDocument();
  });
});
