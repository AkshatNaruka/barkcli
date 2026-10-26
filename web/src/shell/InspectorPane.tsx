import React, { useState, useEffect } from "react";
import type { Card, ThreadEvent, TaskDiff } from "../lib/types";
import { fetchTaskDiff } from "../lib/api";
import { Icon } from "../components/Icon";

interface InspectorPaneProps {
  card?: Card;
  events: ThreadEvent[];
  onClose?: () => void;
}

export function InspectorPane({ card, events, onClose }: InspectorPaneProps) {
  const [tab, setTab] = useState<"plan" | "diff" | "gate" | "context">("plan");
  const [diffData, setDiffData] = useState<TaskDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Extract plan proposal data if present
  const planEvent = events.find(
    (e) => e.kind === "plan_proposed" || e.kind === "plan_approved"
  );
  const proposal = planEvent?.data;

  // Extract gate events
  const gateEvent = [...events].reverse().find((e) => e.kind === "gate");
  const gateData = gateEvent?.data;

  // Extract latest task spawned
  const taskEvent = [...events].reverse().find((e) => e.kind === "task_spawned");
  const currentTaskId = taskEvent?.data?.task_id || card?.id;

  useEffect(() => {
    if (tab === "diff" && currentTaskId) {
      setLoadingDiff(true);
      fetchTaskDiff(currentTaskId)
        .then((res) => setDiffData(res))
        .finally(() => setLoadingDiff(false));
    }
  }, [tab, currentTaskId]);

  return (
    <div className="w-96 shrink-0 border-l border-border h-full flex flex-col bg-bg">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("plan")}
            title="Decomposition into atomic child tasks"
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
              tab === "plan"
                ? "bg-white/[0.08] text-text"
                : "text-muted hover:text-text"
            }`}
          >
            Plan
          </button>
          <button
            onClick={() => setTab("diff")}
            title="Git changes made by the agent in its isolated worktree"
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
              tab === "diff"
                ? "bg-white/[0.08] text-text"
                : "text-muted hover:text-text"
            }`}
          >
            Diff
          </button>
          <button
            onClick={() => setTab("gate")}
            title="Test suite verification gate output"
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
              tab === "gate"
                ? "bg-white/[0.08] text-text"
                : "text-muted hover:text-text"
            }`}
          >
            Gate
          </button>
          <button
            onClick={() => setTab("context")}
            title="Living project context provided to the agent"
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
              tab === "context"
                ? "bg-white/[0.08] text-text"
                : "text-muted hover:text-text"
            }`}
          >
            Context
          </button>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-text rounded"
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-xs">
        {tab === "plan" && (
          <div className="space-y-4">
            <div>
              <div className="text-[11px] uppercase font-bold text-muted mb-1">
                Card Details
              </div>
              <div className="font-medium text-text text-sm">
                {card?.title || "No card selected"}
              </div>
              {card?.description && (
                <div className="mt-1 text-muted leading-relaxed whitespace-pre-wrap">
                  {card.description}
                </div>
              )}
            </div>

            {proposal?.children && Array.isArray(proposal.children) && (
              <div>
                <div className="text-[11px] uppercase font-bold text-muted mb-2">
                  Tasks Tree ({proposal.children.length})
                </div>
                <div className="space-y-2">
                  {proposal.children.map((child: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-surface border border-border"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted">○</span>
                        <span className="font-medium text-text">
                          {child.title || child.id}
                        </span>
                      </div>
                      {child.description && (
                        <div className="mt-1 text-[11px] text-muted">
                          {child.description}
                        </div>
                      )}
                      {child.acceptance_criteria &&
                        child.acceptance_criteria.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border">
                            <div className="text-[10px] text-muted font-medium mb-1">
                              Acceptance Criteria:
                            </div>
                            <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-muted">
                              {child.acceptance_criteria.map(
                                (crit: string, cIdx: number) => (
                                  <li key={cIdx}>{crit}</li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!proposal?.children || proposal.children.length === 0) && (
              <div className="p-4 text-center text-muted border border-dashed border-border rounded-lg">
                No child tasks planned yet. Send a prompt to create a plan.
              </div>
            )}
          </div>
        )}

        {tab === "diff" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>Task: {currentTaskId || "none"}</span>
              {diffData?.branch && (
                <span className="font-mono text-[10px]">{diffData.branch}</span>
              )}
            </div>

            {loadingDiff && (
              <div className="p-4 text-center text-muted">
                Loading diff from worktree...
              </div>
            )}

            {!loadingDiff && diffData?.files && diffData.files.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] uppercase font-bold text-muted mb-1">
                  Files Changed ({diffData.files.length})
                </div>
                <div className="space-y-1">
                  {diffData.files.map((file, i) => (
                    <div
                      key={i}
                      className="font-mono text-[11px] text-text bg-surface px-2 py-1 rounded border border-border truncate"
                    >
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loadingDiff && diffData?.diff ? (
              <pre className="p-3 rounded-lg bg-surface border border-border font-mono text-[11px] text-text overflow-x-auto whitespace-pre leading-snug">
                {diffData.diff}
              </pre>
            ) : (
              !loadingDiff && (
                <div className="p-6 text-center text-muted border border-dashed border-border rounded-lg">
                  No changes recorded yet on the worktree branch.
                </div>
              )
            )}
          </div>
        )}

        {tab === "gate" && (
          <div className="space-y-3">
            <div className="text-[11px] uppercase font-bold text-muted">
              Acceptance Gate Status
            </div>
            {gateData ? (
              <div className="p-3 rounded-lg bg-surface border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text">Verdict</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      gateData.passed
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/20 text-rose-300"
                    }`}
                  >
                    {gateData.passed ? "PASSED" : "FAILED"}
                  </span>
                </div>
                {gateData.command && (
                  <div>
                    <div className="text-[10px] text-muted">Gate Command:</div>
                    <code className="text-[11px] font-mono text-accent">
                      {gateData.command}
                    </code>
                  </div>
                )}
                {gateData.output && (
                  <div>
                    <div className="text-[10px] text-muted mb-1">Test Log:</div>
                    <pre className="p-2 rounded bg-bg text-[10px] font-mono text-muted overflow-x-auto max-h-48">
                      {gateData.output}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-muted border border-dashed border-border rounded-lg">
                No acceptance gate runs recorded for this thread yet.
              </div>
            )}
          </div>
        )}

        {tab === "context" && (
          <div className="space-y-3">
            <div className="text-[11px] uppercase font-bold text-muted">
              Thread Context
            </div>
            <div className="p-3 rounded-lg bg-surface border border-border space-y-2">
              <div>
                <span className="text-muted">Card ID: </span>
                <span className="font-mono text-text">{card?.id || "none"}</span>
              </div>
              <div>
                <span className="text-muted">Column: </span>
                <span className="text-text">{card?.column || "todo"}</span>
              </div>
              {card?.assignee && (
                <div>
                  <span className="text-muted">Assignee: </span>
                  <span className="text-text">{card.assignee}</span>
                </div>
              )}
              {card?.labels && card.labels.length > 0 && (
                <div>
                  <div className="text-muted mb-1">Labels:</div>
                  <div className="flex flex-wrap gap-1">
                    {card.labels.map((l, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 rounded bg-bg border border-border text-[10px] text-muted"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
