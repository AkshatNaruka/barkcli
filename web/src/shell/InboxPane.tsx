import React, { useMemo, useRef, useState } from "react";
import type { ThreadSummary } from "../lib/types";
import { Icon } from "../components/Icon";
import { QuietSelect } from "../components/QuietSelect";
import { ServerStatus } from "../components/ServerStatus";
import {
  filterThreads,
  groupThreads,
  relativeTime,
  threadStatus,
} from "../lib/threads";

interface InboxPaneProps {
  threads: ThreadSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewChat?: () => void;
  loading?: boolean;
  boardName?: string | null;
  boards?: string[];
  onSwitchBoard?: (name: string) => void;
  onOpenPalette?: () => void;
  onCustomize?: () => void;
}

const DOT_TONE: Record<string, string> = {
  warning: "bg-warning",
  success: "bg-success",
  accent: "bg-accent",
  muted: "bg-muted/50",
};

function ThreadRow({
  thread,
  selected,
  onSelect,
}: {
  thread: ThreadSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = threadStatus(thread);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "page" : undefined}
      data-testid={`thread-row-${thread.id}`}
      className={`group relative flex w-full min-w-0 flex-col gap-1 rounded-[7px] py-2 pl-2.5 pr-2 text-left transition-colors ${
        selected
          ? "bg-white/[0.065] text-text"
          : "text-muted-strong hover:bg-white/[0.035] hover:text-text"
      }`}
    >
      {selected && (
        <span className="absolute bottom-2 left-0 top-2 w-[2px] rounded-full bg-accent" />
      )}
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_TONE[status.tone]}`}
          aria-label={status.label}
        />
        <span className={`min-w-0 flex-1 truncate text-[12.5px] ${selected ? "font-medium" : ""}`}>
          {thread.title}
        </span>
        <span className="shrink-0 font-mono text-[9.5px] text-muted/80">
          {relativeTime(thread.updated_at)}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 pl-3.5 font-mono text-[9.5px] text-muted/75">
        <span className="truncate">{thread.id}</span>
        {thread.backend && (
          <>
            <span className="text-muted/35">·</span>
            <span className="truncate">{thread.backend}</span>
          </>
        )}
        <span className="ml-auto shrink-0">{status.label}</span>
      </span>
    </button>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-1 px-1" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="space-y-1.5 rounded-[7px] px-2 py-2.5">
          <div className="h-2.5 w-4/5 animate-pulse rounded bg-surface" />
          <div className="h-2 w-2/5 animate-pulse rounded bg-surface/70" />
        </div>
      ))}
    </div>
  );
}

export function InboxPane({
  threads,
  selectedId,
  onSelect,
  onNew,
  onNewChat,
  loading = false,
  boardName,
  boards = [],
  onSwitchBoard,
  onOpenPalette,
  onCustomize,
}: InboxPaneProps) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => filterThreads(threads, search), [threads, search]);
  const groups = useMemo(() => groupThreads(filtered), [filtered]);

  // "/" focuses the navigator, matching the reference's search affordance.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <aside
      className="chat-sidebar flex h-full w-[304px] shrink-0 flex-col overflow-hidden border-r border-border/80"
      aria-label="Threads"
    >
      <div className="shrink-0 space-y-2 px-3 pb-2 pt-3">
        <div className="flex h-7 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            {boards.length > 0 && onSwitchBoard ? (
              <QuietSelect
                value={boardName || boards[0] || ""}
                onChange={(event) => onSwitchBoard(event.target.value)}
                title="Switch board"
                aria-label="Board"
                className="max-w-[176px] text-[12px] font-medium text-text hover:text-text"
                chevronClass="-ml-1"
              >
                {boards.map((name) => (
                  <option key={name} value={name}>
                    {name}.board
                  </option>
                ))}
              </QuietSelect>
            ) : (
              <span className="text-[12px] font-medium text-text">Bark</span>
            )}
            <span className="font-mono text-[9.5px] text-muted/70">{threads.length}</span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onOpenPalette}
              title="Command palette (⌘K)"
              aria-label="Command palette"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.05] hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <Icon name="search" size={13} />
            </button>
            <button
              type="button"
              onClick={onNewChat || onNew}
              title="New chat (read-only)"
              aria-label="New chat"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.05] hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <Icon name="comment" size={13} />
            </button>
            <button
              type="button"
              onClick={onNew}
              title="New intent (⌘N)"
              aria-label="New intent"
              data-testid="new-intent"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.05] hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <Icon name="plus" size={14} />
            </button>
          </div>
        </div>

        <div className="group relative flex h-8 items-center rounded-md border border-border/80 bg-surface/40 transition-colors focus-within:border-border-strong">
          <Icon name="search" size={12} className="ml-2.5 shrink-0 text-muted/70" />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearch("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Search threads"
            aria-label="Search threads"
            data-testid="thread-search"
            className="min-w-0 flex-1 bg-transparent px-2 text-[11.5px] text-text placeholder:text-muted/70 focus:outline-none"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="mr-1.5 flex h-5 w-5 items-center justify-center rounded text-muted hover:text-text"
              aria-label="Clear thread search"
            >
              <Icon name="x" size={10} />
            </button>
          ) : (
            <kbd className="mr-2 shrink-0 rounded border border-border/80 px-1 font-mono text-[9px] leading-4 text-muted/60">
              /
            </kbd>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <SkeletonRows />
        ) : filtered.length === 0 ? (
          <div className="px-2 py-10 text-center">
            <Icon name="inbox" size={16} className="mx-auto text-muted/50" />
            <p className="mt-2 text-[11px] text-muted">
              {search ? "No threads match that search." : "No threads on this board yet."}
            </p>
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-2 text-[11px] text-accent-text hover:underline"
              >
                Clear search
              </button>
            ) : (
              <button
                type="button"
                onClick={onNew}
                className="mt-2 text-[11px] text-accent-text hover:underline"
              >
                Describe an outcome
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {groups
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <section key={group.key} aria-labelledby={`thread-group-${group.key}`}>
                  <h2
                    id={`thread-group-${group.key}`}
                    className="flex h-7 items-center gap-1.5 px-2.5 text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted/75"
                  >
                    <span
                      className={`h-1 w-1 rounded-full ${
                        group.key === "needs_you"
                          ? "bg-warning"
                          : group.key === "running"
                            ? "bg-success"
                            : "bg-muted/50"
                      }`}
                    />
                    <span>{group.label}</span>
                    <span className="ml-auto font-mono text-[9px] tracking-normal text-muted/55">
                      {group.items.length}
                    </span>
                  </h2>
                  <div className="space-y-0.5">
                    {group.items.map((thread) => (
                      <ThreadRow
                        key={thread.id}
                        thread={thread}
                        selected={thread.id === selectedId}
                        onSelect={() => onSelect(thread.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
        <ServerStatus />
        <button
          type="button"
          onClick={onCustomize}
          title="Appearance (⌘,)"
          aria-label="Appearance"
          className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.05] hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <Icon name="palette" size={13} />
        </button>
      </footer>
    </aside>
  );
}
