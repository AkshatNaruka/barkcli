import React, { useEffect, useMemo, useState } from "react";
import type { ThreadSummary } from "../lib/types";
import { connectWs, fetchThreads, deleteThread, updateThread } from "../lib/api";
import { navigate, useRouteState } from "../lib/hashnav";
import { filterThreads, relativeTime, threadStatus } from "../lib/threads";
import { Icon } from "../components/Icon";
import { ThreadActionsMenu, type ThreadActionTarget } from "./ThreadActionsMenu";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { ProjectAvatar } from "../components/ProjectAvatar";
import { ProjectSourcesModal } from "../components/ProjectSourcesModal";
import { ProjectPickerModal } from "../components/ProjectPickerModal";
import { isDesktop, projectDisplayName, switchProject } from "../lib/desktop";

import { PaneResizeHandle } from "../components/PaneResizeHandle";
import { readLocal, writeLocal } from "../lib/drafts";

interface ThreadListProps {
  boardName: string | null;
  projectRoot?: string;
  projectName?: string | null;
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  width?: number;
  onWidthChange?: (width: number) => void;
}

function isSettled(thread: ThreadSummary): boolean {
  return (thread.column || "").toLowerCase() === "done";
}

function threadProject(thread: ThreadSummary, fallbackName?: string | null): string {
  return projectDisplayName(
    thread.project_name || fallbackName,
    thread.project_root || null
  );
}

/**
 * Global thread navigator. Threads are not scoped to the open project: the
 * list shows activity from every project Bark has opened, T3-style — one flat
 * stream with the project badge on each row. Selecting a thread from another
 * project switches to that checkout, which is the only context a run can have.
 */
