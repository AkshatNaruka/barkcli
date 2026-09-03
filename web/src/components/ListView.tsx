import React from "react";
import type { Board as BoardType, Card } from "../lib/types";
import { Avatar } from "./Avatar";
import { PriorityBadge } from "./PriorityBadge";
import { Icon } from "./Icon";
import { labelClasses } from "../lib/labels";

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
        <div className="text-center py-12 text-muted">
          <div className="flex justify-center mb-3 text-muted"><Icon name="inbox" size={36} /></div>
          <p className="text-sm">No cards yet</p>
          <p className="text-xs mt-1">Press N or use ⌘K → New card</p>
        </div>
      )}
      {sorted.map((card) => (
        <div key={card.id} className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3 hover:border-border-strong transition-colors">
          <div className="flex-1 min-w-0">
            <button onClick={() => onEditCard(card)} className="text-text text-sm hover:text-accent text-left transition-colors">
              {card.title}
            </button>
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <PriorityBadge priority={card.priority} />
              {card.labels.slice(0, 3).map((l) => (
                <span key={l} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${labelClasses(l)}`}>{l}</span>
              ))}
            </div>
          </div>
          <select
            value={card.column}
            onChange={(e) => onMoveCard(card.id, e.target.value)}
            className="bg-card text-text text-xs rounded px-2 py-1 border border-border hover:border-border-strong focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {board.columns.map((col) => (
              <option key={col.id} value={col.id}>{col.name}</option>
            ))}
          </select>
          {card.assignee && <Avatar name={card.assignee} />}
          <button onClick={() => onDeleteCard(card.id)} className="text-muted hover:text-danger transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z"/></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
