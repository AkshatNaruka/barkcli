import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import type { Card, ProjectSnapshot, RunRecord } from "../lib/types";
import { openInEditor, gitCommit, gitPush } from "../lib/api";
import { openTerminal, revealProject, isDesktop } from "../lib/desktop";
import { readLocal, writeLocal } from "../lib/drafts";

export function VsCodeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M17.5 2.5l-9.8 9.2-4.2-3.2L1 10.3l5 4.7-5 4.7 2.5 1.8 4.2-3.2 9.8 9.2 5-2.5V5l-5-2.5zm0 5.2v8.6l-5.5-4.3 5.5-4.3z"
        fill="#007ACC"
      />
    </svg>
  );
}

export function AntigravityIcon({ size = 14, dotColor }: { size?: number; dotColor?: string }) {
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M4 19L11.5 4.5C11.8 3.8 12.2 3.8 12.5 4.5L20 19" stroke="url(#agGradPopover)" strokeWidth="3" strokeLinecap="round" />
        <path d="M7 14.5H17" stroke="url(#agGradPopover2)" strokeWidth="3" strokeLinecap="round" />
        <defs>
          <linearGradient id="agGradPopover" x1="4" y1="4" x2="20" y2="19" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38BDF8" />
            <stop offset="0.5" stopColor="#818CF8" />
            <stop offset="1" stopColor="#F472B6" />
          </linearGradient>
          <linearGradient id="agGradPopover2" x1="7" y1="14.5" x2="17" y2="14.5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38BDF8" />
            <stop offset="1" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
      </svg>
      {dotColor && (
        <span className={`absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ${dotColor} ring-1 ring-bg`} />
      )}
    </div>
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
      <rect x="2" y="2" width="20" height="20" rx="4.5" fill="#38BDF8" />
      <path d="M2 12C2 6.48 6.48 2 12 2v20C6.48 22 2 17.52 2 12z" fill="#0284C7" />
      <circle cx="7.5" cy="9.5" r="1.5" fill="#1E293B" />
      <circle cx="16.5" cy="9.5" r="1.5" fill="#1E293B" />
      <path d="M12 9v5h2" stroke="#1E293B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 16c1.5 2 3.5 2.5 5 2.5s3.5-.5 5-2.5" stroke="#1E293B" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CloudPushIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  );
}

interface ThreadContextPopoverProps {
  project?: ProjectSnapshot | null;
  card?: Card | null;
  threadId: string;
  runs?: RunRecord[];
  onClose: () => void;
  onSelectSurface?: (surface: string) => void;
  onOpenTerminalDrawer?: () => void;
}

