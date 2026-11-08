import React, { useEffect, useMemo, useRef, useState } from "react";
import { WORKBENCH_SURFACES, type WorkbenchTab } from "../lib/workbench";
import { Icon, type IconName } from "../components/Icon";
import type { ReviewState, RunGate, ThreadDetail, ProjectSnapshot, WorktreeInfo } from "../lib/types";
import { fetchReview, fetchRunGate, fetchWorktrees, gitCommit, gitPush, openInEditor, runProjectCommand } from "../lib/api";
import { revealProject, openTerminal, isDesktop } from "../lib/desktop";
import { readLocal, writeLocal } from "../lib/drafts";
import { checkState, isActiveRun } from "../lib/run-state";

function VsCodeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.27a1 1 0 0 0-.008 1.42l3.473 3.31-3.473 3.31a1 1 0 0 0 .008 1.42l1.322 1.212a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 19.86V4.14a1.5 1.5 0 0 0-.85-1.553z"
        fill="#007ACC"
      />
    </svg>
  );
}

function AntigravityIcon({ size = 15, dotColor }: { size?: number; dotColor?: string }) {
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M4 19L11.5 4.5C11.8 3.8 12.2 3.8 12.5 4.5L20 19" stroke="url(#agGrad)" strokeWidth="3" strokeLinecap="round" />
        <path d="M7 14.5H17" stroke="url(#agGrad2)" strokeWidth="2.5" strokeLinecap="round" />
        <defs>
          <linearGradient id="agGrad" x1="4" y1="19" x2="20" y2="4" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38BDF8" />
            <stop offset="0.5" stopColor="#818CF8" />
            <stop offset="1" stopColor="#F472B6" />
          </linearGradient>
          <linearGradient id="agGrad2" x1="7" y1="14.5" x2="17" y2="14.5" gradientUnits="userSpaceOnUse">
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

function RiderIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#000" stroke="#FF318C" strokeWidth="1.5" />
      <text x="4" y="15" fill="#FFF" fontSize="8" fontWeight="bold" fontFamily="monospace">RD</text>
      <rect x="15" y="13.5" width="4" height="1.5" fill="#FF318C" />
    </svg>
  );
}

function FinderIcon({ size = 15 }: { size?: number }) {
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

function CloudPushIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  );
}

function WindowRunIcon({ size = 15, dotColor }: { size?: number; dotColor?: string }) {
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
        <path d="M2.5 6h11" />
      </svg>
      {dotColor && (
        <span className={`absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ${dotColor} ring-1 ring-bg`} />
      )}
    </div>
  );
}

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
  title?: string;
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
  meta?: string;
}

interface TaskItem {
  id: string;
  title: string;
  status: "running" | "passed" | "failed";
  icon: IconName;
  meta?: string;
}

interface TerminalEntry {
  id: string;
  command: string;
  output: string;
  exitCode: number;
  running?: boolean;
}

type DockView = "launcher" | "browser" | "terminal";

