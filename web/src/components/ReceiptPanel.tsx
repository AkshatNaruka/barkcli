import React from "react";
import type {
  ConfidenceLevel,
  GuardFinding,
  GuardSeverity,
  Receipt,
  ReceiptVerification,
} from "../lib/types";
import { Icon } from "./Icon";

interface ReceiptPanelProps {
  receipt: Receipt | null;
  loading: boolean;
  verification?: ReceiptVerification | null;
  verifying?: boolean;
  onVerify: () => void;
}

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  high: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning",
  low: "bg-danger/15 text-danger",
};

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const SEVERITY_ORDER: GuardSeverity[] = ["error", "warn", "info"];

const SEVERITY_STYLES: Record<GuardSeverity, string> = {
  error: "text-danger",
  warn: "text-warning",
  info: "text-muted",
};

const SEVERITY_LABEL: Record<GuardSeverity, string> = {
  error: "Errors",
  warn: "Warnings",
  info: "Notes",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted/70">
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 p-4">
      <div className="h-7 w-32 animate-pulse rounded bg-surface" />
      <div className="h-3 w-full animate-pulse rounded bg-surface/70" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-surface/60" />
      <div className="h-24 w-full animate-pulse rounded bg-surface/50" />
    </div>
  );
}

function Finding({ finding }: { finding: GuardFinding }) {
  return (
    <li className="flex items-start gap-2 py-1.5 text-[10.5px] leading-relaxed">
      <span
        className={`mt-[5px] h-1 w-1 shrink-0 rounded-full bg-current ${SEVERITY_STYLES[finding.severity]}`}
      />
      <span className="min-w-0">
        <span className="font-mono text-[9.5px] text-muted/70">
          {finding.path}
          {finding.line != null ? `:${finding.line}` : ""}
        </span>
        <span className="ml-1.5 text-text">{finding.message}</span>
        {finding.suggestion && (
          <span className="mt-0.5 block text-[10px] text-muted/70">
            {finding.suggestion}
          </span>
        )}
      </span>
    </li>
  );
}

function VerificationBanner({
  verification,
}: {
  verification: ReceiptVerification;
}) {
  const problems: string[] = [];
  if (!verification.hash_ok) problems.push("content hash does not match");
  if (verification.branch_moved) problems.push("branch has moved since the merge");
  if (verification.gate && !verification.gate.passed && !verification.gate.skipped) {
    problems.push("gate no longer passes");
  }
  const ok = verification.valid && problems.length === 0;
  return (
    <div
      role="status"
      className={`mt-3 flex items-start gap-2 rounded border px-2.5 py-2 text-[10.5px] leading-relaxed ${
        ok
          ? "border-success/25 bg-success/10 text-success"
          : "border-danger/25 bg-danger/10 text-danger"
      }`}
    >
      <Icon name={ok ? "check" : "warn"} size={12} className="mt-0.5 shrink-0" />
      <span>
        {ok
          ? "Receipt verified: the hash, branch, and gate all still match."
          : `Receipt could not be verified: ${problems.join(", ") || "unknown mismatch"}.`}
      </span>
    </div>
  );
}