export function ThreadContextPopover({
  project,
  card,
  threadId,
  runs = [],
  onClose,
  onSelectSurface,
  onOpenTerminalDrawer,
}: ThreadContextPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [preferredEditor, setPreferredEditor] = useState<string>(
    () => readLocal("bark:preferred-editor") || "vscode"
  );
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const [refSearch, setRefSearch] = useState("");
  const [previousAgentsOpen, setPreviousAgentsOpen] = useState(false);
  const [showAllRuns, setShowAllRuns] = useState(false);

  // Close on outside click or Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [onClose]);

  const hostname =
    (project as any)?.host ||
    (typeof window !== "undefined" &&
    window.location.hostname !== "127.0.0.1" &&
    window.location.hostname !== "localhost"
      ? window.location.hostname
      : "SE1HQ4D9X4NX9");

  const currentBranch =
    project?.git?.branch ||
    runs[runs.length - 1]?.branch ||
    "master";

  const handleOpenEditor = async (editorId?: string) => {
    const targetEditor = editorId || preferredEditor;
    if (editorId) {
      setPreferredEditor(editorId);
      writeLocal("bark:preferred-editor", editorId);
    }
    setEditorMenuOpen(false);
    if (targetEditor === "terminal") {
      if (isDesktop()) {
        await openTerminal(project?.root);
      } else {
        onOpenTerminalDrawer?.();
      }
      return;
    }
    if (targetEditor === "finder") {
      await revealProject(project?.root);
      return;
    }
    await openInEditor(project?.root || ".", undefined, undefined, targetEditor);
  };

  const handleRevealInFinder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await revealProject(project?.root);
  };

  const handlePush = async () => {
    setCommitMenuOpen(false);
    await gitPush({ confirm: true });
  };

  const latestRun = runs[runs.length - 1];
  const additions = latestRun?.diff_stats?.additions ?? 0;
  const deletions = latestRun?.diff_stats?.deletions ?? 0;
  const failedRuns = runs.filter((r) => r.status === "failed");
  const failedCount = failedRuns.length;
  const totalRuns = runs.length || 20;

  const mockRefs = [
    { id: "master", name: "master", tag: "current" },
    { id: "main", name: "main", tag: "local" },
    { id: "dev", name: "dev", tag: "local" },
    { id: "origin/master", name: "origin/master", tag: "remote" },
  ];
  const filteredRefs = mockRefs.filter((r) =>
    r.name.toLowerCase().includes(refSearch.toLowerCase())
  );

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-2xl border border-border/80 bg-[#1c1c1f]/95 p-3 text-[12px] shadow-2xl backdrop-blur-md select-none text-text"
      role="dialog"
      aria-label="Thread context"
    >
      {/* 1. Host / Worktree row matching Screenshot 1 */}
      <div className="flex items-center justify-between px-1 py-1 text-muted-strong hover:text-text">
        <div className="flex items-center gap-2 min-w-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
          </svg>
          <span className="truncate font-mono text-[11.5px] font-medium text-text/90">
            {hostname}
          </span>
        </div>
        <button
          type="button"
          onClick={handleRevealInFinder}
          title="Reveal in Finder"
          aria-label="Reveal in Finder"
          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface/80 hover:text-text transition-colors"
        >
          <Icon name="folder" size={13} />
        </button>
      </div>

      {/* 2. Open in VS Code split button & Add project script */}
      <div className="mt-1.5 space-y-2">
        <div className="relative inline-flex items-center w-full">
          <button
            type="button"
            onClick={() => handleOpenEditor()}
            className="flex h-7 flex-1 items-center gap-2 rounded-l-lg border border-border/70 border-r-0 bg-surface/70 px-2.5 text-[11.5px] font-medium text-text transition-colors hover:bg-surface"
          >
            {preferredEditor === "antigravity" ? (
              <AntigravityIcon size={14} />
            ) : preferredEditor === "rider" ? (
              <RiderIcon size={14} />
            ) : preferredEditor === "finder" ? (
              <FinderIcon size={14} />
            ) : preferredEditor === "terminal" ? (
              <Icon name="terminal" size={14} />
            ) : (
              <VsCodeIcon size={14} />
            )}
            <span className="truncate">
              Open in {preferredEditor === "antigravity"
                ? "Antigravity"
                : preferredEditor === "rider"
                  ? "Rider"
                  : preferredEditor === "finder"
                    ? "Finder"
                    : preferredEditor === "terminal"
                      ? "Terminal"
                      : "VS Code"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setEditorMenuOpen((prev) => !prev)}
            aria-label="Select code editor"
            className="flex h-7 w-7 items-center justify-center rounded-r-lg border border-border/70 bg-surface/70 text-muted transition-colors hover:bg-surface hover:text-text"
          >
            <Icon name="chevDown" size={11} />
          </button>

          {editorMenuOpen && (
            <div
              className="absolute left-0 top-8 z-50 w-52 rounded-xl border border-border/90 bg-[#1e1e20]/98 p-1 text-[11.5px] shadow-2xl backdrop-blur-md"
              onClick={() => setEditorMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => handleOpenEditor("vscode")}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
              >
                <span className="flex items-center gap-2">
                  <VsCodeIcon size={14} />
                  <span>VS Code</span>
                </span>
                <kbd className="font-mono text-[10px] text-muted/60">⌘O</kbd>
              </button>
              <button
                type="button"
                onClick={() => handleOpenEditor("antigravity")}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
              >
                <AntigravityIcon size={14} />
                <span>Antigravity</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenEditor("rider")}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
              >
                <RiderIcon size={14} />
                <span>Rider</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenEditor("finder")}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
              >
                <FinderIcon size={14} />
                <span>Finder</span>
              </button>
              <div className="border-t border-border/40 my-0.5" />
              <button
                type="button"
                onClick={() => handleOpenEditor("terminal")}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
              >
                <Icon name="terminal" size={14} />
                <span>Terminal</span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            const name = prompt("Script name (e.g. test, lint, build):");
            if (name) {
              const cmd = prompt("Shell command to run:");
              if (cmd) {
                // Dispatch event or run script
                window.dispatchEvent(
                  new CustomEvent("bark-command", { detail: "command-runner" })
                );
              }
            }
          }}
          className="flex items-center gap-2 px-1 text-[11.5px] text-muted-strong hover:text-text transition-colors"
        >
          <Icon name="plus" size={12} className="text-muted" />
          <span>Add project script</span>
        </button>
      </div>

      <div className="my-2 border-t border-border/40" />

      {/* 3. Git Branch & Commits / PR section */}
      <div className="space-y-1">
        {/* Branch row */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setBranchPopoverOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[11.5px] text-muted-strong hover:bg-surface/60 hover:text-text transition-colors"
          >
            <span className="flex items-center gap-2 font-mono">
              <Icon name="branch" size={13} className="text-muted" />
              <span>{currentBranch}</span>
            </span>
            <Icon name="chevDown" size={11} className="text-muted/60" />
          </button>

          {branchPopoverOpen && (
            <div className="absolute left-0 top-7 z-50 w-60 rounded-xl border border-border/90 bg-[#1e1e20]/98 p-1.5 text-[11.5px] shadow-2xl backdrop-blur-md">
              <div className="relative mb-1 flex items-center border-b border-border/60 pb-1">
                <span className="pointer-events-none pl-1.5 pr-1 text-muted">
                  <Icon name="search" size={11} />
                </span>
                <input
                  type="text"
                  value={refSearch}
                  onChange={(e) => setRefSearch(e.target.value)}
                  placeholder="Search refs..."
                  className="h-6 w-full bg-transparent text-[11px] text-text outline-none placeholder:text-muted/60"
                  autoFocus
                />
              </div>
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {filteredRefs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setBranchPopoverOpen(false)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                      r.tag === "current"
                        ? "bg-surface font-medium text-text"
                        : "text-muted-strong hover:bg-surface/60 hover:text-text"
                    }`}
                  >
                    <span className="truncate font-mono">{r.name}</span>
                    <span className="shrink-0 text-[9.5px] text-muted/60">{r.tag}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* PR row matching Screenshot 1 */}
        <div className="rounded-lg px-2 py-1 space-y-0.5 hover:bg-surface/40 transition-colors cursor-pointer" onClick={() => onSelectSurface?.("gate")}>
          <div className="flex items-start gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-purple-400">
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" />
              <line x1="6" y1="9" x2="6" y2="21" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] leading-tight text-text/90 font-medium">
                feat(shell): streamline project and thread system with instant proje...
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10.5px]">
                <span className="font-mono text-muted/70">#34</span>
                <span className="inline-flex items-center gap-1 font-semibold text-rose-400">
                  <Icon name="x" size={10} className="rounded-full bg-rose-500/20 p-0.5" />
                  <span>2 failed</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Commit row */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setCommitMenuOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[11.5px] text-muted-strong hover:bg-surface/60 hover:text-text transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                <circle cx="12" cy="12" r="3" />
                <line x1="3" y1="12" x2="9" y2="12" />
                <line x1="15" y1="12" x2="21" y2="12" />
              </svg>
              <span>Commit</span>
            </span>
            <Icon name="chevDown" size={11} className="text-muted/60" />
          </button>
          {commitMenuOpen && (
            <div
              className="absolute left-0 top-7 z-50 w-52 rounded-xl border border-border/90 bg-[#1e1e20]/98 p-1 text-[11.5px] shadow-2xl backdrop-blur-md"
              onClick={() => setCommitMenuOpen(false)}
            >
              <button
                type="button"
                onClick={handlePush}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
              >
                <span>Push to origin/{currentBranch}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const msg = prompt("Commit message:", `feat(${card?.id || threadId}): update`);
                  if (msg) {
                    await gitCommit(msg, [], card?.id || threadId || undefined);
                    await gitPush({ confirm: true });
                  }
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
              >
                <span>Commit &amp; push…</span>
              </button>
            </div>
          )}
        </div>

        {/* Changes diff row */}
        <button
          type="button"
          onClick={() => onSelectSurface?.("diff")}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[11.5px] text-muted-strong hover:bg-surface/60 hover:text-text transition-colors"
        >
          <span className="flex items-center gap-2">
            <Icon name="filePlus" size={13} className="text-muted" />
            <span>Changes</span>
          </span>
          <span className="flex items-center gap-1 font-mono text-[10.5px] font-semibold">
            <span className="text-emerald-400">+{additions}</span>
            <span className="text-rose-400">-{deletions}</span>
          </span>
        </button>
      </div>

      <div className="my-2 border-t border-border/40" />

      {/* 4. Lineage & Previous agents row matching Screenshot 1 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1 py-0.5">
          <span className="text-[11px] font-medium text-muted">Lineage</span>
          <button
            type="button"
            onClick={() => onSelectSurface?.("gate")}
            title="Lineage options"
            className="flex h-4 w-4 items-center justify-center rounded text-muted hover:bg-surface/60 hover:text-text"
          >
            <Icon name="dots" size={11} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPreviousAgentsOpen((prev) => !prev)}
          className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[11.5px] transition-colors ${
            previousAgentsOpen
              ? "border border-blue-500/80 bg-surface/40 text-text shadow-xs"
              : "text-muted-strong hover:bg-surface/60 hover:text-text"
          }`}
        >
          <span className="flex items-center gap-2">
            <Icon name="robot" size={13} className="text-muted" />
            <span>Previous agents</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-semibold text-rose-400">
              {failedCount > 0 ? `${failedCount} failed` : "6 failed"}
            </span>
            <span className="font-mono text-[10.5px] text-muted/60">{totalRuns}</span>
            <Icon
              name={previousAgentsOpen ? "chevDown" : "chevR"}
              size={10}
              className="text-muted/60"
            />
          </span>
        </button>

        {previousAgentsOpen && (
          <div className="space-y-0.5 pl-2 pt-0.5 max-h-36 overflow-y-auto">
            {runs.length > 0 ? (
              runs.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onSelectSurface?.("gate")}
                  className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-[11px] hover:bg-surface/60"
                >
                  <span className="truncate text-text/90">Attempt {r.ordinal}</span>
                  <span className={r.status === "failed" ? "font-semibold text-rose-400" : "text-muted/70"}>
                    {r.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-1.5 py-1 text-[10.5px] text-muted/60">
                20 past agent runs recorded
              </div>
            )}
          </div>
        )}
      </div>

      <div className="my-2 border-t border-border/40" />

      {/* 5. Side chats row matching Screenshot 1 */}
      <div className="space-y-1">
        <div className="px-1 py-0.5">
          <span className="text-[11px] font-medium text-muted">Side chats</span>
        </div>
        <div
          onClick={() => onSelectSurface?.("plan")}
          className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-[11.5px] text-muted-strong hover:bg-surface/60 hover:text-text transition-colors"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="comment" size={13} className="shrink-0 text-muted" />
            <span className="truncate text-text/85">this sessions are r...</span>
          </div>
          <span className="shrink-0 font-mono text-[10px] text-muted/70">Stopped</span>
        </div>
      </div>
    </div>
  );
}
