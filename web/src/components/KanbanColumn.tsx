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
}

export function KanbanColumn({ column, cards, onAdd, onEdit, onDelete }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const ids = cards.map((c) => c.id);

  return (
    <div
      className="flex flex-col bg-gray-900 rounded-lg min-w-[280px] max-w-[320px] flex-shrink-0 border border-gray-800"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h3 className="font-semibold text-sm text-gray-300">{column.name}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
            {cards.length}
          </span>
          <button
            onClick={onAdd}
            className="text-gray-500 hover:text-blue-400 p-0.5 rounded"
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
        className={`flex flex-col gap-2 p-3 overflow-y-auto flex-1 column-scroll min-h-[60px] ${
          isOver ? "bg-blue-900/20" : ""
        }`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {cards.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">No cards</p>
          ) : (
            cards.map((card) => (
              <SortableCard
                key={card.id}
                card={card}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))
          )}
        </SortableContext>
        {/* Drop zone at bottom of column */}
        <button
          onClick={onAdd}
          className="text-xs text-gray-600 hover:text-gray-400 py-2 text-center rounded hover:bg-gray-800/50 transition-colors"
        >
          + Add card
        </button>
      </div>
    </div>
  );
}
