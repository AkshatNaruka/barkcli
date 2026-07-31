import React, { useState } from "react";
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Board as BoardType, Card } from "../lib/types";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";

interface Props {
  board: BoardType;
  onMoveCard: (id: string, column: string) => void;
  onAddCard: () => void;
  onAddToColumn: (colId: string) => void;
  onEditCard: (card: Card) => void;
  onDeleteCard: (id: string) => void;
}

export function BoardView({ board, onMoveCard, onAddToColumn, onEditCard, onDeleteCard }: Props) {
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

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 p-4 h-full overflow-x-auto">
        {board.columns.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            cards={board.cards.filter((c) => c.column === col.id)}
            onAdd={() => onAddToColumn(col.id)}
            onEdit={onEditCard}
            onDelete={onDeleteCard}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCard && (
          <div className="w-72 opacity-90">
            <KanbanCard card={activeCard} isOverlay onEdit={() => {}} onDelete={() => {}} onContextMenu={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
