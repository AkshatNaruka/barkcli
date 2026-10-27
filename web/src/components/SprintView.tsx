import React, { useEffect, useMemo, useState } from "react";
import type { Board as BoardType, Card, Sprint } from "../lib/types";
import { endSprint, startSprint } from "../lib/api";
import { labelColor } from "../lib/labels";
import { Icon } from "./Icon";

type SprintState = "active" | "ended" | "upcoming";

interface SprintNode {
  card: Card;
  children: SprintNode[];
  externalParent?: Card;
}

interface SprintBranch {
  name: string;
  color: string;
  total: number;
  done: number;
  effort: number;
  doneEffort: number;
  nodes: SprintNode[];
}

interface SprintRow {
  sprint: Sprint;
  state: SprintState;
  cards: Card[];
  done: number;
  effort: number;
  doneEffort: number;
  branches: SprintBranch[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function sprintState(sprint: Sprint): SprintState {
  const today = todayStr();
  if (sprint.end && sprint.end <= today) return "ended";
  if (sprint.start && sprint.start <= today) return "active";
  return "upcoming";
}

function stateRank(state: SprintState): number {
  return state === "active" ? 0 : state === "upcoming" ? 1 : 2;
}

function isDone(card: Card): boolean {
  return card.column === "done";
}

function cardEffort(card: Card): number {
  return card.effort ?? 1;
}

function isBlocked(card: Card): boolean {
  return Boolean(card.blocked_by) || card.links.some((link) => link.ty === "blocked-by");
}

function columnColor(column: string): string {
  if (column === "done") return "var(--success)";
  if (column === "review") return "var(--warning)";
  if (column === "doing" || column === "in-progress" || column === "in_progress") return "var(--accent)";
  if (column === "blocked") return "var(--danger)";
  return "var(--muted)";
}

function columnLabel(column: string): string {
  return column.replace(/[-_]/g, " ");
}

function nodeOrder(a: Card, b: Card): number {
  const rank = (card: Card) => {
    if (card.column === "doing" || card.column === "in-progress" || card.column === "in_progress") return 0;
    if (card.column === "review") return 1;
    if (card.column === "blocked") return 2;
    if (card.column === "done") return 4;
    return 3;
  };
  return rank(a) - rank(b) || a.title.localeCompare(b.title);
}

/**
 * Build the branch forest under one sprint. Workstreams are the first branch
 * level (area, then the first real label). Within a workstream, card parent /
 * child links become the sub-branches. Links that leave the workstream stay
 * visible as a small external-parent marker instead of breaking the tree.
 */
function buildBranches(cards: Card[], allCards: Card[]): SprintBranch[] {
  const allById = new Map(allCards.map((card) => [card.id, card]));
  const parentOf = new Map<string, string>();

  for (const card of cards) {
    for (const link of card.links ?? []) {
      if (link.ty === "parent" && allById.has(link.target)) {
        parentOf.set(card.id, link.target);
      } else if (link.ty === "child" && allById.has(link.target)) {
        parentOf.set(link.target, card.id);
      }
    }
  }

  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const label = card.labels.find(
      (l) => !l.startsWith("sprint:") && !l.startsWith("type:") && !l.startsWith("agent:")
    );
    const name = card.area?.trim() || label || "General";
    const group = groups.get(name) ?? [];
    group.push(card);
    groups.set(name, group);
  }

  const names = [...groups.keys()].sort((a, b) => {
    const aCards = groups.get(a) ?? [];
    const bCards = groups.get(b) ?? [];
    const aOpen = aCards.filter((card) => !isDone(card)).length;
    const bOpen = bCards.filter((card) => !isDone(card)).length;
    return bOpen - aOpen || a.localeCompare(b);
  });

  return names.map((name) => {
    const group = groups.get(name) ?? [];
    const groupIds = new Set(group.map((card) => card.id));
    const childrenOf = new Map<string, Card[]>();

    for (const card of group) {
      const parentId = parentOf.get(card.id);
      if (!parentId || !groupIds.has(parentId)) continue;
      const children = childrenOf.get(parentId) ?? [];
      children.push(card);
      childrenOf.set(parentId, children);
    }

    const visited = new Set<string>();
    const makeNode = (card: Card, path: Set<string>): SprintNode | null => {
      if (path.has(card.id)) return null;
      const nextPath = new Set(path);
      nextPath.add(card.id);
      const children = (childrenOf.get(card.id) ?? [])
        .sort(nodeOrder)
        .map((child) => makeNode(child, nextPath))
        .filter((node): node is SprintNode => Boolean(node));
      visited.add(card.id);
      const parentId = parentOf.get(card.id);
      const externalParent =
        parentId && !groupIds.has(parentId) ? allById.get(parentId) : undefined;
      return { card, children, externalParent };
    };

    const subtreeSize = (card: Card, seen = new Set<string>()): number => {
      if (seen.has(card.id)) return 0;
      const next = new Set(seen);
      next.add(card.id);
      return (
        1 +
        (childrenOf.get(card.id) ?? []).reduce(
          (sum, child) => sum + subtreeSize(child, next),
          0
        )
      );
    };
    const rootScore = (card: Card) => (isDone(card) ? 0 : subtreeSize(card));

    const roots = group
      .filter((card) => {
        const parentId = parentOf.get(card.id);
        return !parentId || !groupIds.has(parentId);
      })
      .sort((a, b) => rootScore(b) - rootScore(a) || nodeOrder(a, b));

    const nodes: SprintNode[] = [];
    for (const root of roots) {
      const node = makeNode(root, new Set());
      if (node) nodes.push(node);
    }
    // Defensive: a cycle with no roots still gets rendered once.
    for (const card of group) {
      if (visited.has(card.id)) continue;
      const node = makeNode(card, new Set());
      if (node) nodes.push(node);
    }

    const done = group.filter(isDone);
    return {
      name,
      color: labelColor(name).color,
      total: group.length,
      done: done.length,
      effort: group.reduce((sum, card) => sum + cardEffort(card), 0),
      doneEffort: done.reduce((sum, card) => sum + cardEffort(card), 0),
      nodes,
    };
  });
}

function buildRows(sprints: Sprint[], board: BoardType | null): SprintRow[] {
  const allCards = board?.cards ?? [];
  return [...sprints]
    .map((sprint) => {
      const cards = allCards.filter((card) => card.labels.includes(`sprint:${sprint.name}`));
      const done = cards.filter(isDone);
      return {
        sprint,
        state: sprintState(sprint),
        cards,
        done: done.length,
        effort: cards.reduce((sum, card) => sum + cardEffort(card), 0),
        doneEffort: done.reduce((sum, card) => sum + cardEffort(card), 0),
        branches: buildBranches(cards, allCards),
      };
    })
    .sort(
      (a, b) =>
        stateRank(a.state) - stateRank(b.state) ||
        (b.sprint.start || "").localeCompare(a.sprint.start || "")
    );
}

function ProgressRing({
  pct,
  color,
  size = 42,
}: {
  pct: number;
  color: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const stroke = 3;
  const radius = (size - stroke * 2) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`${clamped}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9.5px] font-mono tabular-nums text-muted-strong">
        {clamped}%
      </span>
    </div>
  );
}

function StatePill({ state }: { state: SprintState }) {
  const color =
    state === "active" ? "var(--success)" : state === "ended" ? "var(--muted)" : "var(--accent-text)";
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-[2px] text-[8.5px] font-mono uppercase tracking-[0.08em]"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: color }} />
      {state}
    </span>
  );
}

function CardNodeView({
  node,
  onEditCard,
}: {
  node: SprintNode;
  onEditCard: (card: Card) => void;
}) {
  const { card, children, externalParent } = node;
  const done = isDone(card);
  const blocked = isBlocked(card);
  const checklistDone = card.checklist.filter((item) => item.done).length;

  return (
    <div className="relative">
      <span className="absolute -left-4 top-[17px] w-4 h-px bg-border/40" />
      <button
        type="button"
        onClick={() => onEditCard(card)}
        aria-label={`Open card ${card.title}`}
        className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-white/[0.035] transition-colors"
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: columnColor(card.column) }}
          title={columnLabel(card.column)}
        />
        <span
          className={`text-[11.5px] truncate ${done ? "text-muted line-through" : "text-text"}`}
          title={card.title}
        >
          {card.title}
        </span>
        {blocked && (
          <span title={card.blocked_by ? `Blocked by ${card.blocked_by}` : "Blocked"}>
            <Icon name="blocked" size={10} className="text-danger shrink-0" />
          </span>
        )}
        {children.length > 0 && (
          <span
            className="inline-flex items-center gap-0.5 text-[8.5px] font-mono text-muted/70 shrink-0"
            title={`${children.length} linked subcards`}
          >
            <Icon name="subtasks" size={9} />
            {children.length}
          </span>
        )}
        {externalParent && (
          <span title={`Parent outside this workstream: ${externalParent.title}`}>
            <Icon name="link" size={9} className="text-muted/60 shrink-0" />
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0 text-[9px] font-mono text-muted">
          {card.checklist.length > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Checklist progress">
              <Icon name="check" size={8} />
              {checklistDone}/{card.checklist.length}
            </span>
          )}
          {card.effort ? <span title="Effort">{card.effort}p</span> : null}
          <span
            className="uppercase tracking-[0.08em]"
            style={{ color: columnColor(card.column) }}
          >
            {columnLabel(card.column)}
          </span>
        </span>
      </button>

      {children.length > 0 && (
        <div className="relative ml-3 border-l border-border/40 pl-4">
          {children.map((child) => (
            <CardNodeView key={child.card.id} node={child} onEditCard={onEditCard} />
          ))}
        </div>
      )}
    </div>
  );
}

function BranchView({
  branch,
  onEditCard,
}: {
  branch: SprintBranch;
  onEditCard: (card: Card) => void;
}) {
  const pct = branch.total > 0 ? Math.round((branch.done / branch.total) * 100) : 0;
  return (
    <div className="relative pt-1.5">
      <span className="absolute -left-4 top-[17px] w-4 h-px bg-border/50" />
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: branch.color }} />
        <span className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-strong truncate">
          {branch.name}
        </span>
        <span className="text-[9px] font-mono text-muted/80 shrink-0">
          {branch.done}/{branch.total}
        </span>
        <div className="w-14 h-1 rounded-full bg-card overflow-hidden shrink-0">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: branch.color }}
          />
        </div>
        <span className="ml-auto text-[9px] font-mono text-muted/70 shrink-0">
          {branch.doneEffort}/{branch.effort} pts
        </span>
      </div>
      <div className="relative ml-2 border-l border-border/40 pl-4 mt-0.5">
        {branch.nodes.map((node) => (
          <CardNodeView key={node.card.id} node={node} onEditCard={onEditCard} />
        ))}
      </div>
    </div>
  );
}

function SprintTree({
  row,
  open,
  onToggle,
  onEditCard,
  onEnd,
  endArmed,
  endBusy,
}: {
  row: SprintRow;
  open: boolean;
  onToggle: () => void;
  onEditCard: (card: Card) => void;
  onEnd: (name: string) => void;
  endArmed: boolean;
  endBusy: boolean;
}) {
  const pct = row.cards.length > 0 ? Math.round((row.done / row.cards.length) * 100) : 0;
  const ringColor =
    row.state === "active"
      ? "var(--accent)"
      : row.state === "ended"
        ? pct === 100
          ? "var(--success)"
          : "var(--muted-strong)"
        : "var(--muted)";

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-surface/20">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <ProgressRing pct={pct} color={ringColor} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h3 className="text-[13px] font-medium text-text truncate">{row.sprint.name}</h3>
            <StatePill state={row.state} />
            <span className="text-[9.5px] font-mono text-muted">
              {row.sprint.start || "—"} → {row.sprint.end || "—"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[9.5px] text-muted flex-wrap">
            <span>
              <b className="text-muted-strong">{row.done}</b>
              /{row.cards.length} cards
            </span>
            <span>
              {row.doneEffort}/{row.effort} pts
            </span>
            <span>{row.branches.length} branches</span>
            {row.state === "active" && (
              <span className="text-accent-text">{row.cards.length - row.done} open</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {row.state === "active" && (
            <button
              type="button"
              onClick={() => onEnd(row.sprint.name)}
              disabled={endBusy}
              className={`h-6 px-2 rounded text-[10px] transition-colors disabled:opacity-40 ${
                endArmed
                  ? "bg-danger/10 text-danger border border-danger/30"
                  : "text-muted hover:text-danger hover:bg-danger/10"
              }`}
            >
              {endArmed ? "End sprint?" : "End sprint"}
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            title={open ? "Collapse sprint" : "Expand sprint"}
            aria-label={open ? "Collapse sprint" : "Expand sprint"}
            className="p-1 rounded text-muted hover:text-text hover:bg-white/[0.04]"
          >
            <Icon
              name="chevR"
              size={12}
              className={`transition-transform ${open ? "rotate-90" : ""}`}
            />
          </button>
        </div>
      </div>

      <div className="h-[2px] bg-card">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${pct}%`, background: ringColor }}
        />
      </div>

