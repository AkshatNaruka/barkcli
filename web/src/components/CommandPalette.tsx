import React, { useState, useMemo } from "react";
import type { Board as BoardType, Card } from "../lib/types";
import { THEMES, useTheme } from "../lib/theme.tsx";
import { navigate } from "../lib/hashnav";
import { SURFACES } from "../lib/surfaces";
import { Icon, type IconName } from "./Icon";

interface Props {
  board: BoardType;
  onClose: () => void;
  onNavigate: (colId: string, cardId: string) => void;
  onAddCard: (colId: string) => void;
  onEditCard: (card: Card) => void;
  onCustomize: () => void;
}

export function CommandPalette({ board, onClose, onAddCard, onEditCard, onCustomize }: Props) {
  const [query, setQuery] = useState("");
  const { setTheme, railOrder, hidden, railStyle, setRailStyle } = useTheme();

  const views = useMemo(
    () =>
      railOrder
        .filter((id) => !hidden.includes(id))
        .map((id) => SURFACES.find((s) => s.id === id))
        .filter((s): s is (typeof SURFACES)[number] => Boolean(s)),
    [railOrder, hidden]
  );

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const items: { label: string; icon: IconName; action: () => void }[] = [];

    // View navigation — only surfaces that are actually in the rail.
    for (const v of views) {
      if (`go to ${v.label}`.toLowerCase().includes(q) || v.id.includes(q)) {
        items.push({
          label: `Go to ${v.label}`,
          icon: v.icon,
          action: () => {
            navigate(v.id);
            onClose();
          },
        });
      }
    }

    if ("customize appearance theme accent layout".includes(q)) {
      items.push({
        label: "Customize appearance",
        icon: "palette",
        action: () => {
          onCustomize();
          onClose();
        },
      });
    }
    if ("rail labels icons".includes(q)) {
      items.push({
        label: railStyle === "labels" ? "Rail: icons only" : "Rail: show labels",
        icon: "layers",
        action: () => {
          setRailStyle(railStyle === "labels" ? "icons" : "labels");
          onClose();
        },
      });
    }

    for (const t of THEMES) {
      if (`theme ${t.label}`.toLowerCase().includes(q) || `theme ${t.id}`.includes(q)) {
        items.push({
          label: `${t.label} theme`,
          icon: t.id === "light" ? "sun" : t.id === "system" ? "monitor" : "moon",
          action: () => {
            setTheme(t.id);
            onClose();
          },
        });
      }
    }

    if ("sync brain".includes(q)) {
      items.push({
        label: "Sync brain",
        icon: "refresh",
        action: () => {
          fetch("/api/mind").then(() => {}).catch(() => {});
          navigate("brain");
          onClose();
        },
      });
    }

    // Cards
    for (const card of board.cards) {
      if (card.title.toLowerCase().includes(q)) {
        items.push({
          label: `${card.title}: ${card.column}`,
          icon: "board",
          action: () => {
            onEditCard(card);
            onClose();
          },
        });
      }
    }

    // Commands
    if ("new card".includes(q)) {
      items.push({
        label: "New card",
        icon: "board",
        action: () => {
          onAddCard(board.columns[0]?.id || "todo");
          onClose();
        },
      });
    }
    for (const col of board.columns) {
      if (`add to ${col.name}`.toLowerCase().includes(q)) {
        items.push({
          label: `Add to ${col.name}`,
          icon: "board",
          action: () => {
            onAddCard(col.id);
            onClose();
          },
        });
      }
    }

    return items.slice(0, 12);
  }, [
    query,
    board,
    onClose,
    onAddCard,
    onEditCard,
    onCustomize,
    setTheme,
    views,
    railStyle,
    setRailStyle,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15%] bg-black/60" onClick={onClose}>
      <div className="bg-card rounded-xl dialog-elevated w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 bg-transparent text-text text-sm outline-none placeholder:text-muted border-b border-border"
          placeholder="Search cards or type a command..."
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="max-h-64 overflow-y-auto">
          {results.length === 0 && query.trim() && <p className="text-muted text-sm p-3">No results</p>}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={r.action}
              className="w-full text-left px-4 py-2.5 text-sm text-text hover:bg-surface border-b border-border/50 last:border-b-0 transition-colors flex items-center gap-2.5"
            >
              <span className="text-muted">
                <Icon name={r.icon} size={14} />
              </span>
              {r.label}
            </button>
          ))}
          {!query.trim() && (
            <div className="p-3 text-sm text-muted">
              <p>Search for cards, or type:</p>
              <ul className="mt-1 space-y-1 text-xs">
                <li>
                  <code className="bg-surface px-1 rounded">go to board</code> — any surface
                </li>
                <li>
                  <code className="bg-surface px-1 rounded">customize appearance</code> — themes, accent, rail
                </li>
                <li>
                  <code className="bg-surface px-1 rounded">new card</code> — create a card
                </li>
                <li>
                  <code className="bg-surface px-1 rounded">add to {board.columns[0]?.name || "Todo"}</code> — add to column
                </li>
                <li>
                  <code className="bg-surface px-1 rounded">theme paper</code> — switch theme
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
