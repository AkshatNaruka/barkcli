import React, { useEffect, useMemo, useState } from "react";
import type { Board as BoardType, Card, Sprint } from "../lib/types";
import { fetchReportsData } from "../lib/api";
import { Icon } from "./Icon";

function Bar({
  label,
  value,
  max,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  tone: string;
  suffix?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 shrink-0 truncate text-muted text-right font-medium" title={label}>
        {label}
      </div>
      <div className="flex-1 h-3.5 bg-card rounded-md overflow-hidden p-0.5 border border-border">
        <div
          className={`h-full ${tone} rounded transition-all`}
          style={{ width: `${Math.max(pct, value > 0 ? 5 : 0)}%` }}
        />
      </div>
      <div className="w-20 shrink-0 font-mono text-[11px] text-muted-strong flex items-baseline gap-1 justify-end">
        <span>
          {value}
          {suffix || ""}
        </span>
        {pct > 0 && <span className="text-muted text-[10px]">({pct}%)</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl p-5 border border-border shadow-sm space-y-3">
      <h3 className="text-xs font-bold text-text uppercase tracking-wider">{title}</h3>
      <div className="space-y-2.5">{children}</div>
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
    fetchReportsData(board.title)
      .then((data) => {
        if (data && typeof data.completion_rate === "number") {
          setReportsData(data);
        } else {
          setReportsData(null);
        }
      })
      .catch(() => setReportsData(null));
  }, [board.title]);

  // Guaranteed fallback metrics calculated from the board model
  const fallbackMetrics = useMemo(() => {
    const cards = board.cards || [];
    const total_cards = cards.length;
    const completed_cards = cards.filter((c) => c.column === "done").length;
    const in_progress_cards = cards.filter(
      (c) => c.column === "doing" || c.column === "in-progress" || c.column === "in_progress"
    ).length;
    const blocked_cards = cards.filter(
      (c) => Boolean(c.blocked_by) || (c.links && c.links.some((l) => l.ty === "blocked-by"))
    ).length;
    const todo_cards = cards.filter((c) => c.column === "todo").length;
    const total_effort = cards.reduce((acc, c) => acc + (c.effort || 0), 0);
    const completed_effort = cards
      .filter((c) => c.column === "done")
      .reduce((acc, c) => acc + (c.effort || 0), 0);
    const completion_rate = total_cards > 0 ? (completed_cards / total_cards) * 100 : 0;
    const by_priority: Record<string, number> = {};
    const by_column: Record<string, number> = {};
    for (const c of cards) {
      by_priority[c.priority || "medium"] = (by_priority[c.priority || "medium"] || 0) + 1;
      by_column[c.column] = (by_column[c.column] || 0) + 1;
    }
    return {
      board_name: board.title,
      total_cards,
      completed_cards,
      in_progress_cards,
      blocked_cards,
      todo_cards,
      completion_rate,
      total_effort,
      completed_effort,
      by_priority,
      by_column,
    };
  }, [board]);

  const activeReportsData =
    reportsData && typeof reportsData.completion_rate === "number"
      ? reportsData
      : fallbackMetrics;

  const report = useMemo(() => {
    // Effort by column
    const colEffort: Record<string, { count: number; effort: number }> = {};
    // Effort by area
    const areaEffort: Record<string, { count: number; effort: number }> = {};
    // Priority counts
    const prioCount: Record<string, number> = {};
    for (const c of board.cards) {
      const col = colEffort[c.column] || (colEffort[c.column] = { count: 0, effort: 0 });
      col.count++;
      col.effort += c.effort || 0;
      const area = c.area || "(none)";
      const a = areaEffort[area] || (areaEffort[area] = { count: 0, effort: 0 });
      a.count++;
      a.effort += c.effort || 0;
      prioCount[c.priority] = (prioCount[c.priority] || 0) + 1;
    }
    // Per-sprint rollup: counts by column feed the stacked mix strip
    const sprintRows = sprints
      .map((s) => {
        const label = sprintTag(s);
        const cards = board.cards.filter((c) => c.labels.includes(label));
        const colMix: Record<string, number> = {};
        for (const c of cards) colMix[c.column] = (colMix[c.column] || 0) + 1;
        const totalEffort = cards.reduce((n, c) => n + (c.effort || 0), 0);
        const doneEffort = cards
          .filter((c) => c.column === "done")
          .reduce((n, c) => n + (c.effort || 0), 0);
        const doneCount = cards.filter((c) => c.column === "done").length;
        let state = "upcoming";
        if (s.start && s.end && s.start <= today && today <= s.end) state = "active";
        else if (s.end && s.end < today) state = "ended";
        return {
          sprint: s,
          cards: cards.length,
          done: doneCount,
          totalEffort,
          doneEffort,
          state,
          colMix,
        };
      })
      .reverse();

    return { colEffort, areaEffort, prioCount, sprintRows };
  }, [board, sprints, today]);

  const maxColEffort = Math.max(1, ...Object.values(report.colEffort).map((e) => e.effort));
  const maxAreaEffort = Math.max(1, ...Object.values(report.areaEffort).map((e) => e.effort));

  const safeRate =
    typeof activeReportsData.completion_rate === "number" && !isNaN(activeReportsData.completion_rate)
      ? activeReportsData.completion_rate.toFixed(1)
      : "0.0";

  return (
    <div className="h-full overflow-auto">
      <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
        {/* Executive Delivery Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                Completion Rate
              </span>
              <span className="w-2 h-2 rounded-full bg-success" />
            </div>
            <div className="my-2">
              <div className="text-3xl font-extrabold font-mono text-success">
                {safeRate}%
              </div>
              <div className="text-xs text-muted mt-1">
                {activeReportsData.completed_cards} of {activeReportsData.total_cards} cards completed
              </div>
            </div>
            <div className="w-full h-1.5 bg-card rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-success rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, activeReportsData.completion_rate || 0))}%` }}
              />
            </div>
          </div>

          <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                Effort Delivered
              </span>
              <span className="w-2 h-2 rounded-full bg-accent" />
            </div>
            <div className="my-2">
              <div className="text-3xl font-extrabold font-mono text-accent">
                {activeReportsData.completed_effort}
                <span className="text-base text-muted font-normal"> / {activeReportsData.total_effort}</span>
              </div>
              <div className="text-xs text-muted mt-1">Story points verified</div>
            </div>
            <div className="w-full h-1.5 bg-card rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{
                  width: `${
                    activeReportsData.total_effort > 0
                      ? Math.min(
                          100,
                          (activeReportsData.completed_effort / activeReportsData.total_effort) * 100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                In Flight Execution
              </span>
              <span className="w-2 h-2 rounded-full bg-warning" />
            </div>
            <div className="my-2">
              <div className="text-3xl font-extrabold font-mono text-warning">
                {activeReportsData.in_progress_cards}
              </div>
              <div className="text-xs text-muted mt-1">
                {activeReportsData.blocked_cards} blocked dependencies
              </div>
            </div>
            <div className="w-full h-1.5 bg-card rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-warning rounded-full transition-all duration-500"
                style={{
                  width: `${
                    activeReportsData.total_cards > 0
                      ? Math.min(
                          100,
                          (activeReportsData.in_progress_cards / activeReportsData.total_cards) * 100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                Ready For Dispatch
              </span>
              <span className="w-2 h-2 rounded-full bg-muted-strong" />
            </div>
            <div className="my-2">
              <div className="text-3xl font-extrabold font-mono text-text">
                {activeReportsData.todo_cards}
              </div>
              <div className="text-xs text-muted mt-1">Unscheduled todo items</div>
            </div>
            <div className="w-full h-1.5 bg-card rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-muted-strong rounded-full transition-all duration-500"
                style={{
                  width: `${
                    activeReportsData.total_cards > 0
                      ? Math.min(
                          100,
                          (activeReportsData.todo_cards / activeReportsData.total_cards) * 100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Notion Style Delivery Summary Callout */}
        <div className="p-4 rounded-2xl bg-surface border border-border text-xs text-text flex items-start gap-3 shadow-sm">
          <span className="text-base select-none mt-0.5">📌</span>
          <div className="flex-1 space-y-1">
            <div className="font-semibold text-text">Velocity & Acceptance Gate Intelligence</div>
            <p className="text-muted leading-relaxed">
              Tracking {activeReportsData.total_cards} cards across {board.columns.length} columns.
              {activeReportsData.blocked_cards > 0
                ? ` ${activeReportsData.blocked_cards} work item(s) currently await prerequisite card completion before agent dispatch.`
                : " All todo work items have unblocked dependency chains ready for immediate parallel execution."}
            </p>
          </div>
        </div>

        {/* Sprint Burndown & Delivery Velocity */}
        <Section title="Sprint Burndown & Delivery Mix">
          {report.sprintRows.length === 0 ? (
            <p className="text-xs text-muted py-4 text-center">No sprints created yet. Start one in the Sprints view.</p>
          ) : (
            report.sprintRows.map(({ sprint, cards, done, totalEffort, doneEffort, state, colMix }) => {
              const pct = totalEffort > 0 ? Math.round((doneEffort / totalEffort) * 100) : 0;
              const dotCls =
                state === "active"
                  ? "bg-success"
                  : state === "ended"
                  ? "bg-muted"
                  : "ring-1 ring-inset ring-[var(--accent)]";
              return (
                <div key={sprint.name} className="bg-card rounded-xl p-4 border border-border space-y-3">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <span className="text-text font-semibold flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full inline-block ${dotCls}`} title={state} />
                      {sprint.name}
                      <span className="text-muted font-normal font-mono text-[11px] ml-2">
                        {sprint.start || "?"} → {sprint.end || "?"}
                      </span>
                    </span>
                    <span className="text-muted text-[11px] font-mono">
                      {done}/{cards} cards · {doneEffort}/{totalEffort} effort ·{" "}
                      <span
                        className={`font-bold ${
                          pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-danger"
                        }`}
                      >
                        {pct}%
                      </span>
                    </span>
                  </div>
                  {/* Column mix: stacked strip */}
                  {cards > 0 && (
                    <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 bg-surface p-0.5 border border-border">
                      {board.columns.map((col) => {
                        const n = colMix[col.id] || 0;
                        if (n === 0) return null;
                        return (
                          <div
                            key={col.id}
                            className={`rounded-full transition-all ${
                              col.id === "done"
                                ? "bg-success"
                                : col.id === "doing" || col.id === "in-progress"
                                ? "bg-accent"
                                : "bg-muted"
                            }`}
                            style={{ width: `${Math.round((n / cards) * 100)}%` }}
                            title={`${col.name}: ${n} cards`}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </Section>

        {/* Detailed Effort & Priority Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Effort by column */}
          <Section title="Effort by column">
            {board.columns.map((col) => (
              <Bar
                key={col.id}
                label={col.name}
                value={report.colEffort[col.id]?.effort || 0}
                max={maxColEffort}
                tone="bg-accent"
                suffix=" pts"
              />
            ))}
            {maxColEffort === 1 && (
              <p className="text-xs text-muted py-2">No story points assigned yet (set points on cards).</p>
            )}
          </Section>

          {/* Effort by area */}
          <Section title="Effort by area">
            {Object.entries(report.areaEffort)
              .sort((a, b) => b[1].effort - a[1].effort)
              .map(([area, v]) => (
                <Bar
                  key={area}
                  label={area}
                  value={v.effort}
                  max={maxAreaEffort}
                  tone="bg-warning"
                  suffix=" pts"
                />
              ))}
            {Object.keys(report.areaEffort).length === 0 && (
              <p className="text-xs text-muted py-2">No areas assigned yet (set Area on cards).</p>
            )}
          </Section>

          {/* Cards by priority */}
          <Section title="Cards by priority">
            {(["high", "medium", "low"] as const).map((p) => {
              const n = report.prioCount[p] || 0;
              const max = Math.max(1, ...(["high", "medium", "low"] as const).map((x) => report.prioCount[x] || 0));
              const tone = p === "high" ? "bg-danger" : p === "medium" ? "bg-warning" : "bg-muted";
              return <Bar key={p} label={p} value={n} max={max} tone={tone} suffix=" cards" />;
            })}
          </Section>

          {/* Cards by column */}
          <Section title="Cards by column">
            {board.columns.map((col) => (
              <Bar
                key={col.id}
                label={col.name}
                value={report.colEffort[col.id]?.count || 0}
                max={Math.max(1, ...board.columns.map((c) => report.colEffort[c.id]?.count || 0))}
                tone="bg-success"
                suffix=" cards"
              />
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}
