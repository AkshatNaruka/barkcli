import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card } from "../lib/types";
import { KanbanCard } from "./KanbanCard";

interface Props {
  card: Card;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
}

export function SortableCard({ card, onEdit, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard
        card={card}
        onEdit={onEdit}
        onDelete={onDelete}
        onContextMenu={(e, c) => {
          e.preventDefault();
          // Context menu handled by the card
        }}
      />
    </div>
  );
}
