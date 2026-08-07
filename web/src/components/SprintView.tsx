import React, { useMemo, useState } from "react";
import type { Board as BoardType, Card, Sprint } from "../lib/types";
import { startSprint, endSprint } from "../lib/api";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function sprintState(s: Sprint): "active" | "ended" | "upcoming" {
  const today = todayStr();
  if (s.start && s.end && s.start <= today && today <= s.end) return "active";
  if (s.end && s.end < today) return "ended";
  return "upcoming";
}

export function SprintView({
  board,
  sprints,
  onSprintChanged,
  onEditCard,
}: {
  board: BoardType | null;
  sprints: Sprint[];
  onSprintChanged: () => void;
  onEditCard: (card: Card) => void;
}) {
  const [name, setName] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    return [...sprints]
      .sort((a, b) => ((a.start || "") < (b.start || "") ? 1 : -1))
      .map((s) => {
        const label = `sprint:${s.name}`;
        const cards = board ? board.cards.filter((c) => c.labels.includes(label)) : [];
        const done = cards.filter((c) => c.column === "done");
        const effort = cards.reduce((n, c) => n + (c.effort || 0), 0);
        const doneEffort = done.reduce((n, c) => n + (c.effort || 0), 0);
        return { sprint: s, state: sprintState(s), cards, doneCount: done.length, effort, doneEffort };
      });
  }, [sprints, board]);

  const onSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Sprint name is required."); return; }
    setBusy(true);
    setError(null);
    const ok = await startSprint(trimmed, end || undefined);
    setBusy(false);
    if (ok) {
      setName("");
      setEnd("");
      onSprintChanged();
    } else {
      setError("Failed to start sprint.");
    }
  };

  const onEnd = async (sprintName?: string) => {
    setBusy(true);
    const ok = await endSprint(sprintName);
    setBusy(false);
    if (ok) onSprintChanged();
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {/* Start a sprint */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-text mb-3">Start a sprint</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[160px]">
              <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. sprint-23"
                className="w-full bg-bg border border-border rounded px-2.5 py-1.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <label className="w-40">
              <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">Ends (optional)</span>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full bg-bg border border-border rounded px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <button
              onClick={onSubmit}
              disabled={busy}
              className="px-3 py-1.5 rounded bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              Start
            </button>
          </div>
          {error && <p className="text-xs text-danger mt-2">{error}</p>}
          <p className="text-[11px] text-muted mt-2">
            Starting tags all open todo/doing cards with <span className="font-mono">sprint:&lt;name&gt;</span>.
          </p>
        </div>

        {/* Sprint list */}
        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="text-xs text-muted text-center py-8">No sprints yet.</p>
          )}
          {rows.map(({ sprint, state, cards, doneCount, effort, doneEffort }) => {
            const pct = cards.length > 0 ? Math.round((doneCount / cards.length) * 100) : 0;
            const stateCls = state === "active" ? "text-success" : state === "ended" ? "text-muted" : "text-accent";
            const marker = state === "active" ? "●" : state === "ended" ? "○" : "◇";
            return (
              <div key={sprint.name} className="bg-surface border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-text">
                    <span className={`${stateCls} mr-1.5`}>{marker}</span>
                    {sprint.name}
                    <span className="text-muted text-xs font-normal ml-2">
                      {sprint.start || "?"} → {sprint.end || "?"}
                    </span>
                  </div>
                  {state === "active" && (
                    <button
                      onClick={() => onEnd(sprint.name)}
                      disabled={busy}
                      className="text-[11px] px-2 py-1 rounded border border-border text-muted hover:text-danger hover:border-danger transition-colors disabled:opacity-50"
                    >
                      End sprint
                    </button>
                  )}
                </div>
                <div className="h-1.5 bg-bg rounded-full overflow-hidden mt-2.5">
                  <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[11px] text-muted mt-1.5">
                  {doneCount}/{cards.length} cards · {doneEffort}/{effort} effort · {pct}% done
                </div>
                {cards.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {cards.slice(0, 12).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => onEditCard(c)}
                        className="text-[10px] font-mono bg-bg border border-border rounded px-1.5 py-0.5 text-muted-strong hover:text-accent hover:border-accent transition-colors"
                      >
                        {c.id}
                        {c.column === "done" ? " ✓" : ""}
                      </button>
                    ))}
                    {cards.length > 12 && (
                      <span className="text-[10px] text-muted self-center">+{cards.length - 12} more</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
