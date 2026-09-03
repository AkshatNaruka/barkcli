import React, { useMemo, useState } from "react";
import type { Board as BoardType, Card, Sprint } from "../lib/types";
import { Icon } from "./Icon";

interface Props {
  board: BoardType;
  sprints: Sprint[];
  onEditCard: (card: Card) => void;
  onAddCard: (date: string) => void;
}

const SPRINT_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#14b8a6",
  "#6366f1",
  "#10b981",
  "#ef4444",
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CELL_CARDS = 3;

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sprintNameOf(card: Card): string | undefined {
  return card.labels.find((l) => l.startsWith("sprint:"))?.slice(7);
}

function sprintColor(name: string | undefined, sprints: Sprint[]): string | undefined {
  if (!name) return undefined;
  const idx = sprints.findIndex((s) => s.name === name);
  if (idx >= 0) return SPRINT_COLORS[idx % SPRINT_COLORS.length];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SPRINT_COLORS[h % SPRINT_COLORS.length];
}

function remindState(card: Card): "overdue" | "soon" | null {
  if (!card.remind_at) return null;
  const t = Date.parse(card.remind_at);
  if (Number.isNaN(t)) return null;
  const diff = t - Date.now();
  if (diff < 0) return "overdue";
  if (diff <= 24 * 3600 * 1000) return "soon";
  return null;
}

function checkProgress(card: Card): string {
  if (card.checklist.length === 0) return "";
  const done = card.checklist.filter((i) => i.done).length;
  return `${done}/${card.checklist.length}`;
}

