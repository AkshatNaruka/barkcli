import React, { useState } from "react";
import type { RunRecord } from "../lib/types";
import { Icon } from "../components/Icon";
import { formatElapsed } from "../lib/threads";

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
  const elapsed = run.started_at && run.ended_at ? formatElapsed((Date.parse(run.ended_at) - Date.parse(run.started_at)) / 1000) : null;

  return (
    <article
      className={`rounded-xl border p-4 text-text ${
        isFailed ? "border-danger/30 bg-danger/[0.03]" : gatePassed ? "border-border bg-surface/20" : "border-border bg-surface/15"
      } ${className}`}
      aria-label="Worktree review card"
    >
      {/* Top Header: Branch, SHA, Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
            <Icon name="branch" size={13} />
          </span>
          <span className="font-mono text-[12.5px] font-semibold text-text">
            {run.branch || `bark/task-${run.card_id}`}
          </span>
          {run.head_sha && (
            <span className="rounded rounded bg-bg/50 px-1.5 py-0.5 font-mono text-[11px] text-muted">
              {run.head_sha.slice(0, 7)}
            </span>
          )}
        </div>

        {/* Gate Verdict Pill */}
        {run.gate ? (
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10.5px] font-medium ${
              gatePassed
                ? "bg-success/10 text-success border border-success/25"
                : "bg-danger/10 text-danger border border-danger/25"
            }`}
          >
            <Icon name={gatePassed ? "check" : "warn"} size={12} />
            <span>
              {gatePassed ? "Acceptance Gate Passed" : "Acceptance Gate Failed"}
              {run.gate.command ? `: ${run.gate.command}` : ""}
            </span>
          </div>
        ) : (
          <span className="rounded-full bg-bg/40 px-2.5 py-0.5 font-mono text-[10.5px] text-muted border border-border/60">
            Gate: Not evaluated
          </span>
        )}
      </div>



      {/* Middle: Diff Stats & Files Touched */}
      <div className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-bg/20 p-2.5">
        <div className="flex items-center gap-3 text-[12px]">
          <span className="font-medium text-muted-strong">
            {filesCount} {filesCount === 1 ? "file changed" : "files changed"}
          </span>
          <span className="font-mono font-medium text-success">+{run.diff_stats.additions}</span>
          <span className="font-mono font-medium text-danger">-{run.diff_stats.deletions}</span>
        </div>

        {filesCount > 0 && (
          <button
            type="button"
            onClick={() => setShowFiles(!showFiles)}
            className="text-[11.5px] text-accent-text hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>{showFiles ? "Hide changed files" : `View ${filesCount} changed files`}</span>
            <Icon name={showFiles ? "arrowUp" : "arrowDown"} size={12} />
          </button>
        )}
      </div>

      {/* Collapsible Files Touched List */}
      {showFiles && run.files_touched && run.files_touched.length > 0 && (
        <ul className="mb-3 space-y-1 rounded-lg border border-border/50 bg-bg/30 p-2.5 font-mono text-[11px]">
          {run.files_touched.map((path) => (
            <li key={path} className="flex items-center gap-2 text-muted-strong hover:text-text truncate">
              <span className="text-muted">▸</span>
              <span className="truncate">{path}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Summary Note */}
      {run.summary && (
        <p className="mb-3 text-[12px] leading-relaxed text-muted-strong rounded-lg border border-border/40 bg-bg/20 p-2.5">
          {run.summary}
        </p>
      )}

      {/* Bottom Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-[11px] font-mono text-muted">
          Isolated worktree: <span className="text-muted-strong">{run.worktree ? "active" : "released"}</span>{elapsed ? <span className="ml-2">· {elapsed}</span> : null}
        </div>

        <div className="flex items-center gap-2">
          {isMerged ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 font-mono text-[11.5px] font-medium text-success border border-success/20">
              <Icon name="check" size={13} />
              <span>Merged into master</span>
            </div>
          ) : (
            <>
              {onReject && (
                <button
                  type="button"
                  onClick={() => onReject(run.id)}
                  className="rounded-lg border border-border px-3 py-1.5 text-[11.5px] font-medium text-muted hover:bg-white/[0.04] hover:text-text transition-colors"
                >
                  Request Changes
                </button>
              )}
              <button
                type="button"
                onClick={() => onApprove(run.id)}
                className="flex items-center gap-1.5 rounded-lg bg-accent hover:opacity-90 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-opacity cursor-pointer"
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
