import React, { useEffect, useMemo, useRef, useState } from "react";
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
} from "../lib/types";
import {
  fetchTaskDiff,
  evalSession,
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
  mergeRun,
} from "../lib/api";
import { Icon } from "../components/Icon";
import { UnifiedDiff } from "../components/UnifiedDiff";
import { ReceiptPanel } from "../components/ReceiptPanel";

interface InspectorPaneProps {
  card?: Card;
  events: ThreadEvent[];
  threadId?: string;
  onClose?: () => void;
}

type WorkbenchTab = "plan" | "diff" | "gate" | "receipt" | "eval" | "context";

const TABS: Array<{ id: WorkbenchTab; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "diff", label: "Diff" },
  { id: "gate", label: "Gate" },
  { id: "receipt", label: "Receipt" },
  { id: "eval", label: "Eval" },
  { id: "context", label: "Context" },
];

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

export function InspectorPane({ card, events, threadId, onClose }: InspectorPaneProps) {
  const [tab, setTab] = useState<WorkbenchTab>("plan");
  const [diffData, setDiffData] = useState<TaskDiff | RunDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState(false);
  const [evalData, setEvalData] = useState<any | null>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  const [evalError, setEvalError] = useState(false);
  const [runs, setRuns] = useState<RunRecord[]>([]);
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
  const autoSelected = useRef(false);

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
    () => [...events].reverse().find((event) => event.kind === "gate"),
    [events]
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
  const latestRun = runs.length > 0 ? runs[runs.length - 1] : undefined;
  const currentTaskId = latestRun?.id || taskEvent?.data?.task_id || card?.id;
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
  const gateCommand = latestRun?.gate?.command || gateData?.command;
  const gateOutput = runGate?.log || gateData?.output || "";
  const gateTime =
    latestRun?.gate?.finished_at || gateEvent?.created_at || latestRun?.ended_at;

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
    if (tab !== "gate" || !latestRun) {
      setRunGate(null);
      return;
    }
    let cancelled = false;
    setLoadingRunGate(true);
    fetchRunGate(latestRun.id)
      .then((next) => {
        if (!cancelled) setRunGate(next);
      })
      .finally(() => {
        if (!cancelled) setLoadingRunGate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, latestRun?.id, latestRun?.gate?.finished_at]);

  useEffect(() => {
    if (tab !== "context" || !latestRun) {
      setRunContext(null);
      return;
    }
    let cancelled = false;
    setLoadingRunContext(true);
    fetchRunContext(latestRun.id)
      .then((next) => {
        if (!cancelled) setRunContext(next);
      })
      .finally(() => {
        if (!cancelled) setLoadingRunContext(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, latestRun?.id, latestRun?.context_manifest_id]);

  // Match the reference: the artifact is the default panel once a worker exists.
  useEffect(() => {
    if (!taskEvent) {
      setTab("plan");
      autoSelected.current = false;
      return;
    }
    if (autoSelected.current || events.length === 0) return;
    setTab("diff");
    autoSelected.current = true;
  }, [taskEvent, events.length]);

  useEffect(() => {
    if (tab !== "diff") return;
    let cancelled = false;
    setDiffData(null);
    setRunDiff(null);
    setDiffError(false);
    setLoadingDiff(true);
    const request = latestRun
      ? fetchRunDiff(latestRun.id).then((res) => {
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

  useEffect(() => {
    if (tab !== "eval" || !currentSessionId) return;
    let cancelled = false;
    setEvalData(null);
    setEvalError(false);
    setLoadingEval(true);
    evalSession(currentSessionId)
      .then((res) => {
        if (!cancelled) setEvalData(res);
      })
      .catch(() => {
        if (!cancelled) setEvalError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingEval(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, currentSessionId]);

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
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <aside
      className="flex h-full w-[420px] shrink-0 flex-col overflow-hidden border-l border-border/80 bg-bg xl:w-[460px]"
      aria-label="Workbench"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/80 px-3.5">
        <span className="text-[12.5px] font-medium text-text">Workbench</span>
        {currentTaskId && (
          <span className="truncate font-mono text-[9.5px] text-muted/65">{currentTaskId}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {gateVerdict && (
            <span
              className={`hidden items-center gap-1 font-mono text-[9px] sm:flex ${
                gateVerdict.passed ? "text-success" : "text-danger"
              }`}
            >
              <span className={`h-1 w-1 rounded-full ${gateVerdict.passed ? "bg-success" : "bg-danger"}`} />
              {gateVerdict.passed ? "gate passed" : "gate failed"}
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close workbench (⌘J)"
              aria-label="Close workbench"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.05] hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Workbench tabs"
        className="flex h-9 shrink-0 items-stretch gap-0 border-b border-border/70 px-2"
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          const count =
            item.id === "plan"
              ? proposal?.children?.length
              : item.id === "diff" && diffCount > 0
                ? diffCount
                : null;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`relative flex items-center gap-1 px-2.5 text-[10.5px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                active ? "text-text" : "text-muted hover:text-text"
              }`}
            >
              {item.label}
              {count != null && (
                <span className="font-mono text-[9px] text-muted/55">{count}</span>
              )}
              {item.id === "gate" && gateVerdict && (
                <span
                  className={`h-1 w-1 rounded-full ${gateVerdict.passed ? "bg-success" : "bg-danger"}`}
                />
              )}
              {active && (
                <span className="absolute bottom-0 left-2 right-2 h-[1.5px] rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "plan" && (
          <div className="p-4">
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
              <p className="mt-3 whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">
                {card.description}
              </p>
            )}

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
        )}

        {tab === "diff" && (
          <div>
            <div className="border-b border-border/60 px-4 py-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[10px] text-text">
                    {diffData?.branch || taskEvent?.data?.branch || "worktree"}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[9px] text-muted/60">
                    <span>{currentTaskId || "no worker"}</span>
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
                  <Icon name="refresh" size={12} className="mt-0.5 animate-spin text-muted" />
                )}
                {loadingDiff && !reviewBusy && (
                  <Icon name="refresh" size={12} className="mt-0.5 animate-spin text-muted" />
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
                {latestRun?.status === "passed" && (
                  <button
                    type="button"
                    onClick={() => void mergeReviewedRun()}
                    disabled={reviewBusy}
                    className="ml-auto inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    <Icon name="check" size={9} /> Approve & merge
                  </button>
                )}
              </div>

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
            </div>

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

        {tab === "gate" && (
          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Acceptance gate</SectionLabel>
              {loadingRunGate && (
                <Icon name="refresh" size={11} className="animate-spin text-muted/60" />
              )}
            </div>
            {gateVerdict ? (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      gateVerdict.passed ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                    }`}
                  >
                    <Icon name={gateVerdict.passed ? "check" : "x"} size={14} />
                  </span>
                  <div>
                    <div
                      className={`text-[13px] font-medium ${
                        gateVerdict.passed ? "text-success" : "text-danger"
                      }`}
                    >
                      {gateVerdict.passed ? "Gate passed" : "Gate failed"}
                    </div>
                    <div className="font-mono text-[9px] text-muted/65">
                      {gateTime ? new Date(gateTime).toLocaleString() : ""}
                    </div>
                  </div>
                </div>
                {gateVerdict.summary && (
                  <p className="mt-3 whitespace-pre-wrap text-[10.5px] leading-relaxed text-muted">
                    {gateVerdict.summary}
                  </p>
                )}
                {gateCommand && (
                  <div className="mt-4 border-y border-border/60 py-2.5">
                    <SectionLabel>Command</SectionLabel>
                    <code className="mt-1 block break-all font-mono text-[10px] text-accent-text">
                      $ {gateCommand}
                    </code>
                  </div>
                )}
                {gateOutput && (
                  <div className="mt-4">
                    <SectionLabel>Log</SectionLabel>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-border/70 bg-surface/40 p-2.5 font-mono text-[9.5px] leading-relaxed text-muted-strong">
                      {gateOutput}
                    </pre>
                  </div>
                )}
                {latestRun?.status === "passed" && (
                  <p className="mt-4 border-t border-border/60 pt-3 text-[10px] leading-relaxed text-muted/70">
                    This run passed the gate. Merge is available from the run card in the
                    conversation and always requires human approval.
                  </p>
                )}
              </>
            ) : (
              <Empty>
                No gate has run for this thread yet.
                <br />
                Gates run after the agent commits its worktree changes.
              </Empty>
            )}
          </div>
        )}

        {tab === "receipt" && (
          <ReceiptPanel
            receipt={receipt}
            loading={loadingReceipt}
            verification={receiptVerification}
            verifying={verifyingReceipt}
            onVerify={handleVerifyReceipt}
          />
        )}

        {tab === "eval" && (
          <div className="p-4">
            <SectionLabel>Session quality</SectionLabel>
            {loadingEval ? (
              <div className="space-y-3 pt-4">
                <div className="h-7 w-24 animate-pulse rounded bg-surface" />
                <div className="h-3 w-full animate-pulse rounded bg-surface/70" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-surface/60" />
              </div>
            ) : evalError ? (
              <Empty>Could not load evaluation metrics for this session.</Empty>
            ) : evalData ? (
              <div className="mt-4">
                <div className="flex items-end gap-2">
                  <span className="font-mono text-[30px] leading-none text-text">
                    {Math.round((evalData.quality_score ?? 0.9) * 100)}
                  </span>
                  <span className="pb-0.5 text-[10px] text-muted">/ 100 quality</span>
                </div>
                <div className="mt-5 divide-y divide-border/60 border-y border-border/60">
                  {[
                    ["Test gate", evalData.test_gate_passed ? "passed" : "failed"],
                    ["Backend", evalData.backend || "opencode"],
                    [
                      "Duration",
                      evalData.duration_ms ? `${Math.round(evalData.duration_ms / 1000)}s` : "n/a",
                    ],
                    ["Files modified", String(evalData.files_changed_count ?? 0)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between py-2.5 text-[11px]">
                      <span className="text-muted">{label}</span>
                      <span
                        className={`font-mono text-[10px] ${
                          label === "Test gate"
                            ? evalData.test_gate_passed
                              ? "text-success"
                              : "text-danger"
                            : "text-text"
                        }`}
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty>No evaluation metrics for this session yet.</Empty>
            )}
          </div>
        )}

        {tab === "context" && (
          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Thread context</SectionLabel>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    if (!card || previewing) return;
                    const lastUser = [...events].reverse().find((event) => event.kind === "user")?.text;
                    setPreviewing(true);
                    try {
                      const pack = await previewContext({
                        card_id: card.id,
                        prompt: lastUser,
                        role: latestRun?.role,
                        provider: latestRun?.provider || "opencode",
                      });
                      setPreviewPack(pack);
                    } finally {
                      setPreviewing(false);
                    }
                  }}
                  disabled={!card || previewing}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] text-muted transition-colors hover:bg-white/[0.05] hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-40"
                  aria-label="Preview next run context"
                >
                  <Icon name={previewing ? "refresh" : "eye"} size={10} className={previewing ? "animate-spin" : ""} />
                  preview
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const summary = [
                      `# ${card?.title || "Thread"}`,
                      `Card: ${card?.id || "none"}`,
                      `Column: ${card?.column || "draft"}`,
                      `Events: ${events.length}`,
                      contextPack ? `Context: ${contextPack.reuse.reason}` : "",
                      proposal?.rationale ? `Plan: ${proposal.rationale}` : "",
                    ]
                      .filter(Boolean)
                      .join("\n");
                    try {
                      await navigator.clipboard.writeText(summary);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    } catch {
                      // Clipboard access is permission-gated; the panel remains readable.
                    }
                  }}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] text-muted transition-colors hover:bg-white/[0.05] hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  aria-label="Copy thread context"
                >
                  <Icon name={copied ? "check" : "copy"} size={10} />
                  {copied ? "copied" : "copy"}
                </button>
              </div>
            </div>
            {previewPack && (
              <div className="mt-2 rounded border border-accent/25 bg-accent-soft px-2.5 py-2 text-[10px] leading-relaxed text-accent-text">
                Previewing the next run before it starts. {previewPack.reuse.reason}
              </div>
            )}
            <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
              {[
                ["Card", card?.id || "none"],
                ["Column", card?.column || "draft"],
                ["Assignee", card?.assignee || "unassigned"],
                ["Thread", events.length ? `${events.length} events` : "empty"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 py-2.5 text-[11px]">
                  <span className="text-muted">{label}</span>
                  <span className="truncate font-mono text-[10px] text-text">{value}</span>
                </div>
              ))}
            </div>

            {loadingRunContext && (
              <div className="mt-5 flex items-center gap-2 text-[10.5px] text-muted">
                <Icon name="refresh" size={11} className="animate-spin" />
                Loading context pack…
              </div>
            )}

            {!loadingRunContext && !contextPack && (
              <div className="mt-5 rounded-lg border border-dashed border-border/80 px-3 py-4">
                <p className="text-[10.5px] leading-relaxed text-muted">
                  No context pack for this thread yet. Start a run and Bark will compile a
                  bounded prompt with a reusable stable prefix.
                </p>
              </div>
            )}

            {contextPack && contextManifest && (
              <>
                <div className="mt-5">
                  <SectionLabel>Context pack</SectionLabel>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                        contextPack.reuse.reused
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-accent/30 bg-accent-soft text-accent-text"
                      }`}
                    >
                      {contextPack.reuse.reused ? "reused prefix" : "rebuilt"}
                    </span>
                    <span className="font-mono text-[9px] text-muted/70">
                      {contextManifest.estimated_tokens.toLocaleString()} /{" "}
                      {contextManifest.budget_tokens.toLocaleString()} tok
                    </span>
                    <span className="font-mono text-[9px] text-muted/50">
                      {contextManifest.sections.filter((s) => s.kind === "stable").length} stable ·{" "}
                      {contextManifest.sections.filter((s) => s.kind === "dynamic").length} dynamic
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[8.5px] text-muted/50">
                    <span>{contextPack.reuse.stable_prefix_tokens.toLocaleString()} stable tok</span>
                    <span>{contextPack.reuse.dynamic_tokens.toLocaleString()} dynamic tok</span>
                    {contextPack.reuse.reused && (
                      <span className="text-success/80">
                        {contextPack.reuse.reused_tokens?.toLocaleString() || 0} reused
                      </span>
                    )}
                    <span>{contextPack.reuse.cache_hits || 0} cache hit</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface">
                    <div
                      className={`h-full rounded-full ${
                        contextPct > 90 ? "bg-warning" : "bg-accent/70"
                      }`}
                      style={{ width: `${Math.max(2, contextPct)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                    {contextPack.reuse.reason}
                  </p>
                  {contextPack.reuse.invalidations.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l border-warning/40 pl-2.5">
                      {contextPack.reuse.invalidations.map((reason, index) => (
                        <li key={index} className="text-[9.5px] leading-relaxed text-warning/90">
                          {reason}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[8.5px] text-muted/50">
                    <span title={contextManifest.id}>pack {contextManifest.id.slice(0, 10)}</span>
                    <span title={contextManifest.stable_hash}>
                      prefix {contextManifest.stable_hash.slice(0, 10)}
                    </span>
                    {contextManifest.head_sha && (
                      <span title={contextManifest.head_sha}>
                        head {contextManifest.head_sha.slice(0, 8)}
                      </span>
                    )}
                    {contextPack.reuse.resume_candidate && <span>session resume ready</span>}
                  </div>
                </div>

                <div className="mt-5">
                  <SectionLabel>Sections</SectionLabel>
                  <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
                    {contextManifest.sections.map((section) => (
                      <div
                        key={section.id}
                        className="flex items-center justify-between gap-3 py-2 text-[10.5px]"
                      >
                        <span className="min-w-0 truncate text-text">
                          {section.title}
                          <span className="ml-1.5 font-mono text-[8.5px] uppercase text-muted/50">
                            {section.kind}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[9px] text-muted/70">
                          {section.tokens.toLocaleString()} tok
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  <SectionLabel>Skills attached</SectionLabel>
                  {contextManifest.skills.length === 0 ? (
                    <p className="mt-2 text-[10px] leading-relaxed text-muted/70">
                      No skill matched this task.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {contextManifest.skills.map((skill) => (
                        <div key={skill.id} className="border-l-2 border-accent/40 pl-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-text">{skill.name}</span>
                            <span className="font-mono text-[8.5px] text-muted/55">
                              {skill.reason}
                            </span>
                          </div>
                          <div className="mt-0.5 font-mono text-[8.5px] text-muted/50">
                            {skill.id} · {skill.source} · {skill.tokens.toLocaleString()} tok
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5">
                  <SectionLabel>Files in context</SectionLabel>
                  {contextManifest.files.length === 0 ? (
                    <p className="mt-2 text-[10px] text-muted/70">No file bodies selected.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
                      {contextManifest.files.map((file) => (
                        <div key={file.path} className="py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate font-mono text-[9.5px] text-text">
                              {file.path}
                            </span>
                            <span className="shrink-0 font-mono text-[8.5px] text-muted/55">
                              {file.tokens.toLocaleString()} tok
                            </span>
                          </div>
                          <div className="mt-0.5 font-mono text-[8.5px] text-muted/45">
                            {file.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {contextManifest.exclusions.length > 0 && (
                  <div className="mt-5">
                    <SectionLabel>Excluded</SectionLabel>
                    <div className="mt-2 space-y-1.5">
                      {contextManifest.exclusions.slice(0, 10).map((exclusion) => (
                        <div
                          key={`${exclusion.path}-${exclusion.reason}`}
                          className="flex items-start justify-between gap-2 text-[9.5px]"
                        >
                          <span className="min-w-0 truncate font-mono text-muted/70">
                            {exclusion.path}
                          </span>
                          <span className="shrink-0 text-muted/50">{exclusion.reason}</span>
                        </div>
                      ))}
                      {contextManifest.exclusions.length > 10 && (
                        <p className="text-[9px] text-muted/50">
                          +{contextManifest.exclusions.length - 10} more omitted
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {latestRun && (
              <div className="mt-5">
                <SectionLabel>Latest run</SectionLabel>
                <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
                  {[
                    ["Run", latestRun.id],
                    ["Status", latestRun.status],
                    ["Provider", latestRun.provider],
                    ["Branch", latestRun.branch || "—"],
                    ["Worktree", latestRun.worktree?.split("/").slice(-2).join("/") || "—"],
                    ["Diff", `${latestRun.diff_stats.files} files, +${latestRun.diff_stats.additions} −${latestRun.diff_stats.deletions}`],
                    ["Tokens", `${latestRun.usage.input_tokens} in / ${latestRun.usage.output_tokens} out`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 py-2 text-[10.5px]">
                      <span className="text-muted">{label}</span>
                      <span className="truncate font-mono text-[9.5px] text-text">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {card?.labels && card.labels.length > 0 && (
              <div className="mt-5">
                <SectionLabel>Labels</SectionLabel>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {card.labels.map((label, index) => (
                    <span
                      key={index}
                      className="rounded border border-border/70 bg-surface/50 px-1.5 py-0.5 font-mono text-[9px] text-muted"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {mergeEvent && (
              <div className="mt-5 border-t border-border/60 pt-4">
                <SectionLabel>Merge</SectionLabel>
                <div className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-accent-text">
                  <Icon name="branch" size={12} className="mt-0.5 shrink-0" />
                  {mergeEvent.text}
                </div>
              </div>
            )}

            {!card && <Empty>Select a thread to see its context.</Empty>}
          </div>
        )}
      </div>
    </aside>
  );
}
