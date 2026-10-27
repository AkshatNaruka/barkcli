import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Card, ThreadEvent, TaskDiff } from "../lib/types";
import { fetchTaskDiff, evalSession } from "../lib/api";
import { Icon } from "../components/Icon";
import { UnifiedDiff } from "../components/UnifiedDiff";

interface InspectorPaneProps {
  card?: Card;
  events: ThreadEvent[];
  onClose?: () => void;
}

type WorkbenchTab = "plan" | "diff" | "gate" | "eval" | "context";

const TABS: Array<{ id: WorkbenchTab; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "diff", label: "Diff" },
  { id: "gate", label: "Gate" },
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

export function InspectorPane({ card, events, onClose }: InspectorPaneProps) {
  const [tab, setTab] = useState<WorkbenchTab>("plan");
  const [diffData, setDiffData] = useState<TaskDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState(false);
  const [evalData, setEvalData] = useState<any | null>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  const [evalError, setEvalError] = useState(false);
  const [copied, setCopied] = useState(false);
  const autoSelected = useRef(false);

  const planEvent = useMemo(
    () =>
      [...events].reverse().find((event) => event.kind === "plan_proposed") ||
      [...events].reverse().find((event) => event.kind === "plan_approved"),
    [events]
  );
  const proposal = planEvent?.data;
  const planApproved = events.some((event) => event.kind === "plan_approved");
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
  const currentTaskId = taskEvent?.data?.task_id || card?.id;
  const currentSessionId = taskEvent?.data?.session_id;
  const diffCount = diffData?.files?.length || 0;

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
    if (tab !== "diff" || !currentTaskId) return;
    let cancelled = false;
    setDiffData(null);
    setDiffError(false);
    setLoadingDiff(true);
    fetchTaskDiff(currentTaskId)
      .then((res) => {
        if (!cancelled) setDiffData(res);
      })
      .catch(() => {
        if (!cancelled) setDiffError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingDiff(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, currentTaskId]);

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
          {gateData && (
            <span
              className={`hidden items-center gap-1 font-mono text-[9px] sm:flex ${
                gateData.passed ? "text-success" : "text-danger"
              }`}
            >
              <span className={`h-1 w-1 rounded-full ${gateData.passed ? "bg-success" : "bg-danger"}`} />
              {gateData.passed ? "gate passed" : "gate failed"}
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
              {item.id === "gate" && gateData && (
                <span
                  className={`h-1 w-1 rounded-full ${gateData.passed ? "bg-success" : "bg-danger"}`}
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
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[10px] text-text">
                  {diffData?.branch || taskEvent?.data?.branch || "worktree"}
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] text-muted/60">
                  <span>{currentTaskId || "no worker"}</span>
                  {diffCount > 0 && (
                    <>
                      <span className="text-muted/30">·</span>
                      <span>{diffCount} files</span>
                    </>
                  )}
                </div>
              </div>
              {loadingDiff && <Icon name="refresh" size={12} className="animate-spin text-muted" />}
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
              <UnifiedDiff diff={diffData.diff} />
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
            <SectionLabel>Acceptance gate</SectionLabel>
            {gateData ? (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      gateData.passed ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                    }`}
                  >
                    <Icon name={gateData.passed ? "check" : "x"} size={14} />
                  </span>
                  <div>
                    <div
                      className={`text-[13px] font-medium ${
                        gateData.passed ? "text-success" : "text-danger"
                      }`}
                    >
                      {gateData.passed ? "Gate passed" : "Gate failed"}
                    </div>
                    <div className="font-mono text-[9px] text-muted/65">
                      {gateEvent ? new Date(gateEvent.created_at).toLocaleString() : ""}
                    </div>
                  </div>
                </div>
                {gateData.command && (
                  <div className="mt-4 border-y border-border/60 py-2.5">
                    <SectionLabel>Command</SectionLabel>
                    <code className="mt-1 block break-all font-mono text-[10px] text-accent-text">
                      $ {gateData.command}
                    </code>
                  </div>
                )}
                {gateData.output && (
                  <div className="mt-4">
                    <SectionLabel>Log</SectionLabel>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-border/70 bg-surface/40 p-2.5 font-mono text-[9.5px] leading-relaxed text-muted-strong">
                      {gateData.output}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <Empty>No gate has run for this thread yet.</Empty>
            )}
          </div>
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
              <button
                type="button"
                onClick={async () => {
                  const summary = [
                    `# ${card?.title || "Thread"}`,
                    `Card: ${card?.id || "none"}`,
                    `Column: ${card?.column || "draft"}`,
                    `Events: ${events.length}`,
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
