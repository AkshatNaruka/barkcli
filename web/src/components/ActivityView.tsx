import React, { useEffect, useMemo, useState } from "react";
import type { HistoryEntry, SessionEntry } from "../lib/types";
import { fetchHistory, fetchSessions } from "../lib/api";

type Filter = "all" | "history" | "session";

export function ActivityView({ boardName }: { boardName: string | null }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchHistory(undefined, 300), fetchSessions(100)]).then(([h, s]) => {
      setHistory(h);
      setSessions(s);
      setLoading(false);
    });
  }, [boardName]);

  const groups = useMemo(() => {
    type Item =
      | { kind: "history"; at: string; op: string; field?: string; text: string; card: string }
      | { kind: "session"; at: string; agent: string; text: string; id: string };
    const items: Item[] = [
      ...history.map((e) => ({
        kind: "history" as const,
        at: e.at,
        op: e.op,
        field: e.field,
        text: [e.old_value, e.new_value].filter(Boolean).join(" → "),
        card: e.card,
      })),
      ...sessions.map((s) => ({
        kind: "session" as const,
        at: s.at,
        agent: s.agent,
        text: s.summary || s.prompt || s.id,
        id: s.id,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);

    const byDay: { day: string; items: Item[] }[] = [];
    for (const item of filtered) {
      const day = item.at?.slice(0, 10) || "unknown";
      const last = byDay[byDay.length - 1];
      if (last && last.day === day) last.items.push(item);
      else byDay.push({ day, items: [item] });
    }
    return byDay;
  }, [history, sessions, filter]);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Activity</h2>
          <div className="flex bg-surface rounded-md p-0.5">
            {(["all", "history", "session"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-xs rounded font-medium capitalize transition-colors ${
                  filter === f ? "bg-card text-text shadow-sm" : "text-muted hover:text-text"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="text-xs text-muted text-center py-8">Loading…</p>}
        {!loading && groups.length === 0 && (
          <p className="text-xs text-muted text-center py-8">No activity yet.</p>
        )}

        {groups.map((g) => (
          <div key={g.day}>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">{g.day}</div>
            <div className="space-y-1.5">
              {g.items.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs bg-surface border border-border rounded-lg px-3 py-2">
                  <span className="text-muted font-mono shrink-0 mt-0.5">{item.at?.slice(11, 19)}</span>
                  {item.kind === "session" ? (
                    <>
                      <span className="text-accent bg-accent/10 px-1.5 rounded font-mono text-[10px] shrink-0">session</span>
                      <span className="text-muted-strong min-w-0 break-words">
                        <span className="text-accent-text font-mono">{item.agent}</span> · {item.text}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-strong bg-bg px-1.5 rounded font-mono text-[10px] shrink-0">{item.op}</span>
                      <span className="text-muted-strong min-w-0 break-words">
                        <span className="font-mono text-accent-text">{item.card}</span>
                        {item.field ? <span className="text-muted"> · {item.field}</span> : null}
                        {item.text ? <span> · {item.text}</span> : null}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
