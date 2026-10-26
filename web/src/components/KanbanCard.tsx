import React, { useState } from "react";
import type { Card } from "../lib/types";
import { Avatar } from "./Avatar";
import { PriorityBadge } from "./PriorityBadge";
import { Icon } from "./Icon";
import { LabelChip } from "./LabelChip";

interface Props {
  card: Card;
  isOverlay?: boolean;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onShowHistory: (cardId: string) => void;
  onShowActivity: (cardId: string) => void;
  onCopyCommitMsg: (card: Card) => void;
}

export const KanbanCard = React.memo(function KanbanCard({ card, isOverlay, onEdit, onDelete, onTogglePin, onShowHistory, onShowActivity, onCopyCommitMsg }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const checklistDone = card.checklist.filter((i) => i.done).length;
  const checklistTotal = card.checklist.length;
  const checklistPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;
  const overdue = card.due_date && new Date(card.due_date) < new Date();
  const childCount = card.links.filter((l) => l.ty === "child").length;
  const blockedBy = card.blocked_by || card.links.find((l) => l.ty === "blocked-by")?.target;
  const stale =
    card.column !== "done" &&
    Date.now() - new Date(card.updated_at).getTime() > 7 * 24 * 3600 * 1000;

  const cardType = card.labels.find((l) => l.startsWith("type:"))?.replace("type:", "");
  const agentBackend =
    card.labels.find((l) => l.startsWith("agent:"))?.replace("agent:", "") ||
    (["opencode", "board", "codex", "claude"].includes(card.assignee?.toLowerCase() || "")
      ? card.assignee?.toLowerCase()
      : null);

  const displayLabels = card.labels
    .filter((l) => !l.startsWith("type:") && !l.startsWith("agent:"))
    .slice(0, 2);

  return (
    <div
      className={`bg-card rounded-xl p-3.5 border transition-colors group relative ${
        blockedBy
          ? "border-danger/60 hover:border-danger"
          : "border-border hover:border-border-strong"
      } ${isOverlay ? "shadow-[var(--shadow)] rotate-1" : "cursor-grab active:cursor-grabbing"}`}
      style={{ contain: "layout style" }}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={() => onEdit(card)}
    >
      {/* Pin — inline, quiet */}
      {/* Menu + title spawn below */}

      {/* Kebab — hover only */}
      <div className="absolute right-1.5 top-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="text-muted hover:text-text p-1 rounded bg-card/80"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
            <div className="absolute right-0 top-7 z-20 bg-card rounded-lg dialog-elevated border border-border py-1 min-w-[170px]">
              <MenuItem onClick={(e) => { e.stopPropagation(); onEdit(card); setMenuOpen(false); }} icon="pencil" label="Edit" />
              <MenuItem onClick={(e) => { e.stopPropagation(); onTogglePin(card.id); setMenuOpen(false); }} icon="pin" label={card.pinned ? "Unpin" : "Pin"} />
              <MenuItem onClick={(e) => { e.stopPropagation(); onCopyCommitMsg(card); setMenuOpen(false); }} icon="copy" label="Copy commit msg" />
              <MenuItem onClick={(e) => { e.stopPropagation(); onShowHistory(card.id); setMenuOpen(false); }} icon="history" label="History" />
              <MenuItem onClick={(e) => { e.stopPropagation(); onShowActivity(card.id); setMenuOpen(false); }} icon="pulse" label="Activity" />
              <div className="border-t border-border my-0.5" />
              <MenuItem onClick={(e) => { e.stopPropagation(); onDelete(card.id); setMenuOpen(false); }} icon="trash" label="Delete" danger />
            </div>
          </>
        )}
      </div>

      {/* Title — the first thing you see; id & description live in the tooltip */}
      <div
        className="font-medium text-sm text-text leading-snug cursor-pointer pr-4"
        onClick={() => setShowDesc(!showDesc)}
        title={`${card.id}${card.description ? ` — ${card.description}` : ""}`}
      >
        {stale && <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning mr-1.5" title="Stale — untouched for 7+ days" />}
        {card.pinned && <span className="text-warning/80 inline-block mr-1 -mt-px" title="Pinned"><Icon name="pin" size={11} /></span>}
        {card.title}
      </div>

      {/* Description */}
      {showDesc && card.description && (
        <p className="text-xs text-muted mt-1.5 leading-relaxed">{card.description}</p>
      )}

      {/* Checklist — bar carries progress, one quiet count */}
      {checklistTotal > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-[3px] flex-1 rounded-full bg-[color-mix(in_srgb,var(--border)_55%,transparent)] overflow-hidden">
            <div
              className={`h-full rounded-full ${checklistDone === checklistTotal ? "bg-success" : "bg-[color-mix(in_srgb,var(--accent)_70%,transparent)]"}`}
              style={{ width: `${checklistPct}%` }}
            />
          </div>
          <span className={`text-[10px] shrink-0 ${checklistDone === checklistTotal ? "text-success" : "text-muted"}`}>
            {checklistDone}/{checklistTotal}
          </span>
        </div>
      )}

      {/* Badges — type, agent, priority, and user labels */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {cardType && (
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-surface border border-border/80 text-muted">
            {cardType}
          </span>
        )}
        {agentBackend && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-accent/40 text-accent-text flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            {agentBackend}
          </span>
        )}
        {card.priority !== "low" && <PriorityBadge priority={card.priority} iconOnly />}
        {displayLabels.map((l) => (
          <LabelChip key={l} name={l} />
        ))}
        {card.labels.filter((l) => !l.startsWith("type:") && !l.startsWith("agent:")).length > 2 && (
          <span className="text-[10px] text-muted">
            +{card.labels.filter((l) => !l.startsWith("type:") && !l.startsWith("agent:")).length - 2}
          </span>
        )}
      </div>

      {/* Meta — icons over words, no divider */}
      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {card.assignee && <Avatar name={card.assignee} />}
          {card.due_date && (
            <span className={`text-[10px] font-mono inline-flex items-center gap-0.5 ${overdue ? "text-danger" : "text-muted"}`}>
              <Icon name={overdue ? "warn" : "calendar"} size={11} />{card.due_date.slice(5, 10)}
            </span>
          )}
          {(card as any).spec_id && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-accent-text" title={`Spec: ${(card as any).spec_id}`}>
              <Icon name="link" size={10} />spec
            </span>
          )}
          {blockedBy && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-danger" title={`Blocked by ${blockedBy}`}>
              Blocked
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted">
          {card.effort !== undefined && card.effort > 0 && (
            <span className="font-mono inline-flex items-center gap-0.5" title="Effort (points)">
              <Icon name="clock" size={11} /> {card.effort}
            </span>
          )}
          {childCount > 0 && (
            <span className="text-accent inline-flex items-center gap-0.5" title={`${childCount} linked task(s)`}>
              <Icon name="subtasks" size={11} /> {childCount}
            </span>
          )}
          {card.comments.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Icon name="comment" size={11} /> {card.comments.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

function MenuItem({
  onClick,
  icon,
  label,
  danger,
}: {
  onClick: (e: React.MouseEvent) => void;
  icon: "pencil" | "pin" | "copy" | "history" | "pulse" | "trash";
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-[13px] flex items-center gap-2 transition-colors ${
        danger ? "text-danger hover:bg-danger-soft" : "text-text hover:bg-surface"
      }`}
    >
      <Icon name={icon} size={13} />
      {label}
    </button>
  );
}
