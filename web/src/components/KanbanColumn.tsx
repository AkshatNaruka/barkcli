import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "../lib/types";
import { SortableCard } from "./SortableCard";
import { Icon } from "./Icon";
import { columnTone } from "./Lozenge";

interface Props {
  column: Column;
  cards: Card[];
  onAdd: () => void;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onShowHistory: (cardId: string) => void;
  onShowActivity: (cardId: string) => void;
  onCopyCommitMsg: (card: Card) => void;
}

export const KanbanColumn = React.memo(function KanbanColumn({ column, cards, onAdd, onEdit, onDelete, onTogglePin, onShowHistory, onShowActivity, onCopyCommitMsg }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const ids = cards.map((c) => c.id);
  const pinned = cards.filter((c) => c.pinned).length;

  return (
    <div
      className="flex flex-col bg-surface rounded-xl min-w-[280px] max-w-[320px] flex-shrink-0"
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              columnTone(column.id) === "green"
                ? "bg-success"
                : "bg-[color-mix(in_srgb,var(--muted)_50%,transparent)]"
            }`}
          />
          <span className="text-[13px] font-medium text-text truncate">{column.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pinned > 0 && (
            <span className="text-[10px] text-muted inline-flex items-center gap-0.5" title="Pinned cards">
              <Icon name="pin" size={11} />{pinned}
            </span>
          )}
          <span className="text-xs text-muted font-mono">{cards.length}</span>
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
                onShowActivity={onShowActivity}
                onCopyCommitMsg={onCopyCommitMsg}
              />
            ))
          )}
        </SortableContext>
        <button
          onClick={onAdd}
          className="text-xs text-muted hover:text-text py-2 mt-0.5 text-center rounded-md hover:bg-card transition-colors shrink-0"
        >
          + Add card
        </button>
      </div>
    </div>
  );
});
