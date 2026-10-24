import React, { useState, useEffect, useCallback } from "react";
import { fetchContextFile, digestContextFile } from "../lib/api";
import type { ContextFileResponse, ContextFileBlock } from "../lib/api";
import { Icon } from "./Icon";

// Freshness heat scale — same thresholds as the file's Verification footer.
function stalenessColor(s: number): string {
  if (s >= 0.8) return "#f87171"; // likely wrong
  if (s >= 0.4) return "#facc15"; // review
  return "#4ade80"; // fresh
}

function stalenessLabel(s: number): string {
  if (s >= 0.8) return "likely wrong";
  if (s >= 0.4) return "review";
  return "fresh";
}

function healthColor(s: number): string {
  if (s >= 0.8) return "#f87171";
  if (s >= 0.4) return "#facc15";
  return "#4ade80";
}

// Sections most worth reading first get expanded by default.
const DEFAULT_OPEN = new Set(["snapshot", "active", "verify"]);

export function ContextView({ boardName }: { boardName: string | null }) {
  const [data, setData] = useState<ContextFileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [digesting, setDigesting] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set(DEFAULT_OPEN));

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetchContextFile(boardName || undefined);
    setData(d);
    setLoading(false);
  }, [boardName]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDigest = async () => {
    setDigesting(true);
    setMsg("");
    const report = await digestContextFile(boardName || undefined);
    setDigesting(false);
    if (report) {
      const parts: string[] = [`~${report.tokens} tokens`];
      if (report.rewritten.length) parts.push(`${report.rewritten.length} rewritten`);
      if (report.evicted.length) parts.push(`${report.evicted.length} evicted`);
      if (report.flagged_stale.length) parts.push(`${report.flagged_stale.length} flagged`);
      setMsg(`Regenerated — ${parts.join(" · ")}`);
    } else {
      setMsg("Digest failed — is a board initialized here?");
    }
    load();
  };

  const handlePolish = async (polish: boolean) => {
    setDigesting(true);
    setMsg("");
    const report = await digestContextFile(boardName || undefined, polish);
    setDigesting(false);
    if (report) {
      setMsg(
        report.rewritten.includes("brief")
          ? "Brief rewritten by LLM (facts-only, evidence came from the digest)"
          : polish
            ? "Brief unchanged — no LLM provider configured (`barkcli ai config`) or nothing to rewrite"
            : "Digest already in sync"
      );
    } else {
      setMsg("Digest failed — is a board initialized here?");
    }
    load();
  };

  const toggle = (id: string) => {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted">
        Loading context file…
      </div>
    );
  }

  // ── Empty state ──
  if (!data || !data.exists) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-8 text-center">
        <Icon name="doc" className="w-8 h-8 text-muted" />
        <h2 className="text-lg font-semibold text-text">No context file yet</h2>
        <p className="text-xs text-muted max-w-md">
          <code className="text-text bg-card px-1 py-0.5 rounded">project_context.md</code> is barkcli's
          living central context — regenerated from tracked work so agent sessions start warm instead of
          re-exploring the repository.
        </p>
        <p className="text-xs text-muted">{data?.hint || "Run `barkcli context prime` in this repo."}</p>
      </div>
    );
  }

  const blocks = data.blocks || [];
  const flagged = blocks.filter(b => !b.manual && b.staleness >= 0.4);
  const tokenPct = data.budget_tokens
    ? Math.min(100, Math.round(((data.total_tokens || 0) / data.budget_tokens) * 100))
    : 0;
  const tokenColor = tokenPct >= 100 ? "#f87171" : tokenPct >= 85 ? "#facc15" : "#4ade80";

  return (
    <div className="h-full flex flex-col p-4 gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-text">Context</h2>
          <p className="text-xs text-muted">
            Living <code className="text-text bg-card px-1 rounded">project_context.md</code> — verified
            central context agents read before exploring
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handlePolish(true)}
            disabled={digesting}
            title="Rewrite the Brief section with your configured LLM — facts-only, one call, derived from the generated sections"
            className="px-3 py-1.5 bg-card text-text text-xs rounded font-medium hover:bg-surface border border-card hover:border-accent disabled:opacity-50"
          >
            {digesting ? "Polishing…" : "✨ Polish brief"}
          </button>
          <button
            onClick={handleDigest}
            disabled={digesting}
            className="px-3 py-1.5 bg-accent text-white text-xs rounded font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {digesting ? "Regenerating…" : "Regenerate digest"}
          </button>
        </div>
      </div>

      {/* File meta strip */}
      <div className="bg-surface rounded-lg p-3 shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
          <span className="font-mono text-text">{data.file}</span>
          {data.last_run && <span>· digest {data.last_run}</span>}
          {data.generated && <span className="text-yellow-500">· just generated now</span>}
          {msg && <span className="text-text">{msg}</span>}
        </div>
        {/* Token budget gauge */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-card rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${tokenPct}%`, backgroundColor: tokenColor }}
            />
          </div>
          <span className="text-xs text-muted whitespace-nowrap">
            ~{data.total_tokens} / {data.budget_tokens} tokens
          </span>
        </div>
        {data.evicted_last_run && data.evicted_last_run.length > 0 && (
          <div className="text-xs text-muted">
            Trimmed by budget: {data.evicted_last_run.join(", ")}
          </div>
        )}
      </div>

      {/* Flagged drift strip */}
      {flagged.length > 0 && (
        <div className="bg-surface border border-yellow-600/40 rounded-lg px-3 py-2 text-xs text-muted shrink-0">
          <span className="text-yellow-500 font-medium">⚠ Drift detected</span> — these sections may be
          out of date:{" "}
          {flagged
            .map(f => `${f.id} (${f.staleness.toFixed(2)})`)
            .join(", ")}
          . Run <code className="text-text bg-card px-1 rounded">barkcli context verify</code> to re-check
          against git.
        </div>
      )}

      {/* Block cards with heat bars */}
      <div className="flex flex-col gap-2">
        {blocks.map(b => (
          <ContextBlockCard
            key={b.id}
            block={b}
            open={open.has(b.id)}
            onToggle={() => toggle(b.id)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted shrink-0 pb-2">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: healthColor(0) }} /> fresh
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: healthColor(0.5) }} /> ≥0.4 review
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: healthColor(0.9) }} /> ≥0.8 likely
          wrong
        </span>
        <span>· staleness comes from code-map drift, spec staleness & spec git state</span>
      </div>
    </div>
  );
}

function ContextBlockCard({
  block,
  open,
  onToggle,
}: {
  block: ContextFileBlock;
  open: boolean;
  onToggle: () => void;
}) {
  const color = stalenessColor(block.staleness);
  return (
    <div className="bg-surface rounded-lg overflow-hidden shrink-0">
      {/* Heat bar */}
      <div className="h-0.5 w-full bg-card">
        <div
          className="h-full transition-all"
          style={{ width: `${Math.round(block.staleness * 100)}%`, backgroundColor: color }}
        />
      </div>
      <button onClick={onToggle} className="w-full text-left px-3 py-2 hover:bg-card/50 transition-colors">
        <div className="flex items-center gap-2">
          <Icon
            name="chevR"
            className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="text-sm font-medium text-text">{block.heading}</span>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {block.staleness.toFixed(2)} · {stalenessLabel(block.staleness)}
          </span>
          {block.manual && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-400">
              manual
            </span>
          )}
          <span className="ml-auto text-[10px] text-muted whitespace-nowrap font-mono">
            src: {block.src} · {block.updated} · ~{block.tokens} tok
          </span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <pre className="text-xs text-text font-mono whitespace-pre-wrap leading-relaxed bg-card rounded p-2.5 overflow-x-auto">
            {block.body}
          </pre>
        </div>
      )}
    </div>
  );
}
