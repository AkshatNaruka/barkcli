import React from "react";
import type { Board as BoardType, Card as CardType } from "../lib/types";
import { Column as ColumnComponent } from "./Column";

interface BoardProps {
  board: BoardType | null;
  onEdit: (card: CardType) => void;
  onDelete: (id: string) => void;
  onMoveLeft: (id: string) => void;
  onMoveRight: (id: string) => void;
  onAddCard: (columnId: string) => void;
}

export function Board({ board, onEdit, onDelete, onMoveLeft, onMoveRight, onAddCard }: BoardProps) {
  if (!board) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen p-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {board.title}
        </h1>
        {board.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {board.description}
          </p>
        )}
      </div>

      <div className="flex gap-4 flex-1 overflow-x-auto pb-4">
        {board.columns.map((column, idx) => (
          <ColumnComponent
            key={column.id}
            column={column}
            columnIndex={idx}
            totalColumns={board.columns.length}
            cards={board.cards.filter((c) => c.column === column.id)}
            onEdit={onEdit}
            onDelete={onDelete}
            onMoveLeft={onMoveLeft}
            onMoveRight={onMoveRight}
            onAddCard={onAddCard}
          />
        ))}
      </div>
    </div>
  );
}
