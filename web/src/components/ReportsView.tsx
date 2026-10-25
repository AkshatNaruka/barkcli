import React, { useEffect, useMemo, useState } from "react";
import type { Board as BoardType, Card, Sprint } from "../lib/types";
import { fetchReportsData } from "../lib/api";

function Bar({ label, value, max, tone, suffix }: {
  label: string;
  value: number;
  max: number;
  tone: string;
  suffix?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 shrink-0 truncate text-muted text-right" title={label}>{label}</div>
      <div className="flex-1 h-3.5 bg-card rounded overflow-hidden">
        <div
          className={`h-full ${tone} rounded transition-all`}
          style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
        />
      </div>
      <div className="w-16 shrink-0 font-mono text-[10px] text-muted-strong flex items-baseline gap-1">
        <span>{value}{suffix || ""}</span>
        {pct > 0 && <span className="text-muted">{pct}%</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-lg p-4">
      <h3 className="text-xs font-semibold text-text mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function sprintTag(s: Sprint) {
  return `sprint:${s.name}`;
}

export function ReportsView({ board, sprints }: { board: BoardType; sprints: Sprint[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [reportsData, setReportsData] = useState<{
    board_name: string;
    total_cards: number;
    completed_cards: number;
    in_progress_cards: number;
    blocked_cards: number;
    todo_cards: number;
    completion_rate: number;
    total_effort: number;
    completed_effort: number;
    by_priority: Record<string, number>;
    by_column: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    fetchReportsData(board.title).then(setReportsData);
  }, [board.title]);

  const report = useMemo(() => {
    // Effort by column
    const colEffort: Record<string, { count: number; effort: number }> = {};
    // Effort by area
    const areaEffort: Record<string, { count: number; effort: number }> = {};
    // Priority counts
    const prioCount: Record<string, number> = {};
    for (const c of board.cards) {
      const col = colEffort[c.column] || (colEffort[c.column] = { count: 0, effort: 0 });
      col.count++; col.effort += c.effort || 0;
      const area = c.area || "(none)";
      const a = areaEffort[area] || (areaEffort[area] = { count: 0, effort: 0 });
      a.count++; a.effort += c.effort || 0;
      prioCount[c.priority] = (prioCount[c.priority] || 0) + 1;
    }
    // Per-sprint rollup: counts by column feed the stacked mix strip
    const sprintRows = sprints.map((s) => {
      const label = sprintTag(s);
      const cards = board.cards.filter((c) => c.labels.includes(label));
      const colMix: Record<string, number> = {};
      for (const c of cards) colMix[c.column] = (colMix[c.column] || 0) + 1;
      const totalEffort = cards.reduce((n, c) => n + (c.effort || 0), 0);
      const doneEffort = cards.filter((c) => c.column === "done").reduce((n, c) => n + (c.effort || 0), 0);
      const doneCount = cards.filter((c) => c.column === "done").length;
      let state = "upcoming";
      if (s.start && s.end && s.start <= today && today <= s.end) state = "active";
      else if (s.end && s.end < today) state = "ended";
      return { sprint: s, cards: cards.length, done: doneCount, totalEffort, doneEffort, state, colMix };
    }).reverse();

    return { colEffort, areaEffort, prioCount, sprintRows };
  }, [board, sprints, today]);

  const maxColEffort = Math.max(1, ...Object.values(report.colEffort).map((e) => e.effort));
  const maxAreaEffort = Math.max(1, ...Object.values(report.areaEffort).map((e) => e.effort));

  return (
    <div className="h-full overflow-auto">
      <div className="w-full max-w-[1600px] mx-auto p-4 space-y-6">
        {/* Executive Delivery Metrics */}
        {reportsData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">Completion Rate</div>
              <div className="text-xl font-bold font-mono text-success mt-0.5">
                {reportsData.completion_rate.toFixed(1)}%
              </div>
              <div className="text-[11px] text-muted mt-0.5">
                {reportsData.completed_cards} of {reportsData.total_cards} cards completed
              </div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">Effort Delivered</div>
              <div className="text-xl font-bold font-mono text-accent mt-0.5">
                {reportsData.completed_effort} / {reportsData.total_effort}
              </div>
              <div className="text-[11px] text-muted mt-0.5">Story points completed</div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">In Flight Execution</div>
              <div className="text-xl font-bold font-mono text-warning mt-0.5">
                {reportsData.in_progress_cards}
              </div>
              <div className="text-[11px] text-muted mt-0.5">
                {reportsData.blocked_cards} blocked cards
              </div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">Unscheduled / Todo</div>
              <div className="text-xl font-bold font-mono text-muted-strong mt-0.5">
                {reportsData.todo_cards}
              </div>
              <div className="text-[11px] text-muted mt-0.5">Cards ready for dispatch</div>
            </div>
          </div>
        )}

        {/* Sprint burndown */}
        <Section title="Sprint burndown">
          {report.sprintRows.length === 0 && (
            <p className="text-xs text-muted">No sprints yet. Start one in the Sprints view.</p>
          )}
          {report.sprintRows.map(({ sprint, cards, done, totalEffort, doneEffort, state, colMix }) => {
            const pct = totalEffort > 0 ? Math.round((doneEffort / totalEffort) * 100) : 0;
            // Same dot language as Sprints: filled=active, hollow ring=upcoming, muted=ended
            const dotCls = state === "active" ? "bg-success" : state === "ended" ? "bg-muted" : "ring-1 ring-inset ring-[var(--accent)]";
            return (
              <div key={sprint.name} className="bg-card rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text font-semibold">
                <span className={`w-2 h-2 rounded-full inline-block align-[1px] mr-1.5 ${dotCls}`} title={state} />
                    {sprint.name}
                    <span className="text-muted font-normal ml-2">
                      {sprint.start || "?"} → {sprint.end || "?"}
                    </span>
                  </span>
                  <span className="text-muted">
                    {done}/{cards} cards · {doneEffort}/{totalEffort} effort · <span className={pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-danger"}>{pct}%</span>
                  </span>
                </div>
                {/* Column mix: one stacked strip, segments fail soft when empty */}
                {cards > 0 && (
                  <div className="flex h-2 rounded-full overflow-hidden gap-px">
                    {board.columns.map((col) => {
                      const n = colMix[col.id] || 0;
                      if (n === 0) return null;
                      return (
                        <div
                          key={col.id}
                          className={col.id === "done" ? "bg-success" : col.id === "in-progress" ? "bg-accent" : "bg-muted"}
                          style={{ width: `${Math.round((n / cards) * 100)}%` }}
                          title={`${col.name}: ${n}`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </Section>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Effort by column */}
          <Section title="Effort by column">
            {board.columns.map((col) => (
              <Bar key={col.id} label={col.name} value={report.colEffort[col.id]?.effort || 0} max={maxColEffort} tone="bg-accent" />
            ))}
            {maxColEffort === 1 && <p className="text-xs text-muted">No effort assigned yet (set points on cards).</p>}
          </Section>

          {/* Effort by area */}
          <Section title="Effort by area">
            {Object.entries(report.areaEffort).sort((a, b) => b[1].effort - a[1].effort).map(([area, v]) => (
              <Bar key={area} label={area} value={v.effort} max={maxAreaEffort} tone="bg-warning" />
            ))}
            {Object.keys(report.areaEffort).length === 0 && (
              <p className="text-xs text-muted">No areas assigned yet (set Area on cards).</p>
            )}
          </Section>

          {/* Cards by priority */}
          <Section title="Cards by priority">
            {(["high", "medium", "low"] as const).map((p) => {
              const n = report.prioCount[p] || 0;
              const max = Math.max(1, ...(["high", "medium", "low"] as const).map((x) => report.prioCount[x] || 0));
              const tone = p === "high" ? "bg-danger" : p === "medium" ? "bg-warning" : "bg-muted";
              return <Bar key={p} label={p} value={n} max={max} tone={tone} />;
            })}
          </Section>

          {/* Column counts */}
          <Section title="Cards by column">
            {board.columns.map((col) => (
              <Bar key={col.id} label={col.name} value={report.colEffort[col.id]?.count || 0} max={Math.max(1, ...board.columns.map((c) => report.colEffort[c.id]?.count || 0))} tone="bg-success" />
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}
