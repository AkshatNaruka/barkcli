import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const native = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("./desktop", () => ({
  isDesktop: () => true,
  loadSidebarLayout: native.load,
  saveSidebarLayout: native.save,
}));

describe("native sidebar persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    native.load.mockReset();
    native.save.mockReset().mockResolvedValue(undefined);
  });

  it("restores native preferences when a fresh origin has no browser storage", async () => {
    const layout = await import("./sidebarLayout");
    native.load.mockResolvedValue(layout.renameGroup(layout.defaultSidebarLayout(), "build", "My workflow"));
    function Reader() { return <output>{layout.useSidebarLayout().groups[0].label}</output>; }
    await act(async () => { render(<Reader />); });
    expect(screen.getByText("My workflow")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(layout.SIDEBAR_LAYOUT_KEY)!).groups[0].label).toBe("My workflow");
  });

  it("preserves edits made during native loading and writes rapid changes in order", async () => {
    const layout = await import("./sidebarLayout");
    let finishLoad!: (value: unknown) => void;
    native.load.mockImplementation(() => new Promise((resolve) => { finishLoad = resolve; }));
    let finishSave!: () => void;
    native.save.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    function Reader() { return <output>{layout.useSidebarLayout().groups[0].label}</output>; }
    render(<Reader />);
    await act(async () => {
      layout.updateSidebarLayout((value) => layout.renameGroup(value, "build", "First"));
      layout.updateSidebarLayout((value) => layout.renameGroup(value, "build", "Second"));
      finishLoad(layout.defaultSidebarLayout());
    });
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(native.save).toHaveBeenCalledTimes(1);
    await act(async () => { finishSave(); });
    expect(native.save).toHaveBeenCalledTimes(2);
    expect(native.save.mock.calls.map(([value]) => value.groups[0].label)).toEqual(["First", "Second"]);
  });
});
