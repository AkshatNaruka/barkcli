import React from "react";
import { AccessibleDialog } from "./AccessibleDialog";
import { Icon } from "./Icon";
import { DocsView } from "./DocsView";

export interface GlobalDocsModalProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalDocsModal({ open, onClose }: GlobalDocsModalProps) {
  if (!open) return null;

  return (
    <AccessibleDialog label="Documentation & Guides" onClose={onClose} className="global-docs-dialog">
      <div className="flex flex-col h-full w-full overflow-hidden bg-bg text-text">
        <header className="h-12 px-4 flex items-center gap-2.5 border-b border-border shrink-0 bg-surface">
          <Icon name="doc" size={16} className="text-accent-text" />
          <h2 className="text-[13px] font-medium text-text">Documentation & Guides</h2>
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
        <div className="flex-1 min-h-0 overflow-hidden">
          <DocsView />
        </div>
      </div>
    </AccessibleDialog>
  );
}
