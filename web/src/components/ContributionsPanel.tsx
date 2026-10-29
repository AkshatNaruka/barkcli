import React, { useCallback, useEffect, useState } from "react";
import {
  createContribution,
  fetchContributions,
} from "../lib/api";
import type {
  ContributionAnalysis,
  ContributionKind,
  ContributionNode,
  ContributionRecommendation,
  ContributionStatus,
} from "../lib/types";
import { relativeTime } from "../lib/threads";
import { Icon } from "./Icon";
import { QuietSelect } from "./QuietSelect";

// ── Kind / status presentation ──

const KIND_ICON: Record<ContributionKind, Parameters<typeof Icon>[0]["name"]> = {
  result: "star",
  hypothesis: "spark",
  verification: "check",
  report: "doc",
  insight: "spark",
  failure: "warn",
};

const KIND_LABEL: Record<ContributionKind, string> = {
  result: "Result",
  hypothesis: "Hypothesis",
  verification: "Verification",
  report: "Report",
  insight: "Insight",
  failure: "Failure",
};

const KIND_STYLE: Record<ContributionKind, string> = {
  result: "bg-accent-soft text-accent-text",
  hypothesis: "bg-warning-soft text-warning",
  verification: "bg-success-soft text-success",
  report: "bg-surface text-muted",
  insight: "bg-accent-soft text-accent-text",
  failure: "bg-danger-soft text-danger",
};

const STATUS_STYLE: Record<ContributionStatus, string> = {
  queued: "bg-surface text-muted",
  starting: "bg-surface text-muted",
  running: "bg-accent-soft text-accent-text",
  waiting: "bg-warning-soft text-warning",
  needs_review: "bg-warning-soft text-warning",
  passed: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
  interrupted: "bg-danger-soft text-danger",
  cancelled: "bg-surface text-muted",
  merged: "bg-accent-soft text-accent-text",
};

function statusLabel(status: ContributionStatus): string {
  return status.replace(/_/g, " ");
}

function shortId(id: string): string {
  const bare = id.replace(/^run:/, "");
  return bare.length > 8 ? `${bare.slice(0, 8)}…` : bare;
}

// ── Section wrappers ──

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-muted">
        <Icon name={icon} size={13} />
      </span>
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">{title}</h3>
      <span className="text-[11px] text-muted/80 font-mono">{count}</span>
    </div>
  );
}

// ── Node card ──

