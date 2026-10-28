import React, { useEffect, useMemo, useState } from "react";
import type { QueueItem, RiskTier } from "../lib/types";
import { fetchReviewQueue } from "../lib/api";
import { Icon } from "./Icon";

interface ReviewQueuePanelProps {
  open: boolean;
  boardName?: string | null;
  onClose: () => void;
  onSelectCard?: (cardId: string) => void;
}

interface ReviewQueueButtonProps {
  boardName?: string | null;
  onOpen: () => void;
}

const TIER_RANK: Record<RiskTier, number> = {
  must: 3,
  should: 2,
  skim: 1,
  unknown: 0,
};

const TIER_LABEL: Record<RiskTier, string> = {
  must: "Must",
  should: "Should",
  skim: "Skim",
  unknown: "Unknown",
};

const TIER_STYLES: Record<RiskTier, string> = {
  must: "bg-danger/15 text-danger",
  should: "bg-warning/15 text-warning",
  skim: "bg-accent-soft text-accent-text",
  unknown: "bg-surface text-muted",
};

export function sortQueue(items: QueueItem[]): QueueItem[] {
  return [...items].sort(
    (a, b) =>
      TIER_RANK[b.risk.tier] - TIER_RANK[a.risk.tier] ||
      b.risk.score - a.risk.score ||
      a.title.localeCompare(b.title)
  );
}

export function ReviewQueueButton({
  boardName,
  onOpen,
}: ReviewQueueButtonProps) {
  const [mustCount, setMustCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchReviewQueue(boardName).then(({ items }) => {
      if (cancelled) return;
      setMustCount(items.filter((item) => item.risk.tier === "must").length);
    });
    return () => {
      cancelled = true;
    };
  }, [boardName]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      <Icon name="eye" size={12} />
      Review queue
      {mustCount > 0 && (
        <span
          aria-label={`${mustCount} must-review`}
          className="rounded-full bg-danger/15 px-1.5 py-0.5 font-mono text-[9px] leading-none text-danger"
        >
          {mustCount}
        </span>
      )}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-12 text-center text-[11px] leading-relaxed text-muted">
      Nothing to review. Cards in the review column will appear here.
    </div>
  );
}

function QueueRow({
  item,
  onSelect,
}: {
  item: QueueItem;
  onSelect?: (cardId: string) => void;
}) {
  const topReason = item.risk.reasons[0]?.detail;
  const lines = item.additions + item.deletions;
  return (
    <button
      type="button"
      data-testid="review-queue-item"
      onClick={() => onSelect?.(item.card_id)}
      className="flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-surface/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
    >
      <span
        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] ${
          TIER_STYLES[item.risk.tier]
        }`}
      >
        {TIER_LABEL[item.risk.tier]}
      </span>
      <span className="w-7 shrink-0 pt-0.5 text-right font-mono text-[12px] text-text">
        {item.risk.score}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-medium text-text">
          {item.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] text-muted/70">
          <span>{item.card_id}</span>
          {item.branch && (
            <>
              <span className="text-muted/35">·</span>
              <span className="truncate">{item.branch}</span>
            </>
          )}
          <span className="text-muted/35">·</span>
          <span>
            {item.files} files · +{item.additions} −{item.deletions}
          </span>
          {lines === 0 && <span className="text-muted/50">no diff resolved</span>}
        </span>
        <span className="mt-1 block text-[10px] leading-relaxed text-muted">
          {topReason || "No risk signals yet."}
        </span>
      </span>
      <Icon name="chevR" size={12} className="mt-1 shrink-0 text-muted/50" />
    </button>
  );
}

export function ReviewQueuePanel({
  open,
  boardName,
  onClose,
  onSelectCard,
}: ReviewQueuePanelProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchReviewQueue(boardName)
      .then(({ items: next }) => {
        if (!cancelled) setItems(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, boardName]);

  const sorted = useMemo(() => sortQueue(items), [items]);
  const mustCount = sorted.filter((item) => item.risk.tier === "must").length;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Review queue"
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-[560px] flex-col border-l border-border bg-bg shadow-2xl"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/80 px-4">
          <span className="text-[12.5px] font-medium text-text">Review queue</span>
          {mustCount > 0 && (
            <span className="rounded-full bg-danger/15 px-1.5 py-0.5 font-mono text-[9px] text-danger">
              {mustCount} must
            </span>
          )}
          <span className="ml-auto font-mono text-[9px] text-muted/60">
            risk-ranked
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close review queue"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.05] hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="h-16 w-full animate-pulse rounded border border-border/50 bg-surface/50"
                />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              {sorted.map((item) => (
                <QueueRow
                  key={item.card_id}
                  item={item}
                  onSelect={onSelectCard}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/70 px-4 py-2.5 text-[9.5px] leading-relaxed text-muted/60">
          Score combines security-sensitive paths, complexity, missing tests,
          churn, public API changes, and size. Unknown means no diff could be
          resolved for the card.
        </div>
      </aside>
    </div>
  );
}
