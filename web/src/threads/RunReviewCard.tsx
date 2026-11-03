import React, { useState } from "react";
import type { RunRecord } from "../lib/types";
import { Icon } from "../components/Icon";
import { ExecutionTimeline } from "../components/ExecutionTimeline";

interface RunReviewCardProps {
  run: RunRecord;
  onApprove: (runId: string) => void;
  onReject?: (runId: string) => void;
  className?: string;
}

export function RunReviewCard({ run, onApprove, onReject, className = "" }: RunReviewCardProps) {
  const [showFiles, setShowFiles] = useState(false);
  const isMerged = run.status === "merged";
  const gatePassed = run.gate?.passed ?? run.status === "passed";
  const isFailed = run.status === "failed";
  const filesCount = run.diff_stats.files || run.files_touched?.length || 0;

  return (
    <article
      className={`rounded-2xl border border-white/10 bg-[#0B0D12] p-5 text-text shadow-md transition-all ${
        gatePassed ? "hover:border-[#B8845C]/40" : isFailed ? "border-rose-500/30" : ""
      } ${className}`}
      aria-label="Worktree review card"
    >
      {/* Top Header: Branch, SHA, Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#B8845C]/20 text-[#E5AA7A]">
            <Icon name="branch" size={13} />
          </span>
          <span className="font-mono text-[12.5px] font-semibold text-text">
            {run.branch || `bark/task-${run.card_id}`}
          </span>
          {run.head_sha && (
            <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[11px] text-muted">
              {run.head_sha.slice(0, 7)}
            </span>
          )}
        </div>

        {/* Gate Verdict Pill */}
        {run.gate ? (
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] font-medium ${
              gatePassed
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
            }`}
          >
            <Icon name={gatePassed ? "check" : "warn"} size={12} />
            <span>
              {gatePassed ? "Acceptance Gate Passed" : "Acceptance Gate Failed"}
              {run.gate.command ? `: ${run.gate.command}` : ""}
            </span>
          </div>
        ) : (
          <span className="rounded-full bg-white/5 px-3 py-1 font-mono text-[11px] text-muted border border-white/10">
            Gate: Not evaluated
          </span>
        )}
      </div>

      {/* Execution Timeline (DeepSeek-style Gantt) */}
      {run.trace && run.trace.spans.length > 0 && (
        <div className="my-3.5">
          <ExecutionTimeline trace={run.trace} />
        </div>
      )}

      {/* Middle: Diff Stats & Files Touched */}
      <div className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.02] border border-white/5 p-3">
        <div className="flex items-center gap-3 text-[12px]">
          <span className="font-medium text-muted-strong">
            {filesCount} {filesCount === 1 ? "file changed" : "files changed"}
          </span>
          <span className="font-mono font-medium text-emerald-400">+{run.diff_stats.additions}</span>
          <span className="font-mono font-medium text-rose-400">-{run.diff_stats.deletions}</span>
        </div>

        {filesCount > 0 && (
          <button
            type="button"
            onClick={() => setShowFiles(!showFiles)}
            className="text-[11.5px] font-mono text-[#E5AA7A] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>{showFiles ? "Hide changed files" : `View ${filesCount} changed files`}</span>
            <Icon name={showFiles ? "arrowUp" : "arrowDown"} size={12} />
          </button>
        )}
      </div>

      {/* Collapsible Files Touched List */}
      {showFiles && run.files_touched && run.files_touched.length > 0 && (
        <ul className="mb-4 space-y-1.5 rounded-xl border border-white/5 bg-black/30 p-3 font-mono text-[11px]">
          {run.files_touched.map((path) => (
            <li key={path} className="flex items-center gap-2 text-muted-strong hover:text-text truncate">
              <span className="text-[#B8845C]">▸</span>
              <span className="truncate">{path}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Summary Note */}
      {run.summary && (
        <p className="mb-4 text-[12px] leading-relaxed text-muted-strong bg-white/[0.01] p-2.5 rounded-lg border border-white/5">
          {run.summary}
        </p>
      )}

      {/* Bottom Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-[11px] font-mono text-muted">
          Isolated worktree:{" "}
          <span className="text-muted-strong">{run.worktree ? "active" : "released"}</span>
        </div>

        <div className="flex items-center gap-2">
          {isMerged ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3.5 py-1.5 font-mono text-[11.5px] font-medium text-emerald-400 border border-emerald-500/20">
              <Icon name="check" size={13} />
              <span>Merged into master</span>
            </div>
          ) : (
            <>
              {onReject && (
                <button
                  type="button"
                  onClick={() => onReject(run.id)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-[11.5px] font-medium text-muted hover:bg-white/5 hover:text-text transition-colors"
                >
                  Request Changes
                </button>
              )}
              <button
                type="button"
                onClick={() => onApprove(run.id)}
                className="flex items-center gap-1.5 rounded-lg bg-[#B8845C] hover:bg-[#a5764f] px-4 py-1.5 text-[12px] font-semibold text-white transition-all shadow-sm shadow-[#B8845C]/20 hover:shadow-[#B8845C]/40 cursor-pointer"
              >
                <Icon name="check" size={13} />
                <span>Approve & Merge</span>
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