export function ReceiptPanel({
  receipt,
  loading,
  verification,
  verifying = false,
  onVerify,
}: ReceiptPanelProps) {
  if (loading) return <Skeleton />;
  if (!receipt) {
    return (
      <div className="px-4 py-12 text-center text-[11px] leading-relaxed text-muted">
        No receipt yet. One is written when this card&apos;s branch merges.
      </div>
    );
  }

  const findingsBySeverity = SEVERITY_ORDER.map((severity) => ({
    severity,
    findings: receipt.guard.findings.filter(
      (finding) => finding.severity === severity
    ),
  })).filter((group) => group.findings.length > 0);
  const diffLines = receipt.diff.additions + receipt.diff.deletions;
  const guardFindings =
    receipt.guard.errors + receipt.guard.warnings;

  return (
    <section aria-label="Merge receipt" className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel>Merge receipt</SectionLabel>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-medium ${
                CONFIDENCE_STYLES[receipt.confidence.level]
              }`}
            >
              <span className="h-1 w-1 rounded-full bg-current" />
              {CONFIDENCE_LABEL[receipt.confidence.level]}
            </span>
            <span className="font-mono text-[9px] text-muted/60">
              {receipt.id}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onVerify}
          disabled={verifying}
          className="flex shrink-0 items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[9.5px] text-muted transition-colors hover:border-accent/40 hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-40"
        >
          <Icon
            name={verifying ? "refresh" : "check"}
            size={10}
            className={verifying ? "animate-spin" : ""}
          />
          {verifying ? "verifying" : "verify"}
        </button>
      </div>

      {verification && <VerificationBanner verification={verification} />}

      <p className="mt-3 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">
        {receipt.intent}
      </p>

      <div className="mt-4">
        <SectionLabel>Why this confidence</SectionLabel>
        <ul className="mt-1.5 space-y-1">
          {receipt.confidence.reasons.map((reason) => (
            <li
              key={reason}
              className="flex items-start gap-2 text-[10.5px] leading-relaxed text-muted"
            >
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-muted/50" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 divide-y divide-border/60 border-y border-border/60">
        <div className="flex items-center justify-between gap-3 py-2.5 text-[11px]">
          <span className="text-muted">Gate</span>
          <span
            className={`font-mono text-[10px] ${
              receipt.gate.skipped
                ? "text-muted"
                : receipt.gate.passed
                  ? "text-success"
                  : "text-danger"
            }`}
          >
            {receipt.gate.skipped
              ? "skipped"
              : receipt.gate.passed
                ? "passed"
                : "failed"}
            {receipt.gate.duration_ms != null
              ? ` · ${(receipt.gate.duration_ms / 1000).toFixed(1)}s`
              : ""}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5 text-[11px]">
          <span className="text-muted">Diff</span>
          <span className="font-mono text-[10px] text-text">
            {receipt.diff.files} files · +{receipt.diff.additions} −
            {receipt.diff.deletions}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5 text-[11px]">
          <span className="text-muted">Tests</span>
          <span
            className={`font-mono text-[10px] ${
              receipt.tests_changed ? "text-success" : "text-warning"
            }`}
          >
            {receipt.tests_changed ? "changed" : "unchanged"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5 text-[11px]">
          <span className="text-muted">Review</span>
          <span className="font-mono text-[10px] text-text">
            {receipt.review.open_comments} open · {receipt.review.viewed_files}/
            {receipt.review.total_files} viewed
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5 text-[11px]">
          <span className="text-muted">Branch</span>
          <span className="truncate font-mono text-[10px] text-text">
            {receipt.workspace.branch || "n/a"}
          </span>
        </div>
      </div>

      {receipt.gate.command && (
        <div className="mt-3 rounded border border-border/70 bg-surface/40 px-2.5 py-1.5 font-mono text-[9.5px] text-muted">
          $ {receipt.gate.command}
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Guard</SectionLabel>
          <span className="font-mono text-[9px] text-muted/70">
            {receipt.guard.ran
              ? guardFindings > 0
                ? `${receipt.guard.errors} errors · ${receipt.guard.warnings} warnings`
                : "clean"
              : "not run"}
          </span>
        </div>
        {findingsBySeverity.length === 0 ? (
          <p className="mt-1.5 text-[10.5px] text-muted">
            {receipt.guard.ran
              ? "No findings. The deterministic checks passed."
              : "Guard did not run for this merge."}
          </p>
        ) : (
          <div className="mt-1.5 space-y-2">
            {findingsBySeverity.map(({ severity, findings }) => (
              <div key={severity}>
                <div
                  className={`font-mono text-[9px] uppercase tracking-[0.1em] ${SEVERITY_STYLES[severity]}`}
                >
                  {SEVERITY_LABEL[severity]} · {findings.length}
                </div>
                <ul className="divide-y divide-border/40">
                  {findings.map((finding, index) => (
                    <Finding
                      key={`${finding.check}-${finding.path}-${finding.line ?? 0}-${index}`}
                      finding={finding}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 font-mono text-[9px] text-muted/60">
        <span>
          {receipt.agent.provider}
          {receipt.agent.model ? ` · ${receipt.agent.model}` : ""}
        </span>
        <span title={receipt.content_hash}>
          sha256 {receipt.content_hash.slice(0, 12)}
        </span>
        <span>{new Date(receipt.created_at).toLocaleString()}</span>
      </div>
      <span className="sr-only">{diffLines} changed lines</span>
    </section>
  );
}
