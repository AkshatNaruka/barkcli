import React from "react";
import type { Card as CardType, Column as ColumnType } from "../lib/types";
import { Card as CardComponent } from "./Card";

interface ColumnProps {
  column: ColumnType;
  cards: CardType[];
}

export function Column({ column, cards }: ColumnProps) {
  return (
    <div className="flex flex-col bg-gray-50 dark:bg-gray-900 rounded-lg min-w-[280px] max-w-[320px] flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
          {column.name}
        </h3>
        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-full">
          {cards.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-3 overflow-y-auto">
        {cards.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-4">
            No cards
          </p>
        ) : (
          cards.map((card) => (
            <CardComponent key={card.id} card={card} />
          ))
        )}
      </div>
    </div>
  );
}
