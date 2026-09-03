import React, { useState, useMemo } from "react";
import type { Board as BoardType, Card } from "../lib/types";
import { useTheme } from "../lib/theme.tsx";
import { navigate, type Route } from "../lib/hashnav";
import { Icon, type IconName } from "./Icon";

interface Props {
  board: BoardType;
  onClose: () => void;
  onNavigate: (colId: string, cardId: string) => void;
  onAddCard: (colId: string) => void;
  onEditCard: (card: Card) => void;
}

const VIEWS: { route: Route; label: string; icon: IconName }[] = [
  { route: "mind", label: "Go to Mind", icon: "spark" },
  { route: "board", label: "Go to Board", icon: "board" },
  { route: "agents", label: "Go to Agents", icon: "users" },
  { route: "specs", label: "Go to Specs", icon: "layers" },
  { route: "memory", label: "Go to Memory", icon: "db" },
  { route: "code", label: "Go to Code", icon: "code" },
];

export function CommandPalette({ board, onClose, onAddCard, onEditCard }: Props) {
  const [query, setQuery] = useState("");
  const { setTheme } = useTheme();

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const items: { label: string; icon: IconName; action: () => void }[] = [];

    // View navigation (DESIGN.md §3.6 — ⌘K does everything)
    for (const v of VIEWS) {
      if (v.label.toLowerCase().includes(q) || `go to ${v.route}`.includes(q)) {
        items.push({ label: v.label, icon: v.icon, action: () => { navigate(v.route); onClose(); } });
      }
    }
    if ("sync mind".includes(q)) {
      items.push({
        label: "Sync mind",
        icon: "refresh",
        action: () => {
          fetch("/api/mind").then(() => {}).catch(() => {});
          navigate("mind");
          onClose();
        },
      });
    }

    // Cards
    for (const card of board.cards) {
      if (card.title.toLowerCase().includes(q)) {
        items.push({ label: `${card.title} — ${card.column}`, icon: "board", action: () => { onEditCard(card); onClose(); } });
      }
    }

    // Commands
    if ("new card".includes(q)) items.push({ label: "New card", icon: "board", action: () => { onAddCard(board.columns[0]?.id || "todo"); onClose(); } });
    for (const col of board.columns) {
      if (`add to ${col.name}`.toLowerCase().includes(q)) items.push({ label: `Add to ${col.name}`, icon: "board", action: () => { onAddCard(col.id); onClose(); } });
    }
    if ("theme black".includes(q)) items.push({ label: "Black theme", icon: "moon", action: () => { setTheme("black"); onClose(); } });
    if ("theme light".includes(q)) items.push({ label: "Light theme", icon: "sun", action: () => { setTheme("light"); onClose(); } });
    if ("theme system".includes(q)) items.push({ label: "System theme", icon: "monitor", action: () => { setTheme("system"); onClose(); } });

    return items.slice(0, 10);
  }, [query, board, onClose, onAddCard, onEditCard, setTheme]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15%] bg-black/60" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-[var(--shadow)] w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 bg-transparent text-text text-sm outline-none placeholder:text-muted border-b border-border"
          placeholder="Search cards or type a command..."
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        />
        <div className="max-h-64 overflow-y-auto">
          {results.length === 0 && query.trim() && (
            <p className="text-muted text-sm p-3">No results</p>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={r.action}
              className="w-full text-left px-4 py-2.5 text-sm text-text hover:bg-surface border-b border-border/50 last:border-b-0 transition-colors flex items-center gap-2.5"
            >
              <span className="text-muted"><Icon name={r.icon} size={14} /></span>
              {r.label}
            </button>
          ))}
          {!query.trim() && (
            <div className="p-3 text-sm text-muted">
              <p>Search for cards, or type:</p>
              <ul className="mt-1 space-y-1 text-xs">
                <li><code className="bg-surface px-1 rounded">go to mind</code> — Mind, Board, Agents, Specs…</li>
                <li><code className="bg-surface px-1 rounded">new card</code> — create a card</li>
                <li><code className="bg-surface px-1 rounded">add to {board.columns[0]?.name || "Todo"}</code> — add to column</li>
                <li><code className="bg-surface px-1 rounded">theme black</code> / <code className="bg-surface px-1 rounded">theme light</code> / <code className="bg-surface px-1 rounded">theme system</code></li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