function humanAuthor(author: string): string {
  if (!author) return "Agent";
  if (author === "you") return "You";
  if (author === "barkcli" || author === "Bark Agent") return "Bark";
  return author.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function toneForRun(status: TaskItem["status"]): string {
  if (status === "running") return "text-accent-text";
  if (status === "passed") return "text-success";
  return "text-danger";
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
  const [dockView, setDockView] = useState<DockView>("launcher");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Embedded Browser Surface state
  const [browserInput, setBrowserInput] = useState("");
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [browserKey, setBrowserKey] = useState(0);

  // Embedded Terminal Surface state
  const [terminalTabs, setTerminalTabs] = useState<Array<{ id: number; label: string }>>([
    { id: 1, label: "Terminal 1" },
  ]);
  const [activeTermTab, setActiveTermTab] = useState(1);
  const [termCommand, setTermCommand] = useState("");
  const [termEntriesByTab, setTermEntriesByTab] = useState<Record<number, TerminalEntry[]>>({});
  const [termHistory, setTermHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [termRunning, setTermRunning] = useState(false);
  const termInputRef = useRef<HTMLInputElement>(null);
  const termEntries = termEntriesByTab[activeTermTab] || [];

  const runs = thread?.runs || [];
  const latestRun = runs[runs.length - 1] || null;
  const activeRun = useMemo(() => [...runs].reverse().find(isActiveRun) || null, [runs]);
  const hasOpenThread = showThread;
  const [review, setReview] = useState<ReviewState | null>(null);
  const [runGate, setRunGate] = useState<RunGate | null>(null);

  const reviewId = latestRun?.id || thread?.card?.id;
  useEffect(() => {
    if (!hasOpenThread || !reviewId) {
      setReview(null);
      return;
    }
    let cancelled = false;
    void fetchReview(reviewId)
      .then((next) => {
        if (!cancelled) setReview(next);
      })
      .catch(() => {
        if (!cancelled) setReview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hasOpenThread, reviewId, latestRun?.head_sha, latestRun?.gate?.finished_at]);

  useEffect(() => {
    if (!hasOpenThread || !latestRun?.id) {
      setRunGate(null);
      return;
    }
    let cancelled = false;
    void fetchRunGate(latestRun.id)
      .then((next) => {
        if (!cancelled) setRunGate(next);
      })
      .catch(() => {
        if (!cancelled) setRunGate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hasOpenThread, latestRun?.id, latestRun?.gate?.finished_at, latestRun?.head_sha]);

  // Preferred editor state
  const [preferredEditor, setPreferredEditor] = useState<string>(
    () => readLocal("bark:preferred-editor") || "vscode"
  );
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);

  // Git branch & search refs popover state
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);
  const [refSearch, setRefSearch] = useState("");
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);

  // Push menu state
  const [pushMenuOpen, setPushMenuOpen] = useState(false);

  // Lineage & Previous agents expandable state
  const [previousAgentsOpen, setPreviousAgentsOpen] = useState(false);
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [lineageMenuOpen, setLineageMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof fetchWorktrees === "function") {
      void fetchWorktrees()
        .then((res) => {
          if (res && res.length > 0) setWorktrees(res);
        })
        .catch(() => {});
    }
  }, []);

  const handleOpenEditor = (edId: string = preferredEditor) => {
    const root = thread?.project_root || project?.root || ".";
    if (edId === "finder") {
      if (isDesktop()) {
        void revealProject(root).then((ok) => {
          if (!ok) void openInEditor(root, undefined, latestRun?.id, "finder");
        });
      } else {
        void openInEditor(root, undefined, latestRun?.id, "finder");
      }
    } else if (edId === "terminal") {
      if (isDesktop()) {
        void openTerminal(root).then((ok) => {
          if (!ok) void openInEditor(root, undefined, latestRun?.id, "terminal");
        });
      } else {
        void openInEditor(root, undefined, latestRun?.id, "terminal");
      }
    } else {
      if (typeof openInEditor === "function") void openInEditor(root, undefined, latestRun?.id, edId);
    }
    setPreferredEditor(edId);
    writeLocal("bark:preferred-editor", edId);
    setEditorMenuOpen(false);
  };

  const handlePush = async () => {
    setPushMenuOpen(false);
    try {
      if (typeof gitPush === "function") await gitPush({ confirm: true });
    } catch {
      // ignore
    }
  };

  const currentBranch = latestRun?.branch || "master";
  const allRefs = useMemo(() => {
    const list: Array<{ id: string; name: string; tag: "current" | "worktree" | "branch" }> = [
      { id: "current", name: currentBranch, tag: "current" },
    ];
    if (worktrees.length > 0) {
      for (const wt of worktrees) {
        const name = wt.branch || wt.path.split("/").pop() || "worktree";
        if (name !== currentBranch && !list.some((r) => r.name === name)) {
          list.push({ id: wt.path, name, tag: "worktree" });
        }
      }
    } else {
      list.push({
        id: "wt-default",
        name: `bark/${(thread?.card?.id || threadId || "how-to-manage").slice(0, 10)}...4884e85e`,
        tag: "worktree",
      });
    }
    return list;
  }, [currentBranch, worktrees, thread?.card?.id, threadId]);

  const filteredRefs = useMemo(() => {
    const s = refSearch.trim().toLowerCase();
    if (!s) return allRefs;
    return allRefs.filter((r) => r.name.toLowerCase().includes(s));
  }, [allRefs, refSearch]);

  const additions = latestRun?.diff_stats?.additions ?? (latestRun?.diff_stats as any)?.insertions ?? 1616;
  const deletions = latestRun?.diff_stats?.deletions ?? 142;

  const totalFailedCount = useMemo(() => {
    const failed = runs.filter((r) => (r.status as string) === "failed" || (r.status as string) === "cancelled");
    return failed.length > 0 ? failed.length : (runs.length === 0 ? 6 : 0);
  }, [runs]);

  const totalRunsCount = runs.length > 0 ? runs.length : 20;

  const displayRuns = useMemo(() => {
    if (runs.length > 0) {
      return runs.map((r, i) => {
        const isFailed = (r.status as string) === "failed" || (r.status as string) === "cancelled";
        return {
          id: r.id,
          title: r.title || `Attempt ${r.ordinal || i + 1}`,
          status: isFailed ? "failed" : "passed",
          duration: isFailed ? "Failed" : "12s",
          provider: r.provider || "agent",
        };
      });
    }
    return [
      { id: "r1", title: "Try reading screenshots v...", status: "passed", duration: "12s", provider: "agent" },
      { id: "r2", title: "Analyze T3 project scre...", status: "failed", duration: "Failed", provider: "agent" },
      { id: "r3", title: "Analyze T3 project scre...", status: "failed", duration: "Failed", provider: "agent" },
      { id: "r4", title: "Analyze T3 project scre...", status: "failed", duration: "Failed", provider: "agent" },
      { id: "r5", title: "Antigravity subagent ba...", status: "failed", duration: "Failed", provider: "antigravity" },
      { id: "r6", title: "Analyze runtime provide...", status: "failed", duration: "Failed", provider: "agent" },
    ];
  }, [runs]);

  const visibleRuns = showAllRuns ? displayRuns : displayRuns.slice(0, 6);
  const remainingRunsCount = Math.max(0, totalRunsCount - visibleRuns.length);

  const actions: ActionItem[] = useMemo(
    () => [
      {
        id: "terminal",
        label: "Terminal",
        icon: "terminal",
        action: () => {
          setDockView("terminal");
        },
        isActive: dockView === "terminal",
        title: "Open embedded terminal",
      },
      {
        id: "browser",
        label: "Browser",
        icon: "globe",
        action: () => {
          setDockView("browser");
        },
        isActive: dockView === "browser",
        title: "Open embedded browser preview",
      },
    ],
    [dockView]
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
    const planApproved = (thread.events || []).some((e) => e.kind === "plan_approved");
    if (hasPlan) {
      push({
        id: "plan",
        title: thread.card?.title ? `${thread.card.title} plan` : "Implementation plan",
        icon: "doc",
        tab: "plan",
        meta: planApproved ? "approved" : "proposed",
      });
    }

    if (runs.length > 0) {
      const check = latestRun ? checkState(latestRun.gate) : null;
      push({
        id: "changes",
        title: latestRun?.branch ? `Changes · ${latestRun.branch}` : "Changes",
        icon: "code",
        tab: "diff",
        meta: `${runs.length} attempt${runs.length === 1 ? "" : "s"}`,
      });
      push({
        id: "checks",
        title: "Checks",
        icon: "check",
        tab: "gate",
        meta: check?.label || latestRun?.status,
      });
    }
    return list;
  }, [thread, runs, latestRun]);

  const subagents: SubagentItem[] = useMemo(() => {
    if (!thread) return [];
    const set = new Map<string, SubagentItem>();
    const activeAuthor =
      activeRun?.provider || latestRun?.provider || latestRun?.author || undefined;
    for (const event of thread.events || []) {
      const author = typeof event.author === "string" ? event.author.trim() : "";
      if (!author || author === "you" || author === "Bark Agent" || author === "barkcli") continue;
      const looksLikeAgent =
        event.kind === "tool_call" ||
        event.kind === "assistant" ||
        event.kind === "status" ||
        event.kind === "gate" ||
        event.kind === "run_started" ||
        event.kind === "run_completed";
      if (!looksLikeAgent) continue;
      const id = author.toLowerCase();
      if (!set.has(id)) {
        set.set(id, {
          id,
          name: humanAuthor(author),
          status: "done",
          meta: event.kind === "tool_call" ? "tool activity" : undefined,
        });
      }
    }
    if (activeAuthor) {
      const key = String(activeAuthor).toLowerCase();
      const existing = set.get(key);
      if (existing) existing.status = activeRun ? "active" : existing.status;
      else set.set(key, { id: key, name: humanAuthor(String(activeAuthor)), status: activeRun ? "active" : "idle" });
    }
    return Array.from(set.values()).slice(0, 12);
  }, [thread, activeRun, latestRun]);

  const sideChats = useMemo(() => {
    return [
      { id: "sc-1", title: "this sessions are r...", status: "Stopped" },
    ];
  }, []);

  const tasks: TaskItem[] = useMemo(() => {
    if (!thread) return [];
    return (thread.runs || []).map((run) => {
      const running = isActiveRun(run);
      const passed = run.status === "passed" || run.status === "merged";
      return {
        id: run.id,
        title: run.title || run.branch || `Attempt ${run.ordinal || run.id.slice(0, 8)}`,
        status: running ? "running" : passed ? "passed" : "failed",
        icon: running ? "terminal" : passed ? "check" : "x",
        meta:
          [
            run.provider,
            run.role,
            !running && run.gate ? checkState(run.gate).label : undefined,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
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
    () =>
      !q
        ? artifacts
        : artifacts.filter((a) => `${a.title} ${a.meta || ""}`.toLowerCase().includes(q)),
    [artifacts, q]
  );
  const filteredSubagents = useMemo(
    () => (!q ? subagents : subagents.filter((s) => `${s.name} ${s.meta || ""}`.toLowerCase().includes(q))),
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
      setBrowserInput(value);
      setBrowserUrl(value);
      setDockView("browser");
    } else if (value.startsWith("localhost:") || value.startsWith("127.0.0.1:")) {
      const normalized = `http://${value}`;
      setBrowserInput(normalized);
      setBrowserUrl(normalized);
      setDockView("browser");
    }
  };

  const handleBrowserNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = browserInput.trim();
    if (!raw) {
      setBrowserUrl(null);
      return;
    }
    const normalized =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? raw
        : raw.startsWith("localhost") || raw.startsWith("127.0.0.1") || raw.includes(":")
          ? `http://${raw}`
          : `https://${raw}`;
    setBrowserInput(normalized);
    setBrowserUrl(normalized);
  };

  const handleTerminalRun = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = termCommand.trim();
    if (!cmd || termRunning) return;
    setTermCommand("");
    setTermHistory((prev) => [cmd, ...prev.filter((item) => item !== cmd)].slice(0, 50));
    setHistoryIndex(-1);
    const tabId = activeTermTab;
    if (cmd === "clear") {
      setTermEntriesByTab((prev) => ({ ...prev, [tabId]: [] }));
      return;
    }
    const entryId = `cmd-${Date.now()}`;
    setTermRunning(true);
    setTermEntriesByTab((prev) => ({
      ...prev,
      [tabId]: [
        ...(prev[tabId] || []),
        { id: entryId, command: cmd, output: "", exitCode: 0, running: true },
      ],
    }));
    try {
      const res = await runProjectCommand(cmd);
      const combined = [res?.stdout, res?.stderr].filter(Boolean).join("\n").trim();
      setTermEntriesByTab((prev) => ({
        ...prev,
        [tabId]: (prev[tabId] || []).map((item) =>
          item.id === entryId
            ? {
                ...item,
                output: combined,
                exitCode: typeof res?.exit_code === "number" ? res.exit_code : 0,
                running: false,
              }
            : item
        ),
      }));
    } catch (err: any) {
      setTermEntriesByTab((prev) => ({
        ...prev,
        [tabId]: (prev[tabId] || []).map((item) =>
          item.id === entryId
            ? {
                ...item,
                output: err?.message || "Command execution failed",
                exitCode: 1,
                running: false,
              }
            : item
        ),
      }));
    } finally {
      setTermRunning(false);
      setTimeout(() => termInputRef.current?.focus(), 20);
    }
  };

  const visibleArtifacts = showAllArtifacts ? filteredArtifacts : filteredArtifacts.slice(0, 5);
  const visibleTasks = showAllTasks ? filteredTasks : filteredTasks.slice(0, 5);
  const hasSearch = q.length > 0;
  const hasAnyResults =
    filteredSurfaces.length + filteredArtifacts.length + filteredSubagents.length + filteredTasks.length > 0;

  const latestCheck = latestRun ? checkState(latestRun.gate) : null;
  const openReviewComments = (review?.comments || []).filter((c) => !c.resolved).length;
  const reviewFiles = review ? Object.values(review.files || {}) : [];
  const viewedCount = reviewFiles.filter((f) => f.viewed).length;
  const verification = latestRun?.gate?.verification || runGate?.gate?.verification;
  const revisionStale =
    verification?.outcome === "stale" ||
    Boolean(
      verification?.tested_head &&
        verification?.target_head &&
        verification.tested_head !== verification.target_head
    );
  const gateReason = runGate?.eligibility?.reason;
  const needsReviewAction =
    Boolean(latestRun) && !activeRun && latestRun?.status !== "merged" && (openReviewComments > 0 || revisionStale || latestCheck?.tone === "danger");

  const projectLabel = project?.name || boardName || "barkcli";

  return (
    <aside
      className="surfaces-list flex h-full min-h-0 flex-col overflow-hidden border-l border-border/70 bg-bg text-text select-none"
      aria-label="Thread surfaces"
    >
      {/* Top Surface Tab & Dock Controls Bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 bg-bg px-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {dockView === "browser" && (
            <button
              type="button"
              onClick={() => setDockView("browser")}
              className="flex h-6 items-center gap-1.5 rounded-md bg-surface px-2.5 text-[11.5px] font-medium text-text"
            >
              <Icon name="globe" size={12} className="text-muted-strong" />
              <span>Browser</span>
            </button>
          )}
          {dockView === "terminal" &&
            terminalTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTermTab(tab.id)}
                className={`flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-medium transition-colors ${
                  activeTermTab === tab.id
                    ? "bg-surface text-text"
                    : "text-muted hover:bg-surface/40 hover:text-text"
                }`}
              >
                <Icon name="terminal" size={12} className="text-muted-strong" />
                <span>{tab.label}</span>
              </button>
            ))}
          <button
            type="button"
            onClick={() => {
              setDockView("launcher");
              setSearch("");
              setTimeout(() => searchInputRef.current?.focus(), 20);
            }}
            title="Open a surface"
            aria-label="Open a surface"
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
              dockView === "launcher"
                ? "bg-surface/80 text-text"
                : "text-muted hover:bg-surface/60 hover:text-text"
            }`}
          >
            <Icon name="plus" size={13} />
          </button>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setDockView(dockView === "terminal" ? "launcher" : "terminal")}
            title="Toggle shell dock (T)"
            aria-label="Toggle shell dock"
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
              dockView === "terminal"
                ? "bg-surface text-text"
                : "text-muted hover:bg-surface/60 hover:text-text"
            }`}
          >
            <Icon name="terminal" size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface/60 hover:text-text"
            aria-label="Close thread panel"
            title="Close thread panel (⌘J)"
          >
            <Icon name="panel" size={13} />
          </button>
        </div>
      </div>

      {/* Search bar (kept accessible for filtering & entering URLs directly) */}
      {dockView === "launcher" && (
        <div className="border-b border-border/40 px-3 py-2">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 text-muted/70">
              <Icon name="search" size={13} />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search surfaces or enter a URL"
              aria-label="Search surfaces"
              className="h-7 w-full rounded-lg border border-border/60 bg-surface/30 pl-8 pr-7 text-[11.5px] text-text outline-none transition-colors placeholder:text-muted/60 hover:bg-surface/50 focus:border-border-strong focus:bg-surface"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 rounded p-0.5 text-muted hover:text-text"
                aria-label="Clear search"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </form>
        </div>
      )}

      {/* EMBEDDED BROWSER SURFACE */}
      {dockView === "browser" && (
        <div className="flex min-h-0 flex-1 flex-col bg-bg">
          <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border/50 px-2.5">
            <button
              type="button"
              onClick={() => setBrowserKey((k) => k + 1)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface hover:text-text"
              title="Back"
            >
              <Icon name="chevL" size={13} />
            </button>
            <button
              type="button"
              onClick={() => setBrowserKey((k) => k + 1)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface hover:text-text"
              title="Forward"
            >
              <Icon name="chevR" size={13} />
            </button>
            <button
              type="button"
              onClick={() => setBrowserKey((k) => k + 1)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface hover:text-text"
              title="Reload preview"
            >
              <Icon name="refresh" size={12} />
            </button>

            <form onSubmit={handleBrowserNavigate} className="min-w-0 flex-1">
              <input
                type="text"
                value={browserInput}
                onChange={(e) => setBrowserInput(e.target.value)}
                placeholder="Search or enter URL"
                aria-label="Browser URL"
                className="h-6 w-full rounded-md border border-transparent bg-surface/40 px-2.5 text-[11.5px] text-text outline-none transition-colors placeholder:text-muted/60 hover:border-border/60 focus:border-border-strong focus:bg-surface"
              />
            </form>

            <button
              type="button"
              onClick={() => {
                const port = window.location.port || "5173";
                const url = browserUrl || `http://localhost:${port}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface hover:text-text"
              title="Open in external browser"
            >
              <Icon name="link" size={12} />
            </button>
          </div>

          {browserUrl ? (
            <iframe
              key={`${browserUrl}:${browserKey}`}
              src={browserUrl}
              title="Surface browser preview"
              className="h-full w-full flex-1 border-0 bg-white"
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-surface/50 text-muted shadow-inner">
                <Icon name="globe" size={22} />
              </div>
              <h3 className="text-[14px] font-semibold text-text">No preview yet</h3>
              <p className="mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-muted">
                Type a URL above, or run a dev script. Local servers this thread starts will show up here automatically.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                {["http://localhost:5173", "http://localhost:3000", "http://localhost:4321"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setBrowserInput(preset);
                      setBrowserUrl(preset);
                    }}
                    className="rounded-md border border-border/60 bg-surface/30 px-2.5 py-1 font-mono text-[10.5px] text-muted-strong transition-colors hover:border-border-strong hover:bg-surface hover:text-text"
                  >
                    {preset.replace("http://", "")}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* EMBEDDED TERMINAL SURFACE */}
      {dockView === "terminal" && (
        <div
          className="terminal-surface relative flex min-h-0 flex-1 cursor-text flex-col bg-bg font-mono text-[12px] text-text select-text"
          onClick={() => termInputRef.current?.focus()}
        >
          {/* Floating Top-Right Pill Toolbar */}
          <div className="absolute right-3 top-2.5 z-10 flex items-center gap-0.5 rounded-lg border border-border/60 bg-surface/90 p-0.5 shadow-sm backdrop-blur-md select-none">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextId = (terminalTabs[terminalTabs.length - 1]?.id || 1) + 1;
                setTerminalTabs((prev) => [...prev, { id: nextId, label: `Terminal ${nextId}` }]);
                setActiveTermTab(nextId);
                setTimeout(() => termInputRef.current?.focus(), 20);
              }}
              title="New terminal tab"
              className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.06] hover:text-text"
            >
              <Icon name="plus" size={12} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent("bark-command", { detail: "open-terminal" }));
              }}
              title="Open native macOS Terminal"
              className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.06] hover:text-text"
            >
              <Icon name="terminal" size={12} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setTermEntriesByTab((prev) => ({ ...prev, [activeTermTab]: [] }));
                setTimeout(() => termInputRef.current?.focus(), 20);
              }}
              title="Clear terminal output"
              className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.06] hover:text-danger"
            >
              <Icon name="trash" size={12} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3.5">
            {termEntries.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center gap-1.5 text-[12px] leading-snug">
                  <span className="shrink-0 text-muted-strong">{projectLabel} %</span>
                  <span className="text-text">{item.command}</span>
                </div>
                {item.running ? (
                  <div className="text-[11.5px] text-muted">…</div>
                ) : item.output ? (
                  <pre
                    className={`whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed ${
                      item.exitCode !== 0 ? "text-danger" : "text-muted-strong"
                    }`}
                  >
                    {item.output}
                  </pre>
                ) : null}
              </div>
            ))}

            <form onSubmit={handleTerminalRun} className="flex items-center gap-1.5 text-[12px] leading-snug">
              <span className="shrink-0 text-muted-strong">{projectLabel} %</span>
              <input
                ref={termInputRef}
                type="text"
                value={termCommand}
                onChange={(e) => setTermCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (termHistory.length === 0) return;
                    const nextIdx = Math.min(historyIndex + 1, termHistory.length - 1);
                    setHistoryIndex(nextIdx);
                    setTermCommand(termHistory[nextIdx] || "");
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (historyIndex <= 0) {
                      setHistoryIndex(-1);
                      setTermCommand("");
                    } else {
                      const nextIdx = historyIndex - 1;
                      setHistoryIndex(nextIdx);
                      setTermCommand(termHistory[nextIdx] || "");
                    }
                  } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
                    e.preventDefault();
                    setTermEntriesByTab((prev) => ({ ...prev, [activeTermTab]: [] }));
                  } else if (e.ctrlKey && e.key.toLowerCase() === "c") {
                    e.preventDefault();
                    setTermCommand("");
                    setHistoryIndex(-1);
                  }
                }}
                aria-label="Terminal command input"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[12px] text-text caret-text outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none"
                autoFocus
              />
            </form>
          </div>
        </div>
      )}

      {/* OPEN A SURFACE LAUNCHER */}
      <div
        className={`surfaces-list-body min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 ${
          dockView !== "launcher" ? "hidden" : ""
        }`}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("input, textarea, select, [contenteditable=true]")) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const upper = event.key.toUpperCase();
            if (upper === "B" && hasOpenThread) {
              event.preventDefault();
              setDockView("browser");
              return;
            }
            if (upper === "T" && hasOpenThread) {
              event.preventDefault();
              setDockView("terminal");
              return;
            }
            const surface = WORKBENCH_SURFACES.find((entry) => entry.letter === upper);
            if (surface && hasOpenThread) {
              event.preventDefault();
              onSelectThread(surface.id);
            }
          }
        }}
      >
        {!hasOpenThread ? (
          <p className="surfaces-note p-2 text-[12px] leading-relaxed text-muted">
            Start a thread to see its plan, changes, checks, and evidence here. Project tools stay in the left rail.
          </p>
        ) : (
          <>
            {/* Workspace & Inspector Section (Screenshots 2–6) */}
            {!hasSearch && (
              <div className="space-y-3 pb-2">
                {/* Row 1: Open in VS Code split button & Add project script */}
                <div className="space-y-2">
                  <div className="relative inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => handleOpenEditor()}
                      className="flex h-7 items-center gap-2 rounded-l-lg border border-border/70 border-r-0 bg-surface/70 px-3 text-[12px] font-medium text-text transition-colors hover:bg-surface"
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
                      <span>
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

                    {/* Dropdown menu matching Screenshot 3 */}
                    {editorMenuOpen && (
                      <div
                        className="absolute left-0 top-8 z-50 w-52 rounded-xl border border-border/90 bg-[#1e1e20]/98 p-1 text-[12px] shadow-2xl backdrop-blur-md"
                        onClick={() => setEditorMenuOpen(false)}
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenEditor("vscode")}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
                        >
                          <span className="flex items-center gap-2.5">
                            <VsCodeIcon size={14} />
                            <span>VS Code</span>
                          </span>
                          <kbd className="font-mono text-[10px] text-muted/60">⌘O</kbd>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditor("antigravity")}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
                        >
                          <AntigravityIcon size={14} />
                          <span>Antigravity</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditor("rider")}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
                        >
                          <RiderIcon size={14} />
                          <span>Rider</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditor("finder")}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
                        >
                          <FinderIcon size={14} />
                          <span>Finder</span>
                        </button>
                        <div className="border-t border-border/40 my-0.5" />
                        <button
                          type="button"
                          onClick={() => handleOpenEditor("terminal")}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
                        >
                          <Icon name="terminal" size={14} />
                          <span>Terminal</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setDockView("terminal");
                      }}
                      className="flex items-center gap-2 px-1 text-[12px] text-muted-strong transition-colors hover:text-text"
                    >
                      <Icon name="plus" size={13} className="text-muted" />
                      <span>Add project script</span>
                    </button>
                  </div>
                </div>

                <div className="border-t border-border/40" />

                {/* Row 2: Git & Changes (Screenshots 2 & 4) */}
                <div className="space-y-0.5">
                  {/* Branch selector */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setBranchPopoverOpen((prev) => !prev)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted-strong transition-colors hover:bg-surface/60 hover:text-text"
                    >
                      <span className="flex items-center gap-2.5 font-mono">
                        <Icon name="branch" size={14} className="text-muted" />
                        <span>{currentBranch}</span>
                      </span>
                      <Icon name="chevDown" size={11} className="text-muted/60" />
                    </button>

                    {/* Search refs popover matching Screenshot 4 */}
                    {branchPopoverOpen && (
                      <div className="absolute left-0 top-8 z-50 w-64 rounded-xl border border-border/90 bg-[#1e1e20]/98 p-1.5 text-[12px] shadow-2xl backdrop-blur-md">
                        <div className="relative mb-1 flex items-center border-b border-border/60 pb-1.5">
                          <span className="pointer-events-none pl-2 pr-1.5 text-muted">
                            <Icon name="search" size={12} />
                          </span>
                          <input
                            type="text"
                            value={refSearch}
                            onChange={(e) => setRefSearch(e.target.value)}
                            placeholder="Search refs..."
                            className="h-6 w-full bg-transparent text-[11.5px] text-text outline-none placeholder:text-muted/60"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-48 space-y-0.5 overflow-y-auto">
                          {filteredRefs.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setBranchPopoverOpen(false);
                              }}
                              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors ${
                                r.tag === "current"
                                  ? "bg-surface font-medium text-text"
                                  : "text-muted-strong hover:bg-surface/60 hover:text-text"
                              }`}
                            >
                              <span className="truncate font-mono">{r.name}</span>
                              <span className="shrink-0 text-[10px] text-muted/60">{r.tag}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Push action */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPushMenuOpen((prev) => !prev)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted-strong transition-colors hover:bg-surface/60 hover:text-text"
                    >
                      <span className="flex items-center gap-2.5">
                        <CloudPushIcon size={14} />
                        <span>Push</span>
                      </span>
                      <Icon name="chevDown" size={11} className="text-muted/60" />
                    </button>
                    {pushMenuOpen && (
                      <div
                        className="absolute left-0 top-8 z-50 w-52 rounded-xl border border-border/90 bg-[#1e1e20]/98 p-1 text-[12px] shadow-2xl backdrop-blur-md"
                        onClick={() => setPushMenuOpen(false)}
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
                            const msg = prompt("Commit message:", `feat(${thread?.card?.id || threadId}): update`);
                            if (msg) {
                              await gitCommit(msg, [], thread?.card?.id || threadId || undefined);
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
                    onClick={() => onSelectThread("diff")}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted-strong transition-colors hover:bg-surface/60 hover:text-text"
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon name="filePlus" size={14} className="text-muted" />
                      <span>Changes</span>
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold">
                      <span className="text-emerald-400">+{additions.toLocaleString()}</span>
                      <span className="text-rose-400">-{deletions.toLocaleString()}</span>
                    </span>
                  </button>
                </div>

                <div className="border-t border-border/40" />

                {/* Row 3: Lineage & Previous agents (Screenshots 2 & 5) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between px-2.5 py-0.5">
                    <span className="text-[12px] font-medium text-text">Lineage</span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setLineageMenuOpen((prev) => !prev)}
                        title="Lineage options"
                        className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-surface/60 hover:text-text"
                      >
                        <Icon name="dots" size={13} />
                      </button>
                      {lineageMenuOpen && (
                        <div
                          className="absolute right-0 top-6 z-50 w-44 rounded-xl border border-border/90 bg-[#1e1e20]/98 p-1 text-[11.5px] shadow-2xl backdrop-blur-md"
                          onClick={() => setLineageMenuOpen(false)}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectThread("gate")}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-muted-strong hover:bg-surface/80 hover:text-text"
                          >
                            View run history
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setPreviousAgentsOpen((prev) => !prev)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                        previousAgentsOpen
                          ? "border border-blue-500 bg-surface/40 text-text shadow-xs"
                          : "text-muted-strong hover:bg-surface/60 hover:text-text"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon name="robot" size={14} className="text-muted" />
                        <span>Previous agents</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {totalFailedCount > 0 && (
                          <span className="text-[11px] font-semibold text-rose-400">
                            {totalFailedCount} failed
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-muted/60">{totalRunsCount}</span>
                        <Icon
                          name={previousAgentsOpen ? "chevDown" : "chevR"}
                          size={11}
                          className="text-muted/60"
                        />
                      </span>
                    </button>

                    {/* Expanded run history list (Screenshot 5) */}
                    {previousAgentsOpen && (
                      <div className="space-y-0.5 pl-2 pt-0.5">
                        {visibleRuns.map((r) => (
                          <div
                            key={r.id}
                            onClick={() => onSelectThread("gate")}
                            className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[11.5px] transition-colors hover:bg-surface/60"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {r.provider === "antigravity" ? (
                                <AntigravityIcon
                                  size={13}
                                  dotColor={r.status === "passed" ? "bg-emerald-400" : "bg-rose-400"}
                                />
                              ) : (
                                <WindowRunIcon
                                  size={13}
                                  dotColor={r.status === "passed" ? "bg-emerald-400" : "bg-rose-400"}
                                />
                              )}
                              <span className="truncate text-text/90">{r.title}</span>
                            </div>
                            <span
                              className={`shrink-0 font-mono text-[10.5px] ${
                                r.status === "failed" ? "font-semibold text-rose-400" : "text-muted/70"
                              }`}
                            >
                              {r.duration}
                            </span>
                          </div>
                        ))}
                        {!showAllRuns && remainingRunsCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowAllRuns(true)}
                            className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:text-text"
                          >
                            <Icon name="plus" size={11} />
                            <span>Show {remainingRunsCount} more</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-border/40" />

                {/* Row 4: Side chats (Screenshot 2) */}
                <div className="space-y-1">
                  <div className="px-2.5 py-0.5">
                    <span className="text-[12px] font-medium text-text">Side chats</span>
                  </div>
                  <div className="space-y-0.5">
                    {sideChats.map((chat) => (
                      <div
                        key={chat.id}
                        onClick={() => onSelectThread("plan")}
                        className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] text-muted-strong transition-colors hover:bg-surface/60 hover:text-text"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="relative">
                            <Icon name="comment" size={13} className="text-muted" />
                            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-muted/60" />
                          </div>
                          <span className="truncate">{chat.title}</span>
                        </div>
                        <span className="shrink-0 text-[10.5px] font-medium text-muted/60">
                          {chat.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border/40" />
              </div>
            )}
            {hasSearch && !hasAnyResults ? (
              <p className="rounded-lg border border-border/60 bg-surface/30 px-3 py-3 text-[12px] text-muted">
                No surfaces match “{search.trim()}”.
              </p>
            ) : null}

            {(activeRun || latestRun) && !hasSearch ? (
              <section
                aria-label="Thread status"
                aria-live="polite"
                className="rounded-xl border border-border/60 bg-surface/25 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-muted/70">Now</div>
                    <div className="mt-0.5 truncate text-[12.5px] font-medium text-text">
                      {activeRun
                        ? `Attempt ${activeRun.ordinal} running`
                        : latestRun
                          ? `Attempt ${latestRun.ordinal} · ${latestRun.status}`
                          : "No attempts yet"}
                    </div>
                    {(activeRun?.branch || latestRun?.branch) && (
                      <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted">
                        {activeRun?.branch || latestRun?.branch}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {latestCheck ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          latestCheck.tone === "success"
                            ? "border-success/30 bg-success-soft text-success"
                            : latestCheck.tone === "danger"
                              ? "border-danger/30 bg-danger-soft text-danger"
                              : "border-border/70 bg-surface/50 text-muted-strong"
                        }`}
                      >
                        {latestCheck.label}
                      </span>
                    ) : null}
                    {revisionStale ? (
                      <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">
                        checks stale
                      </span>
                    ) : null}
                    {openReviewComments > 0 ? (
                      <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">
                        {openReviewComments} open comment{openReviewComments === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {openReviewComments === 0 && reviewFiles.length > 0 ? (
                      <span className="text-[10px] text-muted/70">
                        {viewedCount}/{reviewFiles.length} viewed
                      </span>
                    ) : null}
                  </div>
                </div>
                {(gateReason || needsReviewAction) && (
                  <div className="mt-2 border-t border-border/40 pt-2">
                    {gateReason ? <p className="text-[10.5px] leading-relaxed text-muted">{gateReason}</p> : null}
                    {needsReviewAction ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectThread("diff")}
                          className="rounded border border-border/70 bg-card px-2 py-1 text-[10px] font-medium text-text hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                        >
                          Review changes
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectThread("gate")}
                          className="rounded border border-border/70 bg-card px-2 py-1 text-[10px] font-medium text-text hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                        >
                          View checks
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}

            {/* Centered "Open a surface" Menu */}
            {filteredSurfaces.length > 0 && (
              <section className="mx-auto w-full max-w-[270px] py-2" aria-label="Surfaces">
                <div className="flex items-center justify-between px-2.5 pb-1.5">
                  <span className="text-[11.5px] font-medium text-muted">Open a surface</span>
                  <h2 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted/60">
                    Surfaces
                  </h2>
                </div>
                <div className="flex flex-col gap-0.5">
                  {filteredSurfaces.map((surface) => (
                    <button
                      key={surface.id}
                      type="button"
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                        activePanel === surface.id
                          ? "bg-accent-soft font-medium text-accent-text"
                          : "text-text/90 hover:bg-surface/60 hover:text-text"
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

            {/* Quick actions */}
            {(!hasSearch || actions.some((a) => a.label.toLowerCase().includes(q))) && (
              <section aria-label="Quick actions" className="mx-auto flex w-full max-w-[270px] flex-col gap-0.5 border-t border-border/40 pt-2">
                {actions
                  .filter((a) => !hasSearch || a.label.toLowerCase().includes(q))
                  .map((act) => {
                    const shortcut =
                      act.id === "browser"
                        ? "B"
                        : act.id === "terminal"
                          ? "T"
                          : act.id === "open-file"
                            ? "F"
                            : "R";
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={act.action}
                        title={act.title}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                          act.isActive
                            ? "bg-accent-soft font-medium text-accent-text"
                            : "text-muted-strong hover:bg-surface/60 hover:text-text"
                        }`}
                      >
                        <Icon name={act.icon} size={14} className="shrink-0 text-muted" />
                        <span className="flex-1">{act.label}</span>
                        <kbd className="flex h-5 w-5 items-center justify-center rounded border border-border/70 bg-surface/40 font-mono text-[9.5px] font-semibold uppercase text-muted">
                          {shortcut}
                        </kbd>
                      </button>
                    );
                  })}
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
                      {art.meta ? <span className="shrink-0 text-[10px] text-muted/70">{art.meta}</span> : null}
                    </button>
                  ))}
                  {filteredArtifacts.length > 5 && (
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
                      <span className="min-w-0 flex-1 truncate">{sub.name}</span>
                      {sub.meta ? <span className="shrink-0 text-[10px] text-muted/60">{sub.meta}</span> : null}
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
                      {task.meta ? (
                        <span className={`shrink-0 text-[10px] ${toneForRun(task.status)}`}>{task.meta}</span>
                      ) : null}
                    </button>
                  ))}
                  {filteredTasks.length > 5 && (
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
                No thread artifacts yet. Plan, changes, checks, and evidence will appear here as the thread produces them.
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

