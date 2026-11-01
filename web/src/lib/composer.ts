import { useEffect, useState } from "react";
import { readLocal, writeLocal } from "./drafts";
import type { ThreadEvent } from "./types";

export type ComposerMode = "ask" | "plan" | "build";

export function useComposerMode(scope: string, initial?: ComposerMode) {
  const key = `bark:composer-mode:v1:${scope}`;
  const [mode, setMode] = useState<ComposerMode>(() => {
    const saved = readLocal(key);
    return initial || (saved === "ask" || saved === "plan" ? saved : "build");
  });
  useEffect(() => { writeLocal(key, mode); }, [key, mode]);
  return [mode, setMode] as const;
}

/** A historical completion must never unlock a different, newer reply. */
export function activeChatTurn(events: ThreadEvent[]): string | null {
  const active = new Set<string>();
  for (const event of events) {
    const id = event.run_id || event.turn_id;
    if (!id?.startsWith("chat_")) continue;
    if (event.kind === "run_started") active.add(id);
    if (["chat_done", "run_failed", "run_interrupted"].includes(event.kind)) active.delete(id);
  }
  const turns = [...active];
  return turns[turns.length - 1] || null;
}
