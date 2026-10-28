import { describe, expect, it } from "vitest";
import { parseRoute } from "./hashnav";
import { aliasSurface, operationsTabFromLegacy } from "./surfaces";

describe("route aliases", () => {
  it("keeps every canonical surface reachable", () => {
    for (const id of [
      "chat",
      "board",
      "agents",
      "brain",
      "skills",
      "operations",
      "history",
    ]) {
      expect(aliasSurface(id)).toBe(id);
      expect(parseRoute(`#/${id}`)).toBe(id);
    }
  });

  it("maps legacy hashes to the surface that owns the function", () => {
    expect(aliasSurface("threads")).toBe("chat");
    expect(aliasSurface("dashboard")).toBe("chat");
    expect(aliasSurface("inbox")).toBe("chat");
    expect(aliasSurface("orchestrate")).toBe("agents");
    expect(aliasSurface("sprints")).toBe("agents");
    expect(aliasSurface("memory")).toBe("brain");
    expect(aliasSurface("context")).toBe("brain");
    expect(aliasSurface("code")).toBe("operations");
    expect(aliasSurface("timeline")).toBe("operations");
    expect(aliasSurface("activity")).toBe("history");
  });

  it("ignores query strings and unknown routes land on Chat", () => {
    expect(parseRoute("#/board?card=readme")).toBe("board");
    expect(aliasSurface("does-not-exist")).toBe("chat");
  });

  it("keeps old Operations tabs addressable", () => {
    expect(operationsTabFromLegacy("project")).toBe("workspace");
    expect(operationsTabFromLegacy("insights")).toBe("workspace");
    expect(operationsTabFromLegacy("agent-prompt")).toBe("agent");
    expect(operationsTabFromLegacy("settings")).toBe("settings");
    expect(operationsTabFromLegacy("chat")).toBeNull();
  });
});
