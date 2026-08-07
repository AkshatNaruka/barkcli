import React, { useState } from "react";
import type { Card as CardType } from "../lib/types";

interface CardProps {
  card: CardType;
  columnIndex: number;
  totalColumns: number;
  onEdit: (card: CardType) => void;
  onDelete: (id: string) => void;
  onMoveLeft: (id: string) => void;
  onMoveRight: (id: string) => void;
}

const priorityColors: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#6b7280",
};

export function Card({ card, columnIndex, totalColumns, onEdit, onDelete, onMoveLeft, onMoveRight }: CardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow relative"
      style={{ borderLeftColor: priorityColors[card.priority] || "#6b7280", borderLeftWidth: "3px" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm text-gray-900 dark:text-gray-100 flex-1 break-words">
          {card.title}
        </div>
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5 rounded"
            title="Actions"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-6 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[140px]">
                <button
                  onClick={() => { onEdit(card); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Edit
                </button>
                {columnIndex > 0 && (
                  <button
                    onClick={() => { onMoveLeft(card.id); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Move left
                  </button>
                )}
                {columnIndex < totalColumns - 1 && (
                  <button
                    onClick={() => { onMoveRight(card.id); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Move right
                  </button>
                )}
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button
                  onClick={() => { onDelete(card.id); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {card.labels.map((label) => (
            <span key={label} className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
              {label}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span className={`font-medium ${
          card.priority === "high" ? "text-red-500" :
          card.priority === "medium" ? "text-amber-500" :
          "text-gray-400"
        }`}>
          {card.priority}
        </span>
        <div className="flex items-center gap-2">
          {card.assignee && <span>{card.assignee}</span>}
        </div>
      </div>
    </div>
  );
}
