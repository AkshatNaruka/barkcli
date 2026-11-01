import { describe, expect, it } from "vitest";
import { activeChatTurn } from "./composer";
import type { ThreadEvent } from "./types";

function event(kind: string, run_id: string): ThreadEvent {
  return { id: `${kind}-${run_id}`, card_id: "task", kind, run_id, author: "agent", text: "", created_at: "" };
}

describe("active chat recovery", () => {
  it("does not let an older replayed completion unlock the current reply", () => {
    expect(activeChatTurn([
      event("run_started", "chat_old"), event("run_started", "chat_new"), event("chat_done", "chat_old"),
    ])).toBe("chat_new");
  });
  it("clears stopped and failed replies without mistaking builds for chat", () => {
    expect(activeChatTurn([
      event("run_started", "chat_one"), event("run_interrupted", "chat_one"),
      event("run_started", "chat_two"), event("run_failed", "chat_two"), event("run_started", "run_build"),
    ])).toBeNull();
  });
});
