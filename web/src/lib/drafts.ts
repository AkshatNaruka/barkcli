import { useEffect, useState } from "react";

export function storageScope(project: string, board?: string | null): string {
  return `${project}:${board || "default"}`;
}
export function readLocal(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
export function writeLocal(key: string, value: string | null) {
  try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* storage may be unavailable */ }
}
export function useDraft(scope: string, thread: string, initialText = "") {
  const key = `bark:draft:v1:${scope}:${thread}`;
  const [text, setText] = useState(() => initialText || readLocal(key) || "");
  useEffect(() => { writeLocal(key, text || null); }, [key, text]);
  return [text, setText] as const;
}
