import React from "react";
import { AccessibleDialog } from "./AccessibleDialog";
import { Icon } from "./Icon";
import { UsageView } from "./UsageView";

export interface GlobalUsageModalProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalUsageModal({ open, onClose }: GlobalUsageModalProps) {
  if (!open) return null;

  return (
    <AccessibleDialog label="Usage & Limits" onClose={onClose} className="global-usage-dialog">
      <div className="flex flex-col h-full w-full overflow-hidden bg-bg text-text">
        <header className="h-12 px-4 flex items-center gap-2.5 border-b border-border shrink-0 bg-surface">
          <Icon name="chart" size={16} className="text-accent-text" />
          <h2 className="text-[13px] font-medium text-text">Usage & Limits</h2>
          <span className="text-[10px] text-muted/70 font-mono">⌘U</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.05]"
            title="Close (Esc)"
            aria-label="Close"
          >
            <Icon name="x" size={14} />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <UsageView />
        </div>
      </div>
    </AccessibleDialog>
  );
}
