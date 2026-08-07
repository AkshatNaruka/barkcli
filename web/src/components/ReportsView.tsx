import React, { useMemo } from "react";
import type { Board as BoardType, Card, Sprint } from "../lib/types";

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
      <div className="w-24 shrink-0 truncate text-muted text-right" title={label}>{label}</div>
      <div className="flex-1 h-4 bg-bg rounded overflow-hidden">
        <div
          className={`h-full ${tone} rounded transition-all`}
          style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
        />
      </div>
      <div className="w-14 shrink-0 font-mono text-muted-strong">{value}{suffix || ""} {pct > 0 ? `(${pct}%)` : ""}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
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
    // Per-sprint burndown
    const sprintRows = sprints.map((s) => {
      const label = sprintTag(s);
      const cards = board.cards.filter((c) => c.labels.includes(label));
      const totalEffort = cards.reduce((n, c) => n + (c.effort || 0), 0);
      const doneEffort = cards.filter((c) => c.column === "done").reduce((n, c) => n + (c.effort || 0), 0);
      const doneCount = cards.filter((c) => c.column === "done").length;
      let state = "upcoming";
      if (s.start && s.end && s.start <= today && today <= s.end) state = "active";
      else if (s.end && s.end < today) state = "ended";
      return { sprint: s, cards: cards.length, done: doneCount, totalEffort, doneEffort, state };
    }).reverse();

    return { colEffort, areaEffort, prioCount, sprintRows };
  }, [board, sprints, today]);

  const maxColEffort = Math.max(1, ...Object.values(report.colEffort).map((e) => e.effort));
  const maxAreaEffort = Math.max(1, ...Object.values(report.areaEffort).map((e) => e.effort));

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Sprint burndown */}
        <Section title="Sprint burndown">
          {report.sprintRows.length === 0 && (
            <p className="text-xs text-muted">No sprints yet. Start one in the Sprints view.</p>
          )}
          {report.sprintRows.map(({ sprint, cards, done, totalEffort, doneEffort, state }) => {
            const pct = totalEffort > 0 ? Math.round((doneEffort / totalEffort) * 100) : 0;
            const stateCls = state === "active" ? "text-success" : state === "ended" ? "text-muted" : "text-accent";
            const marker = state === "active" ? "●" : state === "ended" ? "○" : "◇";
            return (
              <div key={sprint.name} className="border border-border/60 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text font-semibold">
                    <span className={`${stateCls} mr-1.5`}>{marker}</span>
                    {sprint.name}
                    <span className="text-muted font-normal ml-2">
                      {sprint.start || "?"} → {sprint.end || "?"}
                    </span>
                  </span>
                  <span className="text-muted">
                    {done}/{cards} cards · {doneEffort}/{totalEffort} effort · <span className={pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-danger"}>{pct}%</span>
                  </span>
                </div>
                <div className="h-1.5 bg-bg rounded-full overflow-hidden">
                  <div className="h-full bg-success rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
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
            {maxColEffort === 1 && <p className="text-xs text-muted">No effort assigned yet (set ⏱ on cards).</p>}
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
