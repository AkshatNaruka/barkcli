import React from "react";
import { AccessibleDialog } from "./AccessibleDialog";
import { Icon } from "./Icon";
import { SettingsView, type SettingsSection } from "./SettingsView";
import type { Board as BoardType } from "../lib/types";

export interface GlobalSettingsModalProps {
  open: boolean;
  onClose: () => void;
  board?: BoardType | null;
  onSaveBoard?: (b: BoardType) => void;
  initialSection?: SettingsSection;
}

export function GlobalSettingsModal({
  open,
  onClose,
  board,
  onSaveBoard,
  initialSection = "projects",
}: GlobalSettingsModalProps) {
  if (!open) return null;

  return (
    <AccessibleDialog label="Settings" onClose={onClose} className="global-settings-dialog">
      <div className="flex flex-col h-full w-full overflow-hidden bg-surface text-text">
        <header className="h-12 px-4 flex items-center gap-2.5 border-b border-border shrink-0 bg-surface">
          <Icon name="gear" size={16} className="text-accent-text" />
          <h2 className="text-[13px] font-medium text-text">Settings</h2>
          <span className="text-[10px] text-muted/70 font-mono">⌘,</span>
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
          <SettingsView
            board={board}
            onSaveBoard={onSaveBoard}
            initialSection={initialSection}
          />
        </div>
      </div>
    </AccessibleDialog>
  );
}
