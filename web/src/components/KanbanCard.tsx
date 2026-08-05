import React, { useState } from "react";
import type { Card } from "../lib/types";

interface Props {
  card: Card;
  isOverlay?: boolean;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onShowHistory: (cardId: string) => void;
  onCopyCommitMsg: (card: Card) => void;
}

const priorityDot: Record<string, string> = {
  high: "text-red-500",
  medium: "text-yellow-500",
  low: "text-gray-500",
};

const priorityColor: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#6b7280",
};

export function KanbanCard({ card, isOverlay, onEdit, onDelete, onTogglePin, onShowHistory, onCopyCommitMsg }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const checklistDone = card.checklist.filter((i) => i.done).length;
  const checklistTotal = card.checklist.length;
  const overdue = card.due_date && new Date(card.due_date) < new Date();

  return (
    <div
      className={`bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-colors group relative ${
        isOverlay ? "shadow-xl rotate-1" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{ borderLeftColor: priorityColor[card.priority] || "#6b7280", borderLeftWidth: "3px" }}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={() => onEdit(card)}
    >
      {/* Pin icon */}
      {card.pinned && (
        <div className="absolute -top-1 -right-1 text-yellow-500 text-xs">📌</div>
      )}

      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm text-gray-100 flex-1 break-words cursor-pointer" onClick={() => setShowDesc(!showDesc)}>
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
              <div className="absolute right-0 top-6 z-20 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 min-w-[160px]">
                <button onClick={(e) => { e.stopPropagation(); onEdit(card); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700">✏️ Edit</button>
                <button onClick={(e) => { e.stopPropagation(); onTogglePin(card.id); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700">{card.pinned ? "📌 Unpin" : "📌 Pin"}</button>
                <button onClick={(e) => { e.stopPropagation(); onCopyCommitMsg(card); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700">📋 Copy commit msg</button>
                <button onClick={(e) => { e.stopPropagation(); onShowHistory(card.id); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700">🕐 History</button>
                <div className="border-t border-gray-700 my-0.5" />
                <button onClick={(e) => { e.stopPropagation(); onDelete(card.id); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/20">🗑 Delete</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Description on click */}
      {showDesc && card.description && (
        <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{card.description}</p>
      )}

      {/* Labels */}
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {card.labels.map((l) => (
            <span key={l} className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300">{l}</span>
          ))}
        </div>
      )}

      {/* Checklist progress */}
      {checklistTotal > 0 && (
        <div className={`mt-1.5 text-xs ${checklistDone === checklistTotal ? "text-emerald-400" : "text-gray-400"}`}>
          ☑ {checklistDone}/{checklistTotal}
        </div>
      )}

      {/* Due date */}
      {card.due_date && (
        <div className={`mt-1.5 text-xs font-mono ${overdue ? "text-red-400" : "text-gray-400"}`}>
          {overdue ? "⚠ " : "📅 "}
          {card.due_date.slice(0, 10)}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <span className={`font-medium ${card.priority === "high" ? "text-red-400" : card.priority === "medium" ? "text-amber-400" : "text-gray-500"}`}>{card.priority}</span>
        {card.assignee && <span className="text-gray-400">@{card.assignee}</span>}
        {card.comments.length > 0 && <span className="text-gray-500">💬{card.comments.length}</span>}
      </div>
    </div>
  );
}
