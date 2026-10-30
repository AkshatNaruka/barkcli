import React from "react";
import { PROJECT_TOOLS, type ProjectTool } from "../lib/commands";
import { WORKBENCH_SURFACES, type WorkbenchTab } from "../lib/workbench";
import { Icon } from "../components/Icon";

interface SurfacesPanelProps {
  boardName: string | null;
  activePanel?: WorkbenchTab | null;
  showThread: boolean;
  onSelectThread: (panel: WorkbenchTab) => void;
  onOpenProjectTool: (tool: ProjectTool) => void;
  onOpenProjectHub: () => void;
  onClose: () => void;
}

const SHORTCUTS: Array<{ id: string; letter: string }> = [
  { id: "board", letter: "B" },
  { id: "agents", letter: "A" },
];

export function SurfacesPanel({
  boardName,
  activePanel,
  showThread,
  onSelectThread,
  onOpenProjectTool,
  onOpenProjectHub,
  onClose,
}: SurfacesPanelProps) {
  const shortcuts = SHORTCUTS.map((shortcut) => ({
    ...shortcut,
    tool: PROJECT_TOOLS.find((tool) => tool.id === shortcut.id)!,
  })).filter((shortcut) => shortcut.tool);

  const activate = (letter: string) => {
    const thread = showThread
      ? WORKBENCH_SURFACES.find((surface) => surface.letter === letter)
      : undefined;
    if (thread) {
      onSelectThread(thread.id);
      return;
    }
    const shortcut = shortcuts.find((entry) => entry.letter === letter);
    if (shortcut) {
      onOpenProjectTool(shortcut.tool);
      return;
    }
    if (letter === "T") onOpenProjectHub();
  };

  return (
    <aside className="surfaces-list" aria-label="Thread surfaces">
      <header className="surfaces-list-head">
        <span>{showThread ? "This thread" : "Project"}</span>
        <button
          type="button"
          className="bark-icon-button"
          onClick={onClose}
          aria-label="Close surfaces"
          title="Close surfaces (⌘J)"
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
            event.preventDefault();
            activate(event.key.toUpperCase());
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
          <p className="surfaces-note">Start a thread to see its plan, changes, and checks here.</p>
        )}

        <section className="surfaces-group">
          <h2>{showThread ? "Project" : "Project shortcuts"}</h2>
          {shortcuts.map(({ tool, letter }) => (
            <button
              key={tool.id}
              type="button"
              className="surface-row"
              onClick={() => onOpenProjectTool(tool)}
              title={tool.hint}
            >
              <Icon name={tool.icon} size={15} />
              <span>{tool.label}</span>
              <kbd className="surface-key">{letter}</kbd>
            </button>
          ))}
          <button
            type="button"
            className="surface-row"
            onClick={onOpenProjectHub}
            title="All project tools"
          >
            <Icon name="grid" size={15} />
            <span>Project tools</span>
            <kbd className="surface-key">T</kbd>
          </button>
        </section>
      </div>

      <footer className="surfaces-list-foot">
        <span>{boardName ? `${boardName}.board` : "Project"}</span>
        <span>⌘J to close</span>
      </footer>
    </aside>
  );
}
