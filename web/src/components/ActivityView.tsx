import React, { useEffect, useMemo, useState } from "react";
import type { HistoryEntry, SessionEntry } from "../lib/types";
import { fetchHistory, fetchSessions, fetchSessionStats } from "../lib/api";
import { Icon } from "./Icon";

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
      fetchHistory(undefined, 300).catch(() => []),
      fetchSessions(100, search ? search : undefined).catch(() => []),
      fetchSessionStats(boardName || undefined).catch(() => null),
    ]).then(([h, s, st]) => {
      setHistory(h || []);
      setSessions(s || []);
      if (st && typeof st.total_sessions === "number") {
        setStats(st);
      } else {
        setStats(null);
      }
      setLoading(false);
    });
  }, [boardName, search]);

  const effectiveStats = useMemo(() => {
    if (stats && typeof stats.average_files_per_session === "number") return stats;
    if (!sessions.length) return null;
    const uniqueAgents = new Set(sessions.map((s) => s.agent).filter(Boolean)).size;
    const totalFiles = sessions.reduce((acc, s) => acc + (s.files_touched?.length || 0), 0);
    return {
      total_sessions: sessions.length,
      unique_agents: uniqueAgents,
      total_files_touched: totalFiles,
      average_files_per_session: sessions.length ? totalFiles / sessions.length : 0,
    };
  }, [stats, sessions]);

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

  const safeAvgFiles =
    effectiveStats && typeof effectiveStats.average_files_per_session === "number" && !isNaN(effectiveStats.average_files_per_session)
      ? effectiveStats.average_files_per_session.toFixed(1)
      : "0.0";

  return (
    <div className="h-full overflow-auto">
      <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        {effectiveStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Total Sessions</span>
                <span className="w-2 h-2 rounded-full bg-accent" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-accent mt-2">{effectiveStats.total_sessions}</div>
              <div className="text-[11px] text-muted mt-1">Autonomous runs executed</div>
            </div>
            <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Unique Agents</span>
                <span className="w-2 h-2 rounded-full bg-text" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-text mt-2">{effectiveStats.unique_agents}</div>
              <div className="text-[11px] text-muted mt-1">Active worker identities</div>
            </div>
            <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Files Touched</span>
                <span className="w-2 h-2 rounded-full bg-success" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-success mt-2">{effectiveStats.total_files_touched}</div>
              <div className="text-[11px] text-muted mt-1">Cumulative file mutations</div>
            </div>
            <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Avg Files / Session</span>
                <span className="w-2 h-2 rounded-full bg-muted-strong" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-muted-strong mt-2">{safeAvgFiles}</div>
              <div className="text-[11px] text-muted mt-1">Blast radius per run</div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-2xl border border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-text">Activity Timeline</h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Search activity, agent, or card..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-card text-text border border-border rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-accent w-64 shadow-inner"
              />
            </div>
          </div>
          <div className="flex bg-card rounded-xl p-1 border border-border">
            {(["all", "history", "session"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs rounded-lg font-medium capitalize transition-all ${
                  filter === f ? "bg-surface text-accent-text shadow-sm border border-border" : "text-muted hover:text-text"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="text-xs text-muted text-center py-12">Loading activity...</p>}
        {!loading && groups.length === 0 && (
          <div className="p-12 text-center text-muted text-sm bg-surface rounded-2xl border border-border">
            No activity records found.
          </div>
        )}

        {groups.map((g) => (
          <div key={g.day} className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted px-1 flex items-center gap-2">
              <span>{g.day}</span>
              <span className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-2">
              {g.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 text-xs bg-surface rounded-xl px-4 py-3 border border-border hover:border-border-strong transition-colors"
                >
                  <span className="text-muted font-mono shrink-0 mt-0.5 text-[11px]">{item.at?.slice(11, 19)}</span>
                  {item.kind === "session" ? (
                    <div className="flex-1 flex items-start gap-2 min-w-0">
                      <span className="text-accent-text bg-accent-soft px-2 py-0.5 rounded-full font-mono text-[10px] shrink-0 font-semibold border border-accent/20">
                        session
                      </span>
                      <div className="text-text min-w-0 break-words leading-relaxed">
                        <span className="text-accent-text font-mono font-semibold">{item.agent}</span>
                        <span className="text-muted mx-1.5">•</span>
                        <span>{item.text}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-start gap-2 min-w-0">
                      <span className="text-muted bg-card px-2 py-0.5 rounded-full font-mono text-[10px] shrink-0 border border-border font-medium">
                        {item.op}
                      </span>
                      <div className="text-text min-w-0 break-words leading-relaxed">
                        <span className="font-mono text-accent-text font-semibold">{item.card}</span>
                        {item.field ? <span className="text-muted mx-1">· {item.field}</span> : null}
                        {item.text ? <span className="text-muted mx-1">· {item.text}</span> : null}
                      </div>
                    </div>
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
