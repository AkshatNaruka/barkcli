import React, { useState } from "react";
import type { Card } from "../lib/types";

interface Props {
  card: Card;
  isOverlay?: boolean;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, card: Card) => void;
}

const priorityDot: Record<string, string> = {
  high: "text-red-500",
  medium: "text-yellow-500",
  low: "text-gray-500",
};

export function KanbanCard({ card, isOverlay, onEdit, onDelete, onContextMenu }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-colors group relative ${
        isOverlay ? "shadow-xl rotate-1" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{ borderLeftColor: card.priority === "high" ? "#ef4444" : card.priority === "medium" ? "#f59e0b" : "#6b7280", borderLeftWidth: "3px" }}
      onContextMenu={(e) => onContextMenu(e, card)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm text-gray-100 flex-1 break-words">
          <span className={priorityDot[card.priority] || "text-gray-500"}>● </span>
          {card.title}
        </div>
        <div className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="text-gray-500 hover:text-gray-300 p-0.5 rounded"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div className="absolute right-0 top-6 z-20 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 min-w-[130px]">
                <button onClick={(e) => { e.stopPropagation(); onEdit(card); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700">Edit</button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(card.id); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/20">Delete</button>
              </div>
            </>
          )}
        </div>
      </div>
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {card.labels.map((l) => (
            <span key={l} className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300">{l}</span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <span className={`font-medium ${card.priority === "high" ? "text-red-400" : card.priority === "medium" ? "text-amber-400" : "text-gray-500"}`}>{card.priority}</span>
        {card.assignee && <span className="text-gray-400">{card.assignee}</span>}
      </div>
    </div>
  );
}
