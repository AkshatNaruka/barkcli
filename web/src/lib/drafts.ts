import { useEffect, useState } from "react";
import { loadGeneralSettings } from "./appSettings";

type PreferenceWindow = Window & {
  __BARK_THREAD_PREFERENCES__?: Record<string, string | null>;
  __TAURI__?: { core?: { invoke?: (command: string, args: unknown) => Promise<unknown> } };
  __TAURI_INTERNALS__?: { invoke?: (command: string, args: unknown) => Promise<unknown> };
};
let preferenceWrites = Promise.resolve();
const durableKey = (key: string) => ["bark:draft:v1:", "bark:agent:v1:", "bark:composer-mode:v1:"].some((prefix) => key.startsWith(prefix));

export function storageScope(project: string, board?: string | null): string {
  return `${project}:${board || "default"}`;
}
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? (window as PreferenceWindow).__BARK_THREAD_PREFERENCES__?.[key] ?? null;
  } catch { return (window as PreferenceWindow).__BARK_THREAD_PREFERENCES__?.[key] ?? null; }
}
export function writeLocal(key: string, value: string | null) {
  try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* storage may be unavailable */ }
  if (!durableKey(key)) return;
  const host = window as PreferenceWindow;
  const invoke = host.__TAURI__?.core?.invoke || host.__TAURI_INTERNALS__?.invoke;
  if (!invoke) return;
  host.__BARK_THREAD_PREFERENCES__ ??= {};
  if (host.__BARK_THREAD_PREFERENCES__[key] === value) return;
  host.__BARK_THREAD_PREFERENCES__[key] = value;
  preferenceWrites = preferenceWrites.then(async () => {
    try { await invoke("thread_preference_set", { key, value }); }
    catch {
      window.dispatchEvent(new CustomEvent("bark-desktop-error", { detail: {
        command: "thread_preference_set", message: "Could not save thread preferences to disk. Keep Bark open and retry before quitting.",
      } }));
    }
  });
}
export function useDraft(scope: string, thread: string, initialText = "") {
  const key = `bark:draft:v1:${scope}:${thread}`;
  // Settings → General → "Keep unsent prompts" controls persistence: when it
  // is off, switching threads or restarting starts from an empty composer.
  const keepDrafts = () => loadGeneralSettings().autoSave;
  const [text, setText] = useState(() => initialText || (keepDrafts() ? readLocal(key) : null) || "");
  useEffect(() => { writeLocal(key, keepDrafts() && text ? text : null); }, [key, text]);
  return [text, setText] as const;
}
