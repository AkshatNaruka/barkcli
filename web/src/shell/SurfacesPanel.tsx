import React, { useEffect, useMemo, useRef, useState } from "react";
import { WORKBENCH_SURFACES, type WorkbenchTab } from "../lib/workbench";
import { Icon, type IconName } from "../components/Icon";
import type { ReviewState, RunGate, ThreadDetail, ProjectSnapshot } from "../lib/types";
import { fetchReview, fetchRunGate, runProjectCommand } from "../lib/api";
import { checkState, isActiveRun } from "../lib/run-state";

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

