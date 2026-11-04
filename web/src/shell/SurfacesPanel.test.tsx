import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SurfacesPanel } from "./SurfacesPanel";

function renderPanel(overrides: Partial<ComponentProps<typeof SurfacesPanel>> = {}) {
  const handlers = {
    onSelectThread: vi.fn(),
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
  it("shows only thread surfaces, never project tools", () => {
    renderPanel();

    expect(screen.getByText("Surfaces")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Checks")).toBeInTheDocument();
    expect(screen.queryByText("Board")).not.toBeInTheDocument();
    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
    expect(screen.queryByText("Project tools")).not.toBeInTheDocument();
    expect(screen.queryByText("Rules")).not.toBeInTheDocument();
  });

  it("opens a thread surface", async () => {
    const handlers = renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Checks/ }));
    expect(handlers.onSelectThread).toHaveBeenCalledWith("gate");
  });

  it("explains the missing thread surfaces before a thread is selected", () => {
    renderPanel({ showThread: false });

    expect(screen.queryByText("Surfaces")).not.toBeInTheDocument();
    expect(screen.getByText(/Start a thread to see/)).toBeInTheDocument();
    expect(screen.queryByText("Project tools")).not.toBeInTheDocument();
  });

  it("supports surface letter activation and Escape", () => {
    const handlers = renderPanel();
    const body = screen.getByLabelText("Thread surfaces").querySelector(".surfaces-list-body")!;

    fireEvent.keyDown(body, { key: "K" });
    expect(handlers.onSelectThread).toHaveBeenCalledWith("gate");

    fireEvent.keyDown(body, { key: "Escape" });
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("closes from the header button", async () => {
    const handlers = renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Close thread panel" }));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("renders quick actions: Review, Open File, Terminal, Browser", async () => {
    const handlers = renderPanel();
    const user = userEvent.setup();

    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Open File")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Browser")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Review/i }));
    expect(handlers.onSelectThread).toHaveBeenCalledWith("diff");

    await user.click(screen.getByRole("button", { name: /Terminal/i }));
    expect(handlers.onSelectThread).toHaveBeenCalledWith("eval");
  });

  it("renders artifacts, subagents, and background tasks sections with counts", () => {
    renderPanel();

    expect(screen.getByText("Artifacts")).toBeInTheDocument();
    expect(screen.getByText("Subagents")).toBeInTheDocument();
    expect(screen.getByText("Background Tasks")).toBeInTheDocument();
    expect(screen.getByText("Mac App Ui Ux Modernization Plan")).toBeInTheDocument();
  });

  it("filters items when typing in the search bar", async () => {
    renderPanel();
    const user = userEvent.setup();

    const searchInput = screen.getByPlaceholderText("Search or enter a URL");
    await user.type(searchInput, "Modernization");

    expect(screen.getByText("Mac App Ui Ux Modernization Plan")).toBeInTheDocument();
    expect(screen.queryByText("Checks")).not.toBeInTheDocument();
  });
});