      {open && (
        <div className="px-3.5 pb-3 pt-1">
          {row.branches.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-2.5 text-[10.5px] text-muted">
              No cards tagged <span className="font-mono text-muted-strong">sprint:{row.sprint.name}</span>.
              Starting a sprint tags every open card; add the label manually to include others.
            </div>
          ) : (
            <div className="relative ml-[20px] border-l border-border/50 pl-4">
              {row.branches.map((branch) => (
                <BranchView key={branch.name} branch={branch} onEditCard={onEditCard} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StartSprintModal({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the sprint a name first.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await startSprint(trimmed, end || undefined);
    setBusy(false);
    if (ok) {
      onStarted(trimmed);
    } else {
      setError("Could not start that sprint. It may already exist.");
    }
  };

  const field =
    "w-full bg-card border border-border rounded-md px-2.5 py-2 text-[12px] text-text placeholder:text-muted/50 outline-none focus:border-accent/70";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[16vh] px-4 bg-black/60 backdrop-blur-[2px]"
      onMouseDown={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Start a sprint"
    >
      <div
        className="w-full max-w-[380px] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="h-12 px-4 flex items-center gap-2 border-b border-border">
          <div className="w-6 h-6 rounded-md bg-accent-soft text-accent-text flex items-center justify-center">
            <Icon name="cycle" size={13} />
          </div>
          <div>
            <h2 className="text-[12.5px] font-medium text-text">Start a sprint</h2>
            <p className="text-[9.5px] text-muted">One branch of work, end to end.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.05]"
            title="Close"
            aria-label="Close"
          >
            <Icon name="x" size={13} />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <label className="block">
            <span className="block text-[9px] uppercase tracking-[0.14em] text-muted mb-1">Sprint name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
              placeholder="sprint-15"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="block text-[9px] uppercase tracking-[0.14em] text-muted mb-1">Ends (optional)</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={field}
            />
          </label>
          {error && <p className="text-[10.5px] text-danger">{error}</p>}
          <p className="text-[9.5px] text-muted/70 leading-relaxed">
            Starting tags every open todo/doing card with{" "}
            <span className="font-mono text-muted-strong">sprint:&lt;name&gt;</span>. The tree
            groups them by area, then follows card links.
          </p>
        </div>

        <footer className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-8 px-3 rounded-md border border-border text-[11px] text-muted hover:text-text disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim() || busy}
            className="h-8 px-3.5 rounded-md bg-accent text-white text-[11px] font-medium hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? "Starting…" : "Start sprint"}
          </button>
        </footer>
      </div>
    </div>
  );
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
  const [startOpen, setStartOpen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [endArmed, setEndArmed] = useState<string | null>(null);
  const [endBusy, setEndBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const rows = useMemo(() => buildRows(sprints, board), [sprints, board]);
  const activeCount = rows.filter((row) => row.state === "active").length;
  const totalCards = rows.reduce((sum, row) => sum + row.cards.length, 0);
  const totalDone = rows.reduce((sum, row) => sum + row.done, 0);
  const pct = totalCards > 0 ? Math.round((totalDone / totalCards) * 100) : 0;

  const isOpen = (row: SprintRow) => open[row.sprint.name] ?? row.state !== "ended";

  const toggle = (row: SprintRow) => {
    setOpen((current) => ({ ...current, [row.sprint.name]: !isOpen(row) }));
  };

  const onEnd = async (name: string) => {
    if (endArmed !== name) {
      setEndArmed(name);
      window.setTimeout(() => {
        setEndArmed((current) => (current === name ? null : current));
      }, 2800);
      return;
    }
    setEndArmed(null);
    setEndBusy(true);
    const ok = await endSprint(name);
    setEndBusy(false);
    if (ok) {
      setNotice(`Ended ${name}. Unfinished cards returned to the backlog.`);
      onSprintChanged();
    } else {
      setError("Could not end that sprint.");
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[1120px] mx-auto p-4">
        <header className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-medium text-text">Sprints</h2>
              <span className="text-[9.5px] font-mono text-muted">{rows.length}</span>
              {activeCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[9.5px] font-mono text-success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  {activeCount} active
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted mt-1">
              Sprint → workstream → card. Branches follow area and card links.
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {rows.length > 0 && (
              <div className="hidden sm:flex items-center gap-2 text-[9.5px] font-mono text-muted">
                <span>{totalCards} cards</span>
                <div className="w-24 h-1.5 rounded-full bg-card overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span>{pct}%</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              className="h-8 px-3 rounded-md bg-accent text-white text-[11.5px] font-medium hover:bg-accent-hover flex items-center gap-1.5"
            >
              <Icon name="plus" size={12} />
              New sprint
            </button>
          </div>
        </header>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-[10px] text-danger">
            <Icon name="warn" size={11} />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto text-muted hover:text-text"
              aria-label="Dismiss"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        )}
        {notice && !error && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-success/20 bg-success/5 px-2.5 py-1.5 text-[10px] text-success">
            <Icon name="check" size={10} />
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="ml-auto text-success/70 hover:text-success"
              aria-label="Dismiss"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="mt-8 flex flex-col items-center text-center">
            <svg width="160" height="94" viewBox="0 0 160 94" fill="none" aria-hidden="true" className="opacity-60">
              <path
                d="M22 12v70M22 30h38M22 54h38M22 78h38"
                stroke="var(--border-strong)"
                strokeWidth="1"
              />
              <circle cx="22" cy="12" r="3" fill="var(--accent)" />
              <circle cx="60" cy="30" r="2.5" fill="var(--muted)" />
              <circle cx="60" cy="54" r="2.5" fill="var(--muted)" />
              <circle cx="60" cy="78" r="2.5" fill="var(--muted)" />
              <path d="M60 38v4M60 62v4" stroke="var(--border)" strokeWidth="1" />
            </svg>
            <p className="text-[13px] text-text mt-4">No sprints yet</p>
            <p className="text-[11px] text-muted mt-1 max-w-[300px]">
              Start one to tag open cards and grow the first branch of the tree.
            </p>
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              className="mt-4 h-8 px-3.5 rounded-md bg-accent text-white text-[11.5px] font-medium hover:bg-accent-hover"
            >
              Start a sprint
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map((row) => (
              <SprintTree
                key={row.sprint.name}
                row={row}
                open={isOpen(row)}
                onToggle={() => toggle(row)}
                onEditCard={onEditCard}
                onEnd={onEnd}
                endArmed={endArmed === row.sprint.name}
                endBusy={endBusy}
              />
            ))}
          </div>
        )}
      </div>

      {startOpen && (
        <StartSprintModal
          onClose={() => setStartOpen(false)}
          onStarted={(name) => {
            setStartOpen(false);
            setOpen((current) => ({ ...current, [name]: true }));
            setNotice(`Started ${name}. Open todo/doing cards are now in the sprint.`);
            onSprintChanged();
          }}
        />
      )}
    </div>
  );
}