export function ThreadList({
  boardName,
  projectRoot,
  projectName,
  open = false,
  onClose,
  collapsed = false,
  width: propWidth,
  onWidthChange,
}: ThreadListProps) {
  const [internalWidth, setInternalWidth] = useState(() => {
    const saved = Number(readLocal("bark:sidebar-width")) || Number(readLocal("bark:thread-list-width"));
    return Math.min(580, Math.max(240, saved || 340));
  });

  const width = propWidth ?? internalWidth;

  const handleWidthChange = (next: number) => {
    const clamped = Math.min(580, Math.max(240, next));
    if (onWidthChange) {
      onWidthChange(clamped);
    } else {
      setInternalWidth(clamped);
      writeLocal("bark:sidebar-width", String(clamped));
      writeLocal("bark:thread-list-width", String(clamped));
    }
  };
  const location = useRouteState();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sourcesModalOpen, setSourcesModalOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [menu, setMenu] = useState<{ target: ThreadActionTarget; x: number; y: number } | null>(null);
  const [settledOpen, setSettledOpen] = useState(false);

  // Multi-Select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [favicons, setFavicons] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // No board scope: the navigator is global by design.
        const next = await fetchThreads();
        if (!cancelled) setThreads(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const changed = () => void load();
    window.addEventListener("bark-threads-changed", changed);
    const cleanup = connectWs(() => void load());
    return () => {
      cancelled = true;
      cleanup();
      window.removeEventListener("bark-threads-changed", changed);
    };
  }, []);

  const distinctProjects = useMemo(() => {
    const names = new Set<string>();
    for (const thread of threads) {
      const name = threadProject(thread).trim();
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [threads]);

  const filtered = useMemo(() => {
    const bySearch = filterThreads(threads, search).filter((thread) =>
      projectFilter === "all"
        ? true
        : threadProject(thread).trim() === projectFilter
    );
    return [...bySearch].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    });
  }, [threads, search, projectFilter]);

  const active = filtered.filter((thread) => !isSettled(thread));
  const settled = filtered.filter(isSettled);
  const total = filtered.length;

  // Best-effort application favicon for each distinct project. Desktop-only.
  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    const roots = new Map<string, string>();
    for (const thread of threads) {
      const name = threadProject(thread);
      if (name && thread.project_root && !roots.has(name)) roots.set(name, thread.project_root);
    }
    void (async () => {
      const { projectFavicon } = await import("../lib/desktop");
      for (const [name, root] of roots) {
        if (favicons[name] !== undefined) continue;
        const favicon = await projectFavicon(root);
        if (!cancelled) setFavicons((previous) => ({ ...previous, [name]: favicon }));
      }
    })();
    return () => { cancelled = true; };
  }, [threads]);

  const openMenu = (thread: ThreadSummary, x: number, y: number) => {
    setMenu({
      target: {
        id: thread.id,
        title: thread.title,
        pinned: Boolean(thread.pinned),
        settled: isSettled(thread),
      },
      x,
      y,
    });
  };

  const openThread = async (thread: ThreadSummary) => {
    const targetRoot = thread.project_root;
    const elsewhere = Boolean(
      targetRoot && projectRoot && targetRoot !== projectRoot
    );
    if (elsewhere && isDesktop()) {
      setSwitching(true);
      try {
        window.sessionStorage.setItem("bark:thread", thread.id);
      } catch { /* storage is optional */ }
      const opened = await switchProject(targetRoot!, "chat");
      if (!opened) {
        setSwitching(false);
        try { window.sessionStorage.removeItem("bark:thread"); } catch {}
      }
      return;
    }
    navigate("chat", { board: boardName || undefined, thread: thread.id });
    onClose?.();
  };

  // Writes must run in the project that owns the thread. For a thread from
  // another checkout we open that project first instead of mutating a
  // same-named card in the current board.
  const belongsHere = (thread: ThreadSummary) =>
    !thread.project_root || (Boolean(projectRoot) && thread.project_root === projectRoot);

  const handleTogglePin = async (event: React.MouseEvent, thread: ThreadSummary) => {
    event.stopPropagation();
    if (!belongsHere(thread)) {
      await openThread(thread);
      return;
    }
    await updateThread(thread.id, { board: boardName || undefined, pinned: !thread.pinned });
    window.dispatchEvent(new Event("bark-threads-changed"));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectable = filtered.filter((thread) => belongsHere(thread));
  const selectAll = () => setSelectedIds(new Set(selectable.map((thread) => thread.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      for (const id of idsToDelete) {
        await deleteThread(id, boardName || undefined);
      }
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      setSelectionMode(false);
      window.dispatchEvent(new Event("bark-threads-changed"));
      if (location.thread && idsToDelete.includes(location.thread)) {
        navigate("chat", { board: boardName || undefined, draft: "1" });
      }
    } finally {
      setBulkDeleting(false);
    }
  };

  const renderThreadRow = (thread: ThreadSummary) => {
    const status = threadStatus(thread);
    const current = thread.id === location.thread;
    const isSelected = selectedIds.has(thread.id);
    const name = threadProject(thread);
    const elsewhere = Boolean(
      thread.project_root && projectRoot && thread.project_root !== projectRoot
    );

    return (
      <div key={`${thread.project_root || ""}:${thread.id}`} className="thread-list-row-wrap group/row">
        {selectionMode ? (
          <div
            onClick={() => { if (belongsHere(thread)) toggleSelect(thread.id); }}
            title={belongsHere(thread) ? undefined : "Open this project to select this thread"}
            className={`flex items-center gap-2.5 w-full p-2 rounded-lg transition-colors ${
              belongsHere(thread) ? "cursor-pointer" : "cursor-default opacity-60"
            } ${isSelected ? "bg-accent-soft text-text" : "hover:bg-card text-muted-strong"}`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              disabled={!belongsHere(thread)}
              onChange={() => toggleSelect(thread.id)}
              className="accent-accent cursor-pointer shrink-0 rounded"
              onClick={(event) => event.stopPropagation()}
            />
            <ProjectAvatar name={name} size="xs" favicon={favicons[name]} />
            <span className="truncate flex-1 text-[11.5px] font-medium">{thread.title}</span>
            {thread.pinned && <Icon name="pin" size={10} className="text-accent shrink-0" />}
          </div>
        ) : (
          <>
            <button
              type="button"
              className={current ? "thread-list-row is-current" : "thread-list-row"}
              aria-current={current ? "page" : undefined}
              title={`${thread.title} — ${name}${elsewhere ? " (switch project to open)" : ""}`}
              onClick={() => void openThread(thread)}
              onContextMenu={(event) => {
                event.preventDefault();
                if (belongsHere(thread)) openMenu(thread, event.clientX, event.clientY);
              }}
            >
              <div className="thread-row-top">
                <div className="thread-row-projectline">
                  {current && <Icon name="pencil" size={11} className="text-amber-400 shrink-0" />}
                  <ProjectAvatar name={name} size="xs" favicon={favicons[name]} />
                  <span className="thread-row-project">{name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                  {thread.status_group === "failed" || thread.status_group === "blocked" || status.tone === "warning" ? (
                    <span className="text-rose-400 font-medium inline-flex items-center gap-1">
                      <Icon name="warn" size={11} />
                      <span>Failed</span>
                    </span>
                  ) : status.label === "running" ? (
                    <span className="text-amber-400 inline-flex items-center gap-1 font-medium">
                      <span className="thread-list-dot is-warning" />
                      <span>Working</span>
                    </span>
                  ) : (
                    <time dateTime={thread.updated_at} className="text-muted-dim">
                      {relativeTime(thread.updated_at)}
                    </time>
                  )}
                  {thread.pinned && <Icon name="pin" size={10} className="thread-list-pin" />}
                </div>
              </div>

              <div className="thread-row-bottom">
                <strong className="thread-row-title text-[13px] font-medium text-text">
                  <span>{thread.title}</span>
                </strong>
                <div className="flex items-center gap-1 shrink-0 text-muted-dim">
                  {elsewhere && isDesktop() && (
                    <span
                      className="thread-row-worktree text-[10px]"
                      title="Opens in its own project"
                    >
                      other project
                    </span>
                  )}
                  {thread.workspace_strategy === "worktree" && (
                    <span className="thread-row-worktree text-[10px] text-muted-dim" title="worktree">
                      worktree
                    </span>
                  )}
                </div>
              </div>
            </button>
            <div className="thread-row-actions">
              <button
                type="button"
                onClick={(event) => handleTogglePin(event, thread)}
                className="thread-row-action"
                title={thread.pinned ? "Unpin thread" : "Pin thread"}
              >
                <Icon name="pin" size={11} className={thread.pinned ? "text-accent" : ""} />
              </button>
              <button
                type="button"
                className="thread-row-action"
                aria-label={`Actions for ${thread.title}`}
                title={belongsHere(thread) ? "Thread actions" : "Open this project to manage"}
                onClick={(event) => {
                  if (!belongsHere(thread)) {
                    void openThread(thread);
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  openMenu(thread, rect.right + 4, rect.top);
                }}
              >
                <Icon name="dots" size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`thread-list ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Threads"
      style={open && typeof window !== "undefined" && window.innerWidth <= 900 ? undefined : { width }}
    >
      <header className="thread-list-head">
        <label className="thread-list-search flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/60 bg-bg text-muted focus-within:border-accent/80 transition-colors min-w-0">
          <Icon name="search" size={13} className="shrink-0 text-muted-dim" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            aria-label="Search threads"
            className="w-full bg-transparent text-[12px] text-text outline-none placeholder:text-muted/60"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="cursor-pointer">
              <Icon name="x" size={11} />
            </button>
          )}
        </label>
        <div className="thread-list-head-actions">
          {onClose && (
            <button type="button" className="thread-list-icon is-mobile" onClick={onClose} aria-label="Close threads" title="Close">
              <Icon name="x" size={14} />
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              className={`thread-list-icon ${projectFilter !== "all" ? "is-active" : ""}`}
              onClick={() => setProjectMenuOpen((value) => !value)}
              title="Filter by project"
              aria-label="Filter by project"
              aria-haspopup="menu"
              aria-expanded={projectMenuOpen}
            >
              <Icon name="filter" size={14} />
            </button>
            {projectMenuOpen && (
              <div className="thread-project-menu" role="menu" aria-label="Filter threads by project">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={projectFilter === "all"}
                  className={projectFilter === "all" ? "is-current" : ""}
                  onClick={() => { setProjectFilter("all"); setProjectMenuOpen(false); }}
                >
                  All projects
                </button>
                {distinctProjects.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="menuitemradio"
                    aria-checked={projectFilter === name}
                    className={projectFilter === name ? "is-current" : ""}
                    onClick={() => { setProjectFilter(name); setProjectMenuOpen(false); }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSourcesModalOpen(true)}
            className="thread-list-icon"
            title="Add project / Sources"
            aria-label="Add project / Sources"
          >
            <Icon name="folderPlus" size={14} />
          </button>
          <button
            type="button"
            onClick={() => setProjectPickerOpen(true)}
            className="thread-list-icon"
            title="Choose project (⌘1…)"
            aria-label="Choose project"
          >
            <Icon name="folder" size={14} />
          </button>
          <button
            type="button"
            onClick={() => navigate("chat", { draft: "1", board: boardName || undefined })}
            className="thread-list-new"
            title="New thread (⌘N)"
            aria-label="New thread"
          >
            <Icon name="plus" size={12} />
            <span>New</span>
          </button>
        </div>
      </header>

      {switching && (
        <p className="thread-list-note text-[11px] text-muted px-3 pb-2" role="status">
          Switching project…
        </p>
      )}

      {selectionMode && (
        <div className="mx-2 mb-2 p-2 rounded-lg bg-surface border border-border/80 flex flex-col gap-1.5 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-strong">
            <span>{selectedIds.size} of {filtered.length} selected</span>
            <button
              type="button"
              onClick={selectedIds.size === filtered.length ? deselectAll : selectAll}
              className="text-accent hover:underline text-[10.5px] cursor-pointer"
            >
              {selectedIds.size === filtered.length ? "Deselect" : "Select all"}
            </button>
          </div>
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => setConfirmBulkDelete(true)}
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[11px] font-medium border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-40 cursor-pointer"
            >
              <Icon name="trash" size={11} />
              <span>Delete ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      )}

      <div className="thread-list-body flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <p className="thread-list-note text-[11px] text-muted p-3" role="status">Loading threads…</p>
        ) : total === 0 ? (
          <div className="thread-list-empty">
            <p className="thread-list-note text-[11px] text-muted">
              {search || projectFilter !== "all"
                ? "No matching threads."
                : "Your threads will appear here."}
            </p>
            {!search && projectFilter === "all" && (
              <button
                type="button"
                className="thread-list-empty-action"
                onClick={() => navigate("chat", { draft: "1", board: boardName || undefined })}
              >
                <Icon name="plus" size={13} />
                <span>Start a thread</span>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="thread-list-stream space-y-0.5">
              {active.map((thread) => renderThreadRow(thread))}
            </div>
            {settled.length > 0 && (
              <section className="thread-list-settled">
                <button
                  type="button"
                  className="thread-list-settled-head"
                  aria-expanded={settledOpen}
                  onClick={() => setSettledOpen((value) => !value)}
                >
                  <Icon
                    name="chevR"
                    size={10}
                    className={`transition-transform duration-150 ${settledOpen ? "rotate-90" : ""}`}
                  />
                  <span>Settled</span>
                  <span className="thread-list-total">{settled.length}</span>
                </button>
                {settledOpen && (
                  <div className="thread-list-stream space-y-0.5">
                    {settled.map((thread) => renderThreadRow(thread))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <footer className="thread-list-foot">
        <button
          type="button"
          onClick={() => {
            setSelectionMode(!selectionMode);
            setSelectedIds(new Set());
          }}
          className={`thread-list-icon ${selectionMode ? "is-active" : ""}`}
          title={selectionMode ? "Exit multi-select" : "Select multiple threads"}
          aria-label={selectionMode ? "Exit multi-select" : "Select multiple threads"}
          aria-pressed={selectionMode}
        >
          <Icon name="checkSquare" size={13} />
        </button>
      </footer>

      {confirmBulkDelete && (
        <AccessibleDialog label="Confirm bulk deletion" onClose={() => setConfirmBulkDelete(false)} className="thread-dialog-shell">
          <div className="thread-dialog">
            <h2 className="text-danger">Delete {selectedIds.size} Threads?</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Are you sure you want to permanently delete the {selectedIds.size} selected threads? This will remove the threads and their conversation history.
            </p>
            <div className="thread-dialog-actions mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="bark-button text-[12px]"
                disabled={bulkDeleting}
                onClick={() => setConfirmBulkDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bark-danger text-[12px] flex items-center gap-1.5"
                disabled={bulkDeleting}
                onClick={handleBulkDelete}
              >
                <Icon name="trash" size={12} />
                <span>{bulkDeleting ? "Deleting…" : `Delete ${selectedIds.size} Threads`}</span>
              </button>
            </div>
          </div>
        </AccessibleDialog>
      )}

      {menu && (
        <ThreadActionsMenu
          target={menu.target}
          boardName={boardName}
          position={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
          onChanged={() => {
            window.dispatchEvent(new Event("bark-threads-changed"));
          }}
          onForked={(threadId) => {
            window.dispatchEvent(new Event("bark-threads-changed"));
            setMenu(null);
            navigate("chat", { board: boardName || undefined, thread: threadId });
          }}
          onDeleted={() => {
            window.dispatchEvent(new Event("bark-threads-changed"));
            setMenu(null);
            if (location.thread === menu.target.id) {
              navigate("chat", { board: boardName || undefined, draft: "1" });
            }
          }}
        />
      )}

      <ProjectSourcesModal
        isOpen={sourcesModalOpen}
        onClose={() => setSourcesModalOpen(false)}
        onSelectProject={(project) => {
          setSourcesModalOpen(false);
          void switchProject(project.path, "chat");
        }}
      />

      <ProjectPickerModal
        isOpen={projectPickerOpen}
        onClose={() => setProjectPickerOpen(false)}
        currentPath={projectRoot}
        onSelectProject={(project) => {
          setProjectPickerOpen(false);
          void switchProject(project.path, "chat");
        }}
      />
      <PaneResizeHandle
        label="Sidebar width"
        width={width}
        min={240}
        max={580}
        onChange={handleWidthChange}
        onReset={() => handleWidthChange(340)}
      />
    </aside>
  );
}
