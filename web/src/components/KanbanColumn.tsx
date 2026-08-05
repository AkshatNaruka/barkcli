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
          <button
            onClick={onAdd}
            className="text-muted hover:text-accent p-0.5 rounded transition-colors"
            title="Add card"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z" />
            </svg>
          </button>
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
            <button
              onClick={onAdd}
              className="flex flex-col items-center justify-center gap-1.5 py-6 rounded-lg border border-dashed border-border text-muted hover:text-text hover:border-border-strong hover:bg-card transition-colors"
            >
              <span className="text-base">＋</span>
              <span className="text-xs">Add card</span>
            </button>
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
          className="text-xs text-muted hover:text-text py-2 text-center rounded hover:bg-card transition-colors"
        >
          + Add card
        </button>
      </div>
    </div>
  );
}
