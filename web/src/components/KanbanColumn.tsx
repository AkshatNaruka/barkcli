import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "../lib/types";
import { SortableCard } from "./SortableCard";
import { Icon } from "./Icon";

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
  onPlanCard: (card: Card) => void;
  onAskAgent: (card: Card) => void;
}

export const KanbanColumn = React.memo(function KanbanColumn({ column, cards, onAdd, onEdit, onDelete, onTogglePin, onShowHistory, onShowActivity, onCopyCommitMsg, onPlanCard, onAskAgent }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const ids = cards.map((c) => c.id);
  const pinned = cards.filter((c) => c.pinned).length;

  return (
    <div
      className="flex flex-col bg-surface border border-border rounded-xl min-w-[250px] max-w-[340px] flex-1"
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted truncate">{column.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pinned > 0 && (
            <span className="text-[10px] text-muted inline-flex items-center gap-0.5" title="Pinned cards">
              <Icon name="pin" size={11} />{pinned}
            </span>
          )}
          <span className="text-[10px] font-mono text-muted/80">{cards.length}</span>
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
                onPlanCard={onPlanCard}
                onAskAgent={onAskAgent}
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
