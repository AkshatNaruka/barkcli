import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { ProjectAvatar } from "../components/ProjectAvatar";
import { navigate, type Route } from "../lib/hashnav";
import {
  isDesktop,
  recentProjects,
  switchProject,
  openTerminal,
  revealProject,
  openProjectDialog,
  type DesktopProject,
} from "../lib/desktop";
import { openInEditor, fetchReviewQueue } from "../lib/api";
import type { ProjectSnapshot } from "../lib/types";

export interface ProjectNavbarProps {
  projectName?: string | null;
  projectRoot?: string | null;
  boardName?: string | null;
  project?: ProjectSnapshot | null;
  currentRoute: Route;
  cardsCount?: number;
  agentsCount?: number;
  onOpenProject?: () => void;
  onNewThread?: () => void;
}

export function VsCodeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.27a1 1 0 0 0-.008 1.42l3.473 3.31-3.473 3.31a1 1 0 0 0 .008 1.42l1.322 1.212a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 19.86V4.14a1.5 1.5 0 0 0-.85-1.553z"
        fill="#007ACC"
      />
    </svg>
  );
}

export function AntigravityIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 19L11.5 4.5C11.8 3.8 12.2 3.8 12.5 4.5L20 19" stroke="url(#agGradNav)" strokeWidth="3" strokeLinecap="round" />
      <path d="M7 14.5H17" stroke="url(#agGradNav2)" strokeWidth="2.5" strokeLinecap="round" />
      <defs>
        <linearGradient id="agGradNav" x1="4" y1="19" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="0.5" stopColor="#818CF8" />
          <stop offset="1" stopColor="#F472B6" />
        </linearGradient>
        <linearGradient id="agGradNav2" x1="7" y1="14.5" x2="17" y2="14.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function RiderIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#000" stroke="#FF318C" strokeWidth="1.5" />
      <text x="4" y="15" fill="#FFF" fontSize="8" fontWeight="bold" fontFamily="monospace">RD</text>
      <rect x="15" y="13.5" width="4" height="1.5" fill="#FF318C" />
    </svg>
  );
}

export function FinderIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#E2E8F0" />
      <path d="M2 12C2 6.48 6.48 2 12 2v20C6.48 22 2 17.52 2 12z" fill="#0284C7" />
      <circle cx="7.5" cy="9.5" r="1.5" fill="#1E293B" />
      <circle cx="16.5" cy="9.5" r="1.5" fill="#1E293B" />
      <path d="M12 9v5h2" stroke="#1E293B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 16c1.5 2 3.5 2.5 5 2.5s3.5-.5 5-2.5" stroke="#1E293B" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const ROUTE_TITLES: Record<string, string> = {
  hub: "Project Overview",
  chat: "Build & Threads",
  board: "Board & Planning",
  review: "Review & Trust Gate",
  brain: "Brain (3D Knowledge Orbit)",
  agents: "Agents & Orchestra",
  skills: "Skills Registry",
  history: "History & Commits",
  operations: "Operations & System",
};

