import React, { useEffect, useMemo, useState } from "react";
import {
  Bar as RechartsBar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Board as BoardType, Card, Sprint } from "../lib/types";
import { fetchReportsData } from "../lib/api";
import { Icon } from "./Icon";

function CustomColumnTooltip({ active, payload, label, totalCards, totalEffort }: {
  active?: boolean;
  payload?: any[];
  label?: string;
  totalCards: number;
  totalEffort: number;
}) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const cardShare = totalCards > 0 ? Math.round((data.cards / totalCards) * 100) : 0;
  const effortShare = totalEffort > 0 ? Math.round((data.effort / totalEffort) * 100) : 0;
  const avgEffort = data.cards > 0 ? (data.effort / data.cards).toFixed(1) : "0.0";

  return (
    <div className="rounded-xl border border-white/10 bg-[#12141a]/95 p-3 text-xs shadow-2xl backdrop-blur-xl space-y-2 min-w-[170px] select-none pointer-events-none">
      <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
        <span className="font-semibold text-text text-[13px]">{label || data.name}</span>
        <span className="rounded-full bg-surface/80 px-2 py-0.5 text-[9.5px] font-mono text-muted border border-border/40">
          Column
        </span>
      </div>

      <div className="space-y-1.5 pt-0.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-xs shadow-emerald-500/50" />
            <span>Cards</span>
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="font-semibold text-text">{data.cards}</span>
            <span className="text-[10px] text-muted">({cardShare}%)</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-xs shadow-indigo-500/50" />
            <span>Effort</span>
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="font-semibold text-text">{data.effort} pts</span>
            <span className="text-[10px] text-muted">({effortShare}%)</span>
          </div>
        </div>
      </div>

      {data.cards > 0 && data.effort > 0 && (
        <div className="border-t border-border/40 pt-1.5 text-[10.5px] text-muted flex items-center justify-between">
          <span>Avg complexity</span>
          <span className="font-mono text-text/80">{avgEffort} pts/card</span>
        </div>
      )}
    </div>
  );
}

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  const value = item.value || 0;
  const name = item.name || "";
  const color = item.payload?.color || item.payload?.fill || "#888";

  return (
    <div className="rounded-xl border border-white/10 bg-[#12141a]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-xl select-none pointer-events-none">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="font-semibold text-text">{name} Priority</span>
      </div>
      <div className="mt-1 font-mono text-[13px] text-text">
        {value} <span className="text-xs text-muted font-sans">card{value === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

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
    <div className="flex items-center gap-2.5 text-xs">
      <div className="w-28 shrink-0 truncate text-muted text-right font-medium text-[11.5px]" title={label}>
        {label}
      </div>
      <div className="flex-1 h-3 bg-card/80 rounded-full overflow-hidden p-0.5 border border-border/60">
        <div
          className={`h-full ${tone} rounded-full transition-all duration-500`}
          style={{ width: `${Math.max(pct, value > 0 ? 6 : 0)}%` }}
        />
      </div>
      <div className="w-20 shrink-0 font-mono text-[11px] text-muted-strong flex items-baseline gap-1 justify-end">
        <span className="font-semibold text-text">
          {value}
          {suffix || ""}
        </span>
        {pct > 0 && <span className="text-muted/70 text-[10px]">({pct}%)</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface/90 rounded-2xl p-5 border border-border/70 shadow-xs space-y-3.5">
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
  const [chartViewMode, setChartViewMode] = useState<"all" | "cards" | "effort">("all");
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

  const safeData = activeReportsData || fallbackMetrics || {
    board_name: board?.title || "",
    total_cards: 0,
    completed_cards: 0,
    in_progress_cards: 0,
    blocked_cards: 0,
    todo_cards: 0,
    completion_rate: 0,
    total_effort: 0,
    completed_effort: 0,
    by_priority: {},
    by_column: {},
  };

  const report = useMemo(() => {
    // Effort by column
    const colEffort: Record<string, { count: number; effort: number }> = {};
    // Effort by area
    const areaEffort: Record<string, { count: number; effort: number }> = {};
    // Priority counts
    const prioCount: Record<string, number> = {};
    const cards = board?.cards || [];
    for (const c of cards) {
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
        const cards = (board?.cards || []).filter((c) => c.labels.includes(label));
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
    typeof safeData.completion_rate === "number" && !isNaN(safeData.completion_rate)
      ? safeData.completion_rate.toFixed(1)
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
                {safeData.completed_cards} of {safeData.total_cards} cards completed
              </div>
            </div>
            <div className="w-full h-1.5 bg-card rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-success rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, safeData.completion_rate || 0))}%` }}
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
                {safeData.completed_effort}
                <span className="text-base text-muted font-normal"> / {safeData.total_effort}</span>
              </div>
              <div className="text-xs text-muted mt-1">Story points verified</div>
            </div>
            <div className="w-full h-1.5 bg-card rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{
                  width: `${
                    safeData.total_effort > 0
                      ? Math.min(
                          100,
                          (safeData.completed_effort / safeData.total_effort) * 100
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
                {safeData.in_progress_cards}
              </div>
              <div className="text-xs text-muted mt-1">
                {safeData.blocked_cards} blocked dependencies
              </div>
            </div>
            <div className="w-full h-1.5 bg-card rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-warning rounded-full transition-all duration-500"
                style={{
                  width: `${
                    safeData.total_cards > 0
                      ? Math.min(
                          100,
                          (safeData.in_progress_cards / safeData.total_cards) * 100
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
                {safeData.todo_cards}
              </div>
              <div className="text-xs text-muted mt-1">Unscheduled todo items</div>
            </div>
            <div className="w-full h-1.5 bg-card rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-muted-strong rounded-full transition-all duration-500"
                style={{
                  width: `${
                    safeData.total_cards > 0
                      ? Math.min(
                          100,
                          (safeData.todo_cards / safeData.total_cards) * 100
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
          <Icon name="pin" size={14} className="mt-0.5 shrink-0 text-accent-text" />
          <div className="flex-1 space-y-1">
            <div className="font-semibold text-text">Velocity & Acceptance Gate Intelligence</div>
            <p className="text-muted leading-relaxed">
              Tracking {safeData.total_cards} cards across {board?.columns?.length || 0} columns.
              {safeData.blocked_cards > 0
                ? ` ${safeData.blocked_cards} work item(s) currently await prerequisite card completion before agent dispatch.`
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

        {/* Interactive Recharts Analytics Overview */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 bg-surface/90 rounded-2xl p-5 border border-border/70 shadow-xs flex flex-col justify-between space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/50 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-text uppercase tracking-wider">
                    Column Throughput & Effort Chart
                  </h3>
                  <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-muted mt-0.5">
                  Interactive comparison of card count and story point effort per board column
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Segmented view mode toggle */}
                <div className="flex items-center rounded-lg border border-border/70 bg-card/60 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setChartViewMode("all")}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                      chartViewMode === "all"
                        ? "bg-surface text-text shadow-xs"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartViewMode("cards")}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors flex items-center gap-1.5 ${
                      chartViewMode === "cards"
                        ? "bg-surface text-text shadow-xs"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartViewMode("effort")}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors flex items-center gap-1.5 ${
                      chartViewMode === "effort"
                        ? "bg-surface text-text shadow-xs"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    Effort
                  </button>
                </div>
              </div>
            </div>

            <div className="h-60 w-full" data-testid="reports-column-rechart">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 640, height: 240 }}
              >
                <BarChart
                  data={(board.columns || []).map((col) => ({
                    name: col.name,
                    cards: report.colEffort[col.id]?.count || 0,
                    effort: report.colEffort[col.id]?.effort || 0,
                  }))}
                  margin={{ top: 12, right: 12, left: -10, bottom: 0 }}
                  barGap={6}
                >
                  <defs>
                    <linearGradient id="columnGradCards" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="columnGradEffort" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a5b4fc" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 500 }}
                    axisLine={{ stroke: "rgba(255, 255, 255, 0.08)" }}
                    tickLine={false}
                    dy={6}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    width={34}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{
                      fill: "rgba(255, 255, 255, 0.04)",
                      stroke: "rgba(255, 255, 255, 0.08)",
                      strokeWidth: 1,
                      rx: 8,
                      ry: 8,
                    }}
                    content={
                      <CustomColumnTooltip
                        totalCards={safeData.total_cards}
                        totalEffort={safeData.total_effort}
                      />
                    }
                  />
                  {(chartViewMode === "all" || chartViewMode === "cards") && (
                    <RechartsBar
                      dataKey="cards"
                      name="Cards"
                      fill="url(#columnGradCards)"
                      stroke="#10b981"
                      strokeWidth={1}
                      radius={[6, 6, 2, 2]}
                      maxBarSize={40}
                    />
                  )}
                  {(chartViewMode === "all" || chartViewMode === "effort") && (
                    <RechartsBar
                      dataKey="effort"
                      name="Effort (pts)"
                      fill="url(#columnGradEffort)"
                      stroke="#6366f1"
                      strokeWidth={1}
                      radius={[6, 6, 2, 2]}
                      maxBarSize={40}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-border/40 text-muted">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span>Total Cards: <strong className="font-mono text-text">{safeData.total_cards}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-indigo-400" />
                  <span>Total Points: <strong className="font-mono text-text">{safeData.total_effort}</strong></span>
                </div>
              </div>
              <span className="text-[11px] text-muted/70 font-mono">
                {board.columns?.length || 0} columns
              </span>
            </div>
          </div>

          <div className="bg-surface/90 rounded-2xl p-5 border border-border/70 shadow-xs flex flex-col justify-between space-y-3">
            <div>
              <h3 className="text-xs font-bold text-text uppercase tracking-wider">
                Priority Distribution
              </h3>
              <p className="text-[11px] text-muted mt-0.5">
                Share of high, medium, and low priority cards
              </p>
            </div>
            <div className="relative h-44 w-full" data-testid="reports-priority-pie">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 260, height: 176 }}
              >
                <PieChart>
                  <Pie
                    data={(["high", "medium", "low"] as const).map((p) => ({
                      name: p.toUpperCase(),
                      value: report.prioCount[p] || 0,
                      color: p === "high" ? "#f43f5e" : p === "medium" ? "#f59e0b" : "#64748b",
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={4}
                    cornerRadius={5}
                  >
                    <Cell fill="#f43f5e" stroke="rgba(244, 63, 94, 0.4)" strokeWidth={1} />
                    <Cell fill="#f59e0b" stroke="rgba(245, 158, 11, 0.4)" strokeWidth={1} />
                    <Cell fill="#64748b" stroke="rgba(100, 116, 139, 0.4)" strokeWidth={1} />
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Centered label inside Donut */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold font-mono text-text leading-none">
                  {safeData.total_cards}
                </span>
                <span className="text-[9px] uppercase font-semibold text-muted tracking-wider mt-0.5">
                  Cards
                </span>
              </div>
            </div>
            <div className="flex items-center justify-around text-xs pt-1 border-t border-border/40">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="h-2 w-2 rounded-full bg-rose-500 shadow-xs shadow-rose-500/50" />
                High ({report.prioCount.high || 0})
              </span>
              <span className="flex items-center gap-1.5 text-muted">
                <span className="h-2 w-2 rounded-full bg-amber-500 shadow-xs shadow-amber-500/50" />
                Med ({report.prioCount.medium || 0})
              </span>
              <span className="flex items-center gap-1.5 text-muted">
                <span className="h-2 w-2 rounded-full bg-slate-500 shadow-xs shadow-slate-500/50" />
                Low ({report.prioCount.low || 0})
              </span>
            </div>
          </div>
        </div>

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
