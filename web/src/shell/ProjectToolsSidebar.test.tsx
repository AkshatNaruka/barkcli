import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectToolsSidebar } from "./ProjectToolsSidebar";

const navigate = vi.fn();
vi.mock("../lib/hashnav", () => ({ navigate: (route: string) => navigate(route) }));

describe("ProjectToolsSidebar", () => {
  it("lists the project's tools with its own counts", () => {
    render(<ProjectToolsSidebar currentRoute="board" cardsCount={9} agentsCount={4} />);

    const nav = screen.getByRole("navigation", { name: "Project tools" });
    expect(nav).toHaveTextContent("Overview");
    expect(nav).toHaveTextContent("Board");
    expect(nav).toHaveTextContent("Agents");
    expect(nav).toHaveTextContent("Brain (3D)");
    expect(nav).toHaveTextContent("Skills");
    expect(nav).toHaveTextContent("History");
    expect(nav).toHaveTextContent("Operations");
    expect(nav).toHaveTextContent("9");
    expect(nav).toHaveTextContent("4");
    expect(screen.getByRole("button", { name: /Board/ })).toHaveAttribute("aria-current", "page");
  });

  it("navigates within the current project", async () => {
    const user = userEvent.setup();
    render(<ProjectToolsSidebar currentRoute="hub" />);

    await user.click(screen.getByRole("button", { name: /Agents/ }));
    expect(navigate).toHaveBeenCalledWith("agents");
  });
});
