import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { agentColor } from "../lib/agents";
import { labelColor } from "../lib/labels";
import {
  approveBundle,
  assignCommitToAgent,
  fetchAgentsList,
  fetchBundles,
  fetchCommitDiff,
  fetchGitCommits,
  fetchHistory,
  fetchSessions,
  rejectBundle,
  scanBundles,
  sealBundle,
  type AgentItem,
  type GitCommit,
  type GitDiffResponse,
} from "../lib/api";
import type {
  Board,
  Bundle,
  Card,
  HistoryEntry,
  SessionEntry,
} from "../lib/types";

// ── Types ─────────────────────────────────────────────────────────────────

type Tab = "stream" | "commits" | "bundles";
type StreamKind = "board" | "agent" | "git";
type StreamFilter = "all" | StreamKind;
type BundleFilter = "all" | "pending" | "approved" | "sealed";

interface StreamEvent {
  id: string;
  kind: StreamKind;
  at: Date;
  entry?: HistoryEntry;
  session?: SessionEntry;
  commit?: GitCommit;
}

interface DayGroup {
  key: string;
  label: string;
  events: StreamEvent[];
}

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: "stream", label: "Stream", icon: "pulse" },
  { id: "commits", label: "Commits", icon: "branch" },
  { id: "bundles", label: "Bundles", icon: "layers" },
];

const STREAM_FILTERS: Array<{ id: StreamFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "board", label: "Board" },
  { id: "agent", label: "Agents" },
  { id: "git", label: "Commits" },
];

const BUNDLE_FILTERS: Array<{ id: BundleFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "sealed", label: "Sealed" },
];

const KIND_META: Record<
  StreamKind,
  { label: string; color: string; icon: IconName }
> = {
  board: { label: "Board", color: "var(--accent)", icon: "board" },
  agent: { label: "Agent", color: "var(--success)", icon: "robot" },
  git: { label: "Commit", color: "var(--label-5)", icon: "code" },
};

const INPUT =
  "w-full bg-card border border-border/80 rounded-md px-2.5 py-1.5 text-[11px] text-text placeholder:text-muted/50 outline-none focus:border-accent/70";

const DAY_MS = 86_400_000;

// ── Helpers ───────────────────────────────────────────────────────────────

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function dayLabel(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const delta = Math.round((today.getTime() - target.getTime()) / DAY_MS);
  if (delta === 0) return "Today";
  if (delta === 1) return "Yesterday";
  return target.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(target.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function relative(date: Date): string {
  const ms = Date.now() - date.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function clock(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fullDate(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return `${Math.round(ms / 1000)}s`;
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function shortNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1000) return String(value);
  return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatValue(value?: string): string {
  if (!value) return "—";
  return value.replace(/[_-]/g, " ");
}

function commitType(subject: string): string {
  const match = /^([a-zA-Z]+)(?:\([^)]*\))?!?:/.exec(subject);
  return (match?.[1] || "commit").toLowerCase();
}

function cleanSubject(subject: string): string {
  return subject.replace(/^([a-zA-Z]+)(?:\([^)]*\))?!?:\s*/, "") || subject;
}

function trailerValue(commit: GitCommit, key: string): string | undefined {
  return commit.trailers?.find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
}

function opMeta(op: string): { label: string; icon: IconName; color: string } {
  switch (op.toLowerCase()) {
    case "add":
      return { label: "Added", icon: "plus", color: "var(--success)" };
    case "move":
      return { label: "Moved", icon: "arrowFlat", color: "var(--accent-text)" };
    case "update":
      return { label: "Updated", icon: "pencil", color: "var(--warning)" };
    case "comment":
      return { label: "Commented", icon: "comment", color: "var(--muted-strong)" };
    case "remove":
    case "delete":
      return { label: "Removed", icon: "trash", color: "var(--danger)" };
    case "close":
    case "done":
      return { label: "Closed", icon: "check", color: "var(--success)" };
    case "link":
      return { label: "Linked", icon: "link", color: "var(--accent-text)" };
    case "checkpoint":
      return { label: "Checkpoint", icon: "history", color: "var(--muted-strong)" };
    default:
      return {
        label: op ? op.charAt(0).toUpperCase() + op.slice(1) : "Board",
        icon: "history",
        color: "var(--muted-strong)",
      };
  }
}

function bundleStatus(status: string): { label: string; color: string } {
  const s = (status || "").toLowerCase();
  if (s.includes("seal")) return { label: "Sealed", color: "var(--success)" };
  if (s.includes("approve")) return { label: "Approved", color: "var(--accent-text)" };
  if (s.includes("reject")) return { label: "Rejected", color: "var(--danger)" };
  if (s.includes("pending") || s.includes("open"))
    return { label: "Pending", color: "var(--warning)" };
  return { label: status || "Unknown", color: "var(--muted)" };
}

function matchesBoard(value: string | undefined, boardName: string | null): boolean {
  return !boardName || !value || value === boardName;
}

function eventsByDay(events: StreamEvent[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const key = dayKey(event.at);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: dayLabel(event.at), events: [] };
      groups.push(group);
    }
    group.events.push(event);
  }
  return groups;
}

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

// ── Small primitives ──────────────────────────────────────────────────────

function typeColor(type: string): string {
  switch ((type || "").toLowerCase()) {
    case "feat":
    case "feature":
      return "var(--accent-text)";
    case "fix":
    case "bug":
      return "var(--danger)";
    case "docs":
    case "doc":
      return "var(--label-5)";
    case "refactor":
      return "var(--warning)";
    case "test":
    case "tests":
      return "var(--success)";
    case "chore":
    case "commit":
      return "var(--muted)";
    default:
      return labelColor(type || "commit").color;
  }
}

function TypeChip({ type }: { type: string }) {
  const color = typeColor(type);
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[8.5px] font-medium uppercase tracking-[0.06em] shrink-0"
      style={{
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
    >
      {type || "commit"}
    </span>
  );
}

function ChurnBar({ additions = 0, deletions = 0 }: { additions?: number; deletions?: number }) {
  const total = additions + deletions;
  if (total <= 0) return <span className="text-[8.5px] text-muted/50">no diff</span>;
  const pct = Math.max(4, Math.round((additions / total) * 100));
  return (
    <span className="inline-flex w-12 h-1 rounded-full overflow-hidden bg-danger/60 shrink-0" title={`${additions} additions, ${deletions} deletions`}>
      <span className="h-full bg-success" style={{ width: `${pct}%` }} />
    </span>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full sm:w-[210px]">
      <Icon
        name="search"
        size={11}
        className="absolute left-2 top-1/2 -translate-y-1/2 text-muted/60 pointer-events-none"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-7 w-full bg-card border border-border/80 rounded-md pl-6 pr-6 text-[10.5px] text-text placeholder:text-muted/50 outline-none focus:border-accent/70"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted hover:text-text"
          aria-label="Clear search"
        >
          <Icon name="x" size={9} />
        </button>
      )}
    </div>
  );
}

