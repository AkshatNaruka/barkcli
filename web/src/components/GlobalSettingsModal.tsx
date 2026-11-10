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
      <div className="relative flex h-full w-full overflow-hidden bg-bg text-text">
        <SettingsView
          board={board}
          onSaveBoard={onSaveBoard}
          initialSection={initialSection}
          onClose={onClose}
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2.5 right-3.5 z-40 w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.08] transition-colors focus:outline-none"
          title="Close (Esc)"
          aria-label="Close"
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </AccessibleDialog>
  );
}

