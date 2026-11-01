import React from "react";
import type { Board as BoardType, Card } from "../lib/types";
import { Avatar } from "./Avatar";
import { PriorityBadge } from "./PriorityBadge";
import { LabelChip } from "./LabelChip";
import { Icon } from "./Icon";
import { QuietSelect } from "./QuietSelect";

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
          <p className="text-xs mt-1">Press N or ⌘K for a new card</p>
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
                <LabelChip key={l} name={l} />
              ))}
            </div>
          </div>
          <QuietSelect
            value={card.column}
            onChange={(e) => onMoveCard(card.id, e.target.value)}
            className="bg-card text-text text-xs rounded px-2 py-1 border border-border hover:border-border-strong focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {board.columns.map((col) => (
              <option key={col.id} value={col.id}>{col.name}</option>
            ))}
          </QuietSelect>
          {card.assignee && <Avatar name={card.assignee} />}
          <button onClick={() => onDeleteCard(card.id)} className="text-muted hover:text-danger transition-colors">
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
