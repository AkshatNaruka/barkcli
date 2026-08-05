import React, { useState } from "react";
import type { Card } from "../lib/types";
import { Avatar } from "./Avatar";
import { PriorityBadge } from "./PriorityBadge";
import { labelClasses } from "../lib/labels";

interface Props {
  card: Card;
  isOverlay?: boolean;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onShowHistory: (cardId: string) => void;
  onCopyCommitMsg: (card: Card) => void;
}

export function KanbanCard({ card, isOverlay, onEdit, onDelete, onTogglePin, onShowHistory, onCopyCommitMsg }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const checklistDone = card.checklist.filter((i) => i.done).length;
  const checklistTotal = card.checklist.length;
  const checklistPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;
  const overdue = card.due_date && new Date(card.due_date) < new Date();

  return (
    <div
      className={`bg-card rounded-lg p-3 border border-border hover:border-border-strong transition-colors group relative ${
        isOverlay ? "shadow-[var(--shadow)] rotate-1" : "cursor-grab active:cursor-grabbing"
      }`}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={() => onEdit(card)}
    >
      {/* Pin indicator */}
      {card.pinned && (
        <span className="absolute -top-1.5 -right-1.5 text-[10px] text-warning select-none" title="Pinned">📌</span>
      )}

      {/* Card ID */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-muted truncate">{card.id}</span>
        <div className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="text-muted hover:text-text p-0.5 rounded"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div className="absolute right-0 top-6 z-20 bg-card rounded-lg shadow-[var(--shadow)] border border-border py-1 min-w-[160px]">
                <button onClick={(e) => { e.stopPropagation(); onEdit(card); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface">✏️ Edit</button>
                <button onClick={(e) => { e.stopPropagation(); onTogglePin(card.id); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface">{card.pinned ? "📌 Unpin" : "📌 Pin"}</button>
                <button onClick={(e) => { e.stopPropagation(); onCopyCommitMsg(card); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface">📋 Copy commit msg</button>
                <button onClick={(e) => { e.stopPropagation(); onShowHistory(card.id); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface">🕐 History</button>
                <div className="border-t border-border my-0.5" />
                <button onClick={(e) => { e.stopPropagation(); onDelete(card.id); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-danger hover:bg-danger-soft">🗑 Delete</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Title */}
      <div
        className="font-medium text-sm text-text leading-snug cursor-pointer"
        onClick={() => setShowDesc(!showDesc)}
        title={card.description || card.title}
      >
        {card.title}
      </div>

      {/* Description */}
      {showDesc && card.description && (
        <p className="text-xs text-muted mt-1.5 leading-relaxed">{card.description}</p>
      )}

      {/* Checklist progress bar */}
      {checklistTotal > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] mb-0.5">
            <span className={checklistDone === checklistTotal ? "text-success" : "text-muted"}>☑ {checklistDone}/{checklistTotal}</span>
            <span className="text-muted font-mono">{checklistPct}%</span>
          </div>
          <div className="h-1 rounded-full bg-surface overflow-hidden">
            <div
              className={`h-full rounded-full ${checklistDone === checklistTotal ? "bg-success" : "bg-accent"}`}
              style={{ width: `${checklistPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <PriorityBadge priority={card.priority} />
        {card.labels.slice(0, 3).map((l) => (
          <span key={l} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${labelClasses(l)}`}>{l}</span>
        ))}
        {card.labels.length > 3 && (
          <span className="text-[10px] text-muted">+{card.labels.length - 3}</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/50">
        <div className="flex items-center gap-1.5 min-w-0">
          {card.assignee ? (
            <Avatar name={card.assignee} />
          ) : (
            <span className="w-5 h-5 rounded-full border border-dashed border-border" title="Unassigned" />
          )}
          {card.due_date && (
            <span className={`text-[10px] font-mono ${overdue ? "text-danger" : "text-muted"}`}>
              {overdue ? "⚠" : "📅"}{card.due_date.slice(5, 10)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted">
          {card.comments.length > 0 && <span>💬 {card.comments.length}</span>}
          {card.blocked_by && <span title={`Blocked by ${card.blocked_by}`}>⛔</span>}
        </div>
      </div>
    </div>
  );
}
