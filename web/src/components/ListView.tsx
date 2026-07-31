import React from "react";
import type { Board as BoardType, Card } from "../lib/types";

interface Props {
  board: BoardType;
  onEditCard: (card: Card) => void;
  onDeleteCard: (id: string) => void;
  onMoveCard: (id: string, column: string) => void;
}

export function ListView({ board, onEditCard, onDeleteCard, onMoveCard }: Props) {
  const sorted = [...board.cards].sort((a, b) => {
    const p = { high: 0, medium: 1, low: 2 };
    return (p[a.priority as keyof typeof p] || 3) - (p[b.priority as keyof typeof p] || 3);
  });

  return (
    <div className="p-4 max-w-2xl mx-auto h-full overflow-auto space-y-2">
      {sorted.length === 0 && (
        <p className="text-gray-500 text-center py-8">No cards</p>
      )}
      {sorted.map((card) => (
        <div key={card.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-700">
          <div className="flex-1 min-w-0">
            <button onClick={() => onEditCard(card)} className="text-gray-200 text-sm hover:text-blue-400 text-left">
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                card.priority === "high" ? "bg-red-500" : card.priority === "medium" ? "bg-yellow-500" : "bg-gray-600"
              }`} />
              {card.title}
            </button>
            <div className="flex flex-wrap gap-1 mt-1">
              {card.labels.map((l) => (
                <span key={l} className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300">{l}</span>
              ))}
            </div>
          </div>
          <select
            value={card.column}
            onChange={(e) => onMoveCard(card.id, e.target.value)}
            className="bg-gray-800 text-gray-300 text-xs rounded px-2 py-1 border border-gray-700"
          >
            {board.columns.map((col) => (
              <option key={col.id} value={col.id}>{col.name}</option>
            ))}
          </select>
          <span className="text-xs font-medium text-gray-500">{card.priority}</span>
          {card.assignee && <span className="text-xs text-gray-400">{card.assignee}</span>}
          <button onClick={() => onDeleteCard(card.id)} className="text-gray-600 hover:text-red-400">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z"/></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
