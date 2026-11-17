import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { SURFACES, type Surface } from "../lib/surfaces";
import { useTheme } from "../lib/theme";
import {
  isDesktop,
  isScratchPath,
  projectSummaries,
  recentProjects,
  switchProject,
  type DesktopProject,
} from "../lib/desktop";

export interface RailCounts {
  chat: number;
  board: number;
  agents: number;
  review?: number;
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
  onCustomize?: () => void;
  counts?: RailCounts;
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
    if (isDesktop()) {
      // Summaries know which folders still exist, so the menu never offers a
      // project that cannot be opened.
      void projectSummaries().then((list) => {
        if (list.length) {
          setRecent(
            list
              .filter((project) => project.available && !isScratchPath(project.path))
              .map((project) => ({ name: project.name, path: project.path }))
          );
          return;
        }
        void recentProjects().then((projects) =>
          setRecent(projects.filter((project) => !isScratchPath(project.path)))
        );
      });
    }
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

  // Navigation is split by scope: threads and review belong to the whole app,
  // everything else is a project tool and shares the project switcher.
  const globalItems = items.filter((s) => s.id === "chat" || s.id === "review");
  const projectItems = items.filter((s) => s.id !== "chat" && s.id !== "review");

  const badge = (id: Surface) => {
    if (id === "chat") return counts?.chat ?? 0;
    if (id === "board") return counts?.board ?? 0;
    if (id === "agents") return counts?.agents ?? 0;
    if (id === "review") return counts?.review ?? 0;
    return 0;
  };

  const badgeTone = (id: Surface) =>
    id === "agents"
      ? "bg-success/20 text-success"
      : id === "chat"
        ? "bg-warning/20 text-warning"
        : id === "review"
          ? "bg-accent/20 text-accent font-mono font-medium"
          : "bg-white/[0.07] text-muted-strong";

  const renderItem = (s: (typeof SURFACES)[number], index: number) => {
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
  };

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
      data-tauri-drag-region
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
          <img className="app-rail-appicon" src="./icon-192.png" alt="" draggable={false} />
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
              <img className="app-rail-appicon" src="./icon-192.png" alt="" draggable={false} />
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

      <nav className="app-rail-nav is-global" aria-label="Global surfaces">
        {globalItems.map((s) => renderItem(s, 0))}
        <button
          type="button"
          onClick={onAllProjects}
          title="All projects"
          aria-current={surface === "projects" ? "page" : undefined}
          aria-label="All projects"
          className={`app-rail-item ${surface === "projects" ? "is-active" : ""}`}
        >
          <Icon name="folder" size={17} />
          {labels && <span className="app-rail-item-label">Projects</span>}
        </button>
      </nav>

      <span className="app-rail-divider" aria-hidden="true" />

      <nav className="app-rail-nav" aria-label="Project surfaces">
        {projectItems.map((s, index) => renderItem(s, index + 2))}
      </nav>

      <div className="app-rail-foot">
        <button
          type="button"
          className="app-rail-item"
          onClick={() => onCommand("docs")}
          title="Documentation & Guides"
          aria-label="Documentation and guides"
        >
          <Icon name="doc" size={17} />
          {labels && <span className="app-rail-item-label">Docs</span>}
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
          onClick={() => onCommand("settings")}
          title="Settings (⌘,)"
          aria-label="Settings"
        >
          <Icon name="gear" size={17} />
          {labels && <span className="app-rail-item-label">Settings</span>}
        </button>
      </div>
    </aside>
  );
}
