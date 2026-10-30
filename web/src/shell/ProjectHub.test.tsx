import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectHub } from "./ProjectHub";

describe("ProjectHub", () => {
  beforeEach(() => window.history.replaceState({}, "", "/"));

  it("groups every project tool with a real description", () => {
    render(<ProjectHub projectName="barkcli" projectRoot="/Users/me/barkcli" boardName="dev" />);

    expect(screen.getByRole("heading", { name: "Project tools" })).toBeInTheDocument();
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByText("Agent setup")).toBeInTheDocument();
    expect(screen.getByText("History & maintenance")).toBeInTheDocument();
    expect(screen.getByText("Cards, columns, and gates.")).toBeInTheDocument();
    expect(screen.getByText("Instructions injected into every agent context.")).toBeInTheDocument();
    expect(screen.getByText("/Users/me/barkcli")).toBeInTheDocument();
  });

  it("filters by label and description", async () => {
    const user = userEvent.setup();
    render(<ProjectHub projectName="barkcli" projectRoot="/Users/me/barkcli" boardName="dev" />);

    await user.type(screen.getByLabelText("Search project tools"), "commit");
    expect(screen.getByText("Ship")).toBeInTheDocument();
    expect(screen.queryByText("Rules")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search project tools"));
    await user.type(screen.getByLabelText("Search project tools"), "nothing here");
    expect(screen.getByText(/No project tools match/)).toBeInTheDocument();
  });

  it("opens a tool route", async () => {
    const user = userEvent.setup();
    render(<ProjectHub projectName="barkcli" projectRoot="/Users/me/barkcli" boardName="dev" />);

    await user.click(screen.getByRole("button", { name: /Board/ }));
    expect(window.location.hash).toBe("#/board");
  });
});
