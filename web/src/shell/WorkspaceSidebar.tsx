import React, { useEffect, useRef, useState } from "react";
import { connectWs, fetchReviewQueue } from "../lib/api";
import { navigate, useRouteState } from "../lib/hashnav";
import { readLocal, writeLocal } from "../lib/drafts";
import { Icon } from "../components/Icon";
import { PaneResizeHandle } from "../components/PaneResizeHandle";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { isDesktop, recentProjects, switchProject, type DesktopProject } from "../lib/desktop";
import { QuietSelect } from "../components/QuietSelect";
import {
  useSidebarLayout,
  visibleSidebarGroups,
  type SidebarTool,
} from "../lib/sidebarLayout";

export function WorkspaceSidebar({
  projectName,
  projectRoot,
  projectReady,
  boardName,
  boards,
  onSwitchBoard,
  onCommand,
  onNew,
  open,
  onClose,
}: {
  projectName: string | null;
  projectRoot: string;
  projectReady: boolean;
  boardName: string | null;
  boards: string[];
  onSwitchBoard: (name: string) => void;
  onCommand: (id: string) => void;
  onNew: () => void;
  open: boolean;
  onClose: () => void;
}) {
  const location = useRouteState();
  const layout = useSidebarLayout();
  const toolGroups = visibleSidebarGroups(layout);
  const [reviewCount, setReviewCount] = useState(0);
  const [recent, setRecent] = useState<DesktopProject[]>([]);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [width, setWidth] = useState(() => Math.min(300, Math.max(220, Number(readLocal("bark:sidebar-width")) || 248)));
  const sidebarRef = useRef<HTMLElement>(null);
  const toolsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchReviewQueue(boardName || undefined).then(({ items }) => {
        if (!cancelled) setReviewCount(items.length);
      });
    };
    void load();
    window.addEventListener("bark-threads-changed", load);
    const cleanup = connectWs(() => void load());
    return () => {
      cancelled = true;
      cleanup();
      window.removeEventListener("bark-threads-changed", load);
    };
  }, [boardName]);

  useEffect(() => {
    if (isDesktop()) void recentProjects().then(setRecent);
  }, [projectRoot]);

  useEffect(() => {
    const active = toolsRef.current?.querySelector<HTMLElement>(".sidebar-tool.is-active");
    active?.scrollIntoView({ block: "nearest" });
  }, [location.route, location.tool]);

  useEffect(() => {
    if (!open || window.innerWidth >= 900) return;
    const previous = document.activeElement as HTMLElement | null;
    sidebarRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, [open]);

  const chooseProject = async (project: DesktopProject) => {
    if (project.path === projectRoot) {
      go(() => navigate("chat"));
      return;
    }
    if (switching) return;
    setProjectError(null);
    setSwitching(true);
    const opened = await switchProject(project.path);
    setSwitching(false);
    if (!opened) {
      setProjectError("Could not open that project. Your current project remains open.");
    } else {
      go(() => navigate("chat"));
    }
  };

  const go = (action: () => void) => {
    action();
    onClose();
  };

  const toolIsActive = (item: SidebarTool) => {
    if (item.route !== location.route) return false;
    if (item.tool) return location.tool === item.tool;
    return true;
  };

  return (
    <>
      {open && <button className="workspace-sidebar-scrim" aria-label="Close sidebar" onClick={onClose} />}
      <aside
        ref={sidebarRef}
        className={`workspace-sidebar ${open ? "is-open" : ""}`}
        style={{ width }}
        aria-label="Workspace navigation"
        onKeyDown={(event) => {
          if (!open || window.innerWidth >= 900) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (event.key === "Tab") {
            const items = sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, summary, a[href], [tabindex="0"]');
            if (!items?.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="workspace-sidebar-head">
          {location.route === "projects" ? (
            <div className="sidebar-global">
              <div className="sidebar-workspace">
                <span className="sidebar-workspace-mark"><Icon name="grid" size={15} /></span>
                <div>
                  <strong>Bark</strong>
                  <small>Local workspace</small>
                </div>
              </div>
              <nav aria-label="Workspace">
                <a href="#/projects" aria-current="page" onClick={(event) => event.preventDefault()}>
                  <Icon name="grid" size={16} />Projects
                </a>
              </nav>
              <section className="sidebar-global-projects">
                <header>
                  <span>Recent projects</span>
                  <span>{recent.length}</span>
                </header>
                {recent.length === 0 ? (
                  <p>Open a folder to add your first project.</p>
                ) : (
                  recent.map((project) => (
                    <button
                      key={project.path}
                      type="button"
                      title={project.path}
                      aria-current={project.path === projectRoot ? "true" : undefined}
                      onClick={() => chooseProject(project)}
                    >
                      <Icon name="folder" size={12} />
                      <span>
                        <strong>{project.name}</strong>
                        <small>{project.path}</small>
                      </span>
                    </button>
                  ))
                )}
              </section>
              <button className="sidebar-open-folder" onClick={() => onCommand("open-project")} disabled={!isDesktop()}>
                <Icon name="plus" size={13} />
                Open folder…
              </button>
              {projectError && <p role="alert" className="sidebar-global-error">{projectError}</p>}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-text border-b border-border/40 select-none">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono font-semibold tracking-tight">barkcli</span>
                <span className="text-muted/40">•</span>
                <span className="font-mono text-[10.5px] text-muted-strong">v0.8.0</span>
              </div>
              <button className="sidebar-all-projects" onClick={() => go(() => navigate("projects"))}>
                <Icon name="grid" size={14} />
                All projects
                <Icon name="chevR" size={11} />
              </button>
              <section className="project-block" aria-label="Project folder">
                <div className="project-block-head">
                  <span className="project-mark" aria-hidden="true"><Icon name="folder" size={15} /></span>
                  <div className="project-block-copy">
                    <strong>{projectName || (projectReady ? "Current project" : "Choose a project")}</strong>
                    <small title={projectRoot}>{projectReady ? projectRoot : "Select a code folder"}</small>
                  </div>
                  {projectReady && (
                    <button
                      className="project-change"
                      onClick={() => onCommand("open-project")}
                      disabled={!isDesktop()}
                      title={isDesktop() ? "Choose a code folder" : "Available in the Bark app"}
                    >
                      Change
                    </button>
                  )}
                </div>
                {!projectReady && (
                  <>
                    <button className="project-open-primary" onClick={() => onCommand("open-project")} disabled={!isDesktop()}>
                      <Icon name="folder" size={15} />
                      Open code folder…
                    </button>
                    <p className="project-block-note">Choose a code folder from your Mac to start.</p>
                  </>
                )}
                {projectReady && boards.length > 1 && (
                  <div className="project-board-row">
                    <Icon name="board" size={12} />
                    <QuietSelect
                      value={boardName || boards[0]}
                      onChange={(event) => onSwitchBoard(event.target.value)}
                      aria-label="Board"
                      title="Switch board"
                      className="project-board-select"
                    >
                      {boards.map((name) => <option key={name} value={name}>{name}</option>)}
                    </QuietSelect>
                  </div>
                )}
              </section>
              {projectError && <p role="alert" className="text-danger text-xs">{projectError}</p>}
              <button className="sidebar-new" disabled={!projectReady} title={projectReady ? undefined : "Choose a code folder first"} onClick={() => { if (projectReady) go(onNew); }}>
                <Icon name="plus" size={14} />
                New thread
                <kbd>⌘N</kbd>
              </button>

              <nav ref={toolsRef} className="sidebar-tools" aria-label="Project tools">
                {toolGroups.length === 0 ? (
                  <div className="sidebar-tools-empty">
                    <p>Every tool is hidden.</p>
                    <button type="button" onClick={() => go(() => onCommand("customize-sidebar"))}>
                      <Icon name="sliders" size={13} />
                      Choose tools
                    </button>
                  </div>
                ) : toolGroups.map((group) => (
                  <section key={group.id} className="sidebar-tool-group">
                    <h2>{group.label}</h2>
                    {group.tools.map((item) => {
                      const active = toolIsActive(item);
                      return (
                        <a
                          key={item.id}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={active ? "sidebar-tool is-active" : "sidebar-tool"}
                          onClick={(event) => {
                            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                            event.preventDefault();
                            go(() => {
                              if (item.tool) navigate(item.route, { tool: item.tool });
                              else navigate(item.route);
                            });
                          }}
                        >
                          <Icon name={item.icon} size={15} />
                          <span>{item.label}</span>
                          {item.id === "chat" && reviewCount > 0 && (
                            <span className="sidebar-count" aria-label={`${reviewCount} awaiting review`}>{reviewCount}</span>
                          )}
                        </a>
                      );
                    })}
                  </section>
                ))}
              </nav>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border/40 text-[10.5px] font-mono text-muted/70 select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Autonomous Fleet Nominal</span>
        </div>
        <footer>
          <button onClick={() => go(() => onCommand("command-palette"))} title="Search or command (⌘K)" aria-label="Search or command">
            <Icon name="search" size={15} />
          </button>
          <button onClick={() => go(() => onCommand("usage"))} title="Usage & Limits (⌘U)">
            <Icon name="chart" size={14} />
            Usage
          </button>
          <button onClick={() => go(() => onCommand("settings"))}>
            <Icon name="gear" size={14} />
            Settings
          </button>
          <button onClick={() => go(() => onCommand("help"))}>Help</button>
          <button
            className="sidebar-customize-trigger"
            onClick={() => go(() => onCommand("customize-sidebar"))}
            title="Customize sidebar"
            aria-label="Customize sidebar"
          >
            <Icon name="sliders" size={14} />
          </button>
        </footer>
        <PaneResizeHandle
          label="Sidebar width"
          width={width}
          min={220}
          max={300}
          onChange={(value) => {
            setWidth(value);
            writeLocal("bark:sidebar-width", String(value));
          }}
        />
      </aside>
    </>
  );
}