export function CalendarView({ board, sprints, onEditCard, onAddCard }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [filter, setFilter] = useState<string | null>(null);
  const [dayModal, setDayModal] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const todayStr = toDateStr(today);

  const cardsByDate = useMemo(() => {
    const map: Record<string, Card[]> = {};
    for (const card of board.cards) {
      if (!card.due_date) continue;
      const d = card.due_date.slice(0, 10);
      if (filter && sprintNameOf(card) !== filter) continue;
      if (!map[d]) map[d] = [];
      map[d].push(card);
    }
    return map;
  }, [board.cards, filter]);

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const activeSprints = useMemo(() => {
    return sprints.filter((s) => {
      const start = s.start || "";
      const end = s.end || "";
      return start <= end || end === "";
    });
  }, [sprints]);

  const sortedCards = useMemo(() => [...board.cards], [board.cards]);

  // ── Agenda sidebar data ──
  const { overdue, dueToday, upcoming, backlog } = useMemo(() => {
    const overdue: Card[] = [];
    const dueToday: Card[] = [];
    const upcoming: Card[] = [];
    const backlog: Card[] = [];
    const weekEnd = toDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));
    for (const card of sortedCards) {
      if (filter && sprintNameOf(card) !== filter) continue;
      if (card.column === "done") continue;
      const due = card.due_date?.slice(0, 10);
      if (!due) {
        backlog.push(card);
      } else if (due < todayStr) {
        overdue.push(card);
      } else if (due === todayStr) {
        dueToday.push(card);
      } else if (due <= weekEnd) {
        upcoming.push(card);
      }
    }
    overdue.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    upcoming.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    return { overdue, dueToday, upcoming, backlog };
  }, [sortedCards, filter, todayStr]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayCards = (dateStr: string | null): Card[] => (dateStr ? cardsByDate[dateStr] || [] : []);
  const modalCards = dayModal ? cardsByDate[dayModal] || [] : [];

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden">
      {/* Calendar grid */}
      <div className="flex-1 p-4 overflow-auto min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-text">
            {MONTHS[month]} {year}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="px-2 py-1 text-xs rounded border border-border text-muted hover:text-text hover:border-border-strong transition-colors"
            >
              ‹
            </button>
            <button
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              className={`px-2.5 py-1 text-xs rounded border border-border transition-colors ${
                year === today.getFullYear() && month === today.getMonth()
                  ? "text-accent border-accent"
                  : "text-muted hover:text-text hover:border-border-strong"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="px-2 py-1 text-xs rounded border border-border text-muted hover:text-text hover:border-border-strong transition-colors"
            >
              ›
            </button>
          </div>
        </div>

        {/* Sprint chips */}
        {activeSprints.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[10px] font-medium text-muted uppercase tracking-wider mr-1">
              Sprints
            </span>
            <button
              onClick={() => setFilter(null)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                filter === null ? "bg-card text-text border-border-strong" : "text-muted border-border hover:text-text"
              }`}
            >
              All
            </button>
            {activeSprints.map((s) => {
              const color = sprintColor(s.name, sprints);
              const active = filter === s.name;
              const ended = s.end ? s.end < todayStr : false;
              return (
                <button
                  key={s.name}
                  onClick={() => setFilter(active ? null : s.name)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    active ? "text-text border-border-strong" : "text-muted border-border hover:text-text"
                  }`}
                  style={{ borderLeftColor: color, borderLeftWidth: 3 }}
                  title={`${s.start || "?"} → ${s.end || "?"}`}
                >
                  {ended ? "○" : "●"} {s.name}
                  {s.end ? ` · ${s.end}` : ""}
                </button>
              );
            })}
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-7 gap-1">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted py-2 border-b border-border">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={i} className="min-h-[90px] border rounded bg-transparent border-transparent" />;
            }
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const cards = dayCards(dateStr);
            const isToday = dateStr === todayStr;
            const hasOverdue = cards.some((c) => c.due_date && c.due_date.slice(0, 10) < todayStr && c.column !== "done");
            const visible = cards.slice(0, MAX_CELL_CARDS);
            const more = cards.length - visible.length;
            return (
              <div
                key={i}
                onClick={() => onAddCard(dateStr)}
                className={`min-h-[90px] border rounded p-1 cursor-pointer transition-colors ${
                  isToday
                    ? "bg-accent-soft border-accent"
                    : hasOverdue
                      ? "bg-danger-soft/40 border-danger/30 hover:border-danger"
                      : "bg-surface border-border hover:border-border-strong"
                }`}
                title="Click to add a card on this date"
              >
                <div className={`text-xs mb-1 inline-flex items-center gap-1 ${isToday ? "text-accent font-bold" : hasOverdue ? "text-danger font-semibold" : "text-muted"}`}>
                  {day}
                  {hasOverdue && <Icon name="warn" size={11} />}
                </div>
                {visible.map((c) => (
                  <CardChip key={c.id} card={c} todayStr={todayStr} sprints={sprints} onEditCard={onEditCard} />
                ))}
                {more > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDayModal(dateStr); }}
                    className="block w-full text-left text-[10px] text-muted hover:text-accent pl-1.5 py-0.5 transition-colors"
                  >
                    +{more} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda sidebar */}
      <aside className="lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-border p-4 overflow-y-auto">
        <h3 className="text-sm font-bold text-text mb-3">Agenda</h3>

        <AgendaSection title="Overdue" count={overdue.length} tone="danger">
          {overdue.map((c) => (
            <AgendaItem key={c.id} card={c} sprints={sprints} onEditCard={onEditCard} />
          ))}
        </AgendaSection>

        <AgendaSection title="Today" count={dueToday.length} tone="accent">
          {dueToday.map((c) => (
            <AgendaItem key={c.id} card={c} sprints={sprints} onEditCard={onEditCard} />
          ))}
        </AgendaSection>

        <AgendaSection title="Next 7 days" count={upcoming.length}>
          {upcoming.map((c) => (
            <AgendaItem key={c.id} card={c} sprints={sprints} onEditCard={onEditCard} />
          ))}
        </AgendaSection>

        <AgendaSection title="Backlog · no date" count={backlog.length}>
          {backlog.map((c) => (
            <AgendaItem key={c.id} card={c} sprints={sprints} onEditCard={onEditCard} />
          ))}
        </AgendaSection>
      </aside>

      {/* Day modal */}
      {dayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDayModal(null)}>
          <div className="bg-card rounded-xl border border-border shadow-2xl w-full max-w-md mx-4 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-text">{dayModal}</h3>
              <button onClick={() => setDayModal(null)} className="text-muted hover:text-text">✕</button>
            </div>
            <div className="p-4 space-y-2">
              {modalCards.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">No cards this day</p>
              ) : (
                modalCards.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setDayModal(null); onEditCard(c); }}
                    className="block w-full text-left bg-surface border border-border rounded-lg p-3 hover:border-border-strong transition-colors"
                  >
                    <div className="text-sm text-text">{c.title}</div>
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {c.column !== "done" ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-danger-soft text-danger">due</span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface border border-border text-muted">done</span>
                      )}
                      {sprintNameOf(c) && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-muted">{sprintNameOf(c)}</span>
                      )}
                      {checkProgress(c) && (
                        <span className="text-[10px] text-muted font-mono">✓ {checkProgress(c)}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Card chip inside a day cell ── */

function CardChip({ card, todayStr, sprints, onEditCard }: { card: Card; todayStr: string; sprints: Sprint[]; onEditCard: (c: Card) => void }) {
  const done = card.column === "done";
  const overdue = card.due_date && card.due_date.slice(0, 10) < todayStr && !done;
  const remind = remindState(card);
  const color = sprintColor(sprintNameOf(card), sprints);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onEditCard(card); }}
      className={`block w-full text-left text-[10px] font-medium rounded px-1.5 py-0.5 mb-0.5 truncate transition-colors border border-transparent ${
        done ? "text-muted line-through opacity-60" : overdue ? "text-danger" : "text-text"
      } hover:border-border-strong`}
      title={`${card.title}${card.remind_at ? " · reminder " + card.remind_at : ""}`}
      style={color ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined}
    >
      {remind && (
        <span className={`inline-flex mr-0.5 align-[-1px] ${remind === "overdue" ? "text-danger" : "text-amber-500"}`}>
          <Icon name="bell" size={10} />
        </span>
      )}
      {card.title}
    </button>
  );
}

/* ── Agenda section + item ── */

function AgendaSection({ title, count, tone, children }: { title: string; count: number; tone?: "danger" | "accent"; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-muted"}`}>
          {title}
        </span>
        <span className="text-[10px] text-muted bg-surface border border-border px-1.5 rounded-full">{count}</span>
      </div>
      <div className="space-y-1.5">
        {children}
        {count === 0 && <p className="text-xs text-muted pl-0.5">—</p>}
      </div>
    </div>
  );
}

function AgendaItem({ card, sprints, onEditCard }: { card: Card; sprints: Sprint[]; onEditCard: (c: Card) => void }) {
  const sprint = sprintNameOf(card);
  const color = sprintColor(sprint, sprints);
  const progress = checkProgress(card);
  return (
    <button
      onClick={() => onEditCard(card)}
      className="block w-full text-left bg-surface border border-border rounded-lg p-2.5 hover:border-border-strong transition-colors"
    >
      <div className="flex items-start gap-2">
        {color && <span className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: color }} />}
        <div className="min-w-0 flex-1">
          <div className="text-xs text-text truncate">{card.title}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {card.due_date && (
              <span className={`text-[10px] font-mono ${card.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10) ? "text-danger" : "text-muted"}`}>
                {card.due_date.slice(0, 10)}
              </span>
            )}
            {card.priority !== "medium" && (
              <span className={`text-[10px] ${card.priority === "high" ? "text-danger" : "text-muted"}`}>{card.priority}</span>
            )}
            {sprint && (
              <span className="text-[10px] text-muted rounded px-1 bg-surface border border-border">{sprint}</span>
            )}
            {progress && <span className="text-[10px] text-muted font-mono ml-auto">✓ {progress}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}
