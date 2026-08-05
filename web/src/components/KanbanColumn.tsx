import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "../lib/types";
import { SortableCard } from "./SortableCard";

interface Props {
  column: Column;
  cards: Card[];
  onAdd: () => void;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onShowHistory: (cardId: string) => void;
  onCopyCommitMsg: (card: Card) => void;
}

export function KanbanColumn({ column, cards, onAdd, onEdit, onDelete, onTogglePin, onShowHistory, onCopyCommitMsg }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const ids = cards.map((c) => c.id);
  const pinned = cards.filter((c) => c.pinned).length;

  return (
    <div
      className="flex flex-col bg-surface rounded-lg min-w-[280px] max-w-[320px] flex-shrink-0 border border-border"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm text-text">{column.name}</h3>
        <div className="flex items-center gap-2">
          {pinned > 0 && (
            <span className="text-[10px] text-muted" title="Pinned cards">📌{pinned}</span>
          )}
          <span className="text-xs text-muted bg-card border border-border px-2 py-0.5 rounded-full">
            {cards.length}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 p-3 overflow-y-auto flex-1 column-scroll min-h-[60px] transition-colors ${
          isOver ? "bg-accent-soft" : ""
        }`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {cards.length === 0 ? (
            <p className="text-xs text-muted text-center py-5">No cards</p>
          ) : (
            cards.map((card) => (
              <SortableCard
                key={card.id}
                card={card}
                onEdit={onEdit}
                onDelete={onDelete}
                onTogglePin={onTogglePin}
                onShowHistory={onShowHistory}
                onCopyCommitMsg={onCopyCommitMsg}
              />
            ))
          )}
        </SortableContext>
        <button
          onClick={onAdd}
          className="text-xs text-muted hover:text-text py-2 text-center rounded hover:bg-card transition-colors shrink-0"
        >
          + Add card
        </button>
      </div>
    </div>
  );
}
