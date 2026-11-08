import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSourcesModal } from "./ProjectSourcesModal";

const openProjectDialog = vi.fn();

vi.mock("../lib/desktop", () => ({
  openProjectDialog: () => openProjectDialog(),
}));

describe("ProjectSourcesModal", () => {
  it("renders all source types", () => {
    render(<ProjectSourcesModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("New project")).toBeInTheDocument();
    expect(screen.getByText("Local folder")).toBeInTheDocument();
    expect(screen.getByText("Git URL")).toBeInTheDocument();
    expect(screen.getByText("GitHub repository")).toBeInTheDocument();
    expect(screen.getByText("Azure DevOps repository")).toBeInTheDocument();
    expect(screen.getByText("Bitbucket repository")).toBeInTheDocument();
  });

  it("filters sources by query", async () => {
    const user = userEvent.setup();
    render(<ProjectSourcesModal isOpen={true} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText("Search...");
    await user.type(input, "GitHub");

    expect(screen.getByText("GitHub repository")).toBeInTheDocument();
    expect(screen.queryByText("Bitbucket repository")).not.toBeInTheDocument();
  });

  it("handles picking a local folder", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    openProjectDialog.mockResolvedValueOnce({ name: "my-project", path: "/path/to/my-project" });

    render(
      <ProjectSourcesModal
        isOpen={true}
        onClose={onClose}
        onSelectProject={onSelect}
      />
    );

    await user.click(screen.getByText("Local folder"));
    await waitFor(() => {
      expect(openProjectDialog).toHaveBeenCalled();
      expect(onSelect).toHaveBeenCalledWith({ name: "my-project", path: "/path/to/my-project" });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("renders keyboard navigation hints", () => {
    render(<ProjectSourcesModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText("Navigate")).toBeInTheDocument();
    expect(screen.getByText("Select")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });
});
