import React, { useMemo, useState } from "react";
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Board as BoardType, Card } from "../lib/types";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";

interface Props {
  board: BoardType;
  onMoveCard: (id: string, column: string) => void;
  onTogglePin: (id: string) => void;
  onAddCard: () => void;
  onAddToColumn: (colId: string) => void;
  onEditCard: (card: Card) => void;
  onDeleteCard: (id: string) => void;
  onShowHistory: (cardId: string) => void;
  onShowActivity: (cardId: string) => void;
  onCopyCommitMsg: (card: Card) => void;
}

export function BoardView({ board, onMoveCard, onTogglePin, onAddToColumn, onEditCard, onDeleteCard, onShowHistory, onShowActivity, onCopyCommitMsg }: Props) {
  const [activeCard, setActiveCard] = useState<Card | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: any) {
    const id = event.active.id as string;
    const card = board.cards.find((c) => c.id === id);
    setActiveCard(card || null);
  }

  function handleDragEnd(event: any) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;
    const cardId = active.id as string;
    const overId = over.id as string;

    // If dropped on a column
    const targetCol = board.columns.find((c) => c.id === overId);
    if (targetCol) {
      onMoveCard(cardId, overId);
      return;
    }

    // If dropped on another card, find its column
    const card = board.cards.find((c) => c.id === overId);
    if (card) {
      onMoveCard(cardId, card.column);
    }
  }

  // Stable per-column arrays so React.memo'd columns/cards skip re-renders
  // when unrelated cards change.
  const cardsByColumn = useMemo(() => {
    const m: Record<string, Card[]> = {};
    for (const col of board.columns) {
      m[col.id] = board.cards
        .filter((c) => c.column === col.id)
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    }
    return m;
  }, [board]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 p-4 h-full overflow-x-auto">
        {board.columns.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            cards={cardsByColumn[col.id] || []}
            onAdd={() => onAddToColumn(col.id)}
            onEdit={onEditCard}
            onDelete={onDeleteCard}
            onTogglePin={onTogglePin}
            onShowHistory={onShowHistory}
            onShowActivity={onShowActivity}
            onCopyCommitMsg={onCopyCommitMsg}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCard && (
          <div className="w-72 opacity-90">
            <KanbanCard card={activeCard} isOverlay onEdit={() => {}} onDelete={() => {}} onTogglePin={() => {}} onShowHistory={() => {}} onShowActivity={() => {}} onCopyCommitMsg={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
