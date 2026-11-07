import React, { useMemo, useState } from "react";
import { WORKBENCH_SURFACES, type WorkbenchTab } from "../lib/workbench";
import { Icon, type IconName } from "../components/Icon";
import type { ThreadDetail, ProjectSnapshot } from "../lib/types";
import { canReviewMerge, checkState } from "../lib/run-state";

interface SurfacesPanelProps {
  boardName: string | null;
  activePanel?: WorkbenchTab | null;
  showThread: boolean;
  thread?: ThreadDetail | null;
  threadId?: string | null;
  project?: ProjectSnapshot | null;
  onSelectThread: (panel: WorkbenchTab) => void;
  onClose: () => void;
}

interface ActionItem {
  id: string;
  label: string;
  icon: IconName;
  action: () => void;
  isActive?: boolean;
}

interface ArtifactItem {
  id: string;
  title: string;
  icon: IconName;
  tab: WorkbenchTab;
  meta?: string;
}

interface SubagentItem {
  id: string;
  name: string;
  status: "active" | "idle" | "done";
}

interface TaskItem {
  id: string;
  title: string;
  status: "running" | "passed" | "failed";
  icon: IconName;
  meta?: string;
}

function humanAuthor(author: string): string {
  if (!author) return "Agent";
  if (author === "you") return "You";
  if (author === "barkcli" || author === "Bark Agent") return "Bark";
  return author
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function SurfacesPanel({
  boardName,
  activePanel,
  showThread,
  thread,
  threadId,
  project,
  onSelectThread,
  onClose,
}: SurfacesPanelProps) {
  const [search, setSearch] = useState("");
  const [showAllArtifacts, setShowAllArtifacts] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);

  const actions: ActionItem[] = useMemo(
    () => [
      {
        id: "review",
        label: "Review",
        icon: "filePlus",
        action: () => onSelectThread("diff"),
        isActive: activePanel === "diff",
      },
      {
        id: "open-file",
        label: "Open File",
        icon: "doc",
        action: () => onSelectThread("diff"),
        isActive: false,
      },
      {
        id: "terminal",
        label: "Terminal",
        icon: "terminal",
        action: () => {
          window.dispatchEvent(new CustomEvent("bark-open-terminal", { detail: threadId }));
          onSelectThread("eval");
        },
        isActive: activePanel === "eval",
      },
      {
        id: "browser",
        label: "Browser",
        icon: "globe",
        action: () => {
          const port = window.location.port || "4321";
          window.open(`http://localhost:${port}`, "_blank", "noopener,noreferrer");
        },
        isActive: false,
      },
    ],
    [activePanel, onSelectThread, threadId]
  );

  const artifacts: ArtifactItem[] = useMemo(() => {
    if (!thread) return [];
    const list: ArtifactItem[] = [];
    const seen = new Set<string>();
    const push = (item: ArtifactItem) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      list.push(item);
    };

    const hasPlan = (thread.events || []).some(
      (e) => e.kind === "plan_proposed" || e.kind === "plan_approved"
    );
    if (hasPlan) {
      push({
        id: "plan",
        title: thread.card?.title ? `${thread.card.title} plan` : "Implementation plan",
        icon: "doc",
        tab: "plan",
        meta: "thread plan",
      });
    }

    const runs = thread.runs || [];
    const latest = runs[runs.length - 1];
    if (runs.length > 0) {
      push({
        id: "changes",
        title: latest?.branch ? `Changes · ${latest.branch}` : "Changes",
        icon: "code",
        tab: "diff",
        meta: `${runs.length} attempt${runs.length === 1 ? "" : "s"}`,
      });
      push({
        id: "checks",
        title: "Checks",
        icon: "check",
        tab: "gate",
        meta: latest ? checkState(latest.gate).label : undefined,
      });
      if (canReviewMerge(latest) || latest?.gate || latest?.worktree) {
        push({
          id: "evidence",
          title: "Evidence",
          icon: "layers",
          tab: "receipt",
          meta: "run evidence",
        });
      }
    }

    if ((thread.events || []).length > 0) {
      push({
        id: "context",
        title: "Thread context",
        icon: "db",
        tab: "context",
        meta: `${thread.events.length} events`,
      });
    }

    return list;
  }, [thread]);

  const subagents: SubagentItem[] = useMemo(() => {
    if (!thread) return [];
    const set = new Map<string, SubagentItem>();
    for (const event of thread.events || []) {
      const author = typeof event.author === "string" ? event.author.trim() : "";
      if (!author || author === "you" || author === "Bark Agent" || author === "barkcli") continue;
      const looksLikeAgent =
        event.kind === "tool_call" ||
        event.kind === "assistant" ||
        event.kind === "status" ||
        event.kind === "gate" ||
        event.kind === "run_started";
      if (!looksLikeAgent) continue;
      const id = author.toLowerCase();
      if (!set.has(id)) {
        set.set(id, { id, name: humanAuthor(author), status: "done" });
      }
    }
    const running = thread.runs?.some((r) => r.status === "running" || r.status === "starting");
    if (running) {
      const first = set.values().next().value as SubagentItem | undefined;
      if (first) first.status = "active";
    }
    return Array.from(set.values()).slice(0, 12);
  }, [thread]);

  const tasks: TaskItem[] = useMemo(() => {
    if (!thread) return [];
    return (thread.runs || []).map((run) => {
      const isRunning = run.status === "running" || run.status === "starting";
      const isPassed = run.status === "passed" || run.status === "merged";
      return {
        id: run.id,
        title: run.branch || `Attempt ${run.ordinal || run.id.slice(0, 8)}`,
        status: isRunning ? "running" : isPassed ? "passed" : "failed",
        icon: isRunning ? "terminal" : isPassed ? "check" : "x",
        meta: [run.provider, run.role].filter(Boolean).join(" · ") || undefined,
      };
    });
  }, [thread]);

  const q = search.trim().toLowerCase();
  const filteredSurfaces = useMemo(() => {
    if (!q) return WORKBENCH_SURFACES;
    return WORKBENCH_SURFACES.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.letter.toLowerCase() === q ||
        s.id.toLowerCase().includes(q)
    );
  }, [q]);
  const filteredArtifacts = useMemo(
    () => (!q ? artifacts : artifacts.filter((a) => `${a.title} ${a.meta || ""}`.toLowerCase().includes(q))),
    [artifacts, q]
  );
  const filteredSubagents = useMemo(
    () => (!q ? subagents : subagents.filter((s) => s.name.toLowerCase().includes(q))),
    [subagents, q]
  );
  const filteredTasks = useMemo(
    () => (!q ? tasks : tasks.filter((t) => `${t.title} ${t.meta || ""}`.toLowerCase().includes(q))),
    [tasks, q]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = search.trim();
    if (!value) return;
    if (value.startsWith("http://") || value.startsWith("https://")) {
      window.open(value, "_blank", "noopener,noreferrer");
    } else if (value.startsWith("localhost:") || value.startsWith("127.0.0.1:")) {
      window.open(`http://${value}`, "_blank", "noopener,noreferrer");
    }
  };

  const visibleArtifacts = showAllArtifacts ? filteredArtifacts : filteredArtifacts.slice(0, 4);
  const visibleTasks = showAllTasks ? filteredTasks : filteredTasks.slice(0, 4);
  const hasSearch = q.length > 0;
  const hasAnyResults =
    filteredSurfaces.length + filteredArtifacts.length + filteredSubagents.length + filteredTasks.length > 0;

  return (
    <aside
      className="surfaces-list flex h-full min-h-0 flex-col overflow-hidden border-l border-border/70 bg-bg text-text select-none"
      aria-label="Thread surfaces"
    >
      <div className="border-b border-border/50 p-3 pb-2">
        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          <span className="pointer-events-none absolute left-3 text-muted/70">
            <Icon name="search" size={13} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search surfaces or enter a URL"
            aria-label="Search surfaces"
            className="h-8 w-full rounded-full border border-border/70 bg-bg pl-8 pr-8 text-[12px] text-text shadow-inner outline-none transition-colors placeholder:text-muted/60 hover:bg-card focus:border-accent/80 focus:bg-surface"
          />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 rounded p-0.5 text-muted hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            aria-label="Close thread panel"
            title="Close thread panel (⌘J)"
          >
            <Icon name="x" size={13} />
          </button>
        </form>
      </div>

      <div
        className="surfaces-list-body min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-2"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("input, textarea, select, [contenteditable=true]")) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const surface = WORKBENCH_SURFACES.find(
              (entry) => entry.letter === event.key.toUpperCase()
            );
            if (surface && showThread) {
              event.preventDefault();
              onSelectThread(surface.id);
            }
          }
        }}
      >
        {!showThread ? (
          <p className="surfaces-note p-2 text-[12px] leading-relaxed text-muted">
            Start a thread to see its plan, changes, checks, and evidence here. Project tools
            stay in the left rail.
          </p>
        ) : (
          <>
            {hasSearch && !hasAnyResults ? (
              <p className="rounded-lg border border-border/60 bg-surface/30 px-3 py-3 text-[12px] text-muted">
                No surfaces match “{search.trim()}”.
              </p>
            ) : null}

            {(!hasSearch || actions.some((a) => a.label.toLowerCase().includes(q))) && (
              <section aria-label="Quick actions" className="flex flex-col gap-0.5">
                {actions
                  .filter((a) => !hasSearch || a.label.toLowerCase().includes(q))
                  .map((act) => (
                    <button
                      key={act.id}
                      type="button"
                      onClick={act.action}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                        act.isActive
                          ? "bg-accent-soft font-medium text-accent-text"
                          : "text-muted-strong hover:bg-surface/60 hover:text-text"
                      }`}
                    >
                      <Icon name={act.icon} size={14} className="shrink-0 text-muted" />
                      <span>{act.label}</span>
                    </button>
                  ))}
              </section>
            )}

            {filteredSurfaces.length > 0 && (
              <section className="border-t border-border/40 pt-2" aria-label="Surfaces">
                <h2 className="px-3 pb-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted/70">
                  Surfaces
                </h2>
                <div className="flex flex-col gap-0.5">
                  {filteredSurfaces.map((surface) => (
                    <button
                      key={surface.id}
                      type="button"
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                        activePanel === surface.id
                          ? "bg-accent-soft font-medium text-accent-text"
                          : "text-muted-strong hover:bg-surface/60 hover:text-text"
                      }`}
                      aria-current={activePanel === surface.id ? "page" : undefined}
                      onClick={() => onSelectThread(surface.id)}
                    >
                      <Icon name={surface.icon} size={14} className="shrink-0 text-muted" />
                      <span className="flex-1 text-left">{surface.label}</span>
                      <kbd className="flex h-5 w-5 items-center justify-center rounded border border-border/70 bg-surface/40 font-mono text-[9.5px] font-semibold uppercase text-muted">
                        {surface.letter}
                      </kbd>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {filteredArtifacts.length > 0 && (
              <section className="border-t border-border/40 pt-2" aria-label="Artifacts">
                <div className="flex items-center justify-between px-3 pb-1">
                  <h2 className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-strong">
                    <span>Artifacts</span>
                    <span className="rounded-full bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
                      {filteredArtifacts.length}
                    </span>
                  </h2>
                </div>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {visibleArtifacts.map((art) => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => onSelectThread(art.tab)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[12px] text-muted-strong transition-colors hover:bg-surface/60 hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                      title={art.meta ? `${art.title} — ${art.meta}` : art.title}
                    >
                      <Icon name={art.icon} size={13} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{art.title}</span>
                      {art.meta ? (
                        <span className="shrink-0 text-[10px] text-muted/70">{art.meta}</span>
                      ) : null}
                    </button>
                  ))}
                  {filteredArtifacts.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setShowAllArtifacts(!showAllArtifacts)}
                      className="px-3 py-1 text-left text-[11px] font-medium text-muted transition-colors hover:text-accent-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    >
                      {showAllArtifacts ? "Show less" : "See all"}
                    </button>
                  )}
                </div>
              </section>
            )}

            {filteredSubagents.length > 0 && (
              <section className="border-t border-border/40 pt-2" aria-label="Subagents">
                <div className="flex items-center justify-between px-3 pb-1">
                  <h2 className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-strong">
                    <span>Subagents</span>
                    <span className="rounded-full bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
                      {filteredSubagents.length}
                    </span>
                  </h2>
                </div>
                <div className="mt-0.5 flex flex-col gap-1">
                  {filteredSubagents.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2 px-3 py-1 text-[12px] text-muted-strong">
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                          sub.status === "active"
                            ? "border-accent/40 bg-accent-soft text-accent-text"
                            : "border-success/40 bg-success-soft text-success"
                        }`}
                        aria-hidden="true"
                      >
                        <Icon name={sub.status === "active" ? "pulse" : "check"} size={9} />
                      </span>
                      <span className="truncate">{sub.name}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {filteredTasks.length > 0 && (
              <section className="border-t border-border/40 pt-2" aria-label="Background tasks">
                <div className="flex items-center justify-between px-3 pb-1">
                  <h2 className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-strong">
                    <span>Background Tasks</span>
                    <span className="rounded-full bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
                      {filteredTasks.length}
                    </span>
                  </h2>
                </div>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {visibleTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onSelectThread("gate")}
                      className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[12px] text-muted-strong transition-colors hover:bg-surface/60 hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                      title={task.meta ? `${task.title} — ${task.meta}` : task.title}
                    >
                      {task.status === "running" ? (
                        <Icon name="terminal" size={13} className="shrink-0 text-accent-text" />
                      ) : task.status === "passed" ? (
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-success/40 bg-success-soft text-success">
                          <Icon name="check" size={9} />
                        </span>
                      ) : (
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-danger/40 bg-danger-soft text-danger">
                          <Icon name="x" size={9} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      {task.meta ? <span className="shrink-0 text-[10px] text-muted/70">{task.meta}</span> : null}
                    </button>
                  ))}
                  {filteredTasks.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setShowAllTasks(!showAllTasks)}
                      className="px-3 py-1 text-left text-[11px] font-medium text-muted transition-colors hover:text-accent-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    >
                      {showAllTasks ? "Show less" : "See all"}
                    </button>
                  )}
                </div>
              </section>
            )}

            {!hasSearch && artifacts.length === 0 && subagents.length === 0 && tasks.length === 0 ? (
              <p className="px-3 py-1 text-[11.5px] leading-relaxed text-muted">
                No thread artifacts yet. Plan, changes, checks, and evidence will appear here as
                the thread produces them.
              </p>
            ) : null}
          </>
        )}
      </div>

      <footer className="surfaces-list-foot flex items-center justify-between border-t border-border/50 bg-surface/40 px-3.5 py-2 text-[10.5px] text-muted/70">
        <span className="truncate">{boardName ? `${boardName}.board` : "Project"}</span>
        <span>⌘J to close</span>
      </footer>
    </aside>
  );
}
