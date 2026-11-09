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
import { switchProject } from "../lib/desktop";

export function ThreadList({ boardName, open = false, onClose, collapsed = false }: { boardName: string | null; open?: boolean; onClose?: () => void; collapsed?: boolean }) {
  const location = useRouteState();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sourcesModalOpen, setSourcesModalOpen] = useState(false);
  const [menu, setMenu] = useState<{ target: ThreadActionTarget; x: number; y: number } | null>(null);

  // Multi-Select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchThreads(boardName || undefined);
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
  }, [boardName]);

  const distinctProjects = useMemo(() => {
    const names = new Set<string>();
    for (const t of threads) {
      if (t.project_name && t.project_name.trim()) {
        names.add(t.project_name.trim());
      }
    }
    return Array.from(names);
  }, [threads]);

  const filtered = useMemo(() => {
    const bySearch = filterThreads(threads, search);
    if (projectFilter === "all") return bySearch;
    return bySearch.filter((t) => (t.project_name || "").trim() === projectFilter);
  }, [threads, search, projectFilter]);

  // Group threads by project
  const projectGroups = useMemo(() => {
    const map = new Map<string, ThreadSummary[]>();
    for (const t of filtered) {
      const pName = (t.project_name || "").trim() || "barkcli";
      if (!map.has(pName)) map.set(pName, []);
      map.get(pName)!.push(t);
    }
    return Array.from(map.entries()).map(([projectName, items]) => {
      const sorted = [...items].sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      return { projectName, items: sorted };
    });
  }, [filtered]);

  const total = filtered.length;

  const toggleProjectCollapsed = (projectName: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectName)) next.delete(projectName);
      else next.add(projectName);
      return next;
    });
  };

  const openMenu = (thread: ThreadSummary, x: number, y: number) => {
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
  };

  const handleTogglePin = async (e: React.MouseEvent, thread: ThreadSummary) => {
    e.stopPropagation();
    await updateThread(thread.id, { board: boardName || undefined, pinned: !thread.pinned });
    window.dispatchEvent(new Event("bark-threads-changed"));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map((t) => t.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

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

    return (
      <div key={thread.id} className="thread-list-row-wrap group/row">
        {selectionMode ? (
          <div
            onClick={() => toggleSelect(thread.id)}
            className={`flex items-center gap-2.5 w-full p-2 rounded-lg cursor-pointer transition-colors ${
              isSelected ? "bg-accent-soft text-text" : "hover:bg-card text-muted-strong"
            }`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(thread.id)}
              className="accent-accent cursor-pointer shrink-0 rounded"
              onClick={(e) => e.stopPropagation()}
            />
            <span className="truncate flex-1 text-[11.5px] font-medium">{thread.title}</span>
            {thread.pinned && <Icon name="pin" size={10} className="text-accent shrink-0" />}
          </div>
        ) : (
          <>
            <button
              type="button"
              className={current ? "thread-list-row is-current" : "thread-list-row"}
              aria-current={current ? "page" : undefined}
              title={thread.title}
              onClick={() => {
                navigate("chat", { board: boardName || undefined, thread: thread.id });
                onClose?.();
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                openMenu(thread, event.clientX, event.clientY);
              }}
            >
              {/* Row 1: Project Avatar, Project Name, Status / Time */}
              <div className="thread-row-top">
                <div className="flex items-center gap-1.5 min-w-0">
                  {current && (
                    <Icon name="pencil" size={11} className="text-amber-400 shrink-0" />
                  )}
                  <ProjectAvatar name={thread.project_name || "barkcli"} size="xs" />
                  <span
                    className="thread-row-project text-[12px] font-medium text-muted-strong hover:text-text truncate"
                    title={thread.project_root || thread.project_name || "barkcli"}
                  >
                    {thread.project_name || "barkcli"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                  {thread.status_group === "failed" || thread.status_group === "blocked" || status.tone === "warning" ? (
                    <span className="text-rose-400 font-medium inline-flex items-center gap-1">
                      <Icon name="warn" size={11} />
                      <span>Failed</span>
                    </span>
                  ) : status.label === "settled" || (thread.column || "").toLowerCase() === "done" ? (
                    <span className="text-muted-dim inline-flex items-center gap-1">
                      <Icon name="clock" size={10} />
                      <Icon name="check" size={10} />
                      <span>Settle</span>
                    </span>
                  ) : status.tone === "success" || status.tone === "accent" ? (
                    <span className="text-amber-400 inline-flex items-center gap-1 font-medium">
                      <span className="thread-list-dot is-warning" />
                      <span>Working</span>
                    </span>
                  ) : (
                    <time dateTime={thread.updated_at} className="text-muted-dim">
                      {relativeTime(thread.updated_at)}
                    </time>
                  )}
                </div>
              </div>

              {/* Row 2: Thread title and workspace / split icon */}
              <div className="thread-row-bottom flex items-center justify-between gap-2 w-full min-w-0">
                <strong className="thread-row-title text-[13px] font-medium text-text truncate flex items-center gap-1.5">
                  {thread.pinned && <Icon name="pin" size={10} className="thread-list-pin" />}
                  <span className="truncate">{thread.title}</span>
                </strong>
                <div className="flex items-center gap-1 shrink-0 text-muted-dim">
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
                onClick={(e) => handleTogglePin(e, thread)}
                className="thread-row-action"
                title={thread.pinned ? "Unpin thread" : "Pin thread"}
              >
                <Icon name="pin" size={11} className={thread.pinned ? "text-accent" : ""} />
              </button>
              <button
                type="button"
                className="thread-row-action"
                aria-label={`Actions for ${thread.title}`}
                title="Thread actions"
                onClick={(event) => {
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
    <aside className={`thread-list ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`} aria-label="Threads">
      {/* Header with Title and Action Buttons (New Thread & Add Project) */}
      <header className="thread-list-head">
        <div className="thread-list-title">
          <span>Threads</span>
          <span className="thread-list-total">{total}</span>
        </div>
        <div className="thread-list-head-actions">
          {onClose && (
            <button type="button" className="thread-list-icon is-mobile" onClick={onClose} aria-label="Close threads" title="Close">
              <Icon name="x" size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("chat", { draft: "1", board: boardName || undefined })}
            className="thread-list-new"
            title="New thread (⌘N)"
          >
            <Icon name="plus" size={12} />
            <span>New</span>
          </button>
          <button
            type="button"
            onClick={() => setSourcesModalOpen(true)}
            className="thread-list-icon"
            title="Add project / Sources"
            aria-label="Add project / Sources"
          >
            <Icon name="folderPlus" size={14} />
          </button>
        </div>
      </header>

      {/* Search Input and Select Icon (Clean search toolbar with no redundant buttons) */}
      <div className="flex items-center gap-1.5 mx-2.5 my-2">
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
        <button
          type="button"
          onClick={() => {
            setSelectionMode(!selectionMode);
            setSelectedIds(new Set());
          }}
          className={`p-1.5 rounded-md transition-colors ${
            selectionMode ? "text-accent bg-accent-soft" : "text-muted hover:text-text hover:bg-card"
          }`}
          title={selectionMode ? "Exit multi-select" : "Select multiple threads"}
          aria-label={selectionMode ? "Exit multi-select" : "Select multiple threads"}
          aria-pressed={selectionMode}
        >
          <Icon name="checkSquare" size={14} />
        </button>
      </div>

      {/* Cross-Project Filter Chips (shown when multiple projects exist) */}
      {distinctProjects.length > 1 && (
        <div
          className="mx-2.5 mb-2 flex items-center gap-1 overflow-x-auto pb-0.5"
          role="group"
          aria-label="Filter threads by project"
        >
          <button
            type="button"
            onClick={() => setProjectFilter("all")}
            className={`shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
              projectFilter === "all"
                ? "bg-accent/15 text-accent border border-accent/30"
                : "bg-surface/60 text-muted hover:text-text border border-border/50"
            }`}
          >
            All projects
          </button>
          {distinctProjects.map((projName) => (
            <button
              key={projName}
              type="button"
              onClick={() => setProjectFilter(projName)}
              className={`shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                projectFilter === projName
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "bg-surface/60 text-muted hover:text-text border border-border/50"
              }`}
            >
              {projName}
            </button>
          ))}
        </div>
      )}

      {/* Multi-Select Action Toolbar */}
      {selectionMode && (
        <div className="mx-2 mb-2 p-2 rounded-lg bg-surface border border-border/80 flex flex-col gap-1.5 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-strong">
            <span>{selectedIds.size} of {filtered.length} selected</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={selectedIds.size === filtered.length ? deselectAll : selectAll}
                className="text-accent hover:underline text-[10.5px] cursor-pointer"
              >
                {selectedIds.size === filtered.length ? "Deselect" : "Select all"}
              </button>
            </div>
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

      {/* Thread List Body: Same project threads grouped together */}
      <div className="thread-list-body flex-1 overflow-y-auto px-2 pb-4 space-y-3">
        {loading ? (
          <p className="thread-list-note text-[11px] text-muted p-3" role="status">Loading threads…</p>
        ) : total === 0 ? (
          <p className="thread-list-note text-[11px] text-muted p-3">
            {search ? "No matching threads." : "Your threads will appear here."}
          </p>
        ) : (
          projectGroups.map(({ projectName, items }) => {
            const isCollapsed = collapsedProjects.has(projectName);
            return (
              <section key={projectName} className="thread-list-group rounded-lg bg-surface/20 border border-border/40 overflow-hidden">
                <header
                  className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-muted-strong hover:bg-white/[0.04] cursor-pointer select-none"
                  onClick={() => toggleProjectCollapsed(projectName)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={!isCollapsed}
                  aria-label={`${projectName} project, ${items.length} threads`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Icon
                      name="chevR"
                      size={10}
                      className={`text-muted/60 transition-transform duration-150 ${isCollapsed ? "" : "rotate-90"}`}
                    />
                    <ProjectAvatar name={projectName} size="xs" />
                    <span className="truncate font-semibold text-text text-[12px]">{projectName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    <span className="font-mono text-[9.5px] text-muted/70 px-1.5 py-0.5 rounded bg-surface/60 border border-border/30">
                      {items.length}
                    </span>
                  </div>
                </header>

                {!isCollapsed && (
                  <div className="p-1 space-y-0.5 border-t border-border/30">
                    {items.map((thread) => renderThreadRow(thread))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      {/* Bulk Delete Confirmation Modal */}
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

      {/* Single Thread Context Actions Menu */}
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

      {/* Project Sources Modal */}
      <ProjectSourcesModal
        isOpen={sourcesModalOpen}
        onClose={() => setSourcesModalOpen(false)}
        onSelectProject={(proj) => {
          setSourcesModalOpen(false);
          switchProject(proj.path);
        }}
      />
    </aside>
  );
}
