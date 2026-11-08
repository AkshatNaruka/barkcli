import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarCustomizePanel } from "./SidebarCustomizePanel";
import {
  SIDEBAR_LAYOUT_KEY,
  defaultSidebarLayout,
  resetSidebarLayout,
} from "../lib/sidebarLayout";

function storedLayout() {
  return JSON.parse(localStorage.getItem(SIDEBAR_LAYOUT_KEY)!);
}

describe("SidebarCustomizePanel", () => {
  beforeEach(() => {
    resetSidebarLayout();
  });

  it("lists every default group and its tools", () => {
    render(<SidebarCustomizePanel open onClose={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Customize sidebar" })).toBeInTheDocument();
    for (const label of ["Build", "Planning", "Agent setup", "History & maintenance"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Hide Board" })).toBeInTheDocument();
  });

  it("renames a group inline and keeps the label", async () => {
    const user = userEvent.setup();
    render(<SidebarCustomizePanel open onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Planning" }));
    const input = screen.getByRole("textbox", { name: "Rename Planning" });
    await user.clear(input);
    await user.type(input, "Delivery plan{Enter}");

    expect(storedLayout().groups.find((group: { id: string }) => group.id === "planning").label).toBe(
      "Delivery plan"
    );
    expect(screen.getByRole("button", { name: "Delivery plan" })).toBeInTheDocument();
  });

  it("hides and shows a tool without losing its position", async () => {
    const user = userEvent.setup();
    render(<SidebarCustomizePanel open onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Hide Build" }));
    expect(storedLayout().hidden).toEqual(["chat"]);
    expect(screen.getByRole("button", { name: "Show Build" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show Build" }));
    expect(storedLayout().hidden).toEqual([]);
    expect(defaultSidebarLayout().groups[0].items[0]).toBe("chat");
  });

  it("moves a tool into another group with the move menu", async () => {
    const user = userEvent.setup();
    render(<SidebarCustomizePanel open onClose={() => {}} />);

    await user.click(screen.getByRole("combobox", { name: "Move Board to group" }));
    const listbox = screen.getByRole("listbox", { name: "Move Board to group" });
    await user.click(within(listbox).getByRole("option", { name: /Agent setup/ }));

    const layout = storedLayout();
    expect(layout.groups.find((group: { id: string }) => group.id === "planning").items).not.toContain(
      "board"
    );
    expect(
      layout.groups.find((group: { id: string }) => group.id === "agent-setup").items
    ).toContain("board");
  });

  it("adds a custom group and removes it, returning tools to their default group", async () => {
    const user = userEvent.setup();
    render(<SidebarCustomizePanel open onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /Add group/ }));
    expect(storedLayout().groups).toHaveLength(5);
    const input = screen.getByRole("textbox", { name: "Rename New group" });
    expect(input).toHaveFocus();
    await user.keyboard("My tools{Enter}");
    expect(screen.getByRole("button", { name: "My tools" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Remove My tools" }));
    expect(storedLayout().groups).toHaveLength(4);
  });

  it("requires a second click to reset the layout", async () => {
    const user = userEvent.setup();
    render(<SidebarCustomizePanel open onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /Add group/ }));
    await user.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(storedLayout().groups).toHaveLength(5);

    await user.click(screen.getByRole("button", { name: "Confirm reset" }));
    expect(storedLayout().groups).toEqual(defaultSidebarLayout().groups);
    expect(screen.queryByRole("button", { name: "New group" })).not.toBeInTheDocument();
  });

  it("closes from the Done button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SidebarCustomizePanel open onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cancels renaming before Escape closes the panel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SidebarCustomizePanel open onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Planning" }));
    await user.type(screen.getByRole("textbox", { name: "Rename Planning" }), "Changed{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Planning" })).toHaveFocus();
    expect(storedLayout().groups.find((group: { id: string }) => group.id === "planning").label).toBe("Planning");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes the move menu before Escape closes the panel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SidebarCustomizePanel open onClose={onClose} />);
    const trigger = screen.getByRole("combobox", { name: "Move Board to group" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    render(<SidebarCustomizePanel open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
