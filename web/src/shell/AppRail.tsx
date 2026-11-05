import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { SURFACES, type Surface } from "../lib/surfaces";
import { useTheme } from "../lib/theme";
import { isDesktop, recentProjects, switchProject, type DesktopProject } from "../lib/desktop";

export interface RailCounts {
  chat: number;
  board: number;
  agents: number;
}

/**
 * The app's left spine. One narrow rail owns global navigation, the project
 * switcher, and the utility actions — so every surface gets the full width of
 * the window instead of stacking sidebars.
 *
 * Digit shortcuts follow the visible order, so the rail and keyboard never
 * disagree. Labels are opt-in from Appearance.
 */
export function AppRail({
  surface,
  onNavigate,
  onCustomize,
  counts,
  projectName,
  projectRoot,
  projectReady,
  onAllProjects,
  onOpenProject,
  onCommand,
  onNew,
}: {
  surface: Surface;
  onNavigate: (s: Surface) => void;
  onCustomize: () => void;
  counts: RailCounts;
  projectName?: string | null;
  projectRoot?: string;
  projectReady?: boolean;
  onAllProjects: () => void;
  onOpenProject: () => void;
  onCommand: (id: string) => void;
  onNew: () => void;
}) {
  const { railStyle, railOrder, hidden } = useTheme();
  const labels = railStyle === "labels";
  const [projectOpen, setProjectOpen] = useState(false);
  const [recent, setRecent] = useState<DesktopProject[]>([]);
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectOpen) return;
    if (isDesktop()) void recentProjects().then(setRecent);
    const onPointer = (event: MouseEvent) => {
      if (!popover.current?.contains(event.target as Node)) setProjectOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProjectOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [projectOpen]);

  const items = railOrder
    .map((id) => SURFACES.find((s) => s.id === id))
    .filter((s): s is (typeof SURFACES)[number] => Boolean(s) && !hidden.includes(s!.id));

  const badge = (id: Surface) => {
    if (id === "chat") return counts.chat;
    if (id === "board") return counts.board;
    if (id === "agents") return counts.agents;
    return 0;
  };

  const badgeTone = (id: Surface) =>
    id === "agents"
      ? "bg-success/20 text-success"
      : id === "chat"
        ? "bg-warning/20 text-warning"
        : "bg-white/[0.07] text-muted-strong";

  const initial = (projectName || "b").replace(/[^a-z0-9]/gi, "").slice(0, 1).toLowerCase() || "b";

  const pickProject = async (project: DesktopProject) => {
    setProjectOpen(false);
    if (project.path === projectRoot) {
      onNavigate("chat");
      return;
    }
    const opened = await switchProject(project.path);
    if (!opened) onOpenProject();
  };

  return (
    <aside
      className={`app-rail ${labels ? "is-labelled" : ""}`}
      aria-label="App navigation"
    >
      <div className="app-rail-project">
        <button
          type="button"
          className="app-rail-brand"
          aria-haspopup="menu"
          aria-expanded={projectOpen}
          title={projectName ? `${projectName} — switch project` : "Choose a project"}
          onClick={() => setProjectOpen((open) => !open)}
        >
          <span className="app-rail-mark">{initial}</span>
          <span className="app-rail-presence" aria-hidden="true" />
        </button>
        {labels && (
          <button type="button" className="app-rail-project-copy" onClick={() => setProjectOpen((open) => !open)}>
            <strong>{projectName || (projectReady ? "Current project" : "No project")}</strong>
            <small>{projectRoot || "Choose a code folder"}</small>
          </button>
        )}

        {projectOpen && (
          <div ref={popover} className="app-rail-popover" role="menu" aria-label="Projects">
            <header>
              <span className="app-rail-mark">{initial}</span>
              <div>
                <strong>{projectName || "No project open"}</strong>
                <small>{projectRoot || "Choose a code folder to begin"}</small>
              </div>
            </header>
            <div className="app-rail-popover-actions">
              <button type="button" role="menuitem" onClick={() => { setProjectOpen(false); onNew(); }}>
                <Icon name="plus" size={14} /> New thread
              </button>
              <button type="button" role="menuitem" onClick={() => { setProjectOpen(false); onAllProjects(); }}>
                <Icon name="grid" size={14} /> All projects
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setProjectOpen(false); onOpenProject(); }}
                disabled={!isDesktop()}
                title={isDesktop() ? "Open a code folder" : "Available in the Bark desktop app"}
              >
                <Icon name="folder" size={14} /> Open folder…
              </button>
            </div>
            {recent.length > 0 && (
              <section className="app-rail-recent">
                <h3>Recent</h3>
                {recent.slice(0, 6).map((project) => (
                  <button
                    key={project.path}
                    type="button"
                    role="menuitem"
                    className={project.path === projectRoot ? "is-current" : ""}
                    title={project.path}
                    onClick={() => void pickProject(project)}
                  >
                    <Icon name="folder" size={12} />
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.path}</small>
                    </span>
                  </button>
                ))}
              </section>
            )}
          </div>
        )}
      </div>

      <nav className="app-rail-nav" aria-label="Surfaces">
        {items.map((s, index) => {
          const active = surface === s.id;
          const n = badge(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onNavigate(s.id)}
              title={`${s.label} — ${s.hint} (${index + 1})`}
              aria-current={active ? "page" : undefined}
              aria-label={s.label}
              className={`app-rail-item ${active ? "is-active" : ""}`}
            >
              <Icon name={s.icon} size={18} />
              {labels && <span className="app-rail-item-label">{s.label}</span>}
              {n > 0 && (
                <span className={`app-rail-badge ${badgeTone(s.id)}`}>
                  {n > 99 ? "99" : n}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="app-rail-foot">
        <button
          type="button"
          className="app-rail-item"
          onClick={() => onCommand("quick-open")}
          title="Quick open a file (⌘P)"
          aria-label="Quick open a file"
        >
          <Icon name="doc" size={17} />
          {labels && <span className="app-rail-item-label">Quick open</span>}
        </button>
        <button
          type="button"
          className="app-rail-item"
          onClick={() => onCommand("command-palette")}
          title="Search or command (⌘K)"
          aria-label="Search or command"
        >
          <Icon name="search" size={17} />
          {labels && <span className="app-rail-item-label">Search</span>}
        </button>
        <button
          type="button"
          className="app-rail-item"
          onClick={() => onCommand("usage")}
          title="Usage & limits (⌘U)"
          aria-label="Usage and limits"
        >
          <Icon name="chart" size={17} />
          {labels && <span className="app-rail-item-label">Usage</span>}
        </button>
        <button
          type="button"
          className="app-rail-item"
          onClick={onCustomize}
          title="Appearance (⌘,)"
          aria-label="Appearance"
        >
          <Icon name="palette" size={17} />
          {labels && <span className="app-rail-item-label">Appearance</span>}
        </button>
        <button
          type="button"
          className="app-rail-item"
          onClick={() => onCommand("settings")}
          title="Settings"
          aria-label="Settings"
        >
          <Icon name="gear" size={17} />
          {labels && <span className="app-rail-item-label">Settings</span>}
        </button>
      </div>
    </aside>
  );
}
