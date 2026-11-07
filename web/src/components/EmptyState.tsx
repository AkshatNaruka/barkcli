import React from "react";
import { Icon, type IconName } from "./Icon";

export interface EmptyStateProps {
  /** Icon name from the Icon set, or a custom node. */
  icon?: IconName;
  iconNode?: React.ReactNode;
  title: string;
  description?: string;
  /** Primary action. */
  actionLabel?: string;
  onAction?: () => void;
  /** Secondary hint text. */
  hint?: string;
  className?: string;
  compact?: boolean;
}

/**
 * Reusable, accessible empty state. Calm, single focal point, clear next step.
 * Respects reduced motion (no entrance animation under prefers-reduced-motion).
 */
export function EmptyState({
  icon,
  iconNode,
  title,
  description,
  actionLabel,
  onAction,
  hint,
  className = "",
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center text-center animate-fadeIn ${compact ? "gap-2 py-6" : "gap-3 py-10"} px-4 ${className}`}
    >
      <div
        className={`grid place-items-center rounded-xl bg-surface/60 border border-border/60 text-muted ${compact ? "h-9 w-9" : "h-12 w-12"}`}
        aria-hidden="true"
      >
        {iconNode ?? (icon ? <Icon name={icon as IconName} size={compact ? 16 : 20} /> : null)}
      </div>
      <div className="max-w-sm space-y-1">
        <p className={`font-medium text-text ${compact ? "text-[12.5px]" : "text-[13.5px]"}`}>{title}</p>
        {description && (
          <p className={`text-muted leading-relaxed ${compact ? "text-[11.5px]" : "text-[12.5px]"}`}>
            {description}
          </p>
        )}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="bark-button text-[12px]"
        >
          {actionLabel}
        </button>
      )}
      {hint && (
        <p className="text-[10.5px] text-muted/70 font-mono">{hint}</p>
      )}
    </div>
  );
}

export default EmptyState;