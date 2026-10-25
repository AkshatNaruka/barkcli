import React, { useEffect, useMemo, useState } from "react";
import type { HistoryEntry, SessionEntry } from "../lib/types";
import { fetchHistory, fetchSessions, fetchSessionStats } from "../lib/api";

type Filter = "all" | "history" | "session";

export function ActivityView({ boardName }: { boardName: string | null }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [stats, setStats] = useState<{
    total_sessions: number;
    total_files_touched: number;
    unique_agents: number;
    average_files_per_session: number;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchHistory(undefined, 300),
      fetchSessions(100, search ? search : undefined),
      fetchSessionStats(boardName || undefined),
    ]).then(([h, s, st]) => {
      setHistory(h);
      setSessions(s);
      setStats(st);
      setLoading(false);
    });
  }, [boardName, search]);

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
      <div className="w-full max-w-[1600px] mx-auto p-4 space-y-4">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">Total Sessions</div>
              <div className="text-xl font-bold font-mono text-accent mt-0.5">{stats.total_sessions}</div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">Unique Agents</div>
              <div className="text-xl font-bold font-mono text-text mt-0.5">{stats.unique_agents}</div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">Files Touched</div>
              <div className="text-xl font-bold font-mono text-success mt-0.5">{stats.total_files_touched}</div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">Avg Files / Session</div>
              <div className="text-xl font-bold font-mono text-muted-strong mt-0.5">{stats.average_files_per_session.toFixed(1)}</div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-text">Activity</h2>
            <input
              type="text"
              placeholder="Search activity or agent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-surface text-text border border-border rounded px-2.5 py-1 text-xs focus:outline-none focus:border-accent w-56"
            />
          </div>
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
                <div key={i} className="flex items-start gap-2 text-xs bg-surface rounded-lg px-3 py-2">
                  <span className="text-muted font-mono shrink-0 mt-0.5">{item.at?.slice(11, 19)}</span>
                  {item.kind === "session" ? (
                    <>
                      <span className="text-accent-text bg-accent-soft px-1.5 rounded font-mono text-[10px] shrink-0">session</span>
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
