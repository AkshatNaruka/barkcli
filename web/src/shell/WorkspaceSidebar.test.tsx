import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { moveGroup, resetSidebarLayout, setItemHidden, updateSidebarLayout } from "../lib/sidebarLayout";

vi.mock("../lib/api", () => ({
  fetchReviewQueue: vi.fn().mockResolvedValue({ items: [] }),
  connectWs: vi.fn(() => () => {}),
}));

const props = {
  projectName: "Example", projectRoot: "/example", projectReady: true,
  boardName: "dev", boards: ["dev"], onSwitchBoard: vi.fn(),
  onCommand: vi.fn(), onNew: vi.fn(), open: false, onClose: vi.fn(),
};

describe("WorkspaceSidebar layout", () => {
  beforeEach(() => {
    resetSidebarLayout();
    window.location.hash = "#/chat";
    vi.clearAllMocks();
  });

  it("reflects layout changes and keeps customization available with every tool hidden", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSidebar {...props} />);
    const nav = screen.getByRole("navigation", { name: "Project tools" });
    expect(within(nav).getAllByRole("heading")[0]).toHaveTextContent("Build");
    act(() => updateSidebarLayout((layout) => moveGroup(layout, "plan", -1)));
    expect(within(nav).getAllByRole("heading")[0]).toHaveTextContent("Plan");
    act(() => updateSidebarLayout((layout) => layout.groups.flatMap((group) => group.items)
      .reduce((next, id) => setItemHidden(next, id, true), layout)));
    expect(within(nav).queryAllByRole("link")).toHaveLength(0);
    await user.click(within(nav).getByRole("button", { name: "Choose tools" }));
    expect(props.onCommand).toHaveBeenCalledWith("customize-sidebar");
    expect(screen.getByRole("button", { name: /New thread/ })).toBeEnabled();
  });

  it("shows the project card and New thread without a Recent folders disclosure", async () => {
    await act(async () => { render(<WorkspaceSidebar {...props} />); });
    expect(screen.getByRole("region", { name: "Project folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New thread/ })).toBeInTheDocument();
    expect(screen.queryByText(/Recent folders/i)).not.toBeInTheDocument();
  });
});
