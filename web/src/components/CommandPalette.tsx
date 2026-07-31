import React, { useState, useMemo } from "react";
import type { Board as BoardType, Card } from "../lib/types";

interface Props {
  board: BoardType;
  onClose: () => void;
  onNavigate: (colId: string, cardId: string) => void;
  onAddCard: (colId: string) => void;
  onEditCard: (card: Card) => void;
}

export function CommandPalette({ board, onClose, onAddCard, onEditCard }: Props) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const items: { label: string; action: () => void }[] = [];

    // Cards
    for (const card of board.cards) {
      if (card.title.toLowerCase().includes(q)) {
        items.push({ label: `📋 ${card.title} — ${card.column}`, action: () => { onEditCard(card); onClose(); } });
      }
    }

    // Commands
    if ("new card".includes(q)) items.push({ label: "+ New card", action: () => { onAddCard(board.columns[0]?.id || "todo"); onClose(); } });
    for (const col of board.columns) {
      if (`add to ${col.name}`.toLowerCase().includes(q)) items.push({ label: `+ Add to ${col.name}`, action: () => { onAddCard(col.id); onClose(); } });
    }
    if ("edit board".includes(q)) items.push({ label: "✏ Edit board title", action: () => { onClose(); } });
    if ("theme dark".includes(q)) items.push({ label: "🌙 Dark theme", action: () => { document.documentElement.classList.add("dark"); onClose(); } });
    if ("theme light".includes(q)) items.push({ label: "☀ Light theme", action: () => { document.documentElement.classList.remove("dark"); onClose(); } });

    return items.slice(0, 10);
  }, [query, board, onClose, onAddCard, onEditCard]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15%] bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 bg-transparent text-gray-100 text-sm outline-none placeholder-gray-500 border-b border-gray-800"
          placeholder="Search cards or type a command..."
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        />
        <div className="max-h-64 overflow-y-auto">
          {results.length === 0 && query.trim() && (
            <p className="text-gray-500 text-sm p-3">No results</p>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={r.action}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 border-b border-gray-800/50 last:border-b-0"
            >
              {r.label}
            </button>
          ))}
          {!query.trim() && (
            <div className="p-3 text-sm text-gray-500">
              <p>Search for cards, or type:</p>
              <ul className="mt-1 space-y-1 text-xs">
                <li><code className="bg-gray-800 px-1 rounded">new card</code> — create a card</li>
                <li><code className="bg-gray-800 px-1 rounded">add to {board.columns[0]?.name || "Todo"}</code> — add to column</li>
                <li><code className="bg-gray-800 px-1 rounded">edit board</code> — rename board</li>
                <li><code className="bg-gray-800 px-1 rounded">theme dark</code> / <code className="bg-gray-800 px-1 rounded">theme light</code></li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
