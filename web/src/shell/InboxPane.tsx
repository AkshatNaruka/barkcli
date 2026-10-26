import React, { useState } from "react";
import type { ThreadSummary } from "../lib/types";
import { Icon } from "../components/Icon";

interface InboxPaneProps {
  threads: ThreadSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  loading?: boolean;
}

export function InboxPane({
  threads,
  selectedId,
  onSelect,
  onNew,
  loading = false,
}: InboxPaneProps) {
  const [search, setSearch] = useState("");

  const filtered = threads.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      (t.backend && t.backend.toLowerCase().includes(q))
    );
  });

  const needsYou = filtered.filter(
    (t) => t.status_group === "needs_you" || t.status_group === "blocked"
  );
  const running = filtered.filter(
    (t) => t.status_group === "running" || t.status_group === "doing"
  );
  const features = filtered.filter(
    (t) =>
      t.status_group === "features" ||
      t.status_group === "todo" ||
      (!["needs_you", "blocked", "running", "doing", "settled", "done"].includes(
        t.status_group
      ))
  );
  const settled = filtered.filter(
    (t) => t.status_group === "settled" || t.status_group === "done"
  );

  const renderItem = (t: ThreadSummary) => {
    const isSelected = t.id === selectedId;
    let statusIcon = "○";
    let iconClass = "text-muted";

    if (t.status_group === "needs_you" || t.status_group === "blocked") {
      statusIcon = "●";
      iconClass = "text-amber-400";
    } else if (t.status_group === "running" || t.status_group === "doing") {
      statusIcon = "◐";
      iconClass = "text-accent animate-pulse";
    } else if (t.status_group === "settled" || t.status_group === "done") {
      statusIcon = "✓";
      iconClass = "text-emerald-400";
    }

    return (
      <button
        key={t.id}
        onClick={() => onSelect(t.id)}
        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors flex items-start gap-2.5 ${
          isSelected
            ? "bg-white/[0.08] text-text font-medium border border-border"
            : "text-muted hover:text-text hover:bg-white/[0.03]"
        }`}
      >
        <span className={`shrink-0 text-sm font-bold mt-0.5 ${iconClass}`}>
          {statusIcon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="truncate text-[13px] leading-tight text-text">
            {t.title}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
            <span className="font-mono text-[10px]">{t.id}</span>
            {t.backend && (
              <span className="px-1.5 py-0.2 rounded bg-surface border border-border text-[10px]">
                {t.backend}
              </span>
            )}
            <span className="ml-auto text-[10px]">
              {t.event_count} events
            </span>
          </div>
        </div>
      </button>
    );
  };

  const renderSection = (
    title: string,
    items: ThreadSummary[],
    badgeColor: string,
    tooltip: string
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <div 
          className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-muted group cursor-help"
          title={tooltip}
        >
          <span className="flex items-center gap-1.5">
            {title}
            <span className="text-[9px] lowercase font-normal opacity-0 group-hover:opacity-100 transition-opacity">
              ({tooltip})
            </span>
          </span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono ${badgeColor}`}
          >
            {items.length}
          </span>
        </div>
        <div className="space-y-0.5 mt-1">{items.map(renderItem)}</div>
      </div>
    );
  };

  return (
    <div className="w-80 shrink-0 border-r border-border h-full flex flex-col bg-bg">
      <div className="p-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium text-sm text-text">
          <Icon name="inbox" size={16} />
          <span>Inbox</span>
        </div>
        <button
          onClick={onNew}
          title="New thread or intent (Cmd+N)"
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-accent text-bg hover:opacity-90 transition-opacity"
        >
          <span>+ New</span>
        </button>
      </div>

      <div className="p-2.5 border-b border-border">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search threads..."
            className="w-full bg-surface border border-border rounded-md px-2.5 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-2 text-muted hover:text-text"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="p-4 text-center text-xs text-muted">
            Loading threads...
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-4 rounded-lg bg-surface border border-border text-center space-y-3 m-1">
            <div className="text-xs font-semibold text-text">
              Welcome to barkcli
            </div>
            <div className="text-[11px] text-muted leading-relaxed">
              barkcli is the management layer for AI agents. Enter your intent and let agents build it in isolated worktrees.
            </div>
            <button
              onClick={onNew}
              className="w-full py-1.5 px-3 rounded text-xs font-medium bg-accent text-bg hover:opacity-90 transition-opacity"
            >
              Start First Intent
            </button>
          </div>
        )}
        {!loading && (
          <>
            {renderSection(
              "Needs you",
              needsYou,
              "bg-amber-500/20 text-amber-300",
              "awaiting your approval or feedback"
            )}
            {renderSection(
              "Running",
              running,
              "bg-accent/20 text-accent",
              "agents executing in isolated worktrees"
            )}
            {renderSection(
              "Features",
              features,
              "bg-surface text-muted",
              "queued specifications and tasks"
            )}
            {renderSection(
              "Settled",
              settled,
              "bg-emerald-500/20 text-emerald-300",
              "merged code verified by test gates"
            )}
          </>
        )}
      </div>
    </div>
  );
}
