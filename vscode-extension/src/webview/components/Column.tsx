import React from "react";
import type { Card as CardType, Column as ColumnType } from "../lib/types";
import { Card as CardComponent } from "./Card";

interface ColumnProps {
  column: ColumnType;
  cards: CardType[];
  columnIndex: number;
  totalColumns: number;
  onEdit: (card: CardType) => void;
  onDelete: (id: string) => void;
  onMoveLeft: (id: string) => void;
  onMoveRight: (id: string) => void;
  onAddCard: (columnId: string) => void;
}

export function Column({ column, cards, columnIndex, totalColumns, onEdit, onDelete, onMoveLeft, onMoveRight, onAddCard }: ColumnProps) {
  return (
    <div className="flex flex-col bg-gray-50 dark:bg-gray-900 rounded-lg min-w-[280px] max-w-[320px] flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
          {column.name}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-full">
            {cards.length}
          </span>
          <button
            onClick={() => onAddCard(column.id)}
            className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 p-0.5 rounded"
            title="Add card"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2 p-3 overflow-y-auto flex-1">
        {cards.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-4">
            No cards
          </p>
        ) : (
          cards.map((card) => (
            <CardComponent
              key={card.id}
              card={card}
              columnIndex={columnIndex}
              totalColumns={totalColumns}
              onEdit={onEdit}
              onDelete={onDelete}
              onMoveLeft={onMoveLeft}
              onMoveRight={onMoveRight}
            />
          ))
        )}
      </div>
    </div>
  );
}
