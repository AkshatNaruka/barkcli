import React, { useEffect, useMemo, useState } from "react";
import type { ThreadSummary } from "../lib/types";
import { connectWs, fetchThreads, deleteThread, updateThread } from "../lib/api";
import { navigate, useRouteState } from "../lib/hashnav";
import { filterThreads, groupThreads, relativeTime, threadStatus } from "../lib/threads";
import { Icon } from "../components/Icon";
import { ThreadActionsMenu, type ThreadActionTarget } from "./ThreadActionsMenu";
import {
  loadFolderState,
  createFolder,
  renameFolder,
  deleteFolder,
  toggleFolderCollapsed,
  moveThreadsToFolder,
  type ThreadFolder,
} from "../lib/threadFolders";
import { AccessibleDialog } from "../components/AccessibleDialog";

export function ThreadList({ boardName }: { boardName: string | null }) {
  const location = useRouteState();
  const scope = boardName || "default";
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<{ target: ThreadActionTarget; x: number; y: number } | null>(null);

  // Folder & Multi-Select state
  const [folderState, setFolderState] = useState(() => loadFolderState(scope));
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMoveFolderOpen, setBulkMoveFolderOpen] = useState(false);

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
    const onFoldersChanged = () => setFolderState(loadFolderState(scope));
    window.addEventListener("bark-folders-changed", onFoldersChanged);
    const cleanup = connectWs(() => void load());
    return () => {
      cancelled = true;
      cleanup();
      window.removeEventListener("bark-threads-changed", changed);
      window.removeEventListener("bark-folders-changed", onFoldersChanged);
    };
  }, [boardName, scope]);

  const filtered = useMemo(() => filterThreads(threads, search), [threads, search]);

  // Group threads into:
  // 1. Pinned threads
  // 2. Custom Folders (like ChatGPT)
  // 3. Default Unfiled groups (Needs you, Working, Recent, Settled)
  const pinnedThreads = useMemo(() => filtered.filter((t) => Boolean(t.pinned)), [filtered]);

  // Map non-pinned threads to folders
  const folderBuckets = useMemo(() => {
    const buckets: Record<string, ThreadSummary[]> = {};
    for (const folder of folderState.folders) {
      buckets[folder.id] = [];
    }
    for (const t of filtered) {
      if (t.pinned) continue;
      const fId = folderState.threadFolderMap[t.id];
      if (fId && buckets[fId]) {
        buckets[fId].push(t);
      }
    }
    return buckets;
  }, [filtered, folderState]);

  // Unfiled threads (not pinned and not in any folder)
  const unfiledThreads = useMemo(() => {
    return filtered.filter((t) => !t.pinned && !folderState.threadFolderMap[t.id]);
  }, [filtered, folderState]);

  const unfiledGroups = useMemo(() => groupThreads(unfiledThreads), [unfiledThreads]);
  const total = filtered.length;

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

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolder(scope, newFolderName.trim());
    setNewFolderName("");
    setShowNewFolder(false);
    setFolderState(loadFolderState(scope));
  };

  const handleRenameFolder = (folderId: string) => {
    if (!editFolderName.trim()) return;
    renameFolder(scope, folderId, editFolderName.trim());
    setEditingFolderId(null);
    setEditFolderName("");
    setFolderState(loadFolderState(scope));
  };

  const handleDeleteFolder = (folderId: string) => {
    if (window.confirm("Delete this folder? Threads inside will be moved to unfiled.")) {
      deleteFolder(scope, folderId);
      setFolderState(loadFolderState(scope));
    }
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

  const handleBulkMoveToFolder = (targetFolderId: string | null) => {
    if (selectedIds.size === 0) return;
    moveThreadsToFolder(scope, Array.from(selectedIds), targetFolderId);
    setFolderState(loadFolderState(scope));
    setBulkMoveFolderOpen(false);
    setSelectedIds(new Set());
    setSelectionMode(false);
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
              onClick={() =>
                navigate("chat", { board: boardName || undefined, thread: thread.id })
              }
              onContextMenu={(event) => {
                event.preventDefault();
                openMenu(thread, event.clientX, event.clientY);
              }}
            >
              <span className="thread-list-copy">
                <strong>
                  {thread.pinned && <Icon name="pin" size={10} className="thread-list-pin" />}
                  <span>{thread.title}</span>
                </strong>
                <small>
                  <span className={`thread-list-dot is-${status.tone}`} />
                  <span className="truncate">{thread.id}</span>
                  {thread.backend && (
                    <>
                      <span className="thread-list-sep">·</span>
                      <span>{thread.backend}</span>
                    </>
                  )}
                  <span className="thread-list-sep">·</span>
                  {relativeTime(thread.updated_at)}
                </small>
              </span>
            </button>
            <div className="absolute top-1.5 right-1 flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => handleTogglePin(e, thread)}
                className="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-card cursor-pointer"
                title={thread.pinned ? "Unpin thread" : "Pin thread"}
              >
                <Icon name="pin" size={11} className={thread.pinned ? "text-accent" : ""} />
              </button>
              <button
                type="button"
                className="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-text hover:bg-card cursor-pointer"
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
    <aside className="thread-list flex flex-col h-full bg-[#0a0908] border-r border-border/70 select-none overflow-hidden" aria-label="Threads">
      {/* Header with Title and Management Actions */}
      <header className="thread-list-head flex items-center justify-between px-3.5 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-text">Inbox</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigate("chat", { draft: "1", board: boardName || undefined })}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white/[0.08] hover:bg-white/[0.14] border border-border/60 text-text transition-colors cursor-pointer"
            title="New thread (⌘N)"
          >
            <Icon name="plus" size={11} />
            <span>New</span>
          </button>
          {/* New Folder Button */}
          <button
            type="button"
            onClick={() => {
              setShowNewFolder(!showNewFolder);
              setNewFolderName("");
            }}
            className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-text hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Create new folder"
          >
            <Icon name="folderPlus" size={13} />
          </button>
          {/* Multi-Select Toggle */}
          <button
            type="button"
            onClick={() => {
              setSelectionMode(!selectionMode);
              setSelectedIds(new Set());
            }}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors cursor-pointer ${
              selectionMode
                ? "bg-accent-soft text-accent-text"
                : "text-muted hover:text-text hover:bg-white/[0.06]"
            }`}
            title={selectionMode ? "Exit multi-select" : "Select multiple threads"}
          >
            <Icon name="checkSquare" size={13} />
          </button>
        </div>
      </header>

      {/* Inline Create Folder Form */}
      {showNewFolder && (
        <form onSubmit={handleCreateFolder} className="p-2 border-b border-border/50 bg-[#14120e] flex items-center gap-1.5">
          <Icon name="folder" size={13} className="text-accent shrink-0 ml-1" />
          <input
            autoFocus
            type="text"
            placeholder="Folder name…"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="flex-1 bg-transparent border-0 outline-none text-[11.5px] text-text placeholder:text-muted/60"
          />
          <button
            type="submit"
            disabled={!newFolderName.trim()}
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent text-bg disabled:opacity-40 cursor-pointer"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setShowNewFolder(false)}
            className="p-1 text-muted hover:text-text cursor-pointer"
          >
            <Icon name="x" size={11} />
          </button>
        </form>
      )}

      {/* Search Input */}
      <label className="thread-list-search flex items-center gap-2 mx-2.5 my-2 px-2.5 py-1.5 rounded-lg border border-border/60 bg-[#14120e] text-muted focus-within:border-accent/80 transition-colors">
        <Icon name="search" size={12} className="shrink-0" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter threads and intents…"
          aria-label="Search threads"
          className="w-full bg-transparent text-[11.5px] text-text outline-none placeholder:text-muted/60"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="cursor-pointer">
            <Icon name="x" size={11} />
          </button>
        )}
      </label>

      {/* Multi-Select Action Toolbar */}
      {selectionMode && (
        <div className="mx-2 mb-2 p-2 rounded-lg bg-[#161410] border border-border/80 flex flex-col gap-1.5 shadow-sm">
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
              onClick={() => setBulkMoveFolderOpen(true)}
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[11px] font-medium border border-border hover:bg-surface text-muted-strong disabled:opacity-40 cursor-pointer"
            >
              <Icon name="folder" size={11} />
              <span>Move…</span>
            </button>
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

      {/* Thread List Body */}
      <div className="thread-list-body flex-1 overflow-y-auto px-2 pb-4 space-y-3">
        {loading ? (
          <p className="thread-list-note text-[11px] text-muted p-3" role="status">Loading threads…</p>
        ) : total === 0 ? (
          <p className="thread-list-note text-[11px] text-muted p-3">
            {search ? "No matching threads." : "Your threads will appear here."}
          </p>
        ) : (
          <>
            {/* 1. PINNED THREADS SECTION */}
            {pinnedThreads.length > 0 && (
              <section className="thread-list-group">
                <header className="flex items-center justify-between px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-accent font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Icon name="pin" size={10} />
                    <span>Pinned</span>
                  </span>
                  <span>{pinnedThreads.length}</span>
                </header>
                <div className="space-y-0.5">
                  {pinnedThreads.map((thread) => renderThreadRow(thread))}
                </div>
              </section>
            )}

            {/* 2. CHATGPT-STYLE FOLDERS SECTION */}
            {folderState.folders.map((folder) => {
              const folderItems = folderBuckets[folder.id] || [];
              const isEditing = editingFolderId === folder.id;

              return (
                <section key={folder.id} className="thread-list-group rounded-lg bg-surface/20 border border-border/40 overflow-hidden">
                  <header
                    className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-muted-strong hover:bg-white/[0.04] cursor-pointer select-none"
                    onClick={() => {
                      toggleFolderCollapsed(scope, folder.id);
                      setFolderState(loadFolderState(scope));
                    }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <Icon
                        name="chevR"
                        size={10}
                        className={`text-muted/60 transition-transform duration-150 ${folder.collapsed ? "" : "rotate-90"}`}
                      />
                      <Icon name="folder" size={12} className="text-muted shrink-0" />
                      {isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          value={editFolderName}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleRenameFolder(folder.id);
                            } else if (e.key === "Escape") {
                              setEditingFolderId(null);
                            }
                          }}
                          className="w-full bg-[#14120e] px-1 py-0.5 rounded border border-accent text-[11px] text-text"
                        />
                      ) : (
                        <span className="truncate font-medium text-text">{folder.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      <span className="font-mono text-[9.5px] text-muted/60 px-1.5 py-0.2 rounded bg-surface/60">
                        {folderItems.length}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isEditing) {
                            handleRenameFolder(folder.id);
                          } else {
                            setEditingFolderId(folder.id);
                            setEditFolderName(folder.name);
                          }
                        }}
                        className="w-4 h-4 flex items-center justify-center text-muted hover:text-text cursor-pointer"
                        title={isEditing ? "Save name" : "Rename folder"}
                      >
                        <Icon name={isEditing ? "check" : "pencil"} size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder.id);
                        }}
                        className="w-4 h-4 flex items-center justify-center text-muted hover:text-danger cursor-pointer"
                        title="Delete folder"
                      >
                        <Icon name="trash" size={10} />
                      </button>
                    </div>
                  </header>

                  {!folder.collapsed && (
                    <div className="p-1 space-y-0.5 border-t border-border/30">
                      {folderItems.length === 0 ? (
                        <p className="px-3 py-1.5 text-[10.5px] text-muted/50 italic">No threads in this folder</p>
                      ) : (
                        folderItems.map((thread) => renderThreadRow(thread))
                      )}
                    </div>
                  )}
                </section>
              );
            })}

            {/* 3. UNFILED DEFAULT GROUPS */}
            {unfiledGroups.filter((g) => g.items.length > 0 && g.key !== "pinned").map((group) => (
              <section key={group.key} className="thread-list-group">
                <header className="flex items-center justify-between px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted font-medium">
                  <span>{group.key === "running" ? "Working" : group.key === "drafts" ? "Recent" : group.label}</span>
                  <span>{group.items.length}</span>
                </header>
                <div className="space-y-0.5">
                  {group.items.map((thread) => renderThreadRow(thread))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {/* Bulk Move to Folder Modal */}
      {bulkMoveFolderOpen && (
        <AccessibleDialog label="Move selected threads" onClose={() => setBulkMoveFolderOpen(false)} className="thread-dialog-shell">
          <div className="thread-dialog">
            <h2>Move {selectedIds.size} threads to folder</h2>
            <div className="flex flex-col gap-1.5 my-3 max-h-60 overflow-y-auto">
              <button
                type="button"
                onClick={() => handleBulkMoveToFolder(null)}
                className="flex items-center justify-between p-2 rounded-lg text-[12px] border border-border hover:bg-surface text-muted-strong text-left"
              >
                <span>(No folder / Unfiled)</span>
              </button>
              {folderState.folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleBulkMoveToFolder(f.id)}
                  className="flex items-center justify-between p-2 rounded-lg text-[12px] border border-border hover:bg-surface text-muted-strong text-left"
                >
                  <span className="flex items-center gap-2">
                    <Icon name="folder" size={13} />
                    <span>{f.name}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="thread-dialog-actions">
              <button type="button" className="bark-button" onClick={() => setBulkMoveFolderOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </AccessibleDialog>
      )}

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
    </aside>
  );
}
