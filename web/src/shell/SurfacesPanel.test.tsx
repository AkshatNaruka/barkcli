import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SurfacesPanel } from "./SurfacesPanel";

function renderPanel(overrides: Partial<ComponentProps<typeof SurfacesPanel>> = {}) {
  const handlers = {
    onSelectThread: vi.fn(),
    onOpenProjectTool: vi.fn(),
    onOpenProjectHub: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <SurfacesPanel
      boardName="dev"
      showThread
      {...handlers}
      {...overrides}
    />
  );
  return handlers;
}

describe("SurfacesPanel", () => {
  it("shows thread surfaces and only the project shortcuts", () => {
    renderPanel();

    expect(screen.getByText("Surfaces")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Checks")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Project tools")).toBeInTheDocument();
    expect(screen.queryByText("Rules")).not.toBeInTheDocument();
    expect(screen.queryByText("Ship")).not.toBeInTheDocument();
  });

  it("opens a thread surface, a project shortcut, and the hub", async () => {
    const handlers = renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Checks/ }));
    expect(handlers.onSelectThread).toHaveBeenCalledWith("gate");

    await user.click(screen.getByRole("button", { name: /Board/ }));
    expect(handlers.onOpenProjectTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: "board" })
    );

    await user.click(screen.getByRole("button", { name: /Project tools/ }));
    expect(handlers.onOpenProjectHub).toHaveBeenCalled();
  });

  it("explains the missing thread surfaces before a thread is selected", () => {
    renderPanel({ showThread: false });

    expect(screen.queryByText("Surfaces")).not.toBeInTheDocument();
    expect(screen.getByText(/Start a thread to see/)).toBeInTheDocument();
    expect(screen.getByText("Project tools")).toBeInTheDocument();
  });

  it("supports letter activation and Escape", () => {
    const handlers = renderPanel();
    const body = screen.getByLabelText("Thread surfaces").querySelector(".surfaces-list-body")!;

    fireEvent.keyDown(body, { key: "B" });
    expect(handlers.onOpenProjectTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: "board" })
    );

    fireEvent.keyDown(body, { key: "Escape" });
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("closes from the header button", async () => {
    const handlers = renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Close surfaces" }));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});
