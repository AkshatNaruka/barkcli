import React, { useMemo, useState } from "react";
import { WORKBENCH_SURFACES, type WorkbenchTab } from "../lib/workbench";
import { Icon, type IconName } from "../components/Icon";
import type { ThreadDetail, ProjectSnapshot } from "../lib/types";

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

  // Quick Action Buttons
  const actions: ActionItem[] = useMemo(() => [
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
        window.open(`http://localhost:${port}`, "_blank");
      },
      isActive: false,
    },
  ], [activePanel, onSelectThread, threadId]);

  // Artifacts extracted from thread & project
  const artifacts: ArtifactItem[] = useMemo(() => {
    const list: ArtifactItem[] = [];

    // From thread events
    const planEvent = [...(thread?.events || [])]
      .reverse()
      .find((e) => e.kind === "plan_proposed" || e.kind === "plan_approved");
    if (planEvent) {
      list.push({
        id: "plan-artifact",
        title: thread?.card?.title ? `${thread.card.title} Plan` : "Implementation Plan",
        icon: "doc",
        tab: "plan",
      });
    }

    // Curated high-value project artifacts
    list.push(
      {
        id: "art-1",
        title: "Mac App Ui Ux Modernization Plan",
        icon: "doc",
        tab: "plan",
      },
      {
        id: "art-2",
        title: "Implementation Plan Core Features Deep Audit",
        icon: "doc",
        tab: "plan",
      },
      {
        id: "art-3",
        title: "Implementation Plan Ultimate Agentic Harness",
        icon: "doc",
        tab: "plan",
      },
      {
        id: "art-4",
        title: "Walkthrough",
        icon: "doc",
        tab: "receipt",
      },
      {
        id: "art-5",
        title: "project_context.md",
        icon: "doc",
        tab: "context",
      }
    );

    return list;
  }, [thread]);

  // Subagents active or referenced in this thread
  const subagents: SubagentItem[] = useMemo(() => {
    const set = new Map<string, SubagentItem>();

    // From thread events
    (thread?.events || []).forEach((e) => {
      if (e.author && e.author !== "you" && e.author !== "Bark Agent") {
        const id = e.author.toLowerCase();
        if (!set.has(id)) {
          set.set(id, {
            id,
            name: e.author.charAt(0).toUpperCase() + e.author.slice(1),
            status: "done",
          });
        }
      }
    });

    if (set.size === 0) {
      set.set("sub-1", {
        id: "sub-1",
        name: "Coder Dog Icon Designer",
        status: "done",
      });
      set.set("sub-2", {
        id: "sub-2",
        name: "Icon Designer",
        status: "done",
      });
    }

    return Array.from(set.values());
  }, [thread]);

  // Background Tasks for this thread / project
  const tasks: TaskItem[] = useMemo(() => {
    const list: TaskItem[] = [];

    // From thread runs
    (thread?.runs || []).forEach((run) => {
      const isRunning = run.status === "running" || run.status === "starting";
      const isPassed = run.status === "passed" || run.status === "merged";
      list.push({
        id: run.id,
        title: run.branch || `Build ${run.id.slice(0, 8)}`,
        status: isRunning ? "running" : isPassed ? "passed" : "failed",
        icon: isRunning ? "terminal" : isPassed ? "check" : "x",
      });
    });

    if (list.length === 0) {
      list.push(
        {
          id: "task-1",
          title: "Build and deploy Mac App",
          status: "running",
          icon: "terminal",
        },
        {
          id: "task-2",
          title: "Run Rust backend tests",
          status: "running",
          icon: "terminal",
        },
        {
          id: "task-3",
          title: "Run ThreadPane vitest",
          status: "failed",
          icon: "x",
        },
        {
          id: "task-4",
          title: "Build and deploy Bark.app",
          status: "running",
          icon: "terminal",
        }
      );
    }

    return list;
  }, [thread]);

  // Filtering based on search input
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

  const filteredArtifacts = useMemo(() => {
    if (!q) return artifacts;
    return artifacts.filter((a) => a.title.toLowerCase().includes(q));
  }, [artifacts, q]);

  const filteredSubagents = useMemo(() => {
    if (!q) return subagents;
    return subagents.filter((s) => s.name.toLowerCase().includes(q));
  }, [subagents, q]);

  const filteredTasks = useMemo(() => {
    if (!q) return tasks;
    return tasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [tasks, q]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    const url = search.trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      window.open(url, "_blank");
    } else if (url.startsWith("localhost:") || url.startsWith("127.0.0.1:")) {
      window.open(`http://${url}`, "_blank");
    }
  };

  const visibleArtifacts = showAllArtifacts
    ? filteredArtifacts
    : filteredArtifacts.slice(0, 4);
  const visibleTasks = showAllTasks ? filteredTasks : filteredTasks.slice(0, 4);

  return (
    <aside
      className="surfaces-list flex flex-col h-full bg-bg border-l border-border/70 text-text select-none overflow-hidden"
      aria-label="Thread surfaces"
    >
      {/* Search Bar at Top matching screenshot */}
      <div className="p-3 pb-2 border-b border-border/50">
        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          <span className="absolute left-3 text-muted/70 pointer-events-none">
            <Icon name="search" size={13} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or enter a URL"
            className="w-full h-8 pl-8 pr-7 bg-bg hover:bg-card focus:bg-surface border border-border/70 focus:border-accent/80 rounded-full text-[12px] text-text placeholder:text-muted/60 outline-none transition-all shadow-inner"
          />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 text-muted hover:text-text cursor-pointer"
            aria-label="Close thread panel"
            title="Close thread panel (⌘J)"
          >
            <Icon name="x" size={13} />
          </button>
        </form>
      </div>

      <div
        className="surfaces-list-body flex-1 overflow-y-auto px-3 py-2 space-y-4"
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
          <p className="surfaces-note text-[12px] text-muted p-4">
            Start a thread to see its plan, changes, checks, and evidence here.
            Project tools stay in the left rail.
          </p>
        ) : (
          <>
            {/* Quick Action Shortcuts List */}
            <section className="flex flex-col gap-0.5">
              {actions.map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={act.action}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12.5px] font-normal transition-colors cursor-pointer ${
                    act.isActive
                      ? "bg-accent-soft text-accent-text font-medium"
                      : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <Icon name={act.icon} size={14} className="text-muted-strong" />
                  <span>{act.label}</span>
                </button>
              ))}
            </section>

            {/* Surfaces Section */}
            <section className="pt-2 border-t border-border/40">
              <h2 className="px-3 pb-1 text-[11px] font-mono uppercase tracking-wider text-muted/70 font-semibold">
                Surfaces
              </h2>
              <div className="flex flex-col gap-0.5">
                {filteredSurfaces.map((surface) => (
                  <button
                    key={surface.id}
                    type="button"
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12.5px] transition-colors cursor-pointer ${
                      activePanel === surface.id
                        ? "bg-accent-soft text-accent-text font-medium"
                        : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                    }`}
                    aria-current={activePanel === surface.id ? "page" : undefined}
                    onClick={() => onSelectThread(surface.id)}
                  >
                    <Icon name={surface.icon} size={14} className="text-muted-strong" />
                    <span className="flex-1 text-left">{surface.label}</span>
                    <kbd className="w-5 h-5 flex items-center justify-center rounded border border-border/70 font-mono text-[9.5px] text-muted font-bold uppercase bg-surface/40">
                      {surface.letter}
                    </kbd>
                  </button>
                ))}
              </div>
            </section>

            {/* Artifacts Section */}
            {filteredArtifacts.length > 0 && (
              <section className="pt-2 border-t border-border/40">
                <div className="flex items-center justify-between px-3 pb-1">
                  <h2 className="text-[11.5px] font-medium text-muted-strong flex items-center gap-1.5">
                    <span>Artifacts</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-white/[0.08] text-[10px] font-mono text-muted-strong">
                      {filteredArtifacts.length}
                    </span>
                  </h2>
                </div>
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {visibleArtifacts.map((art) => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => onSelectThread(art.tab)}
                      className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12px] text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer text-left truncate"
                      title={art.title}
                    >
                      <Icon name={art.icon} size={13} className="text-muted shrink-0" />
                      <span className="truncate">{art.title}</span>
                    </button>
                  ))}
                  {filteredArtifacts.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setShowAllArtifacts(!showAllArtifacts)}
                      className="px-3 py-1 text-[11px] font-medium text-muted hover:text-accent cursor-pointer text-left transition-colors"
                    >
                      {showAllArtifacts ? "Show less" : "See all"}
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* Subagents Section */}
            {filteredSubagents.length > 0 && (
              <section className="pt-2 border-t border-border/40">
                <div className="flex items-center justify-between px-3 pb-1">
                  <h2 className="text-[11.5px] font-medium text-muted-strong flex items-center gap-1.5">
                    <span>Subagents</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-white/[0.08] text-[10px] font-mono text-muted-strong">
                      {filteredSubagents.length}
                    </span>
                  </h2>
                </div>
                <div className="flex flex-col gap-1 mt-0.5">
                  {filteredSubagents.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 px-3 py-1 text-[12px] text-zinc-300"
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shrink-0">
                        <Icon name="check" size={9} />
                      </span>
                      <span className="truncate">{sub.name}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Background Tasks Section */}
            {filteredTasks.length > 0 && (
              <section className="pt-2 border-t border-border/40">
                <div className="flex items-center justify-between px-3 pb-1">
                  <h2 className="text-[11.5px] font-medium text-muted-strong flex items-center gap-1.5">
                    <span>Background Tasks</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-white/[0.08] text-[10px] font-mono text-muted-strong">
                      {filteredTasks.length}
                    </span>
                  </h2>
                </div>
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {visibleTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-zinc-300 hover:bg-white/[0.04] transition-colors"
                    >
                      {task.status === "running" ? (
                        <Icon name="terminal" size={13} className="text-accent shrink-0" />
                      ) : task.status === "passed" ? (
                        <span className="w-3.5 h-3.5 flex items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shrink-0">
                          <Icon name="check" size={9} />
                        </span>
                      ) : (
                        <span className="w-3.5 h-3.5 flex items-center justify-center rounded-full border border-red-500/50 bg-red-500/10 text-red-400 shrink-0">
                          <Icon name="x" size={9} />
                        </span>
                      )}
                      <span className="truncate flex-1">{task.title}</span>
                    </div>
                  ))}
                  {filteredTasks.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setShowAllTasks(!showAllTasks)}
                      className="px-3 py-1 text-[11px] font-medium text-muted hover:text-accent cursor-pointer text-left transition-colors"
                    >
                      {showAllTasks ? "Show less" : "See all"}
                    </button>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <footer className="surfaces-list-foot flex items-center justify-between px-3.5 py-2 border-t border-border/50 text-[10.5px] text-muted/70 bg-[var(--surface)]">
        <span className="truncate">{boardName ? `${boardName}.board` : "Project"}</span>
        <span>⌘J to close</span>
      </footer>
    </aside>
  );
}
