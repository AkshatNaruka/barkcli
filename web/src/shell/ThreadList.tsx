import React, { useEffect, useMemo, useState } from "react";
import type { ThreadSummary } from "../lib/types";
import { connectWs, fetchThreads } from "../lib/api";
import { navigate, useRouteState } from "../lib/hashnav";
import { filterThreads, groupThreads, relativeTime, threadStatus } from "../lib/threads";
import { Icon } from "../components/Icon";
import { ThreadActionsMenu, type ThreadActionTarget } from "./ThreadActionsMenu";

/**
 * Docked thread list. It belongs to the Build workspace, not the project tool
 * rail, so switching context never opens a floating dialog.
 */
export function ThreadList({ boardName }: { boardName: string | null }) {
  const location = useRouteState();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<{ target: ThreadActionTarget; x: number; y: number } | null>(null);

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


  const groups = useMemo(
    () => groupThreads(filterThreads(threads, search)),
    [threads, search]
  );
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

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

  return (
    <aside className="thread-list" aria-label="Threads">
      <header className="thread-list-head">
        <span>Threads</span>
      </header>

      <label className="thread-list-search">
        <Icon name="search" size={13} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search threads…"
          aria-label="Search threads"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
            <Icon name="x" size={11} />
          </button>
        )}
      </label>

      <div className="thread-list-body">
        {loading ? (
          <p className="thread-list-note" role="status">Loading threads…</p>
        ) : total === 0 ? (
          <p className="thread-list-note">
            {search ? "No matching threads." : "Your threads will appear here."}
          </p>
        ) : (
          groups.filter((group) => group.items.length).map((group) => (
            <section key={group.key} className="thread-list-group">
              <header>
                <span>{group.key === "running" ? "Working" : group.key === "drafts" ? "Recent" : group.label}</span>
                <span>{group.items.length}</span>
              </header>
              {group.items.map((thread) => {
                const status = threadStatus(thread);
                const current = thread.id === location.thread;
                return (
                  <div key={thread.id} className="thread-list-row-wrap">
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
                          {status.label}
                          <span className="thread-list-sep">·</span>
                          {relativeTime(thread.updated_at)}
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="thread-list-more"
                      aria-label={`Actions for ${thread.title}`}
                      title="Thread actions"
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        openMenu(thread, rect.right + 4, rect.top);
                      }}
                    >
                      <Icon name="dots" size={13} />
                    </button>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>

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
