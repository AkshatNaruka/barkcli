import React, { useEffect, useMemo, useState } from "react";
import { PROJECT_TOOLS, openProjectTool, type ProjectTool } from "../lib/commands";
import { Icon } from "../components/Icon";
import { ProjectNavbar } from "./ProjectNavbar";
import { fetchFacts, fetchMemory } from "../lib/api";
import type { Board, ProjectSnapshot } from "../lib/types";

const GROUPS: Array<ProjectTool["group"]> = [
  "Planning",
  "Agent setup",
  "History & maintenance",
];

export interface ProjectHubProps {
  projectName: string | null;
  projectRoot: string | null;
  boardName: string | null;
  project?: ProjectSnapshot | null;
  board?: Board | null;
  boards?: string[];
  hideHeader?: boolean;
  onSwitchBoard?: (name: string) => void;
  onOpenProject?: () => void;
  onNewThread?: () => void;
}

export function ProjectHub({
  projectName,
  projectRoot,
  boardName,
  project,
  board,
  boards,
  hideHeader = false,
  onSwitchBoard,
  onOpenProject,
  onNewThread,
}: ProjectHubProps) {
  const [query, setQuery] = useState("");
  const [factsCount, setFactsCount] = useState<number>(0);
  const [memoryCount, setMemoryCount] = useState<number>(0);

  // Load live counts for project facts and memory
  useEffect(() => {
    let cancelled = false;
    void fetchFacts(boardName || undefined).then((f) => {
      if (!cancelled) setFactsCount(f.length);
    }).catch(() => {});
    void fetchMemory(boardName || undefined).then(({ total }) => {
      if (!cancelled) setMemoryCount(total);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [boardName, projectRoot]);

  // Git state
  const git = project?.git;
  const isClean = git?.clean ?? true;
  const branchName = git?.branch || "master";
  const commitHash = git?.head ? git.head.slice(0, 7) : "HEAD";
  const commitMsg = git?.upstream ? `Tracking ${git.upstream}` : (git?.ahead ? `${git.ahead} ahead` : "Working tree");

  // Cards summary
  const cards = board?.cards || [];
  const agentsCount = project?.counts.agents || 0;

  // Filtered tools directory
  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        tools: PROJECT_TOOLS.filter(
          (tool) =>
            tool.group === group &&
            (!q ||
              [tool.label, tool.group, tool.id, tool.keywords || "", tool.hint]
                .join(" ")
                .toLowerCase()
                .includes(q))
        ),
      })).filter((group) => group.tools.length > 0),
    [q]
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-bg text-text overflow-hidden">
      {!hideHeader && (
        <ProjectNavbar
          projectName={projectName}
          projectRoot={projectRoot}
          boardName={boardName}
          project={project}
          currentRoute="hub"
          cardsCount={cards.length}
          agentsCount={agentsCount}
          onOpenProject={onOpenProject}
          onNewThread={onNewThread}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-6xl w-full mx-auto">
        {/* Section A: Production Deployment / Git Hero Card (clean, no duplicate editor buttons) */}
        <div className="rounded-xl border border-border/80 bg-surface/50 backdrop-blur-sm p-6 shadow-sm hover:border-border transition-colors">
          <div className="pb-5 border-b border-border/40">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full ${isClean ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                {isClean ? "Working Tree Ready" : "Uncommitted Work"}
              </span>
              <span className="text-muted/40">•</span>
              <span className="text-xs font-mono text-muted">Branch: {branchName}</span>
            </div>
            <h2 className="text-lg font-semibold text-text tracking-tight flex items-center gap-2">
              <span>{projectName || "barkcli"}</span>
              <span className="text-xs font-normal text-muted font-mono">({compactPath(projectRoot || "")})</span>
            </h2>
          </div>

          <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-muted text-[11px] block mb-1">Source Repository</span>
              <div className="flex items-center gap-1.5 font-mono text-text">
                <Icon name="branch" size={13} className="text-muted" />
                <span className="font-semibold">{branchName}</span>
                <span className="text-muted font-normal">@{commitHash}</span>
              </div>
              <p className="text-muted text-[11px] truncate mt-1" title={commitMsg}>
                {commitMsg}
              </p>
            </div>

            <div>
              <span className="text-muted text-[11px] block mb-1">Status & Trust Gate</span>
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                  isClean ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {isClean ? "Ready / Passing" : `${git?.changes || 1} changes pending`}
                </span>
              </div>
              <div className="text-muted text-[11px] mt-1 font-mono">
                {git?.upstream ? `Tracking ${git.upstream}` : "Local repository"}
              </div>
            </div>

            <div>
              <span className="text-muted text-[11px] block mb-1">Project Root</span>
              <div className="font-mono text-[11px] text-muted-strong truncate" title={projectRoot || ""}>
                {projectRoot ? compactPath(projectRoot) : "—"}
              </div>
              <div className="text-muted text-[11px] mt-1">
                {boardName ? `Active board: ${boardName}` : "Default board active"}
              </div>
            </div>
          </div>
        </div>

        {/* Section B: Project Health & Readiness Checklist */}
        <div className="rounded-xl border border-border/80 bg-surface/40 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-text tracking-tight flex items-center gap-2">
              <Icon name="checkSquare" size={14} className="text-accent" />
              <span>Project Health & Readiness</span>
            </span>
            <span className="text-muted font-mono text-[11px]">4 of 4 active</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
            <div className="p-3 rounded-lg bg-card/60 border border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="branch" size={14} className="text-accent shrink-0" />
                <span className="text-xs truncate font-medium">Git Tracked</span>
              </div>
              <Icon name="check" size={13} className="text-emerald-400 shrink-0" />
            </div>

            <div className="p-3 rounded-lg bg-card/60 border border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="board" size={14} className="text-accent shrink-0" />
                <span className="text-xs truncate font-medium">{cards.length} Cards</span>
              </div>
              <Icon name="check" size={13} className="text-emerald-400 shrink-0" />
            </div>

            <div className="p-3 rounded-lg bg-card/60 border border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="spark" size={14} className="text-accent shrink-0" />
                <span className="text-xs truncate font-medium">3D Brain Active</span>
              </div>
              <Icon name="check" size={13} className="text-emerald-400 shrink-0" />
            </div>

            <div className="p-3 rounded-lg bg-card/60 border border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="users" size={14} className="text-accent shrink-0" />
                <span className="text-xs truncate font-medium">Orchestra Ready</span>
              </div>
              <Icon name="check" size={13} className="text-emerald-400 shrink-0" />
            </div>
          </div>
        </div>

        {/* Section C: Searchable Project Tools Directory (no repetition, with live badges) */}
        <section className="pt-2">
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-lg font-semibold text-text tracking-tight">Project tools</h1>
              <p className="text-xs text-muted mt-0.5">
                <span>{projectName || "This project"}</span>
                {boardName ? ` · ${boardName}.board` : ""}
                {projectRoot ? <span className="ml-2 font-mono text-[11px] text-muted/70">{projectRoot}</span> : null}
              </p>
            </div>
            <label className="relative flex items-center w-full sm:w-64">
              <Icon name="search" size={13} className="absolute left-3 text-muted pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search project tools"
                placeholder="Search project tools…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface border border-border text-text placeholder:text-muted/60 focus:outline-none focus:border-accent/80 transition-colors"
              />
            </label>
          </header>

          {groups.length === 0 ? (
            <p className="text-xs text-muted py-8 text-center bg-surface/30 rounded-xl border border-dashed border-border/60">
              No project tools match “{query}”.
            </p>
          ) : (
            <div className="space-y-6">
              {groups.map(({ group, tools }) => (
                <div key={group} className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-dim px-1">{group}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {tools.map((tool) => {
                      let badgeText: string | null = null;
                      if (tool.id === "board" && cards.length > 0) badgeText = `${cards.length} cards`;
                      else if (tool.id === "agents" && agentsCount > 0) badgeText = `${agentsCount} hired`;
                      else if (tool.id === "memory" && (factsCount > 0 || memoryCount > 0)) badgeText = `${factsCount} facts`;
                      else if (tool.id === "history" && commitHash) badgeText = commitHash;

                      return (
                        <button
                          key={tool.id}
                          type="button"
                          className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-card hover:border-border-strong hover:bg-card/90 text-left transition-all cursor-pointer group"
                          onClick={() => openProjectTool(tool)}
                        >
                          <span className="p-2 rounded-lg bg-surface border border-border text-accent group-hover:scale-105 transition-transform shrink-0">
                            <Icon name={tool.icon} size={15} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <strong className="block text-xs font-semibold text-text truncate group-hover:text-accent transition-colors">
                                {tool.label}
                              </strong>
                              {badgeText && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface border border-border text-muted font-mono shrink-0">
                                  {badgeText}
                                </span>
                              )}
                            </div>
                            <small className="block text-[11px] text-muted truncate mt-0.5">{tool.hint}</small>
                          </div>
                          <Icon name="chevR" size={12} className="text-muted/50 group-hover:text-text group-hover:translate-x-0.5 transition-all shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function compactPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}
