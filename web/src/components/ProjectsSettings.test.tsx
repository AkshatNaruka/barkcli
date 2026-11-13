import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectsSettings } from "./ProjectsSettings";

const currentProject = vi.fn(async () => ({ name: "barkcli", path: "/projects/barkcli" }));
const recentProjects = vi.fn(async () => [
  { name: "ses", path: "/projects/ses" },
  { name: "skilluply", path: "/projects/skilluply" },
]);
const switchProject = vi.fn();
const revealProject = vi.fn();
const openTerminal = vi.fn();

vi.mock("../lib/desktop", () => ({
  currentProject: () => currentProject(),
  recentProjects: () => recentProjects(),
  savedProjects: () => Promise.resolve([]),
  saveProject: () => Promise.resolve({ name: "x", path: "/x" }),
  removeSavedProject: () => Promise.resolve(true),
  renameProject: (path: string, name: string) => vi.fn(async () => ({ path, name }))(),
  switchProject: (path: string) => switchProject(path),
  revealProject: (path: string) => revealProject(path),
  openTerminal: (path: string) => openTerminal(path),
  openProjectDialog: vi.fn(),
}));

describe("ProjectsSettings", () => {
  it("renders the breadcrumb and project card list", async () => {
    render(<ProjectsSettings />);

    expect(screen.getByText("Projects")).toBeInTheDocument();

    expect(await screen.findByText("/projects/barkcli")).toBeInTheDocument();
    expect(screen.getByText("No project")).toBeInTheDocument();
    expect(screen.getByText("/projects/ses")).toBeInTheDocument();
    expect(screen.getByText("/projects/skilluply")).toBeInTheDocument();
  });

  it("opens project detail view when a project card is clicked", async () => {
    const user = userEvent.setup();
    render(<ProjectsSettings />);

    await screen.findByText("/projects/barkcli");
    const barkcliElements = await screen.findAllByText("barkcli");
    await user.click(barkcliElements[barkcliElements.length - 1]);

    expect(await screen.findByText("Project Settings")).toBeInTheDocument();
    expect(screen.getByText("Display Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reveal in Finder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Terminal" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Terminal" }));
    expect(openTerminal).toHaveBeenCalledWith("/projects/barkcli");
  });

  it("renames a project through the desktop store, not just local state", async () => {
    const user = userEvent.setup();
    render(<ProjectsSettings />);

    await screen.findByText("/projects/barkcli");
    const barkcliElements = await screen.findAllByText("barkcli");
    await user.click(barkcliElements[barkcliElements.length - 1]);

    const input = (await screen.findByLabelText("Display Name")) as HTMLInputElement;
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.clear(input);
    await user.type(input, "Bark");
    await user.click(save);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Bark" })).toBeInTheDocument()
    );
  });
});