function ContributionNodeCard({
  node,
  onOpen,
}: {
  node: ContributionNode;
  onOpen: (node: ContributionNode) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(node)}
      title={`${node.title} — open its thread`}
      className="w-full text-left rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      {/* Title + verified mark */}
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 rounded px-1.5 py-0.5 shrink-0 ${KIND_STYLE[node.kind]}`}>
          <Icon name={KIND_ICON[node.kind] ?? "layers"} size={11} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug text-text font-medium truncate">{node.title}</p>
          {node.summary && (
            <p className="mt-1 truncate text-[11.5px] text-muted" title={node.summary}>
              {node.summary}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-muted">
            <span className="font-mono" title={node.id}>{shortId(node.id)}</span>
            <span
              className={`rounded px-1.5 py-px font-medium ${KIND_STYLE[node.kind]}`}
            >
              {KIND_LABEL[node.kind]}
            </span>
            <span
              className={`rounded px-1.5 py-px font-medium ${STATUS_STYLE[node.status]}`}
            >
              {statusLabel(node.status)}
            </span>
          </div>
        </div>
        {/* Verification badge */}
        {node.verified ? (
          <span
            className="shrink-0 rounded px-1.5 py-0.5 bg-success-soft text-success flex items-center gap-1 text-[11px] font-medium"
            title={`Verified by ${(node.verified_by || []).join(", ") || "gate"}`}
          >
            <Icon name="check" size={10} />
            verified
          </span>
        ) : (
          <span className="shrink-0 rounded px-1.5 py-0.5 bg-surface text-muted text-[11px]" title="Not yet verified">
            unverified
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted">
        <span title="Evidence score">
          evidence <span className="text-text font-mono">{node.evidence_score.toFixed(2)}</span>
        </span>
        <span title="Lineage">
          <span className="text-text font-mono">{node.parents.length}</span>{" "}
          parent{node.parents.length === 1 ? "" : "s"}
          {" · "}
          <span className="text-text font-mono">{node.children.length}</span>{" "}
          child{node.children.length === 1 ? "" : "ren"}
        </span>
        <span title={node.model ? `${node.provider} · ${node.model}` : node.provider}>
          {node.model ? `${node.provider}/${node.model}` : node.provider}
        </span>
        <span title="Files touched">
          <span className="text-text font-mono">{node.files_touched.length}</span>{" "}
          file{node.files_touched.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto" title={node.started_at}>
          {relativeTime(node.ended_at || node.started_at)}
        </span>
      </div>
    </button>
  );
}

// ── Recommendation row ──

const LANE_LABEL: Record<string, string> = {
  leading: "Leading",
  neglected: "Neglected",
  contested: "Contested",
  open_hypothesis: "Open hypothesis",
};

const LANE_STYLE: Record<string, string> = {
  leading: "bg-accent-soft text-accent-text",
  neglected: "bg-warning-soft text-warning",
  contested: "bg-danger-soft text-danger",
  open_hypothesis: "bg-success-soft text-success",
};

function RecommendationRow({ rec }: { rec: ContributionRecommendation }) {
  const laneStyle = LANE_STYLE[rec.lane] ?? "bg-surface text-muted";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <p className="text-[13px] text-text font-medium truncate min-w-0 flex-1">{rec.title}</p>
        <span className={`shrink-0 rounded px-1.5 py-px text-[11px] font-medium ${laneStyle}`}>
          {LANE_LABEL[rec.lane] ?? rec.lane}
        </span>
        <span
          className="shrink-0 text-[11px] font-mono text-accent-text"
          title="Priority score"
        >
          {rec.score.toFixed(2)}
        </span>
      </div>
      {rec.reason && (
        <p className="text-[11px] text-muted mt-1 leading-relaxed">{rec.reason}</p>
      )}
    </div>
  );
}

// ── States ──

function MetricChip({
  label,
  value,
  tone = "muted",
  title,
}: {
  label: string;
  value: string;
  tone?: "muted" | "accent" | "warning" | "danger";
  title?: string;
}) {
  const toneClass = {
    muted: "text-text",
    accent: "text-accent-text",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px]"
    >
      <span className="text-muted">{label}</span>
      <span className={`font-mono font-medium ${toneClass}`}>{value}</span>
    </span>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-7 w-20 rounded-lg bg-surface animate-pulse" />
        ))}
      </div>
      {[0, 1, 2].map((block) => (
        <div key={block} className="space-y-2">
          <div className="h-4 w-32 rounded bg-surface animate-pulse" />
          {[0, 1].map((i) => (
            <div key={i} className="h-[52px] rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="text-muted">
        <Icon name="warn" size={20} />
      </span>
      <p className="text-[13px] text-text">Couldn't load contributions</p>
      <p className="text-[11px] text-muted">The analysis endpoint did not respond.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] text-muted hover:text-text transition-colors"
      >
        <Icon name="refresh" size={12} />
        Retry
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="text-muted">
        <Icon name="spark" size={20} />
      </span>
      <p className="text-[13px] text-text">No contributions yet.</p>
      <p className="text-[11px] text-muted">Run an agent or publish an insight.</p>
    </div>
  );
}

function SectionList({
  data,
  onOpenNode,
}: {
  data: ContributionAnalysis;
  onOpenNode: (node: ContributionNode) => void;
}) {
  const m = data.metrics;
  const sections: {
    key: string;
    icon: Parameters<typeof Icon>[0]["name"];
    title: string;
    items: ContributionNode[];
  }[] = [
    { key: "leading", icon: "flag", title: "Leading", items: data.leading },
    { key: "neglected", icon: "clock", title: "Neglected branches", items: data.neglected },
    { key: "contested", icon: "warn", title: "Contested", items: data.contested },
    { key: "open", icon: "spark", title: "Open hypotheses", items: data.open_hypotheses },
  ];

  const shown = sections.filter((s) => s.items.length > 0);
  const hasRecommendations = data.recommendations.length > 0;
  const shownIds = new Set(shown.flatMap((section) => section.items.map((node) => node.id)));
  const rest = [...data.nodes]
    .filter((node) => !shownIds.has(node.id))
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Next experiments first — action before inventory */}
      {hasRecommendations && (
        <section>
          <SectionHeader icon="spark" title="Next experiments" count={data.recommendations.length} />
          <div className="space-y-2">
            {data.recommendations.map((rec) => (
              <RecommendationRow key={`${rec.run_id}-${rec.lane}`} rec={rec} />
            ))}
          </div>
        </section>
      )}

      {shown.map((section) => (
        <section key={section.key}>
          <SectionHeader icon={section.icon} title={section.title} count={section.items.length} />
          <div className="space-y-2">
            {section.items.map((node) => (
              <ContributionNodeCard key={node.id} node={node} onOpen={onOpenNode} />
            ))}
          </div>
        </section>
      ))}

      {rest.length > 0 && (
        <section>
          <SectionHeader
            icon="layers"
            title={shown.length > 0 ? "Also in the graph" : "Recent contributions"}
            count={rest.length}
          />
          <div className="space-y-2">
            {rest.map((node) => (
              <ContributionNodeCard key={node.id} node={node} onOpen={onOpenNode} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const KIND_OPTIONS: ContributionKind[] = [
  "insight",
  "hypothesis",
  "result",
  "report",
  "verification",
  "failure",
];

function NewContributionDialog({
  nodes,
  onClose,
  onCreated,
}: {
  nodes: ContributionNode[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ContributionKind>("insight");
  const [parent, setParent] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const created = await createContribution({
      title: trimmed,
      kind,
      text: text.trim() || undefined,
      parent: parent || undefined,
    });
    setBusy(false);
    if (!created) {
      setError("Could not publish the contribution. Check the local server.");
      return;
    }
    onCreated();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="New contribution"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[520px] rounded-[14px] border border-border bg-bg p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-text">Publish a contribution</h2>
            <p className="mt-0.5 text-[11.5px] text-muted">
              An immutable node in the shared research graph.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-white/[0.05] hover:text-text"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
              placeholder="What did you learn?"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-text placeholder:text-muted/60 focus:border-accent focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">Kind</span>
              <QuietSelect
                value={kind}
                onChange={(event) => setKind(event.target.value as ContributionKind)}
                className="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[12px] text-text"
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {KIND_LABEL[option]}
                  </option>
                ))}
              </QuietSelect>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">Builds on</span>
              <QuietSelect
                value={parent}
                onChange={(event) => setParent(event.target.value)}
                className="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[12px] text-text"
              >
                <option value="">Root contribution</option>
                {nodes.slice(0, 60).map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.title}
                  </option>
                ))}
              </QuietSelect>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">Evidence / note</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              placeholder="What supports this? Link a result, a reproduction, or an observation."
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] leading-relaxed text-text placeholder:text-muted/60 focus:border-accent focus:outline-none"
            />
          </label>
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
              {error}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-[11.5px] text-muted hover:border-border-strong hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!title.trim() || busy}
            className="rounded-md bg-accent px-3 py-1.5 text-[11.5px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-35"
          >
            {busy ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Panel ──

export function ContributionsPanel() {
  const [data, setData] = useState<ContributionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const duplicates = data?.duplicates || [];

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    fetchContributions()
      .then((result) => {
        if (result) {
          setData(result);
        } else if (!silent) {
          setError(true);
        }
      })
      .catch(() => {
        if (!silent) setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const refresh = () => load(true);
    window.addEventListener("bark-contribution", refresh);
    return () => window.removeEventListener("bark-contribution", refresh);
  }, [load]);

  const openThread = useCallback((node: ContributionNode) => {
    if (!node.thread_id) return;
    try {
      sessionStorage.setItem("bark:thread", node.thread_id);
      window.dispatchEvent(new CustomEvent("bark-open-thread", { detail: node.thread_id }));
      window.location.hash = "#/chat";
    } catch {
      /* session storage unavailable — still navigate */
      window.location.hash = "#/chat";
    }
  }, []);

  const metrics = data?.metrics;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header: title + metric chips + refresh */}
      <div className="shrink-0 flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-text text-sm">Contributions</span>
          <span className="truncate text-[11px] text-muted">
            {metrics ? `${metrics.contributions_last_7d} in the last 7d · ${metrics.active_authors} authors` : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            title="Publish an insight, hypothesis, or report"
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-2.5 py-1.5 text-[11px] font-medium text-accent-text transition-colors hover:border-accent"
          >
            <Icon name="plus" size={12} />
            New
          </button>
          <button
            type="button"
            onClick={() => load()}
            title="Refresh contributions"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
          >
            <Icon name="refresh" size={12} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5">
        {loading ? (
          <Skeleton />
        ) : error ? (
          <ErrorState onRetry={() => load()} />
        ) : !data || !metrics || data.nodes.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Metric chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              <MetricChip label="nodes" value={String(metrics.total_nodes)} title="Total contributions" />
              <MetricChip
                label="verified"
                value={`${(metrics.verification_rate * 100).toFixed(0)}%`}
                tone="accent"
                title={`${metrics.verified_nodes} of ${metrics.total_nodes} verified`}
              />
              <MetricChip
                label="neglected"
                value={String(metrics.neglected_nodes)}
                tone="warning"
                title="Branches left untended"
              />
              <MetricChip
                label="contested"
                value={String(metrics.contested_nodes)}
                tone="danger"
                title="Contradicted claims"
              />
              <MetricChip
                label="reuse"
                value={`${(metrics.reuse_rate * 100).toFixed(0)}%`}
                title="Share of reused contributions"
              />
            </div>
            {duplicates.length > 0 && (
              <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[11px] font-medium text-warning">
                  <Icon name="warn" size={12} />
                  Potential duplicates
                </div>
                <div className="mt-1.5 space-y-1">
                  {duplicates.slice(0, 3).map((pair) => (
                    <div key={`${pair.left}:${pair.right}`} className="font-mono text-[10.5px] text-muted">
                      {shortId(pair.left)} ↔ {shortId(pair.right)} · {pair.shared_files.join(", ")}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <SectionList data={data} onOpenNode={openThread} />
          </>
        )}
      </div>
      {formOpen && (
        <NewContributionDialog
          nodes={data?.nodes || []}
          onClose={() => setFormOpen(false)}
          onCreated={() => load(true)}
        />
      )}
    </div>
  );
}