export function ProjectNavbar({
  projectName,
  projectRoot,
  boardName,
  project,
  currentRoute,
  cardsCount = 0,
  agentsCount = 0,
  onOpenProject,
  onNewThread,
}: ProjectNavbarProps) {
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [recent, setRecent] = useState<DesktopProject[]>([]);
  const [reviewCount, setReviewCount] = useState<number>(0);

  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const editorDropdownRef = useRef<HTMLDivElement>(null);

  // Load recent projects on desktop
  useEffect(() => {
    if (isDesktop()) {
      void recentProjects().then(setRecent);
    }
  }, [projectRoot]);

  // Load review queue count
  useEffect(() => {
    let cancelled = false;
    void fetchReviewQueue(boardName || undefined).then(({ items }) => {
      if (!cancelled) setReviewCount(items.length);
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
    const target = currentRoute === "review" || currentRoute === "chat" ? currentRoute : "hub";
    await switchProject(p.path, target);
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

  const displayName = projectName || project?.name || (projectRoot ? projectRoot.split("/").filter(Boolean).pop() : "barkcli") || "barkcli";
  const activeTitle = ROUTE_TITLES[currentRoute] || "Project";

  return (
    <div className="flex flex-col shrink-0 select-none z-20 border-b border-border/60 bg-surface/80 backdrop-blur-md">
      {/* ── Top Bar: Project Switcher / Breadcrumb / Actions (Screenshot 3) ── */}
      <header className="h-12 px-5 flex items-center justify-between">
        {/* Left: Project Selector & Breadcrumb */}
        <div className="flex items-center gap-2 min-w-0">
          <div ref={projectDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setProjectPickerOpen((o) => !o)}
              className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer group"
              title="Switch project"
            >
              <ProjectAvatar name={displayName} size="xs" />
              <span className="font-semibold text-text text-[13px] tracking-tight truncate max-w-[160px]">
                {displayName}
              </span>
              <Icon name="chevDown" size={12} className="text-muted group-hover:text-text transition-colors" />
            </button>

            {/* Project Picker Dropdown */}
            {projectPickerOpen && (
              <div className="absolute left-0 top-9 w-64 bg-card border border-border/80 rounded-xl shadow-2xl p-1 z-50 text-xs backdrop-blur-xl animate-in fade-in zoom-in-95">
                <div className="px-2 py-1 text-[11px] font-semibold text-muted-dim uppercase tracking-wider">
                  Local Projects
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {recent.map((p) => {
                    const isCur = p.path === projectRoot;
                    return (
                      <button
                        key={p.path}
                        type="button"
                        onClick={() => void handleSwitchProject(p)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
                          isCur
                            ? "bg-accent/15 text-accent font-medium"
                            : "hover:bg-white/[0.06] text-text"
                        }`}
                      >
                        <ProjectAvatar name={p.name} size="xs" />
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
          <span className="text-muted-strong text-xs font-medium">{activeTitle}</span>
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
                  onClick={() => void handleOpenEditor("vscode")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] text-text transition-colors cursor-pointer text-left"
                >
                  <VsCodeIcon size={14} />
                  <span>VS Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenEditor("antigravity")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] text-text transition-colors cursor-pointer text-left"
                >
                  <AntigravityIcon size={14} />
                  <span>Antigravity</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenEditor("rider")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] text-text transition-colors cursor-pointer text-left"
                >
                  <RiderIcon size={14} />
                  <span>Rider</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenEditor("finder")}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] text-text transition-colors cursor-pointer text-left"
                >
                  <FinderIcon size={14} />
                  <span>Finder</span>
                </button>
                <div className="border-t border-border/40 my-1" />
                <button
                  type="button"
                  onClick={() => void handleOpenEditor("terminal")}
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
            onClick={() => {
              if (onNewThread) onNewThread();
              else navigate("chat", { board: boardName || undefined });
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-accent text-bg hover:opacity-90 text-xs font-semibold transition-opacity cursor-pointer shadow-xs"
          >
            <Icon name="plus" size={13} />
            <span>New Thread</span>
          </button>
        </div>
      </header>

      {/* ── Subnavigation Tabs (Screenshots 1 & 2) ── */}
      <nav aria-label="Project tabs" className="px-5 flex items-center gap-1 shrink-0 overflow-x-auto text-xs font-medium select-none bg-surface/30">
        <a
          href="#/hub"
          className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 no-underline ${
            currentRoute === "hub"
              ? "border-accent text-text font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          <Icon name="grid" size={13} />
          <span>Overview</span>
        </a>

        <a
          href="#/chat"
          className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 no-underline ${
            currentRoute === "chat"
              ? "border-accent text-text font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          <Icon name="comment" size={13} />
          <span>Build</span>
        </a>

        <a
          href="#/board"
          className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 no-underline ${
            currentRoute === "board"
              ? "border-accent text-text font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          <Icon name="board" size={13} />
          <span>Board</span>
          {cardsCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface border border-border text-muted">
              {cardsCount}
            </span>
          )}
        </a>

        <a
          href="#/review"
          className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 no-underline ${
            currentRoute === "review"
              ? "border-accent text-text font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
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
          className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 no-underline ${
            currentRoute === "brain"
              ? "border-accent text-text font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          <Icon name="spark" size={13} />
          <span>Brain (3D)</span>
        </a>

        <a
          href="#/agents"
          className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 no-underline ${
            currentRoute === "agents"
              ? "border-accent text-text font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
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
          className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 no-underline ${
            currentRoute === "skills"
              ? "border-accent text-text font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          <Icon name="star" size={13} />
          <span>Skills</span>
        </a>

        <a
          href="#/history"
          className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 no-underline ${
            currentRoute === "history"
              ? "border-accent text-text font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          <Icon name="history" size={13} />
          <span>History</span>
        </a>

        <a
          href="#/operations"
          className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 no-underline ${
            currentRoute === "operations"
              ? "border-accent text-text font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          <Icon name="code" size={13} />
          <span>Operations</span>
        </a>

        <a
          href="#/hub"
          className="py-2 px-3 border-b-2 border-transparent text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-1.5 no-underline"
          title="Browse all project tools"
        >
          <Icon name="sliders" size={13} />
          <span>All Tools</span>
        </a>
      </nav>
    </div>
  );
}
