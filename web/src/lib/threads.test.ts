import { describe, expect, it } from "vitest";
import type { ThreadSummary } from "./types";
import {
  filterThreads,
  groupThreads,
  relativeTime,
  threadGroup,
  threadStatus,
} from "./threads";

function thread(partial: Partial<ThreadSummary> & { id: string }): ThreadSummary {
  return {
    title: partial.id,
    status_group: "features",
    event_count: 1,
    updated_at: "2026-10-27T10:00:00.000Z",
    column: "todo",
    ...partial,
  };
}

describe("thread grouping", () => {
  it("maps server status and board columns into four navigator groups", () => {
    expect(threadGroup(thread({ id: "a", status_group: "needs_you" }))).toBe("needs_you");
    expect(threadGroup(thread({ id: "b", status_group: "stalled" }))).toBe("needs_you");
    expect(threadGroup(thread({ id: "c", status_group: "running" }))).toBe("running");
    expect(threadGroup(thread({ id: "d", status_group: "done" }))).toBe("settled");
    expect(threadGroup(thread({ id: "e", status_group: "features" }))).toBe("drafts");
    expect(threadGroup(thread({ id: "f", status_group: "", column: "review" }))).toBe(
      "needs_you"
    );
    expect(threadGroup(thread({ id: "g", status_group: "", column: "doing" }))).toBe("running");
    expect(threadGroup(thread({ id: "h", status_group: "", column: "done" }))).toBe("settled");
  });

  it("sorts newest activity first inside each group and keeps empty groups", () => {
    const groups = groupThreads([
      thread({ id: "old", status_group: "running", updated_at: "2026-10-27T08:00:00Z" }),
      thread({ id: "new", status_group: "running", updated_at: "2026-10-27T11:00:00Z" }),
      thread({ id: "review", status_group: "needs_you" }),
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      "needs_you",
      "running",
      "drafts",
      "settled",
    ]);
    expect(groups[1].items.map((item) => item.id)).toEqual(["new", "old"]);
    expect(groups[2].items).toEqual([]);
    expect(groups[3].items).toEqual([]);
  });

  it("filters by title, id, backend, and column without mutating the list", () => {
    const list = [
      thread({ id: "oauth-flow", title: "Implement OAuth", backend: "codex-1" }),
      thread({ id: "kiosk-mode", title: "Wall display", backend: "opencode", column: "done" }),
    ];

    expect(filterThreads(list, "oauth")).toHaveLength(1);
    expect(filterThreads(list, "CODEX")).toHaveLength(1);
    expect(filterThreads(list, "done").map((item) => item.id)).toEqual(["kiosk-mode"]);
    expect(filterThreads(list, "  ")).toBe(list);
    expect(list).toHaveLength(2);
  });

  it("gives humans a readable grouped status", () => {
    expect(threadStatus(thread({ id: "a", status_group: "needs_you" }))).toEqual({
      tone: "accent",
      label: "needs you",
    });
    expect(threadStatus(thread({ id: "b", status_group: "stalled" }))).toEqual({
      tone: "warning",
      label: "stalled",
    });
    expect(threadStatus(thread({ id: "c", status_group: "running" })).tone).toBe("success");
    expect(threadStatus(thread({ id: "d", status_group: "settled" })).label).toBe("settled");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-27T12:00:00.000Z");

  it("uses the compact units shown in the navigator", () => {
    expect(relativeTime("2026-10-27T11:59:30.000Z", now)).toBe("now");
    expect(relativeTime("2026-10-27T11:56:00.000Z", now)).toBe("4m");
    expect(relativeTime("2026-10-27T09:00:00.000Z", now)).toBe("3h");
    expect(relativeTime("2026-10-25T12:00:00.000Z", now)).toBe("2d");
    expect(relativeTime("2026-10-06T12:00:00.000Z", now)).toBe("3w");
  });

  it("handles missing and invalid timestamps", () => {
    expect(relativeTime(undefined, now)).toBe("");
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});
