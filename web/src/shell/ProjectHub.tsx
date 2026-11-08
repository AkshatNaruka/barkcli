import React, { useEffect, useMemo, useRef, useState } from "react";
import { PROJECT_TOOLS, openProjectTool, type ProjectTool } from "../lib/commands";
import { Icon, type IconName } from "../components/Icon";
import { ProjectAvatar } from "../components/ProjectAvatar";
import { navigate } from "../lib/hashnav";
import {
  isDesktop,
  recentProjects,
  switchProject,
  openTerminal,
  revealProject,
  openProjectDialog,
  type DesktopProject,
} from "../lib/desktop";
import { openInEditor, fetchReviewQueue, fetchFacts, fetchMemory } from "../lib/api";
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
  onSwitchBoard?: (name: string) => void;
  onOpenProject?: () => void;
}

function VsCodeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.27a1 1 0 0 0-.008 1.42l3.473 3.31-3.473 3.31a1 1 0 0 0 .008 1.42l1.322 1.212a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 19.86V4.14a1.5 1.5 0 0 0-.85-1.553z"
        fill="#007ACC"
      />
    </svg>
  );
}

function AntigravityIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 19L11.5 4.5C11.8 3.8 12.2 3.8 12.5 4.5L20 19" stroke="url(#agGradHub)" strokeWidth="3" strokeLinecap="round" />
      <path d="M7 14.5H17" stroke="url(#agGradHub2)" strokeWidth="2.5" strokeLinecap="round" />
      <defs>
        <linearGradient id="agGradHub" x1="4" y1="19" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="0.5" stopColor="#818CF8" />
          <stop offset="1" stopColor="#F472B6" />
        </linearGradient>
        <linearGradient id="agGradHub2" x1="7" y1="14.5" x2="17" y2="14.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function RiderIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#000" stroke="#FF318C" strokeWidth="1.5" />
      <text x="4" y="15" fill="#FFF" fontSize="8" fontWeight="bold" fontFamily="monospace">RD</text>
      <rect x="15" y="13.5" width="4" height="1.5" fill="#FF318C" />
    </svg>
  );
}

function FinderIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4.5" fill="#38BDF8" />
      <path d="M2 12C2 6.48 6.48 2 12 2v20C6.48 22 2 17.52 2 12z" fill="#0284C7" />
      <circle cx="7.5" cy="9.5" r="1.5" fill="#1E293B" />
      <circle cx="16.5" cy="9.5" r="1.5" fill="#1E293B" />
      <path d="M12 9v5h2" stroke="#1E293B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 16c1.5 2 3.5 2.5 5 2.5s3.5-.5 5-2.5" stroke="#1E293B" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ProjectHub({
  projectName,
  projectRoot,
  boardName,
  project,
  board,
  boards,
  onSwitchBoard,
  onOpenProject,
}: ProjectHubProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "tools">("overview");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [recent, setRecent] = useState<DesktopProject[]>([]);
  const [reviewCount, setReviewCount] = useState<number>(0);
  const [factsCount, setFactsCount] = useState<number>(0);
  const [memoryCount, setMemoryCount] = useState<number>(0);

  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const editorDropdownRef = useRef<HTMLDivElement>(null);

  // Load recent projects
  useEffect(() => {
    if (isDesktop()) {
      void recentProjects().then(setRecent);
    }
  }, [projectRoot]);

  // Load live counts for project tools
  useEffect(() => {
    let cancelled = false;
    void fetchReviewQueue(boardName || undefined).then(({ items }) => {
      if (!cancelled) setReviewCount(items.length);
    }).catch(() => {});
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

  // Click outside listener for dropdowns
  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setProjectPickerOpen(false);
      }
      if (editorDropdownRef.current && !editorDropdownRef.current.contains(e.target as Node)) {
        setEditorMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, []);

  const handleSwitchProject = async (p: DesktopProject) => {
    setProjectPickerOpen(false);
    if (p.path === projectRoot) return;
    await switchProject(p.path, "hub");
  };

  const handleOpenEditor = async (editor: string) => {
    setEditorMenuOpen(false);
    if (editor === "finder") {
      await revealProject(projectRoot || undefined);
    } else if (editor === "terminal") {
      await openTerminal(projectRoot || undefined);
    } else {
      await openInEditor(projectRoot || "", undefined, undefined, editor);
    }
  };

  // Git state
  const git = project?.git;
  const isClean = git?.clean ?? true;
  const branchName = git?.branch || "master";
  const commitHash = git?.head ? git.head.slice(0, 7) : "HEAD";
  const commitMsg = git?.upstream ? `Tracking ${git.upstream}` : (git?.ahead ? `${git.ahead} ahead` : "Working tree");

  // Cards summary
  const cards = board?.cards || [];
  const todoCount = cards.filter((c) => c.column === "todo" || c.column === "backlog").length;
  const doingCount = cards.filter((c) => c.column === "doing" || c.column === "in-progress").length;
  const reviewCardsCount = cards.filter((c) => c.column === "review").length;
  const doneCount = cards.filter((c) => c.column === "done").length;
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
      {/* ── Top Bar: Vercel Breadcrumb, Project Switcher & Actions ── */}
      <header className="h-12 border-b border-border/60 bg-surface/80 backdrop-blur-md px-5 flex items-center justify-between shrink-0 select-none z-20">
        <div className="flex items-center gap-2 min-w-0">
          {/* Project Switcher Dropdown */}
          <div ref={projectDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setProjectPickerOpen((o) => !o)}
              className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer group"
              title="Switch project"
            >
              <ProjectAvatar name={projectName || "Project"} size="sm" />
              <span className="font-semibold text-text text-[13px] tracking-tight truncate max-w-[160px]">
                {projectName || "Current Project"}
              </span>
              <Icon name="chevDown" size={12} className="text-muted group-hover:text-text transition-colors" />
            </button>

            {projectPickerOpen && (
              <div className="absolute left-0 top-10 w-72 bg-card border border-border/80 rounded-xl shadow-2xl p-1.5 z-50 text-xs backdrop-blur-xl animate-in fade-in zoom-in-95">
                <div className="px-2.5 py-1.5 text-[10.5px] font-semibold text-muted tracking-wider uppercase flex items-center justify-between">
                  <span>Projects</span>
                  <button
                    type="button"
                    onClick={() => {
                      setProjectPickerOpen(false);
                      navigate("projects");
                    }}
                    className="text-accent hover:underline lowercase font-normal"
                  >
                    All projects →
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5 my-1">
                  {recent.map((p) => {
                    const isCur = p.path === projectRoot;
                    return (
                      <button
                        key={p.path}
                        type="button"
                        onClick={() => handleSwitchProject(p)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                          isCur
                            ? "bg-accent/15 text-accent font-medium"
                            : "hover:bg-white/[0.04] text-text"
                        }`}
                      >
                        <ProjectAvatar name={p.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-[12px]">{p.name}</div>
                          <div className="truncate text-[10px] text-muted font-mono">{p.path}</div>
                        </div>
                        {isCur && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-border/40 pt-1 mt-1 flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setProjectPickerOpen(false);
                      navigate("projects");
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.04] text-muted hover:text-text transition-colors cursor-pointer text-left"
                  >
                    <Icon name="grid" size={13} />
                    <span>View All Projects</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProjectPickerOpen(false);
                      if (onOpenProject) onOpenProject();
                      else if (isDesktop()) void openProjectDialog();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.04] text-muted hover:text-text transition-colors cursor-pointer text-left"
                  >
                    <Icon name="folder" size={13} />
                    <span>Open local folder…</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <span className="text-muted/40 font-light text-sm">/</span>
          <span className="text-muted-strong text-xs font-medium">Project Overview</span>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2.5">
          {/* Git status pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-border/60 text-[11px] font-mono">
            <Icon name="branch" size={12} className="text-muted" />
            <span className="text-text font-medium">{branchName}</span>
            <span className="text-muted/40">•</span>
            <span className={isClean ? "text-emerald-400" : "text-amber-400"}>
              {isClean ? "Clean" : `${git?.changes || 1} modified`}
            </span>
          </div>

          {/* Open in Editor Dropdown */}
          <div ref={editorDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setEditorMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-surface hover:bg-card border border-border text-text text-xs font-medium transition-colors cursor-pointer shadow-xs"
              title="Open project in external editor"
            >
              <VsCodeIcon size={13} />
              <span>Open in VS Code</span>
              <Icon name="chevDown" size={11} className="text-muted ml-0.5" />
            </button>

            {editorMenuOpen && (
              <div className="absolute right-0 top-9 w-48 bg-card border border-border/80 rounded-xl shadow-2xl p-1 z-50 text-xs backdrop-blur-xl animate-in fade-in zoom-in-95">
                <button
                  type="button"
                  onClick={() => handleOpenEditor("vscode")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] text-text transition-colors cursor-pointer text-left"
                >
                  <VsCodeIcon size={14} />
                  <span>VS Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEditor("antigravity")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] text-text transition-colors cursor-pointer text-left"
                >
                  <AntigravityIcon size={14} />
                  <span>Antigravity</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEditor("rider")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] text-text transition-colors cursor-pointer text-left"
                >
                  <RiderIcon size={14} />
                  <span>Rider</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEditor("finder")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] text-text transition-colors cursor-pointer text-left"
                >
                  <FinderIcon size={14} />
                  <span>Finder</span>
                </button>
                <div className="border-t border-border/40 my-1" />
                <button
                  type="button"
                  onClick={() => handleOpenEditor("terminal")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] text-text transition-colors cursor-pointer text-left"
                >
                  <Icon name="terminal" size={14} />
                  <span>Terminal</span>
                </button>
              </div>
            )}
          </div>

          {/* New Thread CTA */}
          <button
            type="button"
            onClick={() => navigate("chat")}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-accent text-bg hover:opacity-90 text-xs font-semibold transition-opacity cursor-pointer shadow-xs"
          >
            <Icon name="plus" size={13} />
            <span>New Thread</span>
          </button>
        </div>
      </header>

      {/* ── Subnavigation Tabs (Vercel Style, matching Image 2) ── */}
      <nav className="border-b border-border/50 bg-surface/40 px-5 flex items-center gap-1 shrink-0 overflow-x-auto text-xs font-medium select-none">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`py-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "overview"
              ? "border-accent text-text font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          <Icon name="grid" size={13} />
          <span>Overview</span>
        </button>

        <a
          href="#/chat"
          className="py-2.5 px-3 border-b-2 border-transparent text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-1.5 no-underline"
        >
          <Icon name="comment" size={13} />
          <span>Build</span>
        </a>

        <a
          href="#/board"
          className="py-2.5 px-3 border-b-2 border-transparent text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-1.5 no-underline"
        >
          <Icon name="board" size={13} />
          <span>Board</span>
          {cards.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface border border-border text-muted">
              {cards.length}
            </span>
          )}
        </a>

        <a
          href="#/review"
          className="py-2.5 px-3 border-b-2 border-transparent text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-1.5 no-underline"
        >
          <Icon name="eye" size={13} />
          <span>Review</span>
          {reviewCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent/20 text-accent font-mono font-medium">
              {reviewCount}
            </span>
          )}
        </a>

        <a
          href="#/brain"
          className="py-2.5 px-3 border-b-2 border-transparent text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-1.5 no-underline"
        >
          <Icon name="spark" size={13} />
          <span>Brain (3D)</span>
        </a>

        <a
          href="#/agents"
          className="py-2.5 px-3 border-b-2 border-transparent text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-1.5 no-underline"
        >
          <Icon name="users" size={13} />
          <span>Agents</span>
          {agentsCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface border border-border text-muted font-mono">
              {agentsCount}
            </span>
          )}
        </a>

        <a
          href="#/skills"
          className="py-2.5 px-3 border-b-2 border-transparent text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-1.5 no-underline"
        >
          <Icon name="star" size={13} />
          <span>Skills</span>
        </a>

        <a
          href="#/history"
          className="py-2.5 px-3 border-b-2 border-transparent text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-1.5 no-underline"
        >
          <Icon name="history" size={13} />
          <span>History</span>
        </a>

        <a
          href="#/operations"
          className="py-2.5 px-3 border-b-2 border-transparent text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-1.5 no-underline"
        >
          <Icon name="code" size={13} />
          <span>Operations</span>
        </a>

        <button
          type="button"
          onClick={() => setActiveTab("tools")}
          className={`py-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "tools"
              ? "border-accent text-text font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          <Icon name="sliders" size={13} />
          <span>All Tools</span>
        </button>
      </nav>

      {/* ── Main Content Area ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-6xl w-full mx-auto">
        {/* Section A: Production Deployment / Git Hero Card (matching Vercel Image 2) */}
        <div className="rounded-xl border border-border/80 bg-surface/50 backdrop-blur-sm p-6 shadow-sm hover:border-border transition-colors">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-border/40">
            <div>
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

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleOpenEditor("vscode")}
                className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-medium hover:bg-card hover:border-border-strong text-text flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <VsCodeIcon size={14} />
                <span>Open in VS Code</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenEditor("finder")}
                className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-medium hover:bg-card hover:border-border-strong text-text flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FinderIcon size={14} />
                <span>Finder</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenEditor("terminal")}
                className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-medium hover:bg-card hover:border-border-strong text-text flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Icon name="terminal" size={13} />
                <span>Terminal</span>
              </button>
            </div>
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
              <div className="text-muted text-[11px] mt-1">
                {reviewCount > 0 ? `${reviewCount} pull requests / reviews` : "All review queues clear"}
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

        {/* Section B: Recommendations & Readiness Checklist (matching Vercel Image 2) */}
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

        {/* Section C: Project Tools Interactive Widgets (matching Vercel Image 2) */}
        <div>
          <div className="flex items-center justify-between mb-3 text-xs">
            <h3 className="font-semibold text-text tracking-tight text-sm">Project Tools</h3>
            <span className="text-muted text-[11px]">Click any tool to inspect or manage within this project</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* Card 1: Board */}
            <div
              onClick={() => navigate("board")}
              className="p-4 rounded-xl border border-border/70 bg-card hover:border-border-strong hover:bg-card/90 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-text font-medium text-xs">
                    <span className="p-1.5 rounded-lg bg-surface border border-border text-accent group-hover:scale-105 transition-transform">
                      <Icon name="board" size={14} />
                    </span>
                    <span>Board & Planning</span>
                  </div>
                  <Icon name="chevR" size={12} className="text-muted group-hover:text-text group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11.5px] text-muted mb-3">
                  Kanban columns, sprint management, acceptance test gates, and autonomous tasks.
                </p>
              </div>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted">
                <span>{todoCount} todo · {doingCount} doing</span>
                <span className="text-emerald-400 font-semibold">{doneCount} done</span>
              </div>
            </div>

            {/* Card 2: Review */}
            <div
              onClick={() => navigate("review")}
              className="p-4 rounded-xl border border-border/70 bg-card hover:border-border-strong hover:bg-card/90 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-text font-medium text-xs">
                    <span className="p-1.5 rounded-lg bg-surface border border-border text-accent group-hover:scale-105 transition-transform">
                      <Icon name="eye" size={14} />
                    </span>
                    <span>Review & Trust Gate</span>
                  </div>
                  <Icon name="chevR" size={12} className="text-muted group-hover:text-text group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11.5px] text-muted mb-3">
                  Unified diffs, verification gates, safety receipts, and code review queue.
                </p>
              </div>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted">
                <span>{reviewCount} in queue</span>
                <span className="text-accent font-medium">Trust Guard Active</span>
              </div>
            </div>

            {/* Card 3: 3D Knowledge Brain */}
            <div
              onClick={() => navigate("brain")}
              className="p-4 rounded-xl border border-border/70 bg-card hover:border-border-strong hover:bg-card/90 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-text font-medium text-xs">
                    <span className="p-1.5 rounded-lg bg-surface border border-border text-accent group-hover:scale-105 transition-transform">
                      <Icon name="spark" size={14} />
                    </span>
                    <span>Brain (3D Knowledge Orbit)</span>
                  </div>
                  <Icon name="chevR" size={12} className="text-muted group-hover:text-text group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11.5px] text-muted mb-3">
                  Interactive 3D force-directed knowledge universe inspired by Second Brain OS.
                </p>
              </div>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted">
                <span>{factsCount} facts · {memoryCount} memories</span>
                <span className="text-accent font-medium">3D Orbit →</span>
              </div>
            </div>

            {/* Card 4: Agents */}
            <div
              onClick={() => navigate("agents")}
              className="p-4 rounded-xl border border-border/70 bg-card hover:border-border-strong hover:bg-card/90 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-text font-medium text-xs">
                    <span className="p-1.5 rounded-lg bg-surface border border-border text-accent group-hover:scale-105 transition-transform">
                      <Icon name="users" size={14} />
                    </span>
                    <span>Agents & Orchestra</span>
                  </div>
                  <Icon name="chevR" size={12} className="text-muted group-hover:text-text group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11.5px] text-muted mb-3">
                  Multi-agent orchestra, subagent role trees, delegation matrix, and fleet supervision.
                </p>
              </div>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted">
                <span>{agentsCount} hired agents</span>
                <span className="text-emerald-400 font-medium">Autonomous Fleet</span>
              </div>
            </div>

            {/* Card 5: Skills */}
            <div
              onClick={() => navigate("skills")}
              className="p-4 rounded-xl border border-border/70 bg-card hover:border-border-strong hover:bg-card/90 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-text font-medium text-xs">
                    <span className="p-1.5 rounded-lg bg-surface border border-border text-accent group-hover:scale-105 transition-transform">
                      <Icon name="star" size={14} />
                    </span>
                    <span>Skills Registry</span>
                  </div>
                  <Icon name="chevR" size={12} className="text-muted group-hover:text-text group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11.5px] text-muted mb-3">
                  Engineering skills and MCP tools available for autonomous agent workflows.
                </p>
              </div>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted">
                <span>Managed skills</span>
                <span className="text-accent font-medium">Explore →</span>
              </div>
            </div>

            {/* Card 6: History */}
            <div
              onClick={() => navigate("history")}
              className="p-4 rounded-xl border border-border/70 bg-card hover:border-border-strong hover:bg-card/90 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-text font-medium text-xs">
                    <span className="p-1.5 rounded-lg bg-surface border border-border text-accent group-hover:scale-105 transition-transform">
                      <Icon name="history" size={14} />
                    </span>
                    <span>History & Commits</span>
                  </div>
                  <Icon name="chevR" size={12} className="text-muted group-hover:text-text group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11.5px] text-muted mb-3">
                  Commit stream, autonomous execution timeline, task run logs, and receipts.
                </p>
              </div>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted">
                <span className="truncate">{commitHash}</span>
                <span className="text-accent font-medium">Timeline →</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section D: Searchable Project Tools Directory (preserves compatibility with ProjectHub.test.tsx) */}
        <section className="pt-6 border-t border-border/60">
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
                    {tools.map((tool) => (
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
                          <strong className="block text-xs font-semibold text-text truncate">{tool.label}</strong>
                          <small className="block text-[11px] text-muted truncate mt-0.5">{tool.hint}</small>
                        </div>
                        <Icon name="chevR" size={12} className="text-muted/50 group-hover:text-text group-hover:translate-x-0.5 transition-all shrink-0" />
                      </button>
                    ))}
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
