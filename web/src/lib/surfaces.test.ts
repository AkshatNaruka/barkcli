import { describe, expect, it } from "vitest";
import {
  SURFACES,
  isHouseSurface,
  isSurface,
  railSequence,
  type Surface,
} from "./surfaces";

describe("surfaces registry", () => {
  it("includes every navigational destination, Projects among them", () => {
    expect(SURFACES.map((surface) => surface.id)).toContain("projects");
    expect(isSurface("projects")).toBe(true);
    // Projects describes the machine, not one project, so it sits above the
    // divider with threads and review.
    expect(isHouseSurface("projects")).toBe(true);
    expect(isHouseSurface("board")).toBe(false);
  });

  it("keeps the rail's order and drops what the user hid", () => {
    const order: Surface[] = ["projects", "chat", "board", "review"];
    expect(railSequence(order, [])).toEqual(order);
    expect(railSequence(order, ["board"])).toEqual(["projects", "chat", "review"]);
    // Hidden ids that are not in the order never appear.
    expect(railSequence(["chat"], ["board"])).toEqual(["chat"]);
  });
});
