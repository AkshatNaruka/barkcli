import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchReviewQueue, fetchThreads, connectWs } from "../lib/api";
import { navigate, updateRouteState, useRouteState } from "../lib/hashnav";
import { readLocal, writeLocal, storageScope } from "../lib/drafts";
import { filterThreads, groupThreads, relativeTime, threadStatus } from "../lib/threads";
import type { ThreadSummary } from "../lib/types";
import { Icon } from "../components/Icon";
import { PaneResizeHandle } from "../components/PaneResizeHandle";
import { ThreadActionsMenu, type ThreadActionTarget } from "./ThreadActionsMenu";
import { isDesktop, recentProjects, switchProject, type DesktopProject } from "../lib/desktop";

export function WorkspaceSidebar({ projectName, projectRoot, projectReady, boardName, boards, onSwitchBoard, onCommand, onNew, open, onClose }: {
  projectName: string | null; projectRoot: string; projectReady: boolean; boardName: string | null; boards: string[];
  onSwitchBoard: (name: string) => void; onCommand: (id: string) => void; onNew: () => void;
  open: boolean; onClose: () => void;
}) {
  const location = useRouteState();
  const scope = storageScope(projectRoot, boardName);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<DesktopProject[]>([]);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [width, setWidth] = useState(() => Math.min(300, Math.max(220, Number(readLocal("bark:sidebar-width")) || 248)));
  const [menu, setMenu] = useState<{ target: ThreadActionTarget; x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const groups = useMemo(() => groupThreads(filterThreads(threads, search)), [threads, search]);
  const openMenu = (thread: ThreadSummary, x: number, y: number) =>
    setMenu({
      target: {
        id: thread.id,
        title: thread.title,
        pinned: Boolean(thread.pinned),
        settled: (thread.column || "").toLowerCase() === "done",
      },
      x,
      y,
    });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [list, queue] = await Promise.all([fetchThreads(boardName || undefined), fetchReviewQueue(boardName)]);
      if (cancelled) return;
      setThreads(list); setCount(queue.items.length); setLoading(false);
    };
    setLoading(true); void load();
    window.addEventListener("bark-threads-changed", load);
    const cleanup = connectWs(() => { void load(); });
    return () => { cancelled = true; cleanup(); window.removeEventListener("bark-threads-changed", load); };
  }, [boardName]);

  useEffect(() => {
    if (location.thread) writeLocal(`bark:last-thread:${scope}`, location.thread);
  }, [location.thread, scope]);
  useEffect(() => {
    if (location.route !== "chat" || location.thread || location.draft || loading) return;
    const last = readLocal(`bark:last-thread:${scope}`);
    if (last && threads.some((thread) => thread.id === last)) updateRouteState({ thread: last }, true);
  }, [location.route, location.thread, location.draft, loading, threads, scope]);
  useEffect(() => { if (isDesktop()) void recentProjects().then(setRecent); }, [projectRoot]);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]") || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/" && window.innerWidth >= 900) { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  useEffect(() => {
    if (!open || window.innerWidth >= 900) return;
    const previous = document.activeElement as HTMLElement | null;
    sidebarRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, [open]);

  const chooseProject = async (path: string) => {
    if (path === projectRoot) return;
    if (!window.confirm("Switch project? Drafts are saved. Switching restarts the local server and may interrupt active agents; their worktrees remain on disk.")) return;
    setProjectError(null);
    if (!await switchProject(path)) setProjectError("Could not open that project. Your current project remains open.");
  };
  const go = (action: () => void) => { action(); onClose(); };
  return <>
    {open && <button className="workspace-sidebar-scrim" aria-label="Close sidebar" onClick={onClose} />}
    <aside ref={sidebarRef} className={`workspace-sidebar ${open ? "is-open" : ""}`} style={{ width }} aria-label="Workspace navigation"
      onKeyDown={(event) => {
        if (!open || window.innerWidth >= 900) return;
        if (event.key === "Escape") { event.preventDefault(); onClose(); }
        if (event.key === "Tab") {
          const items = sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, summary, a[href], [tabindex="0"]');
          if (!items?.length) return;
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
      <div className="workspace-sidebar-head">
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
          <details className="project-recents">
            <summary>Recent folders</summary>
            <div className="project-picker-menu">
              {isDesktop() ? <><button onClick={() => onCommand("open-project")}>Open folder…</button>{recent.filter((project) => project.path !== projectRoot).map((project) => <button key={project.path} title={project.path} onClick={() => void chooseProject(project.path)}>{project.name}</button>)}</> : <p>Open the Bark app to choose a code folder.</p>}
              {boards.length > 1 && <label className="block mt-3">Board<select value={boardName || boards[0]} onChange={(event) => onSwitchBoard(event.target.value)} className="bark-field mt-1 w-full">{boards.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>}
            </div>
          </details>
        </section>
        {projectError && <p role="alert" className="text-danger text-xs">{projectError}</p>}
        <button className="sidebar-new" disabled={!projectReady} title={projectReady ? undefined : "Choose a code folder first"} onClick={() => { if (projectReady) go(onNew); }}><Icon name="plus" size={14} />New thread<kbd>⌘N</kbd></button>
        <nav aria-label="Primary navigation">
          <a href="#/chat" onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); go(() => navigate("chat")); }} aria-current={location.route === "chat" ? "page" : undefined}><Icon name="comment" size={16} />Build</a>
          <a href="#/review" onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); go(() => navigate("review")); }} aria-current={location.route === "review" ? "page" : undefined}><Icon name="eye" size={16} />Review{count > 0 && <span className="sidebar-count" aria-label={`${count} awaiting review`}>{count}</span>}</a>
        </nav>
      </div>
      <div className="sidebar-threads">
        <div className="sidebar-search"><Icon name="search" size={13} /><input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search threads" placeholder="Search threads…" /><kbd>/</kbd></div>
        {loading ? <p role="status" className="sidebar-empty">Loading threads…</p> : !threads.length ? <p className="sidebar-empty">Your threads will appear here.</p> : groups.every((group) => !group.items.length) ? <p className="sidebar-empty">No matching threads.</p> : groups.filter((group) => group.items.length).map((group) => {
          const rows = <div>{group.items.map((thread) => {
            const settled = (thread.column || "").toLowerCase() === "done";
            return <div key={thread.id} className="sidebar-thread-row" onContextMenu={(event) => { event.preventDefault(); openMenu(thread, event.clientX, event.clientY); }} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 64px" }}>
              <button className="sidebar-thread" aria-current={location.thread === thread.id ? "page" : undefined} title={thread.title} onClick={() => go(() => navigate("chat", { board: boardName || undefined, thread: thread.id }))}>
                <span className="sidebar-thread-title">{thread.pinned && <Icon name="pin" size={11} className="sidebar-pin" />}<span>{thread.title}</span></span>
                <span className="sidebar-thread-meta"><span>{threadStatus(thread).label}</span><time dateTime={thread.updated_at}>{relativeTime(thread.updated_at)}</time></span>
              </button>
              <button className="sidebar-thread-more" aria-label={`Actions for ${thread.title}`} title="Thread actions" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); openMenu(thread, rect.right + 6, rect.top); }}><Icon name="dots" size={14} /></button>
            </div>;
          })}</div>;
          return group.key === "settled" ? <details key={group.key} open={search ? true : undefined}><summary className="sidebar-group">Completed <span>{group.items.length}</span></summary>{rows}</details> : <section key={group.key}><h2 className="sidebar-group">{group.key === "running" ? "Working" : group.key === "drafts" ? "Recent" : group.label}<span>{group.items.length}</span></h2>{rows}</section>;
        })}
      </div>
      <footer><button onClick={() => go(() => onCommand("command-palette"))} title="Search or command (⌘K)" aria-label="Search or command"><Icon name="search" size={15} /></button><button onClick={() => go(() => onCommand("settings"))}><Icon name="gear" size={14} />Settings</button><button onClick={() => go(() => onCommand("help"))}>Help</button></footer>
      {menu && <ThreadActionsMenu
        target={menu.target}
        boardName={boardName}
        position={{ x: menu.x, y: menu.y }}
        onClose={() => setMenu(null)}
        onChanged={() => {
          window.dispatchEvent(new Event("bark-threads-changed"));
          window.dispatchEvent(new CustomEvent("bark-thread-updated", { detail: menu.target.id }));
        }}
        onForked={(threadId) => {
          window.dispatchEvent(new Event("bark-threads-changed"));
          go(() => navigate("chat", { board: boardName || undefined, thread: threadId }));
        }}
        onDeleted={() => {
          window.dispatchEvent(new Event("bark-threads-changed"));
          if (location.thread === menu.target.id) {
            go(() => navigate("chat", { board: boardName || undefined, draft: "1" }));
          }
        }}
      />}
      <PaneResizeHandle label="Sidebar width" width={width} min={220} max={300} onChange={(value) => { setWidth(value); writeLocal("bark:sidebar-width", String(value)); }} />
    </aside>
  </>;
}
