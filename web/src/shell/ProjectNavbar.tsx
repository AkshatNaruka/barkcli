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
import { openInEditor, fetchReviewQueue, fetchGitStatus, runProjectCommand } from "../lib/api";
import { readLocal, writeLocal } from "../lib/drafts";
import type { ProjectSnapshot, GitStatus } from "../lib/types";
import { openInbuiltBrowser } from "../lib/inbuiltBrowser";

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

export function CloudPullIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m8 17 4 4 4-4" />
    </svg>
  );
}

export function CloudPushIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 21v-9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  );
}

export function GitCommitIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
    </svg>
  );
}

export function GitHubIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
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
  const [selectedEditor, setSelectedEditor] = useState<string>(() => readLocal("bark:preferred-editor") || "vscode");
  const [recent, setRecent] = useState<DesktopProject[]>([]);
  const [reviewCount, setReviewCount] = useState<number>(0);

  // Git state & dropdown
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitDropdownOpen, setGitDropdownOpen] = useState(false);
  const [pullMenuOpen, setPullMenuOpen] = useState(false);
  const [showCommitInput, setShowCommitInput] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const editorDropdownRef = useRef<HTMLDivElement>(null);
  const gitDropdownRef = useRef<HTMLDivElement>(null);

  const refreshGit = async () => {
    try {
      const res = await fetchGitStatus();
      if (res) setGitStatus(res);
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    void fetchGitStatus().then((res) => {
      if (!cancelled && res) setGitStatus(res);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectRoot, project]);

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
      if (gitDropdownRef.current && !gitDropdownRef.current.contains(e.target as Node)) {
        setGitDropdownOpen(false);
        setPullMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, []);

  const handlePull = async (rebase = false) => {
    setPulling(true);
    setActionFeedback(null);
    try {
      const cmd = rebase ? "git pull --rebase" : "git pull";
      const res = await runProjectCommand(cmd);
      if (res && res.exit_code === 0) {
        setActionFeedback("Pull successful: up to date");
        await refreshGit();
      } else {
        setActionFeedback(res?.stderr || res?.stdout || "Pull completed");
        await refreshGit();
      }
    } catch (err: any) {
      setActionFeedback(err?.message || "Pull command failed");
    } finally {
      setPulling(false);
    }
  };

  const handleFetch = async () => {
    setPulling(true);
    setActionFeedback(null);
    try {
      const res = await runProjectCommand("git fetch origin");
      if (res && res.exit_code === 0) {
        setActionFeedback("Fetched origin");
        await refreshGit();
      } else {
        setActionFeedback(res?.stderr || res?.stdout || "Fetch completed");
        await refreshGit();
      }
    } catch (err: any) {
      setActionFeedback(err?.message || "Fetch failed");
    } finally {
      setPulling(false);
    }
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim() || committing) return;
    setCommitting(true);
    setActionFeedback(null);
    try {
      const msg = commitMessage.trim();
      const res = await runProjectCommand(`git add -A && git commit -m ${JSON.stringify(msg)}`);
      if (res && res.exit_code === 0) {
        setActionFeedback("Committed changes");
        setCommitMessage("");
        setShowCommitInput(false);
        await refreshGit();
      } else {
        setActionFeedback(res?.stderr || res?.stdout || "Commit failed");
      }
    } catch (err: any) {
      setActionFeedback(err?.message || "Commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    setActionFeedback(null);
    try {
      const res = await runProjectCommand(`git push origin ${branchName}`);
      if (res && res.exit_code === 0) {
        setActionFeedback(`Pushed to origin/${branchName}`);
        await refreshGit();
      } else {
        setActionFeedback(res?.stderr || res?.stdout || "Push completed");
        await refreshGit();
      }
    } catch (err: any) {
      setActionFeedback(err?.message || "Push failed");
    } finally {
      setPushing(false);
    }
  };

  const handleCreatePr = async () => {
    setActionFeedback("Opening PR comparison...");
    try {
      const res = await runProjectCommand("git config --get remote.origin.url");
      let remoteUrl = (res?.stdout || "").trim();
      if (remoteUrl) {
        if (remoteUrl.startsWith("git@")) {
          remoteUrl = remoteUrl.replace(/^git@([^:]+):/, "https://$1/").replace(/\.git$/, "");
        } else {
          remoteUrl = remoteUrl.replace(/\.git$/, "");
        }
        const prUrl = `${remoteUrl}/compare/${encodeURIComponent(branchName)}?expand=1`;
        if (typeof window !== "undefined") {
          openInbuiltBrowser(prUrl);
        }
        setActionFeedback(`Opened ${prUrl}`);
      } else {
        navigate("chat", { board: boardName || undefined });
      }
    } catch {
      navigate("chat", { board: boardName || undefined });
    }
  };

  const handleSwitchProject = async (p: DesktopProject) => {
    setProjectPickerOpen(false);
    if (p.path === projectRoot) return;
    const target = currentRoute === "review" || currentRoute === "chat" ? currentRoute : "hub";
    await switchProject(p.path, target);
  };

  const handleOpenEditor = async (editor: string = selectedEditor) => {
    setSelectedEditor(editor);
    writeLocal("bark:preferred-editor", editor);
    setEditorMenuOpen(false);
    const root = projectRoot || project?.root || "";
    if (editor === "finder") {
      if (isDesktop()) {
        const ok = await revealProject(root || undefined);
        if (ok) return;
      }
      await openInEditor(root, undefined, undefined, "finder");
    } else if (editor === "terminal") {
      if (isDesktop()) {
        const ok = await openTerminal(root || undefined);
        if (ok) return;
      }
      await openInEditor(root, undefined, undefined, "terminal");
    } else {
      await openInEditor(root, undefined, undefined, editor);
    }
  };

  const getEditorBadge = (id: string) => {
    switch (id) {
      case "antigravity":
        return { label: "Open in Antigravity", icon: <AntigravityIcon size={13} /> };
      case "rider":
        return { label: "Open in Rider", icon: <RiderIcon size={13} /> };
      case "finder":
        return { label: "Open in Finder", icon: <FinderIcon size={13} /> };
      case "terminal":
        return { label: "Open in Terminal", icon: <Icon name="terminal" size={13} /> };
      case "vscode":
      default:
        return { label: "Open in VS Code", icon: <VsCodeIcon size={13} /> };
    }
  };
  const currentBadge = getEditorBadge(selectedEditor);

  // Git state
  const git = project?.git;
  const isClean = gitStatus ? gitStatus.clean : (git?.clean ?? true);
  const branchName = gitStatus?.branch || git?.branch || "master";
  const aheadCount = gitStatus?.ahead ?? git?.ahead ?? 0;
  const behindCount = gitStatus?.behind ?? git?.behind ?? 0;
  const gitChanges = gitStatus?.changes || [];
  const changesCount = gitChanges.length || git?.changes || 0;

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
              <div className="absolute left-0 top-9 w-64 bg-[#141416] border border-border rounded-xl shadow-2xl p-1 z-50 text-xs">
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
          {currentRoute === "chat" && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("bark-show-working-changes"))}
              aria-label={
                changesCount > 0
                  ? `Show changes — ${changesCount} modified ${changesCount === 1 ? "file" : "files"}`
                  : "Show changes — working tree clean"
              }
              title="Show working-tree changes in the side panel"
              className="hidden sm:flex items-center gap-1.5 rounded-md border border-border/60 bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-strong transition-colors hover:border-border hover:bg-white/[0.04] hover:text-text cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <Icon name="code" size={12} />
              <span>Changes</span>
            </button>
          )}
          {/* Git status split button & actions popover (Screenshots 1 & 2) */}
          <div ref={gitDropdownRef} className="relative hidden sm:flex items-center">
            <button
              type="button"
              onClick={() => {
                setGitDropdownOpen((o) => !o);
                void refreshGit();
              }}
              aria-expanded={gitDropdownOpen}
              aria-label="Git branch and sync status"
              title={`Git branch: ${branchName} (${isClean ? "Clean" : `${changesCount} modified`})`}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border text-[11px] font-mono transition-colors cursor-pointer group ${
                gitDropdownOpen
                  ? "border-accent/80 bg-accent/10 shadow-xs"
                  : "border-border/60 hover:border-border hover:bg-white/[0.04]"
              }`}
            >
              <Icon name="branch" size={12} className="text-muted group-hover:text-text transition-colors" />
              <span className="text-text font-medium">{branchName}</span>
              <span className="text-muted/40">•</span>
              <span className={isClean ? "text-emerald-400" : "text-amber-400"}>
                {isClean ? "Clean" : `${changesCount} modified`}
              </span>
            </button>

            {gitDropdownOpen && (
              <div className="absolute right-0 top-9 w-64 rounded-xl border border-border bg-[#141416] p-1.5 text-xs shadow-2xl z-50">
                {/* 1. Pull Split Button (Matching Screenshot 2) */}
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-white/[0.04] hover:bg-white/[0.08] transition-colors p-0.5">
                  <button
                    type="button"
                    onClick={() => void handlePull(false)}
                    disabled={pulling}
                    className="flex flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-text font-medium rounded-l-md hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <CloudPullIcon size={14} className={pulling ? "text-accent animate-spin" : "text-muted"} />
                    <span>{pulling ? "Pulling..." : "Pull"}</span>
                  </button>
                  <div className="w-[1px] h-4 bg-border/60" />
                  <button
                    type="button"
                    onClick={() => setPullMenuOpen((o) => !o)}
                    title="Pull options"
                    aria-label="Pull options"
                    className="px-2 py-1.5 text-muted hover:text-text rounded-r-md hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <Icon name="chevDown" size={11} className={pullMenuOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                  </button>
                </div>

                {pullMenuOpen && (
                  <div className="mt-1 space-y-0.5 rounded-lg border border-border bg-[#1c1c1f] p-1 text-[11px] shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setPullMenuOpen(false);
                        void handlePull(false);
                      }}
                      className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-muted-strong hover:bg-white/[0.06] hover:text-text cursor-pointer"
                    >
                      <span>git pull</span>
                      <span className="font-mono text-[9.5px] text-muted/60">merge</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPullMenuOpen(false);
                        void handlePull(true);
                      }}
                      className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-muted-strong hover:bg-white/[0.06] hover:text-text cursor-pointer"
                    >
                      <span>git pull --rebase</span>
                      <span className="font-mono text-[9.5px] text-muted/60">rebase</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPullMenuOpen(false);
                        void handleFetch();
                      }}
                      className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-muted-strong hover:bg-white/[0.06] hover:text-text cursor-pointer"
                    >
                      <span>git fetch origin</span>
                      <span className="font-mono text-[9.5px] text-muted/60">fetch</span>
                    </button>
                  </div>
                )}

                {/* 2. Menu Items: Commit, Push, Create PR (Matching Screenshot 2) */}
                <div className="mt-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setShowCommitInput((prev) => !prev)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12px] text-muted-strong hover:bg-white/[0.06] hover:text-text transition-colors cursor-pointer"
                  >
                    <GitCommitIcon size={14} className="text-muted" />
                    <span className="flex-1">Commit</span>
                    {changesCount > 0 && (
                      <span className="font-mono text-[10px] text-amber-400 font-medium">
                        +{changesCount}
                      </span>
                    )}
                  </button>

                  {showCommitInput && (
                    <form onSubmit={handleCommit} className="rounded-lg border border-border bg-[#1a1a1d] p-2 space-y-2 mt-1 shadow-md">
                      <div className="text-[11px] font-medium text-text flex items-center justify-between">
                        <span>Commit changes</span>
                        <span className="text-[10px] text-muted font-mono">{changesCount} modified</span>
                      </div>
                      {gitChanges.length > 0 && (
                        <div className="max-h-24 overflow-y-auto space-y-0.5 text-[10px] font-mono text-muted/80 bg-[#121214] p-1.5 rounded border border-border/40">
                          {gitChanges.slice(0, 6).map((ch, idx) => (
                            <div key={idx} className="truncate flex items-center justify-between">
                              <span className="truncate">{ch.path}</span>
                              <span className="text-[9px] text-amber-400 font-semibold shrink-0 ml-1">{ch.status}</span>
                            </div>
                          ))}
                          {gitChanges.length > 6 && (
                            <div className="text-[9.5px] text-muted/60 italic">+{gitChanges.length - 6} more files</div>
                          )}
                        </div>
                      )}
                      <input
                        type="text"
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder="Commit message..."
                        className="w-full rounded border border-border/80 bg-bg px-2 py-1 text-[11.5px] text-text placeholder:text-muted/60 outline-none focus:border-accent"
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setShowCommitInput(false)}
                          className="px-2 py-0.5 rounded text-[10.5px] text-muted hover:text-text cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!commitMessage.trim() || committing}
                          className="px-2.5 py-0.5 rounded bg-accent text-bg text-[10.5px] font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                        >
                          {committing ? "Committing..." : "Commit"}
                        </button>
                      </div>
                    </form>
                  )}

                  <button
                    type="button"
                    onClick={() => void handlePush()}
                    disabled={pushing}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12px] text-muted-strong hover:bg-white/[0.06] hover:text-text transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <CloudPushIcon size={14} className={pushing ? "text-accent animate-spin" : "text-muted"} />
                    <span className="flex-1">{pushing ? "Pushing..." : "Push"}</span>
                    {aheadCount > 0 && (
                      <span className="font-mono text-[10px] text-emerald-400 font-medium">
                        ↑{aheadCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCreatePr()}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12px] text-muted-strong hover:bg-white/[0.06] hover:text-text transition-colors cursor-pointer"
                  >
                    <GitHubIcon size={14} className="text-muted" />
                    <span>Create PR</span>
                  </button>
                </div>

                {/* 3. Status Note in Orange/Amber (Matching Screenshot 2) */}
                <div className="border-t border-border/40 mt-1.5 pt-1.5 px-2 pb-0.5 text-[11px] leading-snug">
                  {behindCount > 0 ? (
                    <p className="text-amber-400 font-medium">
                      Behind upstream. Pull/rebase first.
                    </p>
                  ) : aheadCount > 0 ? (
                    <p className="text-emerald-400 font-medium">
                      Ahead of upstream by {aheadCount} commit{aheadCount === 1 ? "" : "s"}. Push your changes.
                    </p>
                  ) : !isClean ? (
                    <p className="text-amber-400 font-medium">
                      {changesCount || 1} uncommitted file{changesCount === 1 ? "" : "s"}.
                    </p>
                  ) : (
                    <p className="text-muted/80">
                      Working tree clean. Up to date.
                    </p>
                  )}

                  {actionFeedback && (
                    <p className="mt-1 font-mono text-[10px] text-accent truncate" title={actionFeedback}>
                      {actionFeedback}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Open in Editor Split Button */}
          <div ref={editorDropdownRef} className="relative flex items-center">
            <div className="inline-flex items-center rounded-md bg-surface border border-border text-text text-xs font-medium transition-colors shadow-xs hover:border-border/80">
              <button
                type="button"
                onClick={() => void handleOpenEditor(selectedEditor)}
                className="flex items-center gap-1.5 px-3 py-1 hover:bg-white/[0.06] text-text text-xs font-medium transition-colors cursor-pointer rounded-l-md"
                title={`${currentBadge.label} (${projectRoot || project?.root || "project root"})`}
              >
                {currentBadge.icon}
                <span>{currentBadge.label}</span>
              </button>
              <div className="w-[1px] h-3.5 bg-border/60" />
              <button
                type="button"
                onClick={() => setEditorMenuOpen((o) => !o)}
                className="px-1.5 py-1 hover:bg-white/[0.06] text-muted hover:text-text transition-colors cursor-pointer rounded-r-md"
                title="Select external editor or tool"
                aria-label="Select external editor or tool"
              >
                <Icon name="chevDown" size={11} className={editorMenuOpen ? "rotate-180 transition-transform" : "transition-transform"} />
              </button>
            </div>

            {editorMenuOpen && (
              <div className="absolute right-0 top-9 w-48 bg-[#141416] border border-border rounded-xl shadow-2xl p-1 z-50 text-xs">
                <button
                  type="button"
                  onClick={() => void handleOpenEditor("vscode")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-text transition-colors cursor-pointer text-left ${selectedEditor === "vscode" ? "bg-accent/15 text-accent font-medium" : "hover:bg-white/[0.06]"}`}
                >
                  <span className="flex items-center gap-2.5">
                    <VsCodeIcon size={14} />
                    <span>VS Code</span>
                  </span>
                  {selectedEditor === "vscode" && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenEditor("antigravity")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-text transition-colors cursor-pointer text-left ${selectedEditor === "antigravity" ? "bg-accent/15 text-accent font-medium" : "hover:bg-white/[0.06]"}`}
                >
                  <span className="flex items-center gap-2.5">
                    <AntigravityIcon size={14} />
                    <span>Antigravity</span>
                  </span>
                  {selectedEditor === "antigravity" && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenEditor("rider")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-text transition-colors cursor-pointer text-left ${selectedEditor === "rider" ? "bg-accent/15 text-accent font-medium" : "hover:bg-white/[0.06]"}`}
                >
                  <span className="flex items-center gap-2.5">
                    <RiderIcon size={14} />
                    <span>Rider</span>
                  </span>
                  {selectedEditor === "rider" && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                </button>
                <div className="border-t border-border/40 my-1" />
                <button
                  type="button"
                  onClick={() => void handleOpenEditor("finder")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-text transition-colors cursor-pointer text-left ${selectedEditor === "finder" ? "bg-accent/15 text-accent font-medium" : "hover:bg-white/[0.06]"}`}
                >
                  <span className="flex items-center gap-2.5">
                    <FinderIcon size={14} />
                    <span>Finder</span>
                  </span>
                  {selectedEditor === "finder" && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenEditor("terminal")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-text transition-colors cursor-pointer text-left ${selectedEditor === "terminal" ? "bg-accent/15 text-accent font-medium" : "hover:bg-white/[0.06]"}`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon name="terminal" size={14} />
                    <span>Terminal</span>
                  </span>
                  {selectedEditor === "terminal" && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
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
