import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import {
  SIDEBAR_LAYOUT_KEY,
  SIDEBAR_TOOLS,
  addGroup,
  defaultSidebarLayout,
  moveGroup,
  moveItem,
  moveItemToGroup,
  normalizeSidebarLayout,
  parseSidebarLayout,
  removeGroup,
  renameGroup,
  resetSidebarLayout,
  setItemHidden,
  updateSidebarLayout,
  useSidebarLayout,
  visibleSidebarGroups,
} from "./sidebarLayout";

describe("sidebar layout", () => {
  beforeEach(() => {
    resetSidebarLayout();
  });

  it("starts with the workflow groups and every tool once", () => {
    const layout = defaultSidebarLayout();
    expect(layout.groups.map((group) => group.label)).toEqual([
      "Build",
      "Plan",
      "Agents",
      "Knowledge",
      "Code & delivery",
    ]);
    expect(layout.groups.flatMap((group) => group.items)).toHaveLength(SIDEBAR_TOOLS.length);
    expect(new Set(layout.groups.flatMap((group) => group.items)).size).toBe(SIDEBAR_TOOLS.length);
  });

  it("repairs a partial layout and appends new tools to their default group", () => {
    const layout = normalizeSidebarLayout({
      groups: [
        { id: "plan", label: "  Ship it  ", items: ["board", "board", "ghost"] },
        { id: "custom-1", label: "Mine", items: ["chat"] },
      ],
      hidden: ["board", "nope"],
    });

    expect(layout.groups.map((group) => group.id)).toEqual([
      "plan",
      "custom-1",
      "build",
      "agents",
      "knowledge",
      "delivery",
    ]);
    expect(layout.groups[0]).toMatchObject({ id: "plan", label: "Ship it", items: ["board", "sprints", "calendar", "reports"] });
    expect(layout.groups[1].items).toEqual(["chat"]);
    expect(layout.hidden).toEqual(["board"]);
    expect(layout.groups.flatMap((group) => group.items)).toHaveLength(SIDEBAR_TOOLS.length);
  });

  it("falls back to the default layout for invalid storage", () => {
    expect(parseSidebarLayout(null).groups).toHaveLength(5);
    expect(parseSidebarLayout("not json").groups).toHaveLength(5);
    expect(parseSidebarLayout("null").groups).toHaveLength(5);
  });

  it("reorders groups and tools", () => {
    const layout = defaultSidebarLayout();
    const movedGroup = moveGroup(layout, "delivery", -1);
    expect(movedGroup.groups.map((group) => group.id)).toEqual(["build", "plan", "agents", "delivery", "knowledge"]);

    const movedTool = moveItem(layout, "plan", "sprints", -1);
    expect(movedTool.groups[1].items.slice(0, 2)).toEqual(["sprints", "board"]);
  });

  it("moves a tool between groups at a chosen position", () => {
    const layout = moveItemToGroup(defaultSidebarLayout(), "board", "knowledge", 1);
    const plan = layout.groups.find((group) => group.id === "plan")!;
    const knowledge = layout.groups.find((group) => group.id === "knowledge")!;
    expect(plan.items).not.toContain("board");
    expect(knowledge.items).toEqual(["memory", "board", "graph", "context"]);
  });

  it("drops before the indicated row when moving downward in the same group", () => {
    const layout = moveItemToGroup(defaultSidebarLayout(), "board", "plan", 2);
    expect(layout.groups.find((group) => group.id === "plan")?.items).toEqual([
      "sprints", "board", "calendar", "reports",
    ]);
  });

  it("syncs a mounted layout after another window changes or clears storage", () => {
    function LayoutReader() {
      const layout = useSidebarLayout();
      return createElement("output", null, layout.groups[0].label);
    }
    render(createElement(LayoutReader));
    const next = renameGroup(defaultSidebarLayout(), "build", "My workflow");
    act(() => {
      localStorage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(next));
      window.dispatchEvent(new StorageEvent("storage", { key: SIDEBAR_LAYOUT_KEY }));
    });
    expect(screen.getByText("My workflow")).toBeInTheDocument();
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(screen.getByText("Build")).toBeInTheDocument();
  });

  it("hides tools without losing their position", () => {
    const hidden = setItemHidden(defaultSidebarLayout(), "board", true);
    expect(visibleSidebarGroups(hidden).flatMap((group) => group.tools.map((tool) => tool.id))).not.toContain("board");
    const shown = setItemHidden(hidden, "board", false);
    expect(visibleSidebarGroups(shown)[1].tools.map((tool) => tool.id)).toContain("board");
  });

  it("renames groups and keeps a fallback label", () => {
    const layout = renameGroup(defaultSidebarLayout(), "plan", "Delivery plan");
    expect(layout.groups.find((group) => group.id === "plan")?.label).toBe("Delivery plan");
    expect(renameGroup(layout, "plan", "   ").groups.find((group) => group.id === "plan")?.label).toBe("Plan");
  });

  it("adds and removes custom groups, returning tools to their default group", () => {
    let layout = addGroup(defaultSidebarLayout(), "Scratch");
    const custom = layout.groups[layout.groups.length - 1];
    expect(custom.id).toBe("custom-1");
    layout = moveItemToGroup(layout, "board", custom.id);
    layout = removeGroup(layout, custom.id);
    expect(layout.groups.some((group) => group.id === custom.id)).toBe(false);
    expect(layout.groups.find((group) => group.id === "plan")?.items).toContain("board");
  });

  it("never removes a default group", () => {
    const layout = removeGroup(defaultSidebarLayout(), "build");
    expect(layout.groups.some((group) => group.id === "build")).toBe(true);
  });

  it("persists updates and resets back to the default", () => {
    updateSidebarLayout((layout) => moveItemToGroup(layout, "board", "knowledge"));
    const stored = JSON.parse(localStorage.getItem(SIDEBAR_LAYOUT_KEY)!);
    expect(stored.groups.find((group: { id: string }) => group.id === "knowledge").items).toContain("board");

    resetSidebarLayout();
    const reset = JSON.parse(localStorage.getItem(SIDEBAR_LAYOUT_KEY)!);
    expect(reset.groups).toEqual(defaultSidebarLayout().groups);
  });
});
