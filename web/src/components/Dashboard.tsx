import React, { useEffect, useMemo, useState } from "react";
import type { Board as BoardType, Card, HistoryEntry, SessionEntry, Sprint } from "../lib/types";
import { fetchHistory, fetchSessions, type GitInfo } from "../lib/api";

function StatCard({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "accent" | "success" | "warning" | "danger" | "muted" }) {
  const toneClass = {
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    muted: "text-muted-strong",
  }[tone || "muted"];
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted mt-1 truncate">{sub}</div>}
    </div>
  );
}

function todayStr(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function sprintState(s: Sprint): "active" | "ended" | "upcoming" {
  const today = todayStr();
  if (s.start && s.end && s.start <= today && today <= s.end) return "active";
  if (s.end && s.end < today) return "ended";
  return "upcoming";
}

export function Dashboard({
  board,
  sprints,
  gitInfo,
  onOpenCard,
}: {
  board: BoardType;
  sprints: Sprint[];
  gitInfo: GitInfo | null;
  onOpenCard: (id: string) => void;
}) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);

  useEffect(() => {
    fetchHistory(undefined, 25).then(setHistory);
    fetchSessions(15).then(setSessions);
  }, [board.title]);

  const today = todayStr();
  const active = sprints.find((s) => sprintState(s) === "active");
  const activeLabel = active ? `sprint:${active.name}` : "";

  const stats = useMemo(() => {
    const byColumn: Record<string, number> = {};
    let overdue = 0, dueSoon = 0, totalEffort = 0, sprintTotal = 0, sprintDone = 0, sprintEffort = 0, sprintEffortDone = 0;
    for (const c of board.cards) {
      byColumn[c.column] = (byColumn[c.column] || 0) + 1;
      const due = c.due_date ? c.due_date.slice(0, 10) : "";
      const inDone = c.column === "done";
      if (due && due < today && !inDone) overdue++;
      if (due && due >= today && due <= addDays(today, 7) && !inDone) dueSoon++;
      totalEffort += c.effort || 0;
      if (activeLabel && c.labels.includes(activeLabel)) {
        sprintTotal++;
        sprintEffort += c.effort || 0;
        if (inDone) { sprintDone++; sprintEffortDone += c.effort || 0; }
      }
    }
    return {
      byColumn,
      total: board.cards.length,
      overdue, dueSoon, totalEffort,
      sprintTotal, sprintDone, sprintEffort, sprintEffortDone,
    };
  }, [board, today, activeLabel]);

  const timeline = useMemo(() => {
    const items = [
      ...history.map((e) => ({ at: e.at, kind: "history" as const, op: e.op, text: `${e.card}: ${e.old_value || ""} ${e.new_value || ""}`.trim(), card: e.card })),
      ...sessions.map((s) => ({ at: s.at, kind: "session" as const, op: "session", text: s.summary || s.prompt || s.id, card: "" })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 12);
    return items;
  }, [history, sessions]);

  const doneCol = board.columns.find((c) => c.id === "done");
  const sprintPct = stats.sprintTotal > 0 ? Math.round((stats.sprintDone / stats.sprintTotal) * 100) : 0;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total cards" value={stats.total} sub={gitInfo ? `${gitInfo.branch}` : undefined} tone="accent" />
          {board.columns.map((col) => (
            <StatCard key={col.id} label={col.name} value={stats.byColumn[col.id] || 0} tone={col.id === "done" ? "success" : "muted"} />
          ))}
          <StatCard label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? "danger" : "success"} />
          <StatCard label="Due in 7d" value={stats.dueSoon} tone={stats.dueSoon > 0 ? "warning" : "muted"} />
          <StatCard label="Total effort" value={stats.totalEffort} tone="muted" />
        </div>

        {/* Sprint progress */}
        {active ? (
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-text">
                Sprint <span className="text-accent">{active.name}</span>
                {active.start && active.end && (
                  <span className="text-muted font-normal ml-2">{active.start} → {active.end}</span>
                )}
              </div>
              <div className="text-xs text-muted">
                {stats.sprintDone}/{stats.sprintTotal} done · {stats.sprintEffortDone}/{stats.sprintEffort} effort
              </div>
            </div>
            <div className="h-2 bg-bg rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${sprintPct}%` }} />
            </div>
            <div className="text-[11px] text-muted mt-1.5">{sprintPct}% complete</div>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-4 text-xs text-muted">
            No active sprint. Start one in the <span className="text-accent">Sprints</span> view.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Recent activity */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold text-text mb-3">Recent activity</h3>
            {timeline.length === 0 && <p className="text-xs text-muted">No activity yet.</p>}
            <div className="space-y-2">
              {timeline.map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-xs border-b border-border/50 pb-2 last:border-0">
                  <span className="text-muted font-mono shrink-0">{t.at?.slice(11, 19)}</span>
                  {t.kind === "session" ? (
                    <span className="text-accent bg-accent/10 px-1 rounded font-mono text-[10px] shrink-0">session</span>
                  ) : (
                    <span className="text-muted-strong bg-bg px-1 rounded font-mono text-[10px] shrink-0">{t.op}</span>
                  )}
                  <span className="text-muted-strong break-words">{t.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Due soon */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold text-text mb-3">Due soon / overdue</h3>
            {board.cards.filter((c) => c.due_date && c.column !== "done").sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1)).slice(0, 8).map((c) => {
              const due = c.due_date!.slice(0, 10);
              const isOver = due < today;
              return (
                <button
                  key={c.id}
                  onClick={() => onOpenCard(c.id)}
                  className="w-full flex items-center gap-2 text-xs text-left border-b border-border/50 pb-2 mb-2 last:border-0 last:mb-0 hover:text-accent transition-colors"
                >
                  <span className={`font-mono shrink-0 ${isOver ? "text-danger" : "text-warning"}`}>{due}</span>
                  <span className="text-muted-strong truncate">{c.title}</span>
                  {c.effort ? <span className="text-muted shrink-0 font-mono">⏱{c.effort}</span> : null}
                </button>
              );
            })}
            {board.cards.filter((c) => c.due_date && c.column !== "done").length === 0 && (
              <p className="text-xs text-muted">Nothing due.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
