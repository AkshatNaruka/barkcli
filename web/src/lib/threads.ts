import type { ThreadSummary } from "./types";

export type ThreadGroupKey = "needs_you" | "running" | "drafts" | "settled";

export interface ThreadGroup {
  key: ThreadGroupKey;
  label: string;
  items: ThreadSummary[];
}

export const THREAD_GROUPS: Array<{ key: ThreadGroupKey; label: string }> = [
  { key: "needs_you", label: "Needs you" },
  { key: "running", label: "Running" },
  { key: "drafts", label: "Drafts" },
  { key: "settled", label: "Settled" },
];

/** One status model for every thread surface: route, list, header. */
export function threadGroup(thread: ThreadSummary): ThreadGroupKey {
  const status = (thread.status_group || "").toLowerCase();
  if (status === "needs_you" || status === "blocked" || status === "stalled") {
    return "needs_you";
  }
  if (status === "running" || status === "doing") return "running";
  if (status === "settled" || status === "done") return "settled";

  const column = (thread.column || "").toLowerCase();
  if (column === "review") return "needs_you";
  if (column === "doing") return "running";
  if (column === "done") return "settled";
  return "drafts";
}

export function threadStatus(thread: ThreadSummary): {
  tone: "warning" | "success" | "accent" | "muted";
  label: string;
} {
  const group = threadGroup(thread);
  if (group === "needs_you") {
    return {
      tone: thread.status_group === "stalled" ? "warning" : "accent",
      label: thread.status_group === "stalled" ? "stalled" : "needs you",
    };
  }
  if (group === "running") return { tone: "success", label: "running" };
  if (group === "settled") return { tone: "muted", label: "settled" };
  return { tone: "muted", label: "draft" };
}

function threadTime(thread: ThreadSummary): string {
  return thread.last_seen || thread.updated_at || "";
}

/** Filter without changing group order; search includes the fields shown in a row. */
export function filterThreads(threads: ThreadSummary[], query: string): ThreadSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return threads;
  return threads.filter((thread) =>
    [thread.title, thread.id, thread.backend, thread.column, thread.status_group]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q))
  );
}

/** Stable grouped view: newest activity first inside each group. */
export function groupThreads(threads: ThreadSummary[]): ThreadGroup[] {
  const buckets = new Map<ThreadGroupKey, ThreadSummary[]>(
    THREAD_GROUPS.map(({ key }) => [key, []])
  );

  for (const thread of threads) {
    buckets.get(threadGroup(thread))!.push(thread);
  }

  for (const items of buckets.values()) {
    items.sort((a, b) => {
      const at = Date.parse(threadTime(a)) || 0;
      const bt = Date.parse(threadTime(b)) || 0;
      if (bt !== at) return bt - at;
      return a.title.localeCompare(b.title);
    });
  }

  return THREAD_GROUPS.map(({ key, label }) => ({
    key,
    label,
    items: buckets.get(key)!,
  }));
}

/** Compact, clock-like relative time used by the navigator and thread header. */
export function relativeTime(iso?: string, now = Date.now()): string {
  if (!iso) return "";
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  if (ms < 45_000) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
