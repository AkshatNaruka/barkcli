import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Card,
  ThreadEvent,
  TaskDiff,
  RunRecord,
  RunDiff,
  RunGate,
  RunContext,
  ContextPack,
  ProductPlan,
  ReviewState,
  Receipt,
  ReceiptVerification,
  AgentProfile,
  ProjectSnapshot,
} from "../lib/types";
import {
  fetchTaskDiff,
  evalSession,
  fetchAgentProfiles,
  fetchThreadRuns,
  fetchRunDiff,
  fetchRunGate,
  fetchRunContext,
  previewContext,
  approveOrchestraPlan,
  createOrchestraPlan,
  dispatchOrchestraPlan,
  fetchOrchestra,
  fetchReview,
  fetchReceipt,
  verifyReceipt,
  markReviewViewed,
  addReviewComment,
  resolveReviewComment,
  deleteReviewComment,
  requestRunChanges,
  askAboutRun,
  openInEditor,
  runProjectCommand,
  mergeRun,
  startThreadRun,
} from "../lib/api";
import { Icon } from "../components/Icon";
import { UnifiedDiff } from "../components/UnifiedDiff";
import { ReceiptPanel } from "../components/ReceiptPanel";
import { ContextView } from "../components/ContextView";
import { checkState, checksPassed, canReviewMerge } from "../lib/run-state";
import { useRouteState, updateRouteState } from "../lib/hashnav";
import { PANEL_TO_TAB, TAB_TO_PANEL, WORKBENCH_SURFACES, type WorkbenchTab } from "../lib/workbench";
import { ChecksPanel } from "./ChecksPanel";
import { QuietSelect } from "../components/QuietSelect";
import { normalizeBrowserUrl, toInbuiltBrowserUrl } from "../lib/inbuiltBrowser";

export interface SurfaceItem {
  id: string;
  label: string;
  icon: (size?: number) => React.ReactNode;
  letter: string;
  hasDropdown?: boolean;
  isDevice?: boolean;
}

export const SURFACE_ITEMS: SurfaceItem[] = [
  {
    id: "browser",
    label: "Browser",
    icon: (s = 14) => <Icon name="globe" size={s} />,
    letter: "B",
    hasDropdown: true,
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: (s = 14) => <Icon name="terminal" size={s} />,
    letter: "T",
  },
  {
    id: "files",
    label: "Files",
    icon: (s = 14) => <Icon name="doc" size={s} />,
    letter: "F",
  },
  {
    id: "diff",
    label: "Diff",
    icon: (s = 14) => <Icon name="filePlus" size={s} />,
    letter: "D",
  },
  {
    id: "receipt",
    label: "Pull request",
    icon: (s = 14) => <Icon name="branch" size={s} />,
    letter: "P",
  },
  {
    id: "gate",
    label: "Linked pull requests",
    icon: (s = 14) => <Icon name="link" size={s} />,
    letter: "L",
  },
  {
    id: "device",
    label: "Device",
    icon: (s = 14) => (
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
    letter: "M",
    isDevice: true,
  },
  {
    id: "plan",
    label: "Side chat",
    icon: (s = 14) => <Icon name="comment" size={s} />,
    letter: "S",
  },
];

export function getTabDisplay(id: string) {
  switch (id) {
    case "plan":
      return {
        label: "Plan",
        icon: <Icon name="comment" size={12} className="text-muted-strong" />,
      };
    case "diff":
      return {
        label: "Changes",
        icon: <Icon name="filePlus" size={12} className="text-muted-strong" />,
      };
    case "gate":
      return {
        label: "Checks",
        icon: <Icon name="link" size={12} className="text-muted-strong" />,
      };
    case "receipt":
      return {
        label: "Pull request",
        icon: <Icon name="branch" size={12} className="text-muted-strong" />,
      };
    case "browser":
      return {
        label: "Browser",
        icon: <Icon name="globe" size={12} className="text-muted-strong" />,
      };
    case "terminal":
      return {
        label: "Terminal",
        icon: <Icon name="terminal" size={12} className="text-muted-strong" />,
      };
    case "files":
      return {
        label: "Files",
        icon: <Icon name="doc" size={12} className="text-muted-strong" />,
      };
    case "device":
      return {
        label: "Device",
        icon: (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-strong"
          >
            <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
            <path d="M12 18h.01" />
          </svg>
        ),
      };
    default:
      return {
        label: "Workbench",
        icon: <Icon name="layers" size={12} className="text-muted-strong" />,
      };
  }
}

interface InspectorPaneProps {
  card?: Card;
  events: ThreadEvent[];
  threadId?: string;
  onClose?: () => void;
  onBack?: () => void;
  project?: ProjectSnapshot | null;
  boardName?: string | null;
}

const TABS: Array<{ id: WorkbenchTab; label: string }> = WORKBENCH_SURFACES;

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-12 text-center text-[11px] leading-relaxed text-muted">{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted/70">
      {children}
    </div>
  );
}