function FilterPill({
  active,
  label,
  count,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-6 px-2 rounded-md text-[10.5px] inline-flex items-center gap-1 transition-colors ${
        active ? "bg-accent-soft text-accent-text" : "text-muted hover:text-text"
      }`}
    >
      {color && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: color }}
        />
      )}
      {label}
      {typeof count === "number" && (
        <span className="text-[8.5px] font-mono opacity-60">{count}</span>
      )}
    </button>
  );
}

function Banner({
  tone,
  children,
  onClose,
}: {
  tone: "success" | "danger";
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className={`mt-3 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[10px] ${
        tone === "success"
          ? "border-success/20 bg-success/5 text-success"
          : "border-danger/20 bg-danger/5 text-danger"
      }`}
    >
      <Icon name={tone === "success" ? "check" : "warn"} size={10} />
      <span className="min-w-0 flex-1">{children}</span>
      <button
        type="button"
        onClick={onClose}
        className="opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        <Icon name="x" size={9} />
      </button>
    </div>
  );
}

function EmptyState({
  icon = "history",
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-xl border border-border/80 bg-surface/20 flex flex-col items-center justify-center text-center px-6 py-12">
      <span className="w-9 h-9 rounded-full bg-card-hover text-muted flex items-center justify-center">
        <Icon name={icon} size={15} />
      </span>
      <div className="mt-2 text-[12px] text-text">{title}</div>
      <p className="mt-1 text-[10.5px] text-muted max-w-[320px] leading-relaxed">{hint}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="mt-4 space-y-2 animate-pulse">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="h-14 rounded-lg bg-surface/50" />
      ))}
    </div>
  );
}

// ── Activity pulse ────────────────────────────────────────────────────────

function ActivityPulse({ events }: { events: StreamEvent[] }) {
  const days = useMemo(() => {
    const base = startOfDay(new Date());
    const result: Array<{
      date: Date;
      key: string;
      counts: Record<StreamKind, number>;
      total: number;
    }> = [];
    for (let index = 13; index >= 0; index -= 1) {
      const date = new Date(base.getTime() - index * DAY_MS);
      const key = dayKey(date);
      const counts: Record<StreamKind, number> = { board: 0, agent: 0, git: 0 };
      for (const event of events) {
        if (dayKey(event.at) === key) counts[event.kind] += 1;
      }
      result.push({
        date,
        key,
        counts,
        total: counts.board + counts.agent + counts.git,
      });
    }
    return result;
  }, [events]);

  const max = Math.max(1, ...days.map((day) => day.total));
  const windowTotal = days.reduce((sum, day) => sum + day.total, 0);
  const counts: Record<StreamKind, number> = { board: 0, agent: 0, git: 0 };
  for (const event of events) counts[event.kind] += 1;

  return (
    <section className="rounded-xl border border-border/80 bg-surface/20 p-3">
      <div className="flex items-start gap-5 flex-wrap">
        <div className="min-w-[145px]">
          <div className="text-[9px] uppercase tracking-[0.14em] text-muted">Activity</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[24px] leading-none font-medium text-text tabular-nums">
              {events.length}
            </span>
            <span className="text-[10px] text-muted">
              {events.length === 1 ? "event" : "events"}
            </span>
          </div>
          <div className="mt-1.5 text-[9px] font-mono text-muted/60">
            {windowTotal} in the last 14 days
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {(["board", "agent", "git"] as const).map((kind) => (
              <span key={kind} className="inline-flex items-center gap-1.5 text-[9px] font-mono text-muted/80">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: KIND_META[kind].color }} />
                <span className="w-10">{KIND_META[kind].label}</span>
                <span className="text-muted-strong tabular-nums">{counts[kind]}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center justify-between text-[8.5px] font-mono uppercase tracking-[0.12em] text-muted/50 mb-1.5">
            <span>14-day pulse</span>
            <span>{plural(windowTotal, "event")}</span>
          </div>
          <div className="flex h-14 items-end gap-[3px] border-b border-border/60">
            {days.map((day) => (
              <div
                key={day.key}
                className="group flex-1 h-full flex flex-col justify-end gap-[1px] rounded-[1px] hover:bg-white/[0.03] transition-colors"
                title={`${day.date.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })} · ${day.total} events`}
              >
                {(["git", "agent", "board"] as const).map((kind) => {
                  const count = day.counts[kind];
                  if (!count) return null;
                  return (
                    <span
                      key={kind}
                      className="w-full rounded-[1px] opacity-75 group-hover:opacity-100 transition-opacity"
                      style={{
                        height: `${(count / max) * 100}%`,
                        background: KIND_META[kind].color,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[3px]">
            {days.map((day, index) => (
              <span
                key={day.key}
                className={`flex-1 text-center text-[8px] font-mono ${
                  index === days.length - 1 ? "text-accent-text" : "text-muted/45"
                }`}
              >
                {day.date.toLocaleDateString(undefined, { weekday: "narrow" })}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Stream row ────────────────────────────────────────────────────────────

function boardDescription(entry: HistoryEntry): React.ReactNode {
  switch (entry.op.toLowerCase()) {
    case "add":
      return (
        <>
          Added to <span className="font-mono text-muted-strong">{formatValue(entry.new_value) || "the board"}</span>
        </>
      );
    case "move":
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-muted-strong">{formatValue(entry.old_value)}</span>
          <span className="text-accent-text">→</span>
          <span className="font-mono text-accent-text">{formatValue(entry.new_value)}</span>
        </span>
      );
    case "update":
      return (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-muted-strong">{entry.field || "field"}</span>
          {entry.old_value || entry.new_value ? (
            <>
              <span className="text-muted/40">·</span>
              <span className="font-mono">{formatValue(entry.old_value)}</span>
              <span className="text-accent-text">→</span>
              <span className="font-mono text-accent-text">{formatValue(entry.new_value)}</span>
            </>
          ) : null}
        </span>
      );
    case "comment":
      return <span className="text-muted-strong">“{entry.new_value || "Comment"}”</span>;
    case "remove":
    case "delete":
      return <span>{entry.old_value ? `Removed “${entry.old_value}”` : "Removed from the board"}</span>;
    case "close":
    case "done":
      return <span>Closed · {formatValue(entry.new_value) || "done"}</span>;
    case "link":
      return <span>Linked to {entry.new_value || entry.card}</span>;
    default:
      return (
        <span>
          {entry.op} {entry.field ? <span className="font-mono text-muted-strong">{entry.field}</span> : null}
          {entry.new_value ? <span className="ml-1 font-mono text-accent-text">{formatValue(entry.new_value)}</span> : null}
        </span>
      );
  }
}

function StreamRow({
  event,
  board,
  onOpenCard,
  onInspect,
  onAssign,
}: {
  event: StreamEvent;
  board: Board | null;
  onOpenCard?: (card: Card) => void;
  onInspect: (sha: string) => void;
  onAssign: (commit: GitCommit) => void;
}) {
  let icon: IconName = KIND_META[event.kind].icon;
  let color = KIND_META[event.kind].color;
  let kindLabel = KIND_META[event.kind].label;
  let title = "";
  let titleNode: React.ReactNode = null;
  let description: React.ReactNode = null;
  let meta: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (event.entry) {
    const entry = event.entry;
    const op = opMeta(entry.op);
    const card = board?.cards.find((item) => item.id === entry.card);
    icon = op.icon;
    color = op.color;
    kindLabel = op.label;
    title = card?.title || entry.card;
    titleNode =
      card && onOpenCard ? (
        <button
          type="button"
          onClick={() => onOpenCard(card)}
          className="min-w-0 truncate text-left hover:text-accent-text transition-colors"
          title={title}
        >
          {title}
        </button>
      ) : (
        <span className="min-w-0 truncate" title={title}>
          {title}
        </span>
      );
    description = boardDescription(entry);
    meta = (
      <>
        <span style={{ color }} className="uppercase tracking-[0.1em]">
          {op.label}
        </span>
        <span className="text-muted/40">·</span>
        <span>{entry.board || "board"}</span>
        {entry.card && card && (
          <>
            <span className="text-muted/40">·</span>
            <button
              type="button"
              onClick={() => onOpenCard?.(card)}
              className="inline-flex items-center gap-1 text-muted/70 hover:text-accent-text transition-colors"
              title={`Open ${card.title}`}
            >
              <Icon name="board" size={9} />
              {entry.card}
            </button>
          </>
        )}
      </>
    );
  } else if (event.session) {
    const session = event.session;
    const dot = agentColor(session.agent, session.agent) || "var(--muted)";
    title = session.prompt || session.summary || "Agent session";
    titleNode = (
      <span className="min-w-0 truncate" title={title}>
        {title}
      </span>
    );
    if (session.prompt && session.summary) {
      description = <span className="text-muted-strong">{session.summary}</span>;
    } else if (session.model) {
      description = <span>{session.model}</span>;
    }
    meta = (
      <>
        <span className="uppercase tracking-[0.1em]" style={{ color }}>
          {kindLabel}
        </span>
        <span className="text-muted/40">·</span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
          {session.agent || "agent"}
        </span>
        {session.model && (
          <>
            <span className="text-muted/40">·</span>
            <span className="text-muted/60">{session.model}</span>
          </>
        )}
        {session.duration_ms ? (
          <>
            <span className="text-muted/40">·</span>
            <span>{duration(session.duration_ms)}</span>
          </>
        ) : null}
        {session.files_touched?.length ? (
          <>
            <span className="text-muted/40">·</span>
            <span>{plural(session.files_touched.length, "file")}</span>
          </>
        ) : null}
        {session.commit_sha && (
          <>
            <span className="text-muted/40">·</span>
            <button
              type="button"
              onClick={() => onInspect(session.commit_sha!)}
              className="inline-flex items-center gap-1 text-accent-text hover:text-accent-text/80"
              title={`Inspect ${session.commit_sha}`}
            >
              <Icon name="code" size={9} />
              {session.commit_sha.slice(0, 7)}
            </button>
          </>
        )}
      </>
    );
    actions = session.commit_sha ? (
      <button
        type="button"
        onClick={() => onInspect(session.commit_sha!)}
        className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-card-hover"
        title="Inspect commit"
        aria-label="Inspect commit"
      >
        <Icon name="code" size={11} />
      </button>
    ) : null;
  } else if (event.commit) {
    const commit = event.commit;
    const type = commitType(commit.subject);
    const cardId = trailerValue(commit, "card");
    const card = cardId ? board?.cards.find((item) => item.id === cardId) : undefined;
    title = cleanSubject(commit.subject) || "Untitled commit";
    titleNode = (
      <button
        type="button"
        onClick={() => onInspect(commit.sha)}
        className="min-w-0 truncate text-left hover:text-accent-text transition-colors"
        title={title}
      >
        {title}
      </button>
    );
    if (commit.body && commit.body.trim() && commit.body.trim() !== commit.subject.trim()) {
      description = <span className="line-clamp-2">{commit.body.trim()}</span>;
    }
    meta = (
      <>
        <TypeChip type={type} />
        <button
          type="button"
          onClick={() => onInspect(commit.sha)}
          className="font-mono text-accent-text hover:text-accent-text/80"
          title={`Inspect ${commit.sha}`}
        >
          {commit.sha.slice(0, 7)}
        </button>
        {commit.is_merge && (
          <>
            <span className="text-muted/40">·</span>
            <span className="text-warning">merge</span>
          </>
        )}
        <span className="text-muted/40">·</span>
        <span>{commit.author || "unknown"}</span>
        <span className="text-muted/40">·</span>
        <ChurnBar additions={commit.additions ?? 0} deletions={commit.deletions ?? 0} />
        <span className="text-success">+{shortNumber(commit.additions ?? 0)}</span>
        <span className="text-danger">-{shortNumber(commit.deletions ?? 0)}</span>
        {cardId && (
          <>
            <span className="text-muted/40">·</span>
            {card && onOpenCard ? (
              <button
                type="button"
                onClick={() => onOpenCard(card)}
                className="inline-flex items-center gap-1 text-muted/70 hover:text-accent-text transition-colors"
                title={`Open ${card.title}`}
              >
                <Icon name="board" size={9} />
                {card.title}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted/70">
                <Icon name="board" size={9} />
                {cardId}
              </span>
            )}
          </>
        )}
      </>
    );
    actions = (
      <>
        <button
          type="button"
          onClick={() => onInspect(commit.sha)}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-card-hover"
          title="Inspect diff"
          aria-label="Inspect diff"
        >
          <Icon name="code" size={11} />
        </button>
        <button
          type="button"
          onClick={() => onAssign(commit)}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-accent-text hover:bg-accent-soft"
          title="Assign to agent"
          aria-label="Assign to agent"
        >
          <Icon name="robot" size={11} />
        </button>
      </>
    );
  }

  return (
    <div className="relative py-2 group">
      <span
        className="absolute -left-8 top-1.5 w-7 h-7 rounded-md border flex items-center justify-center"
        style={{
          borderColor: `color-mix(in srgb, ${color} 35%, var(--border))`,
          background: `color-mix(in srgb, ${color} 10%, var(--card))`,
          color,
        }}
      >
        <Icon name={icon} size={12} />
      </span>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0 flex-1 text-[11.5px] font-medium text-text truncate">
              {titleNode}
            </div>
            <time
              dateTime={event.at.toISOString()}
              title={fullDate(event.at)}
              className="shrink-0 text-[9px] font-mono text-muted/55"
            >
              {relative(event.at)}
            </time>
          </div>
          {description && (
            <div className="mt-0.5 text-[10.5px] text-muted leading-snug line-clamp-2">
              {description}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[9px] font-mono text-muted/75">
            <span className="hidden sm:inline text-muted/45">{clock(event.at)}</span>
            {meta}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Commit row ────────────────────────────────────────────────────────────

function CommitRow({
  commit,
  last,
  board,
  onOpenCard,
  onInspect,
  onAssign,
}: {
  commit: GitCommit;
  last: boolean;
  board: Board | null;
  onOpenCard?: (card: Card) => void;
  onInspect: (sha: string) => void;
  onAssign: (commit: GitCommit) => void;
}) {
  const type = commitType(commit.subject);
  const date = parseDate(commit.date);
  const cardId = trailerValue(commit, "card");
  const card = cardId ? board?.cards.find((item) => item.id === cardId) : undefined;
  const files = commit.files_changed ?? [];

  return (
    <div className="flex gap-3 group">
      <div className="relative w-4 shrink-0">
        <span
          className={`absolute left-1/2 -translate-x-1/2 w-[1.5px] bg-border ${
            last ? "top-0 h-7" : "inset-y-0"
          }`}
        />
        <span
          className="absolute left-1/2 -translate-x-1/2 top-[17px] w-2.5 h-2.5 rounded-full border-2 border-card"
          style={{ background: "var(--label-5)" }}
        />
      </div>

      <div className={`min-w-0 flex-1 py-2.5 ${last ? "" : "border-b border-border/40"}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TypeChip type={type} />
              <button
                type="button"
                onClick={() => onInspect(commit.sha)}
                className="font-mono text-[8.5px] text-accent-text bg-surface border border-border/60 rounded px-1 py-0.5 hover:border-accent/40"
                title={`Inspect ${commit.sha}`}
              >
                {commit.sha.slice(0, 7)}
              </button>
              {commit.is_merge && (
                <span className="text-[8.5px] font-mono text-warning">merge</span>
              )}
              <span
                className="ml-auto text-[9px] font-mono text-muted/55"
                title={date ? fullDate(date) : commit.date}
              >
                {date ? relative(date) : ""}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onInspect(commit.sha)}
              className="mt-1 block max-w-full truncate text-left text-[11.5px] text-text hover:text-accent-text transition-colors"
              title={commit.subject}
            >
              {cleanSubject(commit.subject) || "Untitled commit"}
            </button>

            <div className="mt-1 flex items-center gap-2 flex-wrap text-[9px] font-mono text-muted/70">
              <span>{commit.author || "unknown"}</span>
              <span className="text-muted/40">·</span>
              <span>{plural(files.length, "file")}</span>
              <ChurnBar additions={commit.additions ?? 0} deletions={commit.deletions ?? 0} />
              <span className="text-success">+{shortNumber(commit.additions ?? 0)}</span>
              <span className="text-danger">-{shortNumber(commit.deletions ?? 0)}</span>
              {cardId && (
                <>
                  <span className="text-muted/40">·</span>
                  {card && onOpenCard ? (
                    <button
                      type="button"
                      onClick={() => onOpenCard(card)}
                      className="inline-flex items-center gap-1 text-muted/70 hover:text-accent-text transition-colors"
                      title={`Open ${card.title}`}
                    >
                      <Icon name="board" size={9} />
                      {card.title}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted/70">
                      <Icon name="board" size={9} />
                      {cardId}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onInspect(commit.sha)}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-card-hover"
              title="Inspect diff"
              aria-label="Inspect diff"
            >
              <Icon name="code" size={11} />
            </button>
            <button
              type="button"
              onClick={() => onAssign(commit)}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-accent-text hover:bg-accent-soft"
              title="Assign to agent"
              aria-label="Assign to agent"
            >
              <Icon name="robot" size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bundle card ───────────────────────────────────────────────────────────

function BundleCard({
  bundle,
  busy,
  board,
  onOpenCard,
  onApprove,
  onReject,
  onSeal,
  onInspect,
  onAssign,
}: {
  bundle: Bundle;
  busy: boolean;
  board: Board | null;
  onOpenCard?: (card: Card) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSeal: (id: string) => void;
  onInspect: (sha: string) => void;
  onAssign: (bundle: Bundle) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = bundleStatus(bundle.status);
  const rawStatus = bundle.status.toLowerCase();
  const isPending = rawStatus.includes("pending") || rawStatus.includes("open");
  const isSealed = rawStatus.includes("seal");
  const card = bundle.card_id ? board?.cards.find((item) => item.id === bundle.card_id) : undefined;
  const commits = bundle.commits ?? [];

  return (
    <article
      className={`rounded-xl border p-3 ${
        bundle.id.endsWith("-unsorted")
          ? "border-dashed border-border/70 bg-surface/10"
          : "border-border/80 bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TypeChip type={bundle.kind || "bundle"} />
            <span
              className="text-[8.5px] font-mono uppercase tracking-[0.08em]"
              style={{ color: status.color }}
            >
              {status.label}
            </span>
            <span className="font-mono text-[8.5px] text-muted/60 truncate max-w-[180px]" title={bundle.branch}>
              {bundle.branch}
            </span>
            {bundle.confidence > 0 && (
              <span className="text-[8.5px] font-mono text-muted/55">
                {Math.round(bundle.confidence * 100)}%
              </span>
            )}
          </div>

          <h3 className="mt-1 text-[12.5px] font-medium text-text leading-snug truncate" title={bundle.title}>
            {bundle.title}
          </h3>
          {bundle.summary && (
            <p className="mt-0.5 text-[10.5px] text-muted leading-relaxed line-clamp-2">{bundle.summary}</p>
          )}

          <div className="mt-2 flex items-center gap-2 flex-wrap text-[9px] font-mono text-muted/70">
            <span className="inline-flex items-center gap-1">
              <Icon name="history" size={9} />
              {bundle.commit_count} {bundle.commit_count === 1 ? "commit" : "commits"}
            </span>
            {bundle.first_sha && (
              <>
                <span className="text-muted/40">·</span>
                <span>
                  {bundle.first_sha.slice(0, 7)}
                  {bundle.last_sha && bundle.last_sha !== bundle.first_sha
                    ? `..${bundle.last_sha.slice(0, 7)}`
                    : ""}
                </span>
              </>
            )}
            {bundle.card_id && (
              <>
                <span className="text-muted/40">·</span>
                {card && onOpenCard ? (
                  <button
                    type="button"
                    onClick={() => onOpenCard(card)}
                    className="inline-flex items-center gap-1 text-muted/70 hover:text-accent-text transition-colors"
                    title={`Open ${card.title}`}
                  >
                    <Icon name="board" size={9} />
                    {bundle.card_id}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted/70">
                    <Icon name="board" size={9} />
                    {bundle.card_id}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[270px]">
          {isPending && (
            <button
              type="button"
              onClick={() => onApprove(bundle.id)}
              disabled={busy}
              className="h-6 px-2 rounded-md text-[9.5px] font-medium bg-success-soft text-success hover:opacity-85 disabled:opacity-40"
            >
              Approve
            </button>
          )}
          {!isSealed && (
            <button
              type="button"
              onClick={() => onReject(bundle.id)}
              disabled={busy}
              className="h-6 px-2 rounded-md text-[9.5px] font-medium bg-danger-soft text-danger hover:opacity-85 disabled:opacity-40"
            >
              Reject
            </button>
          )}
          {!isSealed && (
            <button
              type="button"
              onClick={() => onSeal(bundle.id)}
              disabled={busy}
              className="h-6 px-2 rounded-md text-[9.5px] font-medium bg-surface text-muted border border-border/70 hover:text-text disabled:opacity-40"
            >
              Seal
            </button>
          )}
          <button
            type="button"
            onClick={() => onAssign(bundle)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-accent-text hover:bg-accent-soft"
            title="Assign bundle to agent"
            aria-label="Assign bundle to agent"
          >
            <Icon name="robot" size={11} />
          </button>
          {commits.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-card-hover"
              title={expanded ? "Collapse commits" : "Expand commits"}
              aria-label={expanded ? "Collapse commits" : "Expand commits"}
              aria-expanded={expanded}
            >
              <span className={`inline-flex transition-transform ${expanded ? "" : "rotate-90"}`}>
                <Icon name="chevR" size={12} />
              </span>
            </button>
          )}
        </div>
      </div>

      {expanded && commits.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-0.5">
          {commits.map((commit) => {
            const date = parseDate(commit.date);
            return (
              <button
                key={commit.sha}
                type="button"
                onClick={() => onInspect(commit.sha)}
                className="w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-card-hover transition-colors"
              >
                <span className="font-mono text-[8.5px] text-muted/60 shrink-0">
                  {commit.sha.slice(0, 7)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-text" title={commit.subject}>
                  {commit.subject}
                </span>
                <span className="shrink-0 text-[8.5px] font-mono text-muted/50">
                  {date ? relative(date) : commit.date}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}

// ── Main HistoryView ──────────────────────────────────────────────────────

export function HistoryView({
  boardName,
  board = null,
  onEditCard,
}: {
  boardName: string | null;
  board?: Board | null;
  onEditCard?: (card: Card) => void;
}) {
  const [tab, setTab] = useState<Tab>("stream");
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState("HEAD");
  const [resolvedBranch, setResolvedBranch] = useState("HEAD");
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [streamFilter, setStreamFilter] = useState<StreamFilter>("all");
  const [commitFilter, setCommitFilter] = useState("all");
  const [bundleFilter, setBundleFilter] = useState<BundleFilter>("all");
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [bundleBusy, setBundleBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Commit diff inspector
  const [inspectSha, setInspectSha] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<GitDiffResponse | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Assign-to-agent dialog
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTitle, setAssignTitle] = useState("");
  const [assignDesc, setAssignDesc] = useState("");
  const [assignColumn, setAssignColumn] = useState("todo");
  const [assignPriority, setAssignPriority] = useState("medium");
  const [assignAgentId, setAssignAgentId] = useState("");
  const [assignSha, setAssignSha] = useState("");
  const [assignFiles, setAssignFiles] = useState<string[]>([]);
  const [assignCriteria, setAssignCriteria] = useState<string[]>([
    "Project acceptance tests pass cleanly",
    "Branch passes merge acceptance gate",
  ]);
  const [newCriterion, setNewCriterion] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setInspectSha(null);
      setAssignModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bundleRes, commitRes, agentRes, historyRes, sessionsRes] = await Promise.all([
        safe(fetchBundles(), { bundles: [] as Bundle[] }),
        safe(fetchGitCommits(branch === "HEAD" ? undefined : branch, 60), {
          branch: branch === "HEAD" ? "HEAD" : branch,
          branches: [] as string[],
          commits: [] as GitCommit[],
        }),
        safe(fetchAgentsList(), { agents: [] as AgentItem[] }),
        safe(fetchHistory(undefined, 300, boardName || undefined), [] as HistoryEntry[]),
        safe(
          fetchSessions(100, undefined, undefined, undefined, boardName || undefined),
          [] as SessionEntry[]
        ),
      ]);
      setBundles(bundleRes.bundles || []);
      setCommits(commitRes.commits || []);
      setBranches(commitRes.branches || []);
      if (commitRes.branch) setResolvedBranch(commitRes.branch);
      setAgents(agentRes.agents || []);
      setHistory(historyRes || []);
      setSessions(sessionsRes || []);
    } finally {
      setLoading(false);
    }
  }, [branch, boardName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!inspectSha) {
      setDiffData(null);
      return;
    }
    setLoadingDiff(true);
    fetchCommitDiff(inspectSha)
      .then((data) => setDiffData(data))
      .catch(() => setDiffData(null))
      .finally(() => setLoadingDiff(false));
  }, [inspectSha]);

  const boardHistory = useMemo(
    () => history.filter((entry) => matchesBoard(entry.board, boardName)),
    [history, boardName]
  );
  const boardSessions = useMemo(
    () => sessions.filter((session) => matchesBoard(session.board, boardName)),
    [sessions, boardName]
  );

  const allEvents = useMemo(() => {
    const events: StreamEvent[] = [];

    boardHistory.forEach((entry, index) => {
      const at = parseDate(entry.at);
      if (!at) return;
      events.push({
        id: `board-${index}-${entry.at}-${entry.card}`,
        kind: "board",
        at,
        entry,
      });
    });

    boardSessions.forEach((session) => {
      const at = parseDate(session.at);
      if (!at) return;
      events.push({
        id: `session-${session.id}`,
        kind: "agent",
        at,
        session,
      });
    });

    commits.forEach((commit) => {
      const at = parseDate(commit.date);
      if (!at) return;
      events.push({
        id: `commit-${commit.sha}`,
        kind: "git",
        at,
        commit,
      });
    });

    return events.sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [boardHistory, boardSessions, commits]);

  const streamCounts = useMemo(() => {
    const counts: Record<StreamKind, number> = { board: 0, agent: 0, git: 0 };
    for (const event of allEvents) counts[event.kind] += 1;
    return counts;
  }, [allEvents]);

  const filteredStream = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allEvents.filter((event) => {
      if (streamFilter !== "all" && event.kind !== streamFilter) return false;
      if (!query) return true;
      return eventSearchText(event, board).includes(query);
    });
  }, [allEvents, streamFilter, search, board]);

  const groupedStream = useMemo(() => eventsByDay(filteredStream), [filteredStream]);

  const commitTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const commit of commits) {
      const type = commitType(commit.subject);
      counts.set(type, (counts.get(type) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8);
  }, [commits]);

  const filteredCommits = useMemo(() => {
    const query = search.trim().toLowerCase();
    return commits
      .filter((commit) => {
        if (commitFilter !== "all" && commitType(commit.subject) !== commitFilter) return false;
        if (!query) return true;
        return [
          commit.subject,
          commit.body,
          commit.sha,
          commit.author,
          ...(commit.files_changed ?? []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const aTime = parseDate(a.date)?.getTime() ?? 0;
        const bTime = parseDate(b.date)?.getTime() ?? 0;
        return bTime - aTime;
      });
  }, [commits, commitFilter, search]);

  const commitAdditions = filteredCommits.reduce((sum, commit) => sum + (commit.additions ?? 0), 0);
  const commitDeletions = filteredCommits.reduce((sum, commit) => sum + (commit.deletions ?? 0), 0);

  const bundleCounts = useMemo(() => {
    const counts: Record<BundleFilter, number> = {
      all: bundles.length,
      pending: 0,
      approved: 0,
      sealed: 0,
    };
    for (const bundle of bundles) {
      const status = bundle.status.toLowerCase();
      if (status.includes("seal")) counts.sealed += 1;
      else if (status.includes("approve")) counts.approved += 1;
      else if (status.includes("pending") || status.includes("open")) counts.pending += 1;
    }
    return counts;
  }, [bundles]);

  const filteredBundles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bundles.filter((bundle) => {
      const status = bundle.status.toLowerCase();
      if (bundleFilter === "pending" && !(status.includes("pending") || status.includes("open"))) return false;
      if (bundleFilter === "approved" && !status.includes("approve")) return false;
      if (bundleFilter === "sealed" && !status.includes("seal")) return false;
      if (!query) return true;
      return [bundle.title, bundle.summary, bundle.branch, bundle.id, ...(bundle.commits ?? []).map((commit) => commit.subject)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [bundles, bundleFilter, search]);

  const branchOptions = useMemo(
    () => Array.from(new Set([resolvedBranch, ...branches].filter(Boolean))),
    [resolvedBranch, branches]
  );
  const branchValue = branch === "HEAD" ? resolvedBranch : branch;

  const switchTab = (next: Tab) => {
    setTab(next);
    setSearch("");
    setError(null);
  };

  const openAssignForCommit = (commit: GitCommit) => {
    setAssignSha(commit.sha);
    setAssignTitle(commit.subject);
    setAssignDesc(
      `Autonomous execution derived from commit ${commit.sha.slice(0, 8)} by ${
        commit.author || "Unknown"
      }.\n\n${commit.body || commit.subject || ""}`
    );
    setAssignFiles(Array.from(new Set(commit.files_changed ?? [])));
    if (agents.length > 0 && !assignAgentId) setAssignAgentId(agents[0].id);
    setAssignError(null);
    setAssignModalOpen(true);
  };

  const openAssignForBundle = (bundle: Bundle) => {
    setAssignSha(bundle.first_sha || "");
    setAssignTitle(bundle.title);
    setAssignDesc(
      `Bundle execution for [${bundle.title}] on ${bundle.branch}.\n\n${
        bundle.summary || "No summary"
      }`
    );
    setAssignFiles([]);
    if (agents.length > 0 && !assignAgentId) setAssignAgentId(agents[0].id);
    setAssignError(null);
    setAssignModalOpen(true);
  };

  const handleDispatch = async () => {
    if (!assignTitle.trim()) {
      setAssignError("Give the task a title first.");
      return;
    }
    setAssigning(true);
    setAssignError(null);
    try {
      const result = await assignCommitToAgent({
        board_name: boardName || undefined,
        commit_sha: assignSha || undefined,
        title: assignTitle.trim(),
        description: assignDesc.trim(),
        column: assignColumn,
        priority: assignPriority,
        agent_id: assignAgentId || undefined,
        files_context: assignFiles,
        acceptance_criteria: assignCriteria.filter((criterion) => criterion.trim().length > 0),
      });
      setAssignModalOpen(false);
      setInspectSha(null);
      setNotice(
        `Task ${result.card_id} created${result.agent_id ? ` for ${result.agent_id}` : " and queued"}.`
      );
      await loadData();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Could not assign that task.");
    } finally {
      setAssigning(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      await scanBundles();
      await loadData();
      setNotice("Bundle scan finished.");
    } catch {
      setError("Could not scan bundles.");
    } finally {
      setScanning(false);
    }
  };

  const handleBundleAction = async (id: string, action: "approve" | "reject" | "seal") => {
    setBundleBusy(id);
    setError(null);
    try {
      if (action === "approve") await approveBundle(id);
      if (action === "reject") await rejectBundle(id);
      if (action === "seal") await sealBundle(id);
      setNotice(
        `Bundle ${action === "approve" ? "approved" : action === "reject" ? "rejected" : "sealed"}.`
      );
      await loadData();
    } catch {
      setError(`Could not ${action} that bundle.`);
    } finally {
      setBundleBusy(null);
    }
  };

  const selectedCommit = inspectSha
    ? commits.find((commit) => commit.sha === inspectSha)
    : undefined;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 h-10 border-b border-border/70 shrink-0">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => switchTab(item.id)}
              className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] transition-colors ${
                active ? "text-text bg-white/[0.05]" : "text-muted hover:text-text hover:bg-white/[0.03]"
              }`}
            >
              <Icon name={item.icon} size={13} className={active ? "text-accent-text" : ""} />
              {item.label}
              {active && (
                <span className="absolute left-2 right-2 -bottom-[7px] h-[2px] rounded-full bg-accent" />
              )}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:inline text-[9px] font-mono text-muted/60">
            {boardName || "all boards"}
          </span>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-card-hover disabled:opacity-40"
            title="Refresh"
            aria-label="Refresh history"
          >
            <Icon name="refresh" size={11} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <div className="max-w-[1120px] mx-auto p-4">
          {tab === "stream" && (
            <>
              <header className="flex items-end justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-medium text-text">History</h2>
                    <span className="text-[9.5px] font-mono text-muted">{allEvents.length}</span>
                    {streamCounts.agent > 0 && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono text-success">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        {streamCounts.agent} agent {streamCounts.agent === 1 ? "session" : "sessions"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    Board changes, agent sessions, and commits in one stream.
                  </p>
                </div>
                <div className="text-right text-[9px] font-mono text-muted/60">
                  <div>{boardName ? `${boardName}.board` : "all boards"}</div>
                  <div className="mt-0.5">
                    {allEvents.length > 0 ? `updated ${relative(allEvents[0].at)}` : "no activity yet"}
                  </div>
                </div>
              </header>

              {error && <Banner tone="danger" onClose={() => setError(null)}>{error}</Banner>}
              {notice && !error && (
                <Banner tone="success" onClose={() => setNotice(null)}>{notice}</Banner>
              )}

              <div className="mt-3">
                <ActivityPulse events={allEvents} />
              </div>

              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {STREAM_FILTERS.map((filter) => (
                  <FilterPill
                    key={filter.id}
                    active={streamFilter === filter.id}
                    label={filter.label}
                    count={filter.id === "all" ? allEvents.length : streamCounts[filter.id as StreamKind]}
                    color={filter.id === "all" ? undefined : KIND_META[filter.id as StreamKind].color}
                    onClick={() => setStreamFilter(filter.id)}
                  />
                ))}
                <div className="ml-auto">
                  <SearchBox value={search} onChange={setSearch} placeholder="Search events…" />
                </div>
              </div>

              {loading && allEvents.length === 0 ? (
                <LoadingRows />
              ) : filteredStream.length === 0 ? (
                <EmptyState
                  icon="history"
                  title={allEvents.length === 0 ? "No activity yet" : "No events match"}
                  hint={
                    allEvents.length === 0
                      ? "Board edits, agent sessions, and commits will collect here as work happens."
                      : "Try another filter or clear the search to see the full stream."
                  }
                  action={
                    allEvents.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setStreamFilter("all");
                          setSearch("");
                        }}
                        className="h-7 px-2.5 rounded-md border border-border/80 text-[10.5px] text-muted hover:text-text"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                groupedStream.map((group) => (
                  <section key={group.key} className="mt-4">
                    <div className="sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-bg/95 backdrop-blur-sm flex items-center gap-2">
                      <span className="text-[9px] font-medium uppercase tracking-[0.13em] text-muted-strong">
                        {group.label}
                      </span>
                      <span className="text-[9px] font-mono text-muted/60">{group.events.length}</span>
                      <span className="flex-1 h-px bg-border/50" />
                    </div>
                    <div className="relative pl-8">
                      <span className="absolute left-[13px] top-4 bottom-4 w-px bg-border/70" />
                      {group.events.map((event) => (
                        <StreamRow
                          key={event.id}
                          event={event}
                          board={board}
                          onOpenCard={onEditCard}
                          onInspect={setInspectSha}
                          onAssign={openAssignForCommit}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </>
          )}

          {tab === "commits" && (
            <>
              <header className="flex items-end justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-medium text-text">Commits</h2>
                    <span className="text-[9.5px] font-mono text-muted">{filteredCommits.length}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    Repository history, diffs, and one-click agent handoff.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline-flex items-center gap-2 text-[9px] font-mono text-muted/70">
                    <span className="text-success">+{shortNumber(commitAdditions)}</span>
                    <span className="text-danger">-{shortNumber(commitDeletions)}</span>
                  </span>
                  {branchOptions.length > 0 ? (
                    <select
                      value={branchValue}
                      onChange={(event) => setBranch(event.target.value)}
                      className="h-7 max-w-[180px] bg-card border border-border/80 rounded-md px-2 text-[10.5px] text-text outline-none focus:border-accent/70"
                      aria-label="Branch"
                    >
                      {branchOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[9px] font-mono text-muted/60">{resolvedBranch}</span>
                  )}
                </div>
              </header>

              {error && <Banner tone="danger" onClose={() => setError(null)}>{error}</Banner>}
              {notice && !error && (
                <Banner tone="success" onClose={() => setNotice(null)}>{notice}</Banner>
              )}

              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                <FilterPill
                  active={commitFilter === "all"}
                  label="All"
                  count={commits.length}
                  onClick={() => setCommitFilter("all")}
                />
                {commitTypeCounts.map(([type, count]) => (
                  <FilterPill
                    key={type}
                    active={commitFilter === type}
                    label={type}
                    count={count}
                    color={typeColor(type)}
                    onClick={() => setCommitFilter(type)}
                  />
                ))}
                <div className="ml-auto">
                  <SearchBox value={search} onChange={setSearch} placeholder="Search commits…" />
                </div>
              </div>

              {loading && commits.length === 0 ? (
                <LoadingRows />
              ) : filteredCommits.length === 0 ? (
                <EmptyState
                  icon="branch"
                  title={commits.length === 0 ? "No commits yet" : "No commits match"}
                  hint={
                    commits.length === 0
                      ? "This repository has no commit history to show on this branch."
                      : "Try another type or clear the search."
                  }
                  action={
                    commits.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCommitFilter("all");
                          setSearch("");
                        }}
                        className="h-7 px-2.5 rounded-md border border-border/80 text-[10.5px] text-muted hover:text-text"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="mt-3 rounded-xl border border-border/80 bg-surface/10 overflow-hidden">
                  <div className="h-8 px-3 border-b border-border/60 flex items-center gap-2">
                    <span className="text-[8.5px] font-mono uppercase tracking-[0.13em] text-muted/60">
                      Commit timeline
                    </span>
                    <span className="text-[8.5px] font-mono text-muted/40">
                      {resolvedBranch}
                    </span>
                    <span className="ml-auto text-[8.5px] font-mono text-muted/50">
                      {filteredCommits.length} of {commits.length}
                    </span>
                  </div>
                  <div className="px-3 py-1">
                    {filteredCommits.map((commit, index) => (
                      <CommitRow
                        key={commit.sha}
                        commit={commit}
                        last={index === filteredCommits.length - 1}
                        board={board}
                        onOpenCard={onEditCard}
                        onInspect={setInspectSha}
                        onAssign={openAssignForCommit}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "bundles" && (
            <>
              <header className="flex items-end justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-medium text-text">Bundles</h2>
                    <span className="text-[9.5px] font-mono text-muted">{bundles.length}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    Reviewable slices of agent work, grouped from commits.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleScan}
                  disabled={scanning}
                  className="h-7 px-2.5 rounded-md bg-accent text-white text-[10.5px] font-medium hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Icon
                    name={scanning ? "refresh" : "spark"}
                    size={11}
                    className={scanning ? "animate-spin" : ""}
                  />
                  {scanning ? "Scanning…" : "Scan bundles"}
                </button>
              </header>

              {error && <Banner tone="danger" onClose={() => setError(null)}>{error}</Banner>}
              {notice && !error && (
                <Banner tone="success" onClose={() => setNotice(null)}>{notice}</Banner>
              )}

              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                {BUNDLE_FILTERS.map((filter) => (
                  <FilterPill
                    key={filter.id}
                    active={bundleFilter === filter.id}
                    label={filter.label}
                    count={bundleCounts[filter.id]}
                    onClick={() => setBundleFilter(filter.id)}
                  />
                ))}
                <div className="ml-auto">
                  <SearchBox value={search} onChange={setSearch} placeholder="Search bundles…" />
                </div>
              </div>

              {loading && bundles.length === 0 ? (
                <LoadingRows />
              ) : filteredBundles.length === 0 ? (
                <EmptyState
                  icon="layers"
                  title={bundles.length === 0 ? "No bundles yet" : "No bundles match"}
                  hint={
                    bundles.length === 0
                      ? "Scan commit history to group related work into reviewable bundles."
                      : "Try another status or clear the search."
                  }
                  action={
                    bundles.length === 0 ? (
                      <button
                        type="button"
                        onClick={handleScan}
                        disabled={scanning}
                        className="h-7 px-2.5 rounded-md bg-accent text-white text-[10.5px] font-medium hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Icon name="spark" size={11} />
                        {scanning ? "Scanning…" : "Scan bundles"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setBundleFilter("all");
                          setSearch("");
                        }}
                        className="h-7 px-2.5 rounded-md border border-border/80 text-[10.5px] text-muted hover:text-text"
                      >
                        Clear filters
                      </button>
                    )
                  }
                />
              ) : (
                <div className="mt-3 space-y-2">
                  {filteredBundles.map((bundle) => (
                    <BundleCard
                      key={bundle.id}
                      bundle={bundle}
                      busy={bundleBusy === bundle.id}
                      board={board}
                      onOpenCard={onEditCard}
                      onApprove={(id) => handleBundleAction(id, "approve")}
                      onReject={(id) => handleBundleAction(id, "reject")}
                      onSeal={(id) => handleBundleAction(id, "seal")}
                      onInspect={setInspectSha}
                      onAssign={openAssignForBundle}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Commit diff inspector */}
      {inspectSha && (
        <>
          <div
            className="fixed inset-0 z-40 bg-scrim animate-in fade-in duration-150"
            onClick={() => setInspectSha(null)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Commit diff"
            className="fixed inset-y-0 right-0 z-50 w-full max-w-[640px] bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          >
            <header className="h-12 px-3 border-b border-border/80 flex items-center gap-2 shrink-0">
              <span className="font-mono text-[9px] text-accent-text bg-surface border border-border/70 rounded px-1.5 py-0.5 shrink-0">
                {inspectSha.slice(0, 8)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-text truncate">
                  {selectedCommit ? cleanSubject(selectedCommit.subject) : "Commit diff"}
                </div>
                <div className="text-[9px] font-mono text-muted/60 truncate">
                  {selectedCommit ? `${selectedCommit.author} · ${commitType(selectedCommit.subject)}` : "Inspecting commit"}
                </div>
              </div>
              {selectedCommit && (
                <button
                  type="button"
                  onClick={() => openAssignForCommit(selectedCommit)}
                  className="h-7 px-2 rounded-md bg-accent-soft text-accent-text text-[10px] font-medium hover:bg-accent hover:text-white transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Icon name="robot" size={10} />
                  Assign
                </button>
              )}
              <button
                type="button"
                onClick={() => setInspectSha(null)}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-card-hover shrink-0"
                aria-label="Close diff"
              >
                <Icon name="x" size={14} />
              </button>
            </header>

            <div className="flex-1 overflow-auto p-3 space-y-3 font-mono text-[10.5px]">
              {loadingDiff ? (
                <div className="py-12 text-center text-[11px] text-muted">Loading diff…</div>
              ) : diffData ? (
                <>
                  <div className="rounded-lg border border-border/70 bg-surface/30 p-3 space-y-2">
                    <div className="text-[11.5px] font-sans text-text whitespace-pre-wrap line-clamp-4">
                      {diffData.message}
                    </div>
                    <div className="flex items-center gap-3 text-[9px] text-muted border-t border-border/50 pt-2 flex-wrap">
                      <span className="text-success">+{diffData.additions}</span>
                      <span className="text-danger">-{diffData.deletions}</span>
                      <span>{plural(diffData.files_changed.length, "file")}</span>
                      {selectedCommit && (
                        <>
                          <span className="text-muted/40">·</span>
                          <span>{selectedCommit.author}</span>
                          {parseDate(selectedCommit.date) && (
                            <>
                              <span className="text-muted/40">·</span>
                              <span>{fullDate(parseDate(selectedCommit.date)!)}</span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {diffData.files_changed.length > 0 && (
                    <div>
                      <div className="text-[8.5px] font-sans uppercase tracking-[0.13em] text-muted/60 mb-1.5">
                        Files
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {diffData.files_changed.map((file) => (
                          <span
                            key={file}
                            className="px-1.5 py-0.5 rounded border border-border/70 bg-surface text-muted-strong text-[9px] break-all max-w-full"
                          >
                            {file}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-[8.5px] font-sans uppercase tracking-[0.13em] text-muted/60 mb-1.5">
                      Unified diff
                    </div>
                    <div className="rounded-lg border border-border/70 bg-surface/30 p-2.5 overflow-x-auto text-[10px] leading-relaxed">
                      {diffData.diff ? (
                        diffData.diff.split("\n").map((line, index) => {
                          const isAdd = line.startsWith("+") && !line.startsWith("+++");
                          const isDel = line.startsWith("-") && !line.startsWith("---");
                          const isHeader = line.startsWith("@@") || line.startsWith("diff --git");
                          return (
                            <div
                              key={index}
                              className={`whitespace-pre px-1 rounded-sm ${
                                isAdd
                                  ? "bg-success-soft text-success"
                                  : isDel
                                    ? "bg-danger-soft text-danger"
                                    : isHeader
                                      ? "text-accent-text font-semibold"
                                      : "text-muted"
                              }`}
                            >
                              {line || " "}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-muted">No text changes in this commit.</div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-[11px] text-muted">
                  Could not load this diff.
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {/* Assign-to-agent dialog */}
      {assignModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim animate-in fade-in duration-150"
          onClick={() => setAssignModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Assign to agent"
            className="w-full max-w-[520px] max-h-[88vh] overflow-auto rounded-xl border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-border/80 flex items-start gap-2.5">
              <span className="w-7 h-7 rounded-md bg-accent-soft text-accent-text flex items-center justify-center shrink-0">
                <Icon name="robot" size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[13px] font-medium text-text">Assign to agent</h3>
                <p className="mt-0.5 text-[10px] text-muted">
                  Create an isolated task with context and an acceptance gate.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-card-hover"
                aria-label="Close"
              >
                <Icon name="x" size={14} />
              </button>
            </header>

            <div className="p-4 space-y-3">
              <label className="block">
                <span className="block text-[9px] uppercase tracking-[0.12em] text-muted mb-1">
                  Task title
                </span>
                <input
                  value={assignTitle}
                  onChange={(event) => setAssignTitle(event.target.value)}
                  className={INPUT}
                  autoFocus
                />
              </label>

              <label className="block">
                <span className="block text-[9px] uppercase tracking-[0.12em] text-muted mb-1">
                  Intent & context
                </span>
                <textarea
                  rows={3}
                  value={assignDesc}
                  onChange={(event) => setAssignDesc(event.target.value)}
                  className={`${INPUT} resize-none leading-relaxed`}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[9px] uppercase tracking-[0.12em] text-muted mb-1">
                    Agent
                  </span>
                  <select
                    value={assignAgentId}
                    onChange={(event) => setAssignAgentId(event.target.value)}
                    className={INPUT}
                  >
                    <option value="">Auto dispatch</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.role})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[9px] uppercase tracking-[0.12em] text-muted mb-1">
                    Priority
                  </span>
                  <select
                    value={assignPriority}
                    onChange={(event) => setAssignPriority(event.target.value)}
                    className={INPUT}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
              </div>

              {assignFiles.length > 0 && (
                <div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-muted mb-1">
                    Context files ({assignFiles.length})
                  </div>
                  <div className="max-h-20 overflow-auto rounded-md border border-border/70 bg-surface/40 p-2 space-y-0.5">
                    {assignFiles.map((file) => (
                      <div key={file} className="font-mono text-[9.5px] text-muted-strong truncate">
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[9px] uppercase tracking-[0.12em] text-muted mb-1">
                  Acceptance gate
                </div>
                <div className="space-y-1 mb-1.5">
                  {assignCriteria.map((criterion, index) => (
                    <div
                      key={`${criterion}-${index}`}
                      className="flex items-center gap-2 rounded-md bg-surface/50 px-2 py-1 text-[10px] text-text"
                    >
                      <span className="text-success">✓</span>
                      <span className="min-w-0 flex-1 truncate">{criterion}</span>
                      <button
                        type="button"
                        onClick={() => setAssignCriteria(assignCriteria.filter((_, i) => i !== index))}
                        className="text-muted hover:text-danger"
                        aria-label="Remove criterion"
                      >
                        <Icon name="x" size={9} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={newCriterion}
                    onChange={(event) => setNewCriterion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && newCriterion.trim()) {
                        event.preventDefault();
                        setAssignCriteria([...assignCriteria, newCriterion.trim()]);
                        setNewCriterion("");
                      }
                    }}
                    placeholder="Add a test or verification…"
                    className={`${INPUT} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newCriterion.trim()) return;
                      setAssignCriteria([...assignCriteria, newCriterion.trim()]);
                      setNewCriterion("");
                    }}
                    className="h-[30px] px-2.5 rounded-md border border-border/80 text-[10.5px] text-muted hover:text-text"
                  >
                    Add
                  </button>
                </div>
              </div>

              {assignError && (
                <p className="flex items-center gap-1.5 text-[10px] text-danger">
                  <Icon name="warn" size={10} />
                  {assignError}
                </p>
              )}
            </div>

            <footer className="px-4 py-3 border-t border-border/80 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="h-7 px-2.5 rounded-md text-[10.5px] text-muted hover:text-text hover:bg-card-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDispatch}
                disabled={assigning || !assignTitle.trim()}
                className="h-7 px-2.5 rounded-md bg-accent text-white text-[10.5px] font-medium hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5"
              >
                <Icon name={assigning ? "refresh" : "spark"} size={11} className={assigning ? "animate-spin" : ""} />
                {assigning ? "Dispatching…" : "Dispatch to worktree"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function eventSearchText(event: StreamEvent, board: Board | null): string {
  if (event.entry) {
    const entry = event.entry;
    const card = board?.cards.find((item) => item.id === entry.card);
    return [
      entry.op,
      entry.board,
      entry.card,
      card?.title,
      entry.old_value,
      entry.new_value,
      entry.field,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  if (event.session) {
    const session = event.session;
    return [
      session.agent,
      session.model,
      session.board,
      session.prompt,
      session.summary,
      session.commit_sha,
      ...(session.files_touched ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  if (event.commit) {
    const commit = event.commit;
    const cardId = trailerValue(commit, "card");
    const card = cardId ? board?.cards.find((item) => item.id === cardId) : undefined;
    return [
      commit.subject,
      commit.body,
      commit.sha,
      commit.author,
      cardId,
      card?.title,
      ...(commit.files_changed ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  return "";
}
