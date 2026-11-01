import React from "react";
import { WORKBENCH_SURFACES, type WorkbenchTab } from "../lib/workbench";
import { Icon } from "../components/Icon";

interface SurfacesPanelProps {
  boardName: string | null;
  activePanel?: WorkbenchTab | null;
  showThread: boolean;
  onSelectThread: (panel: WorkbenchTab) => void;
  onClose: () => void;
}

/**
 * Thread surfaces live beside the conversation. Project tools live in the left
 * rail, so this panel never competes with project navigation.
 */
export function SurfacesPanel({
  boardName,
  activePanel,
  showThread,
  onSelectThread,
  onClose,
}: SurfacesPanelProps) {
  return (
    <aside className="surfaces-list" aria-label="Thread surfaces">
      <header className="surfaces-list-head">
        <span>{showThread ? "This thread" : "Thread"}</span>
        <button
          type="button"
          className="bark-icon-button"
          onClick={onClose}
          aria-label="Close thread panel"
          title="Close thread panel (⌘J)"
        >
          <Icon name="x" size={15} />
        </button>
      </header>

      <div
        className="surfaces-list-body"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("input, textarea, select, [contenteditable=true]")) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const surface = WORKBENCH_SURFACES.find((entry) => entry.letter === event.key.toUpperCase());
            if (surface && showThread) {
              event.preventDefault();
              onSelectThread(surface.id);
            }
          }
        }}
      >
        {showThread ? (
          <section className="surfaces-group">
            <h2>Surfaces</h2>
            {WORKBENCH_SURFACES.map((surface) => (
              <button
                key={surface.id}
                type="button"
                className={`surface-row ${activePanel === surface.id ? "is-active" : ""}`}
                aria-current={activePanel === surface.id ? "page" : undefined}
                onClick={() => onSelectThread(surface.id)}
              >
                <Icon name={surface.icon} size={15} />
                <span>{surface.label}</span>
                <kbd className="surface-key">{surface.letter}</kbd>
              </button>
            ))}
          </section>
        ) : (
          <p className="surfaces-note">
            Start a thread to see its plan, changes, checks, and evidence here.
            Project tools stay in the left rail.
          </p>
        )}
      </div>

      <footer className="surfaces-list-foot">
        <span>{boardName ? `${boardName}.board` : "Project"}</span>
        <span>⌘J to close</span>
      </footer>
    </aside>
  );
}
