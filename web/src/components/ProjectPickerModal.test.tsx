import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectPickerModal } from "./ProjectPickerModal";

const currentProject = vi.fn(async () => ({ name: "barkcli", path: "/projects/barkcli" }));
const recentProjects = vi.fn(async () => [
  { name: "ses", path: "/projects/ses" },
  { name: "skilluply", path: "/projects/skilluply" },
]);

vi.mock("../lib/desktop", () => ({
  currentProject: () => currentProject(),
  recentProjects: () => recentProjects(),
}));

describe("ProjectPickerModal", () => {
  it("renders projects list with shortcuts", async () => {
    render(<ProjectPickerModal isOpen={true} onClose={vi.fn()} onSelectProject={vi.fn()} />);

    expect(await screen.findByText("barkcli")).toBeInTheDocument();
    expect(screen.getByText("No project")).toBeInTheDocument();
    expect(screen.getByText("ses")).toBeInTheDocument();
    expect(screen.getByText("skilluply")).toBeInTheDocument();

    expect(screen.getByText("⌘1")).toBeInTheDocument();
    expect(screen.getByText("⌥⌘N")).toBeInTheDocument();
  });

  it("filters project list", async () => {
    const user = userEvent.setup();
    render(<ProjectPickerModal isOpen={true} onClose={vi.fn()} onSelectProject={vi.fn()} />);

    await screen.findByText("barkcli");
    const input = screen.getByPlaceholderText("Search...");
    await user.type(input, "ses");

    expect(screen.getByText("ses")).toBeInTheDocument();
    expect(screen.queryByText("barkcli")).not.toBeInTheDocument();
  });

  it("selects a project on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(<ProjectPickerModal isOpen={true} onClose={onClose} onSelectProject={onSelect} />);

    await screen.findByText("ses");
    await user.click(screen.getByText("ses"));

    expect(onSelect).toHaveBeenCalledWith({
      path: "/projects/ses",
      name: "ses",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("selects scratch environment for No project", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(<ProjectPickerModal isOpen={true} onClose={onClose} onSelectProject={onSelect} />);

    await screen.findByText("No project");
    await user.click(screen.getByText("No project"));

    expect(onSelect).toHaveBeenCalledWith({
      path: "__scratch__",
      name: "No project",
      isScratch: true,
    });
    expect(onClose).toHaveBeenCalled();
  });
});