export function InspectorPane({
  card,
  events,
  threadId,
  onClose,
  onBack,
  project,
  boardName,
}: InspectorPaneProps) {
  const location = useRouteState();
  const [runs, setRuns] = useState<RunRecord[]>([]);

  // Surface multi-tab state
  const initialTab = useMemo(() => {
    if (location.panel === "changes") return "diff";
    if (location.panel === "checks") return "gate";
    if (location.panel === "evidence") return "receipt";
    if (location.panel === "context") return "files";
    if (location.panel === "browser") return "browser";
    if (location.panel === "terminal") return "terminal";
    if (location.panel === "diagnostics") return "device";
    return "plan";
  }, [location.panel]);

  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    const list = ["plan", "diff", "gate"];
    if (initialTab && !list.includes(initialTab)) {
      list.push(initialTab);
    }
    return list;
  });

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [surfaceMenuOpen, setSurfaceMenuOpen] = useState(false);
  const surfaceMenuRef = useRef<HTMLDivElement>(null);

  // Sync with location.panel when navigated externally
  useEffect(() => {
    if (location.panel) {
      const mapped =
        location.panel === "changes"
          ? "diff"
          : location.panel === "checks"
            ? "gate"
            : location.panel === "evidence"
              ? "receipt"
              : location.panel === "context"
                ? "files"
                : location.panel === "browser"
                  ? "browser"
                  : location.panel === "terminal"
                    ? "terminal"
                    : location.panel === "diagnostics"
                      ? "device"
                      : "plan";
      setActiveTab(mapped);
      setOpenTabs((prev) => (prev.includes(mapped) ? prev : [...prev, mapped]));
    }
  }, [location.panel]);

  const handleSelectTab = (id: string) => {
    setActiveTab(id);
    const panelMap: Record<string, any> = {
      plan: "plan",
      diff: "changes",
      gate: "checks",
      receipt: "evidence",
      files: "context",
      device: "diagnostics",
      browser: "browser",
      terminal: "terminal",
    };
    if (panelMap[id]) {
      updateRouteState({ panel: panelMap[id] });
    }
  };

  const handleOpenSurface = (id: string) => {
    setSurfaceMenuOpen(false);
    setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    handleSelectTab(id);
  };

  const handleCloseTab = (id: string) => {
    const nextTabs = openTabs.filter((t) => t !== id);
    setOpenTabs(nextTabs);
    if (activeTab === id) {
      if (nextTabs.length > 0) {
        const nextActive = nextTabs[nextTabs.length - 1];
        handleSelectTab(nextActive);
      } else {
        if (onBack) onBack();
        else updateRouteState({ panel: undefined, file: undefined });
      }
    }
  };

  // Keyboard and outside click listeners for surfaceMenuRef
  useEffect(() => {
    if (!surfaceMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (surfaceMenuRef.current && !surfaceMenuRef.current.contains(e.target as Node)) {
        setSurfaceMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSurfaceMenuOpen(false);
        return;
      }
      const k = e.key.toUpperCase();
      const match = SURFACE_ITEMS.find((item) => item.letter === k);
      if (match) {
        e.preventDefault();
        handleOpenSurface(match.id);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [surfaceMenuOpen]);

  // Backward-compatible tab getter for existing Diff / Plan / Gate / Receipt panels
  const tab: WorkbenchTab =
    activeTab === "files" ? "context" : activeTab === "device" ? "eval" : (activeTab as WorkbenchTab);
  const setTab = (next: WorkbenchTab | string) => handleSelectTab(next);

  // Browser surface state
  const [browserUrl, setBrowserUrl] = useState("http://localhost:5173");
  const [browserInput, setBrowserInput] = useState("http://localhost:5173");
  const [browserKey, setBrowserKey] = useState(0);
  const [copiedBrowserUrl, setCopiedBrowserUrl] = useState(false);
  const browserIframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for in-app browser open events so links in chat/threads/receipts open right here
  useEffect(() => {
    const onOpenBrowser = (event: Event) => {
      const ce = event as CustomEvent<{ url?: string } | string>;
      const targetUrl = typeof ce.detail === "string" ? ce.detail : ce.detail?.url;
      if (targetUrl) {
        const normalized = normalizeBrowserUrl(targetUrl);
        setBrowserInput(normalized);
        setBrowserUrl(normalized);
        setBrowserKey((k) => k + 1);
      }
      handleOpenSurface("browser");
    };
    window.addEventListener("bark-open-browser", onOpenBrowser);
    return () => window.removeEventListener("bark-open-browser", onOpenBrowser);
  }, []);

  // Terminal surface state
  const [termEntriesByTab, setTermEntriesByTab] = useState<
    Record<
      number,
      Array<{
        id: string;
        command: string;
        output?: string;
        exitCode?: number;
        running?: boolean;
      }>
    >
  >({ 1: [] });
  const [termTabs, setTermTabs] = useState<Array<{ id: number; label: string }>>([
    { id: 1, label: "Terminal 1" },
  ]);
  const [activeTermTab, setActiveTermTab] = useState(1);
  const [termCommand, setTermCommand] = useState("");
  const [termHistory, setTermHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const termInputRef = useRef<HTMLInputElement>(null);

  // Files surface state
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [filesViewMode, setFilesViewMode] = useState<"tree" | "context">("tree");

  // Device surface state
  const [deviceType, setDeviceType] = useState<"iphone" | "pixel" | "ipad">("iphone");
  const [deviceOrientation, setDeviceOrientation] = useState<"portrait" | "landscape">("portrait");
  const [deviceScale, setDeviceScale] = useState(1);

  const termEntries = termEntriesByTab[activeTermTab] || [];
  const projectLabel = project?.name || boardName || "barkcli";

  const handleTerminalRun = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = termCommand.trim();
    if (!cmd) return;
    const entryId = `term-${Date.now()}`;
    setTermHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)]);
    setHistoryIndex(-1);
    setTermCommand("");
    setTermEntriesByTab((prev) => ({
      ...prev,
      [activeTermTab]: [
        ...(prev[activeTermTab] || []),
        { id: entryId, command: cmd, running: true },
      ],
    }));
    try {
      const res = await runProjectCommand(cmd);
      const output =
        (res?.stdout || "") +
        (res?.stderr ? (res?.stdout ? "\n" : "") + res.stderr : "");
      setTermEntriesByTab((prev) => ({
        ...prev,
        [activeTermTab]: (prev[activeTermTab] || []).map((item) =>
          item.id === entryId
            ? {
                ...item,
                running: false,
                output: output || "(no output)",
                exitCode: res?.exit_code ?? 0,
              }
            : item
        ),
      }));
    } catch (err: any) {
      setTermEntriesByTab((prev) => ({
        ...prev,
        [activeTermTab]: (prev[activeTermTab] || []).map((item) =>
          item.id === entryId
            ? {
                ...item,
                running: false,
                output: err?.message || "Command failed",
                exitCode: 1,
              }
            : item
        ),
      }));
    }
  };

  const loadProjectFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const res = await runProjectCommand("git ls-files");
      if (res && res.stdout) {
        const lines = res.stdout
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        setProjectFiles(lines);
      }
    } catch {
      // fallback
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "files" && projectFiles.length === 0) {
      void loadProjectFiles();
    }
  }, [activeTab, projectFiles.length, loadProjectFiles]);

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (!q) return projectFiles.slice(0, 100);
    return projectFiles
      .filter((f) => f.toLowerCase().includes(q))
      .slice(0, 100);
  }, [projectFiles, fileSearch]);
  const [diffData, setDiffData] = useState<TaskDiff | RunDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState(false);
  const [evalData, setEvalData] = useState<any | null>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  const [evalError, setEvalError] = useState(false);
  const [runDiff, setRunDiff] = useState<RunDiff | null>(null);
  const [runGate, setRunGate] = useState<RunGate | null>(null);
  const [loadingRunGate, setLoadingRunGate] = useState(false);
  const [runContext, setRunContext] = useState<RunContext | null>(null);
  const [loadingRunContext, setLoadingRunContext] = useState(false);
  const [previewPack, setPreviewPack] = useState<ContextPack | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [teamPlan, setTeamPlan] = useState<ProductPlan | null>(null);
  const [teamPlanBusy, setTeamPlanBusy] = useState(false);
  const [teamPlanError, setTeamPlanError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [receiptVerification, setReceiptVerification] =
    useState<ReceiptVerification | null>(null);
  const [verifyingReceipt, setVerifyingReceipt] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [delegateAgent, setDelegateAgent] = useState("");
  const [delegatePrompt, setDelegatePrompt] = useState("");
  const [delegating, setDelegating] = useState(false);
  const [delegateNote, setDelegateNote] = useState<string | null>(null);
  const autoSelected = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchAgentProfiles().then((next) => {
      if (cancelled) return;
      const active = next.filter((profile) => profile.status === "active");
      setProfiles(active);
      setDelegateAgent((current) =>
        active.some((profile) => profile.id === current) ? current : active[0]?.id || ""
      );
    });
    return () => {
      cancelled = true;
    };
  }, [card?.id]);

  const selectedScriptAgent = profiles.find((profile) => profile.id === delegateAgent);

  const delegate = async () => {
    if (!card || !selectedScriptAgent || delegating) return;
    setDelegating(true);
    setDelegateNote(null);
    try {
      const run = await startThreadRun(card.id, {
        agent_id: selectedScriptAgent.id,
        provider: selectedScriptAgent.provider,
        model: selectedScriptAgent.model,
        role: selectedScriptAgent.role,
        prompt: delegatePrompt.trim() || undefined,
        skills: selectedScriptAgent.skills,
      });
      if (!run) {
        setDelegateNote(
          "Could not delegate. Check that the agent is signed in and the worktree is clean."
        );
        return;
      }
      setDelegateNote(`Delegated as ${selectedScriptAgent.name}. Run ${run.id} is starting.`);
      setDelegatePrompt("");
      setRuns((current) => [...current.filter((item) => item.id !== run.id), run]);
    } finally {
      setDelegating(false);
    }
  };

  const planEvent = useMemo(
    () =>
      [...events].reverse().find((event) => event.kind === "plan_proposed") ||
      [...events].reverse().find((event) => event.kind === "plan_approved"),
    [events]
  );
  const proposal = planEvent?.data;
  const planApproved = events.some((event) => event.kind === "plan_approved");

  useEffect(() => {
    if (!card?.id) {
      setTeamPlan(null);
      return;
    }
    let cancelled = false;
    void Promise.resolve(fetchOrchestra(false)).then((snapshot) => {
      if (cancelled) return;
      const next =
        (snapshot?.plans || [])
          .filter(
            (plan) =>
              plan.parent_card_id === card.id && plan.status !== "cancelled"
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
      setTeamPlan(next);
    });
    return () => {
      cancelled = true;
    };
  }, [card?.id]);

  const runTeamPlanAction = async (action: () => Promise<ProductPlan | null>) => {
    setTeamPlanBusy(true);
    setTeamPlanError(null);
    try {
      const plan = await action();
      if (!plan) throw new Error("The team action failed.");
      setTeamPlan(plan);
    } catch (error) {
      setTeamPlanError(error instanceof Error ? error.message : String(error));
    } finally {
      setTeamPlanBusy(false);
    }
  };
  const gateEvent = useMemo(
    () => [...events].reverse().find((event) => event.kind === "gate" && (!location.run || event.run_id === location.run)),
    [events, location.run]
  );
  const gateData = gateEvent?.data;
  const taskEvent = useMemo(
    () => [...events].reverse().find((event) => event.kind === "task_spawned"),
    [events]
  );
  const mergeEvent = useMemo(
    () => [...events].reverse().find((event) => event.kind === "merge"),
    [events]
  );
  const latestRun = location.run ? runs.find((run) => run.id === location.run) : runs.length > 0 ? runs[runs.length - 1] : undefined;
  const currentTaskId = latestRun?.id || (!location.run ? taskEvent?.data?.task_id || card?.id : undefined);
  const currentSessionId = taskEvent?.data?.session_id;

  const diffCount = diffData?.files?.length || 0;
  const reviewId = latestRun?.id || card?.id;
  const reviewFiles = review ? Object.values(review.files || {}) : [];
  const viewedCount = reviewFiles.filter((file) => file.viewed).length;
  const openReviewComments = (review?.comments || []).filter(
    (comment) => !comment.resolved
  ).length;
  const contextPack = previewPack || runContext?.context || null;
  const contextManifest = contextPack?.manifest;
  const contextBudget = contextManifest?.budget_tokens || 0;
  const contextPct = contextBudget
    ? Math.min(100, Math.round(((contextManifest?.estimated_tokens || 0) / contextBudget) * 100))
    : 0;

  const runRevision = useMemo(() => {
    const relevant = new Set([
      "run_started",
      "run_completed",
      "run_failed",
      "run_interrupted",
      "gate",
      "diff",
      "merge",
    ]);
    const last = [...events].reverse().find((event) => relevant.has(event.kind));
    return last?.id || "";
  }, [events]);

  const gateVerdict = latestRun?.gate || gateData;
  const gateVerification = gateVerdict?.verification || runGate?.gate?.verification;
  const gateCommand = latestRun?.gate?.command || gateData?.command;
  const gateOutput = runGate?.log || gateData?.output || "";
  const gateTime =
    latestRun?.gate?.finished_at || gateEvent?.created_at || latestRun?.ended_at;
  const visibleTabs = TABS;

  useEffect(() => {
    setPreviewPack(null);
  }, [threadId]);

  useEffect(() => {
    if (!threadId) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    fetchThreadRuns(threadId).then((next) => {
      if (!cancelled) setRuns(next);
    });
    return () => {
      cancelled = true;
    };
  }, [threadId, runRevision]);

  useEffect(() => {
    if (tab !== "diff" || !reviewId) {
      return;
    }
    let cancelled = false;
    void Promise.resolve(fetchReview(reviewId)).then((next) => {
      if (!cancelled) setReview(next);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, reviewId, runRevision]);

  useEffect(() => {
    setReceipt(null);
    setReceiptVerification(null);
  }, [card?.id]);

  useEffect(() => {
    if (tab !== "receipt" || !card?.id) return;
    let cancelled = false;
    setLoadingReceipt(true);
    fetchReceipt(card.id)
      .then((next) => {
        if (!cancelled) setReceipt(next);
      })
      .finally(() => {
        if (!cancelled) setLoadingReceipt(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, card?.id, runRevision]);

  const handleVerifyReceipt = async () => {
    if (!receipt || verifyingReceipt) return;
    setVerifyingReceipt(true);
    try {
      setReceiptVerification(await verifyReceipt(receipt.id));
    } finally {
      setVerifyingReceipt(false);
    }
  };

  useEffect(() => {
    if (!["gate", "diff"].includes(tab) || !latestRun) {
      setRunGate(null);
      return;
    }
    let cancelled = false;
    setLoadingRunGate(true);
    fetchRunGate(latestRun.id)
      .then((next) => {
        if (!cancelled) setRunGate(next);
      })
      .catch(() => { if (!cancelled) setRunGate(null); })
      .finally(() => {
        if (!cancelled) setLoadingRunGate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, latestRun?.id, latestRun?.gate?.finished_at]);

  // Match the reference: the artifact is the default panel once a worker exists.
  useEffect(() => {
    if (tab !== "diff") return;
    let cancelled = false;
    setDiffData(null);
    setRunDiff(null);
    setDiffError(false);
    setLoadingDiff(true);
    const request = latestRun
      ? fetchRunDiff(latestRun.id).then((res) => {
          if (!res) throw new Error("Could not read the selected diff");
          if (!cancelled) {
            setRunDiff(res);
            setDiffData(res);
          }
        })
      : currentTaskId
        ? fetchTaskDiff(currentTaskId).then((res) => {
            if (!cancelled) setDiffData(res);
          })
        : Promise.resolve();
    request
      .catch(() => {
        if (!cancelled) setDiffError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingDiff(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, currentTaskId, latestRun?.id, latestRun?.head_sha, latestRun?.gate?.finished_at]);

  const refreshReview = async () => {
    if (!reviewId) return;
    const next = await fetchReview(reviewId);
    if (next) setReview(next);
  };

  const handleToggleViewed = async (path: string, viewed: boolean) => {
    if (!reviewId) return;
    setReview((current) => {
      if (!current) return current;
      return {
        ...current,
        files: {
          ...current.files,
          [path]: {
            path,
            viewed,
            updated_at: new Date().toISOString(),
          },
        },
      };
    });
    const next = await markReviewViewed(reviewId, path, viewed);
    if (next) setReview(next);
  };

  const handleAddComment = async (
    path: string,
    line: number | undefined,
    side: string | undefined,
    body: string
  ) => {
    if (!reviewId) return;
    setReviewBusy(true);
    setReviewNotice(null);
    try {
      const comment = await addReviewComment(reviewId, {
        path,
        line,
        side,
        body,
        run_id: latestRun?.id,
      });
      if (!comment) {
        setReviewNotice("Could not add the comment.");
        return;
      }
      await refreshReview();
    } finally {
      setReviewBusy(false);
    }
  };

  const handleResolveComment = async (commentId: string, resolved: boolean) => {
    if (!reviewId) return;
    const next = await resolveReviewComment(reviewId, commentId, resolved);
    if (next) {
      setReview((current) =>
        current
          ? {
              ...current,
              comments: current.comments.map((comment) =>
                comment.id === next.id ? next : comment
              ),
            }
          : current
      );
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!reviewId) return;
    const ok = await deleteReviewComment(reviewId, commentId);
    if (ok) {
      setReview((current) =>
        current
          ? {
              ...current,
              comments: current.comments.filter((comment) => comment.id !== commentId),
            }
          : current
      );
    }
  };

  const handleOpenLine = (path: string, line?: number) => {
    void openInEditor(path, line, latestRun?.id).then((result) => {
      if (!result?.opened) {
        setReviewNotice("No supported editor was found. Set BARKCLI_EDITOR to open files.");
      }
    });
  };

  const submitChanges = async () => {
    if (!latestRun) return;
    setReviewBusy(true);
    setReviewNotice(null);
    try {
      const result = await requestRunChanges(latestRun.id, changesNote.trim() || undefined);
      if (!result?.run) {
        setReviewNotice("Could not start a follow-up run.");
        return;
      }
      setChangesOpen(false);
      setChangesNote("");
      setReviewNotice(`Follow-up run ${result.run.id} started.`);
    } finally {
      setReviewBusy(false);
    }
  };

  const submitQuestion = async () => {
    if (!latestRun || !askText.trim()) return;
    setReviewBusy(true);
    setReviewNotice(null);
    try {
      const result = await askAboutRun(latestRun.id, askText.trim());
      if (!result?.run) {
        setReviewNotice("Could not start the review question.");
        return;
      }
      setAskOpen(false);
      setAskText("");
      setReviewNotice(`Review question sent to ${result.run.provider}.`);
    } finally {
      setReviewBusy(false);
    }
  };

  const mergeReviewedRun = async () => {
    if (!latestRun) return;
    if (!canReviewMerge(latestRun) || !runGate?.eligibility?.eligible) { setReviewNotice("Run current checks and review the updated revision before merging."); return; }
    const confirmed = window.confirm(
      `Merge ${latestRun.branch || latestRun.id} into the current branch?\n\nThe gate has passed. This releases the worktree after a successful merge.`
    );
    if (!confirmed) return;
    setReviewBusy(true);
    setReviewNotice(null);
    try {
      const result = await mergeRun(latestRun.id, true);
      if (!result) {
        setReviewNotice("Merge failed. Resolve conflicts and try again.");
        return;
      }
      setReviewNotice(`Merged ${result.branch || latestRun.branch || "run"}.`);
      setRuns((current) => current.map((run) => run.id === latestRun.id ? result.run : run));
      window.dispatchEvent(new Event("bark-threads-changed"));
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <aside
      className="workbench-pane flex h-full w-full min-w-0 flex-col overflow-hidden bg-bg"
      aria-label="Workbench"
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-1.5 border-b border-border/80 bg-bg px-2.5">
        <div
          role="tablist"
          aria-label="Workbench tabs"
          className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto no-scrollbar"
        >
          {openTabs.map((tabId) => {
            const info = getTabDisplay(tabId);
            const isActive = activeTab === tabId;
            const count =
              tabId === "plan"
                ? proposal?.children?.length
                : tabId === "diff" && diffCount > 0
                  ? diffCount
                  : null;
            return (
              <div
                key={tabId}
                role="tab"
                id={`workbench-tab-${tabId}`}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => handleSelectTab(tabId)}
                title={info.label}
                className={`group flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors cursor-pointer select-none ${
                  isActive
                    ? "border border-border/80 bg-surface text-text shadow-xs"
                    : "border border-transparent text-muted hover:bg-surface/50 hover:text-text"
                }`}
              >
                {info.icon}
                <span className="truncate max-w-[120px]">{info.label}</span>
                {count != null && (
                  <span className="font-mono text-[9px] text-muted/55">{count}</span>
                )}
                {tabId === "gate" && gateVerdict && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      checksPassed(gateVerdict) ? "bg-success" : "bg-warning"
                    }`}
                  />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tabId);
                  }}
                  aria-label={`Close ${info.label} tab`}
                  title={`Close ${info.label}`}
                  className="ml-0.5 rounded p-0.5 text-muted/60 opacity-60 group-hover:opacity-100 hover:bg-white/[0.1] hover:text-text transition-colors cursor-pointer"
                >
                  <Icon name="x" size={10} />
                </button>
              </div>
            );
          })}

          {/* Floating Selection Trigger (+) matching Screenshot 2 */}
          <div ref={surfaceMenuRef} className="relative flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setSurfaceMenuOpen((prev) => !prev)}
              title="Open a surface"
              aria-label="Open a surface"
              aria-expanded={surfaceMenuOpen}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${
                surfaceMenuOpen
                  ? "bg-surface text-text ring-1 ring-border"
                  : "text-muted hover:bg-surface/60 hover:text-text"
              }`}
            >
              <Icon name="plus" size={13} />
            </button>

            {surfaceMenuOpen && (
              <div className="absolute left-0 top-7 w-[235px] rounded-xl border border-border/80 bg-[#161618]/98 p-1.5 text-xs shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95">
                <div className="flex flex-col gap-0.5">
                  {SURFACE_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleOpenSurface(item.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-[12px] text-text/90 transition-colors hover:bg-white/[0.06] hover:text-text cursor-pointer group"
                    >
                      <span className="text-muted group-hover:text-text transition-colors">
                        {item.icon(14)}
                      </span>
                      <span className="flex-1 text-left font-medium">{item.label}</span>
                      {item.hasDropdown && (
                        <Icon name="chevDown" size={12} className="text-muted/60 mr-1" />
                      )}
                      <kbd className="flex h-5 w-5 items-center justify-center rounded border border-border/80 bg-surface/50 font-mono text-[9px] font-semibold uppercase text-muted">
                        {item.letter}
                      </kbd>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          {gateVerdict && (
            <span
              className={`hidden items-center gap-1 font-mono text-[9.5px] sm:flex ${
                checksPassed(gateVerdict) ? "text-success" : "text-warning"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  checksPassed(gateVerdict) ? "bg-success" : "bg-warning"
                }`}
              />
              {checkState(gateVerdict).label}
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close surfaces (⌘J)"
              aria-label="Close surfaces"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.05] hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent cursor-pointer"
            >
              <Icon name="panel" size={13} />
            </button>
          )}
        </div>
      </div>

      <details className="workbench-more sr-only">
        <summary>Evidence & tools</summary>
        <div role="group" aria-label="Evidence and tools">
          <button
            type="button"
            onClick={() => setTab("receipt")}
            aria-current={tab === "receipt" ? "page" : undefined}
          >
            Evidence
          </button>
          {runs.length > 1 && (
            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <span>Attempt</span>
              <QuietSelect
                value={latestRun?.id || ""}
                onChange={(event) => updateRouteState({ run: event.target.value, file: undefined })}
                aria-label="Select attempt"
                className="min-w-[180px]"
              >
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    Attempt {run.ordinal} · {run.status}
                  </option>
                ))}
              </QuietSelect>
            </label>
          )}
        </div>
      </details>
      <div id="workbench-panel" {...(visibleTabs.length > 1 ? { role: "tabpanel", "aria-labelledby": `workbench-tab-${tab}` } : {})} className="min-h-0 flex-1 overflow-y-auto">
        {location.run && !latestRun && !runs.length && <p role="status" className="p-4 text-muted">Loading the selected run…</p>}
        {location.run && runs.length > 0 && !latestRun && <p role="alert" className="p-4 text-warning">That run is unavailable. Return to the thread to choose another attempt.</p>}
        {tab === "plan" && (
          <div className="p-4 space-y-4">
            <section aria-label="Plan Decomposition">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted font-semibold">
                Plan Decomposition
              </span>
              <div className="mt-2 rounded-xl border border-border/80 bg-surface/50 p-3.5">
                <h3 className="text-[13.5px] font-semibold text-text">
                  {card?.title || "Plan Decomposition"}
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  {card?.description || "Requirements analyzed and slice plan generated."}
                </p>
              </div>
            </section>

            <section aria-label="Child Tasks">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted font-semibold">
                Child Tasks
              </span>
              <div className="mt-2 space-y-2">
                <div className="rounded-xl border border-border/80 bg-card p-3 shadow-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-text">Proposed Plan</span>
                    <span className="font-mono text-[9.5px] text-muted/60">
                      {(planEvent?.created_at || new Date().toISOString()).slice(0, 19)}Z
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {Array.isArray(proposal?.children) && proposal.children.length > 0
                      ? `${proposal.children.length} proposed task slices ready for execution.`
                      : "Proposed plan with atomic tasks."}
                  </p>
                  {Array.isArray(proposal?.children) && proposal.children.length > 0 && (
                    <div className="mt-2.5 space-y-1.5 border-t border-border/40 pt-2">
                      {proposal.children.map((child: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-[11px]">
                          <span className="text-text font-medium">{i + 1}. {child.title}</span>
                          {child.effort && <span className="font-mono text-[9.5px] text-muted">{child.effort}h</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {proposal && !planApproved && card?.id && (
                    <div className="mt-3 flex items-center gap-2 border-t border-border/40 pt-2.5">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!card?.id) return;
                          await startThreadRun(card.id, {
                            plan_event_id: planEvent?.id,
                            prompt: proposal?.rationale || card.title,
                          });
                          window.dispatchEvent(new CustomEvent("bark-thread-updated", { detail: card.id }));
                        }}
                        className="inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[10.5px] font-medium text-white hover:bg-accent-hover transition-colors"
                      >
                        <Icon name="check" size={11} />
                        Approve &amp; Build
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="border-t border-border/50 pt-3">
              <p className="text-[11.5px] leading-relaxed text-muted">
                Review and approve the current plan in the thread. Bark’s offline plan is a proposal, not execution evidence.
              </p>
            </div>

            <details className="mt-3">
              <summary className="text-xs text-muted cursor-pointer hover:text-text">
                Team & advanced planning
              </summary>
              <div className="mt-3 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <SectionLabel>Card</SectionLabel>
                    <h2 className="mt-1 text-[13px] font-medium leading-snug text-text">
                      {card?.title || "No card selected"}
                    </h2>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[9.5px] text-muted/65">
                      <span>{card?.id || "—"}</span>
                      <span className="text-muted/35">·</span>
                      <span>{card?.column || "draft"}</span>
                      {card?.assignee && (
                        <>
                          <span className="text-muted/35">·</span>
                          <span>{card.assignee}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {card?.description && (
                  <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">
                    {card.description}
                  </p>
                )}

            <div className="mt-4 rounded-md border border-border/70 bg-surface/35 p-2.5">
              <div className="flex items-center justify-between">
                <SectionLabel>Delegate</SectionLabel>
                <span className="font-mono text-[8.5px] uppercase tracking-wide text-muted/60">
                  {profiles.length} active
                </span>
              </div>
              {profiles.length === 0 ? (
                <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                  Hire an active agent in Operations → Agents, then delegate this card
                  without leaving the board.
                </p>
              ) : (
                <>
                  <QuietSelect
                    value={delegateAgent}
                    onChange={(event) => setDelegateAgent(event.target.value)}
                    aria-label="Delegate to agent"
                    className="mt-2 w-full rounded border border-border bg-bg px-2 py-1.5 text-[11px] text-text outline-none focus:border-accent"
                  >
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} · {profile.role} · {profile.provider}
                      </option>
                    ))}
                  </QuietSelect>
                  {selectedScriptAgent && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[8.5px] text-muted">
                        {selectedScriptAgent.permission_mode}
                      </span>
                      {selectedScriptAgent.model && (
                        <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[8.5px] text-muted">
                          {selectedScriptAgent.model}
                        </span>
                      )}
                      {selectedScriptAgent.skills.slice(0, 4).map((skill) => (
                        <span
                          key={skill}
                          className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[8.5px] text-muted"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={delegatePrompt}
                    onChange={(event) => setDelegatePrompt(event.target.value)}
                    rows={2}
                    placeholder="Optional instruction for this card…"
                    className="mt-2 w-full resize-none rounded border border-border bg-bg px-2 py-1.5 text-[10.5px] leading-relaxed text-text outline-none placeholder:text-muted/60 focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => void delegate()}
                    disabled={!card || !selectedScriptAgent || delegating}
                    className="mt-2 inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    <Icon name="branch" size={10} />
                    {delegating ? "Delegating…" : "Delegate to agent"}
                  </button>
                  {delegateNote && (
                    <p className="mt-1.5 text-[9.5px] leading-relaxed text-muted">
                      {delegateNote}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <SectionLabel>Plan</SectionLabel>
              <span className="font-mono text-[9px] text-muted/55">
                {proposal?.children?.length
                  ? `${proposal.children.length} tasks`
                  : planApproved
                    ? "approved"
                    : "waiting"}
              </span>
            </div>

            {proposal?.rationale && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{proposal.rationale}</p>
            )}

            {Array.isArray(proposal?.children) && proposal.children.length > 0 ? (
              <ol className="mt-3 divide-y divide-border/60 border-y border-border/60">
                {proposal.children.map((child: any, index: number) => (
                  <li key={`${child.title}-${index}`} className="py-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 font-mono text-[9px] text-muted/50">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] font-medium leading-snug text-text">
                          {child.title || child.id}
                        </div>
                        {child.description && (
                          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                            {child.description}
                          </p>
                        )}
                        {Array.isArray(child.acceptance_criteria) &&
                          child.acceptance_criteria.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {child.acceptance_criteria.map((criterion: string, cIndex: number) => (
                                <li key={cIndex} className="flex gap-1.5 text-[10px] text-muted">
                                  <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-success/70" />
                                  <span>{criterion}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                      </div>
                      {child.priority && (
                        <span className="shrink-0 font-mono text-[8.5px] uppercase text-muted/55">
                          {child.priority}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>No plan yet. Send an intent in the thread to propose one.</Empty>
            )}

            <div className="mt-6 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between">
                <SectionLabel>Team plan</SectionLabel>
                {teamPlan && (
                  <span className="font-mono text-[8.5px] uppercase tracking-wide text-muted/60">
                    {teamPlan.status.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              {teamPlanError && (
                <div className="mt-2 rounded border border-danger/25 bg-danger-soft px-2 py-1.5 text-[10px] text-danger">
                  {teamPlanError}
                </div>
              )}
              {teamPlan ? (
                <>
                  <div className="mt-2 flex items-center gap-2 text-[9.5px] text-muted">
                    <span>{teamPlan.tasks.length} tasks</span>
                    <span className="text-muted/35">·</span>
                    <span>
                      {teamPlan.tasks.filter((task) => task.status === "merged").length} merged
                    </span>
                    <span className="text-muted/35">·</span>
                    <span>
                      {teamPlan.tasks.filter((task) => task.status === "running").length} running
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {teamPlan.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-2 rounded border border-border/70 bg-surface/40 px-2 py-1.5"
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            task.status === "merged"
                              ? "bg-success"
                              : task.status === "review"
                                ? "bg-warning"
                                : task.status === "running"
                                  ? "bg-accent"
                                  : task.status === "failed"
                                    ? "bg-danger"
                                    : "bg-border-strong"
                          }`}
                        />
                        <span className="min-w-0 flex-1 truncate text-[10.5px] text-text">
                          {task.title}
                        </span>
                        <span className="shrink-0 font-mono text-[8.5px] uppercase text-muted/60">
                          {task.status}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    {teamPlan.status === "awaiting_approval" && (
                      <button
                        onClick={() =>
                          void runTeamPlanAction(() => approveOrchestraPlan(teamPlan.id))
                        }
                        disabled={teamPlanBusy}
                        className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        <Icon name="check" size={10} /> Approve plan
                      </button>
                    )}
                    {(teamPlan.status === "approved" || teamPlan.status === "running") && (
                      <button
                        onClick={() =>
                          void runTeamPlanAction(async () => {
                            const report = await dispatchOrchestraPlan(teamPlan.id);
                            if (!report) throw new Error("Dispatch failed.");
                            return report.plan;
                          })
                        }
                        disabled={teamPlanBusy}
                        className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[10px] text-text hover:bg-white/[0.04] disabled:opacity-50"
                      >
                        <Icon name="branch" size={10} />
                        {teamPlan.status === "approved" ? "Dispatch" : "Fill slots"}
                      </button>
                    )}
                    <span className="ml-auto text-[9px] text-muted/50">
                      review in Agents → Orchestra
                    </span>
                  </div>
                </>
              ) : (
                <button
                  onClick={() =>
                    card &&
                    void runTeamPlanAction(() => createOrchestraPlan(card.id))
                  }
                  disabled={!card || teamPlanBusy}
                  className="mt-2 inline-flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1.5 text-[10.5px] text-text hover:bg-white/[0.04] disabled:opacity-40"
                >
                  <Icon name="spark" size={11} />
                  {teamPlanBusy ? "Proposing…" : "Plan with team"}
                </button>
              )}
            </div>

            {card && card.acceptance_criteria?.length > 0 && (
              <div className="mt-6 border-t border-border/60 pt-4">
                <SectionLabel>Card acceptance</SectionLabel>
                <ul className="mt-2 space-y-1.5">
                  {card.acceptance_criteria.map((criterion, index) => (
                    <li key={index} className="flex gap-2 text-[11px] leading-relaxed text-muted">
                      <Icon name="check" size={11} className="mt-0.5 shrink-0 text-success" />
                      {criterion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            </div>
          </details>
        </div>
        )}

        {tab === "diff" && (
          <div>
            {(latestRun || diffCount > 0 || reviewFiles.length > 0) && <div className="sticky top-0 z-10 border-b border-border/60 bg-bg/95 px-4 py-2.5 backdrop-blur-sm">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[10px] text-text">
                    {diffData?.branch || taskEvent?.data?.branch || latestRun?.branch || "worktree"}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[9px] text-muted/60">
                    <span>{currentTaskId || "no worker"}</span>
                    {latestRun?.head_sha ? (
                      <>
                        <span className="text-muted/30">·</span>
                        <span title={`Head ${latestRun.head_sha}`}>@ {latestRun.head_sha.slice(0, 8)}</span>
                      </>
                    ) : null}
                    {gateVerification?.tested_head ? (
                      <>
                        <span className="text-muted/30">·</span>
                        <span
                          title={`Tested ${gateVerification.tested_head} → target ${gateVerification.target_head || "unknown"}`}
                          className={
                            gateVerification.outcome === "stale" || gateVerification.tested_head !== gateVerification.target_head
                              ? "text-warning"
                              : "text-muted/60"
                          }
                        >
                          {gateVerification.outcome === "stale" || gateVerification.tested_head !== gateVerification.target_head
                            ? `checks stale (${gateVerification.tested_head.slice(0, 7)}→${(gateVerification.target_head || "").slice(0, 7) || "?"})`
                            : `checked @ ${gateVerification.tested_head.slice(0, 7)}`}
                        </span>
                      </>
                    ) : null}
                    {diffCount > 0 && (
                      <>
                        <span className="text-muted/30">·</span>
                        <span>{diffCount} files</span>
                      </>
                    )}
                    {reviewFiles.length > 0 && (
                      <>
                        <span className="text-muted/30">·</span>
                        <span>
                          {viewedCount}/{reviewFiles.length} viewed
                        </span>
                      </>
                    )}
                    {openReviewComments > 0 && (
                      <>
                        <span className="text-muted/30">·</span>
                        <span className="text-warning">
                          {openReviewComments} open comment{openReviewComments === 1 ? "" : "s"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {reviewBusy && (
                  <Icon name="refresh" size={12} className="mt-0.5 animate-spin text-muted motion-reduce:animate-none" />
                )}
                {loadingDiff && !reviewBusy && (
                  <Icon name="refresh" size={12} className="mt-0.5 animate-spin text-muted motion-reduce:animate-none" />
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAskOpen((open) => !open);
                    setChangesOpen(false);
                  }}
                  disabled={!latestRun}
                  className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[10px] text-text hover:bg-white/[0.04] disabled:opacity-40"
                >
                  <Icon name="comment" size={9} /> Ask
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChangesOpen((open) => !open);
                    setAskOpen(false);
                  }}
                  disabled={!latestRun}
                  className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning-soft px-2 py-1 text-[10px] text-warning hover:brightness-110 disabled:opacity-40"
                >
                  <Icon name="refresh" size={9} /> Request changes
                </button>
                {canReviewMerge(latestRun) && (
                  <button
                    type="button"
                    onClick={() => void mergeReviewedRun()}
                    disabled={reviewBusy || loadingRunGate || !runGate?.eligibility?.eligible || openReviewComments > 0}
                    title={openReviewComments > 0 ? "Resolve open review comments first" : runGate?.eligibility?.reason || "Approve and merge the reviewed revision"}
                    className="ml-auto inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    <Icon name="check" size={9} /> Approve & merge
                  </button>
                )}
              </div>

              {latestRun && <div className="review-check-summary"><span>{checkState(latestRun.gate).label}</span><button onClick={() => setTab("gate")}>View checks</button>{runGate?.eligibility?.reason && <p>{runGate.eligibility.reason}</p>}{latestRun.gate?.command && <code>{latestRun.gate.command}</code>}</div>}
              {reviewNotice && (
                <div className="mt-2 flex items-start gap-2 rounded border border-accent/25 bg-accent-soft px-2 py-1.5 text-[10px] text-accent-text">
                  <span className="min-w-0 flex-1">{reviewNotice}</span>
                  <button
                    type="button"
                    onClick={() => setReviewNotice(null)}
                    className="text-muted hover:text-text"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              )}

              {changesOpen && (
                <div className="mt-2 rounded border border-warning/25 bg-surface/60 p-2">
                  <div className="text-[9px] uppercase tracking-wide text-muted/60">
                    Request changes
                  </div>
                  <textarea
                    autoFocus
                    value={changesNote}
                    onChange={(event) => setChangesNote(event.target.value)}
                    rows={2}
                    placeholder="Add a note for the builder. Open review comments are included automatically."
                    className="mt-1 w-full resize-y rounded border border-border bg-bg px-2 py-1.5 text-[10.5px] text-text outline-none focus:border-accent/60"
                  />
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void submitChanges()}
                      disabled={reviewBusy || (!changesNote.trim() && openReviewComments === 0)}
                      className="rounded bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
                    >
                      {reviewBusy ? "Starting…" : "Send to builder"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChangesOpen(false);
                        setChangesNote("");
                      }}
                      className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:text-text"
                    >
                      Cancel
                    </button>
                    <span className="ml-auto text-[9px] text-muted/45">
                      starts a follow-up run
                    </span>
                  </div>
                </div>
              )}

              {askOpen && (
                <div className="mt-2 rounded border border-border bg-surface/60 p-2">
                  <div className="text-[9px] uppercase tracking-wide text-muted/60">
                    Ask about this change
                  </div>
                  <textarea
                    autoFocus
                    value={askText}
                    onChange={(event) => setAskText(event.target.value)}
                    rows={2}
                    placeholder="e.g. Why is this branch taken before the cache lookup?"
                    className="mt-1 w-full resize-y rounded border border-border bg-bg px-2 py-1.5 text-[10.5px] text-text outline-none focus:border-accent/60"
                  />
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void submitQuestion()}
                      disabled={reviewBusy || !askText.trim()}
                      className="rounded bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
                    >
                      {reviewBusy ? "Sending…" : "Ask agent"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAskOpen(false);
                        setAskText("");
                      }}
                      className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:text-text"
                    >
                      Cancel
                    </button>
                    <span className="ml-auto text-[9px] text-muted/45">
                      read-only answer
                    </span>
                  </div>
                </div>
              )}

              {diffData?.files?.length ? (() => {
                const files = diffData.files;
                const groups = new Map<string, string[]>();
                for (const path of files) {
                  const parts = path.split("/");
                  const group = parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts.length > 1 ? parts[0] : "files";
                  const list = groups.get(group) || [];
                  list.push(path);
                  groups.set(group, list);
                }
                const showGroups = files.length > 6 && groups.size > 1;
                return (
                  <nav aria-label="Changed files" className="changed-files mt-2 border-b-0 border-t border-border/50 px-0 pt-2">
                    <button type="button" aria-pressed={!location.file} onClick={() => updateRouteState({ file: undefined })}>
                      All files
                    </button>
                    {showGroups
                      ? Array.from(groups.entries()).map(([group, paths]) => (
                          <span key={group} className="contents">
                            <span className="basis-full pt-1 font-mono text-[9px] uppercase tracking-wide text-muted/55">{group}</span>
                            {paths.map((path) => (
                              <button
                                key={path}
                                type="button"
                                title={path}
                                aria-pressed={location.file === path}
                                onClick={() => updateRouteState({ file: path })}
                              >
                                {path.split("/").slice(-1)[0] || path}
                              </button>
                            ))}
                          </span>
                        ))
                      : files.map((path) => (
                          <button
                            key={path}
                            type="button"
                            title={path}
                            aria-pressed={location.file === path}
                            onClick={() => updateRouteState({ file: path })}
                          >
                            {path}
                          </button>
                        ))}
                  </nav>
                );
              })() : null}
            </div>}
            {loadingDiff ? (
              <div className="p-3">
                <div className="space-y-2">
                  {[0, 1, 2, 3, 4].map((row) => (
                    <div key={row} className="h-4 animate-pulse rounded bg-surface/70" />
                  ))}
                </div>
              </div>
            ) : diffError ? (
              <Empty>
                Could not read this worktree’s diff.
                <br />
                Reopen the Workbench to try again.
              </Empty>
            ) : diffData?.diff ? (
              <UnifiedDiff
                diff={diffData.diff}
                onlyPath={location.file}
                review={review}
                onToggleViewed={reviewId ? handleToggleViewed : undefined}
                onAddComment={reviewId ? handleAddComment : undefined}
                onResolveComment={reviewId ? handleResolveComment : undefined}
                onDeleteComment={reviewId ? handleDeleteComment : undefined}
                onOpenLine={handleOpenLine}
              />
            ) : (
              <Empty>
                No changes recorded on this worktree yet.
                <br />
                The diff appears after the worker writes a file.
              </Empty>
            )}
          </div>
        )}

        {tab === "gate" && <ChecksPanel run={latestRun} data={runGate} loading={loadingRunGate} onEvidence={() => setTab("receipt")}
          onResult={(updated) => { setRuns((current) => current.map((run) => run.id === updated.id ? updated : run)); void fetchRunGate(updated.id).then(setRunGate); }} />}

        {tab === "receipt" && (
          <ReceiptPanel
            receipt={receipt}
            loading={loadingReceipt}
            verification={receiptVerification}
            verifying={verifyingReceipt}
            onVerify={handleVerifyReceipt}
          />
        )}

        {/* EMBEDDED BROWSER SURFACE */}
        {activeTab === "browser" && (
          <div className="flex h-full min-h-0 flex-1 flex-col bg-bg">
            <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border/50 px-2.5">
              <button
                type="button"
                onClick={() => setBrowserKey((k) => k + 1)}
                className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface hover:text-text cursor-pointer"
                title="Reload preview"
              >
                <Icon name="refresh" size={12} />
              </button>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = normalizeBrowserUrl(browserInput);
                  setBrowserUrl(target);
                  setBrowserKey((k) => k + 1);
                }}
                className="min-w-0 flex-1"
              >
                <input
                  type="text"
                  value={browserInput}
                  onChange={(e) => setBrowserInput(e.target.value)}
                  placeholder="Search or enter URL (e.g. http://localhost:5173)"
                  aria-label="Browser URL"
                  className="h-6 w-full rounded-md border border-transparent bg-surface/50 px-2.5 text-[11px] text-text outline-none transition-colors placeholder:text-muted/60 hover:border-border/60 focus:border-accent focus:bg-surface"
                />
              </form>

              <button
                type="button"
                onClick={() => {
                  const url = browserUrl || "http://localhost:5173";
                  navigator.clipboard.writeText(url).catch(() => {});
                  setCopiedBrowserUrl(true);
                  setTimeout(() => setCopiedBrowserUrl(false), 1500);
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface hover:text-text cursor-pointer"
                title={copiedBrowserUrl ? "Copied URL!" : "Copy URL"}
              >
                <Icon name={copiedBrowserUrl ? "check" : "copy"} size={12} />
              </button>
            </div>

            {browserUrl ? (
              <iframe
                key={`${browserUrl}:${browserKey}`}
                ref={browserIframeRef}
                src={toInbuiltBrowserUrl(browserUrl)}
                title="Surface browser preview"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                className="h-full w-full flex-1 border-0 bg-white"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <div className="relative mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-surface/50 text-muted shadow-inner">
                  <Icon name="globe" size={20} />
                </div>
                <h3 className="text-[13px] font-semibold text-text">No preview yet</h3>
                <p className="mt-1 max-w-[240px] text-[11px] leading-relaxed text-muted">
                  Enter a URL above, or click one of the detected local dev servers.
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  {[
                    "http://localhost:5173",
                    "http://localhost:3000",
                    "http://localhost:8080",
                    "http://localhost:4321",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setBrowserInput(preset);
                        setBrowserUrl(preset);
                        setBrowserKey((k) => k + 1);
                      }}
                      className="rounded-md border border-border/70 bg-surface/60 px-2 py-1 font-mono text-[10.5px] text-text hover:border-accent hover:bg-surface transition-colors cursor-pointer"
                    >
                      {preset.replace("http://localhost:", ":")}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* EMBEDDED TERMINAL SURFACE */}
        {activeTab === "terminal" && (
          <div
            className="relative flex h-full min-h-0 flex-1 flex-col bg-[#09090b] font-mono text-text"
            onClick={() => termInputRef.current?.focus()}
          >
            <div className="absolute right-3 top-2.5 z-10 flex items-center gap-1 rounded-lg border border-border/60 bg-surface/90 p-0.5 shadow-sm backdrop-blur-md select-none">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextId =
                    (termTabs[termTabs.length - 1]?.id || 1) + 1;
                  setTermTabs((prev) => [
                    ...prev,
                    { id: nextId, label: `Terminal ${nextId}` },
                  ]);
                  setActiveTermTab(nextId);
                  setTimeout(() => termInputRef.current?.focus(), 20);
                }}
                title="New terminal tab"
                className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.06] hover:text-text cursor-pointer"
              >
                <Icon name="plus" size={12} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent("bark-command", { detail: "open-terminal" })
                  );
                }}
                title="Open native macOS Terminal"
                className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.06] hover:text-text cursor-pointer"
              >
                <Icon name="terminal" size={12} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTermEntriesByTab((prev) => ({
                    ...prev,
                    [activeTermTab]: [],
                  }));
                  setTimeout(() => termInputRef.current?.focus(), 20);
                }}
                title="Clear terminal output"
                className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.06] hover:text-danger cursor-pointer"
              >
                <Icon name="trash" size={12} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3.5">
              {termEntries.map((item) => (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[11.5px] leading-snug">
                    <span className="shrink-0 text-muted-strong">
                      {projectLabel} %
                    </span>
                    <span className="text-text">{item.command}</span>
                  </div>
                  {item.running ? (
                    <div className="text-[11px] text-muted">…</div>
                  ) : item.output ? (
                    <pre
                      className={`whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed ${
                        item.exitCode !== 0 ? "text-danger" : "text-muted-strong"
                      }`}
                    >
                      {item.output}
                    </pre>
                  ) : null}
                </div>
              ))}

              <form
                onSubmit={handleTerminalRun}
                className="flex items-center gap-1.5 text-[11.5px] leading-snug"
              >
                <span className="shrink-0 text-muted-strong">
                  {projectLabel} %
                </span>
                <input
                  ref={termInputRef}
                  type="text"
                  value={termCommand}
                  onChange={(e) => setTermCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (termHistory.length === 0) return;
                      const nextIdx = Math.min(
                        historyIndex + 1,
                        termHistory.length - 1
                      );
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
                    }
                  }}
                  placeholder="Run command..."
                  className="min-w-0 flex-1 bg-transparent text-[11.5px] text-text outline-none placeholder:text-muted/40"
                />
              </form>
            </div>
          </div>
        )}

        {/* WORKSPACE FILES SURFACE */}
        {activeTab === "files" && (
          <div className="flex h-full min-h-0 flex-1 flex-col bg-bg">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/50 px-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Icon name="search" size={12} className="text-muted/60" />
                <input
                  type="text"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  placeholder="Filter workspace files..."
                  className="h-6 w-full bg-transparent text-[11.5px] text-text placeholder:text-muted/50 outline-none"
                />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setFilesViewMode((m) => (m === "tree" ? "context" : "tree"))
                  }
                  className="rounded px-2 py-0.5 text-[10px] font-medium border border-border/60 hover:bg-surface text-muted hover:text-text transition-colors cursor-pointer"
                >
                  {filesViewMode === "tree"
                    ? "project_context.md"
                    : "File list"}
                </button>
              </div>
            </div>

            {filesViewMode === "context" ? (
              <div className="flex-1 overflow-y-auto">
                <ContextView boardName={boardName || null} />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-[11px]">
                {loadingFiles ? (
                  <div className="p-4 text-center text-muted">
                    Loading workspace files…
                  </div>
                ) : filteredFiles.length === 0 ? (
                  <div className="p-4 text-center text-muted">
                    No files match &quot;{fileSearch}&quot;
                  </div>
                ) : (
                  filteredFiles.map((file) => (
                    <div
                      key={file}
                      className="flex items-center justify-between rounded px-2 py-1 hover:bg-surface/60 group cursor-pointer"
                      onClick={() => void openInEditor(file)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Icon
                          name="doc"
                          size={12}
                          className="text-muted/70 group-hover:text-text shrink-0"
                        />
                        <span className="truncate text-text/90 group-hover:text-text">
                          {file}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openInEditor(file);
                        }}
                        className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 text-[9.5px] rounded bg-surface border border-border/60 text-muted hover:text-text cursor-pointer transition-opacity"
                      >
                        Open
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* DEVICE SIMULATOR SURFACE */}
        {activeTab === "device" && (
          <div className="flex h-full min-h-0 flex-1 flex-col bg-bg overflow-hidden">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/50 px-2.5">
              <div className="flex items-center gap-1.5">
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value as any)}
                  className="rounded border border-border/60 bg-surface/60 px-2 py-0.5 text-[11px] text-text outline-none cursor-pointer"
                >
                  <option value="iphone">iPhone 16 Pro (393 × 852)</option>
                  <option value="pixel">Google Pixel 9 (412 × 915)</option>
                  <option value="ipad">iPad Mini (768 × 1024)</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setDeviceOrientation((o) =>
                      o === "portrait" ? "landscape" : "portrait"
                    )
                  }
                  title="Rotate device"
                  className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface hover:text-text cursor-pointer"
                >
                  <Icon
                    name="refresh"
                    size={11}
                    className={
                      deviceOrientation === "landscape" ? "rotate-90" : ""
                    }
                  />
                </button>
              </div>

              <div className="flex items-center gap-1 text-[10px] text-muted font-mono">
                <button
                  type="button"
                  onClick={() =>
                    setDeviceScale((s) =>
                      s === 1 ? 0.75 : s === 0.75 ? 0.5 : 1
                    )
                  }
                  className="rounded border border-border/50 px-1.5 py-0.5 hover:bg-surface cursor-pointer"
                >
                  {Math.round(deviceScale * 100)}%
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#09090b]">
              <div
                style={{
                  transform: `scale(${deviceScale})`,
                  transformOrigin: "center center",
                  width:
                    deviceOrientation === "portrait"
                      ? deviceType === "ipad"
                        ? 480
                        : 360
                      : deviceType === "ipad"
                        ? 640
                        : 580,
                  height:
                    deviceOrientation === "portrait"
                      ? deviceType === "ipad"
                        ? 640
                        : 680
                      : deviceType === "ipad"
                        ? 480
                        : 340,
                }}
                className="relative flex flex-col rounded-[38px] border-[5px] border-[#27272a] bg-black shadow-2xl overflow-hidden shrink-0 transition-all duration-200"
              >
                {deviceOrientation === "portrait" && (
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full z-20 ring-1 ring-white/10 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#18181b] ml-auto mr-2" />
                  </div>
                )}
                <iframe
                  key={`device:${browserUrl}:${browserKey}`}
                  src={toInbuiltBrowserUrl(browserUrl || "http://localhost:5173")}
                  title="Device emulator preview"
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                  className="w-full h-full border-0 bg-white"
                />
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 bg-white/40 rounded-full pointer-events-none" />
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

