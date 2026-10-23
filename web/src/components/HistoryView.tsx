import React, { useState, useEffect, useCallback } from "react";
import { Icon } from "./Icon";
import { fetchBundles, scanBundles, approveBundle, rejectBundle, sealBundle, fetchBundleTree } from "../lib/api";
import type { Bundle } from "../lib/types";

// Kind chips reuse the app-wide dot language: labelColor gives a stable,
// readable hue per kind (same palette as board labels — no raw Tailwind rows).
import { labelColor } from "../lib/labels";

function KindChip({ kind }: { kind: string }) {
  const { color } = labelColor(kind || "chore");
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-px rounded-full shrink-0"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {kind}
    </span>
  );
}

function BundleCard({ bundle, onApprove, onReject, onSeal }: {
  bundle: Bundle;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSeal: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isUnsorted = bundle.id.endsWith("-unsorted");

  return (
    <div className={`rounded-lg p-3 mb-2 transition-all ${isUnsorted ? "border border-dashed border-border bg-card" : "bg-surface"}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <KindChip kind={bundle.kind} />
            {bundle.status === "sealed" && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-px rounded text-accent-text bg-accent-soft">sealed</span>
            )}
            <span className="text-xs text-muted">{bundle.branch}</span>
            {bundle.confidence > 0 && (
              <span className="text-xs text-muted">{Math.round(bundle.confidence * 100)}%</span>
            )}
          </div>
          <h4 className="font-medium text-text mt-1 truncate">{bundle.title}</h4>
          {bundle.summary && (
            <p className="text-sm text-muted mt-0.5 line-clamp-2">{bundle.summary}</p>
          )}
          <div className="flex items-center gap-3 mt-1 text-xs text-muted">
            <span>{bundle.commit_count} commits</span>
            <span className="font-mono">{bundle.first_sha?.slice(0, 8)}..{bundle.last_sha?.slice(0, 8)}</span>
            {bundle.card_id && <span className="text-accent">→ {bundle.card_id}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          {!bundle.status.includes("sealed") && (
            <>
              <button onClick={() => onApprove(bundle.id)} className="text-xs px-2 py-1 rounded bg-success-soft text-success hover:opacity-80 transition-opacity">Approve</button>
              <button onClick={() => onSeal(bundle.id)} className="text-xs px-2 py-1 rounded bg-accent-soft text-accent-text hover:opacity-80 transition-opacity">Seal</button>
              <button onClick={() => onReject(bundle.id)} className="text-xs px-2 py-1 rounded bg-danger-soft text-danger hover:opacity-80 transition-opacity">Reject</button>
            </>
          )}
          <button onClick={() => setExpanded(!expanded)} className="text-xs px-2 py-1.5 rounded hover:bg-card text-muted">
            <span className={`inline-flex transition-transform ${expanded ? "" : "rotate-90"}`}><Icon name="chevR" size={12} /></span>
          </button>
        </div>
      </div>
      {expanded && bundle.commits && (
        <div className="mt-2 border-t border-border pt-2">
          {bundle.commits.map((c: any) => (
            <div key={c.sha} className="flex items-center gap-2 py-0.5 text-xs font-mono">
              <span className="text-muted">{c.sha.slice(0, 8)}</span>
              <span className="text-text truncate">{c.subject}</span>
              <span className="text-muted ml-auto">{c.author}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HistoryView({ boardName }: { boardName: string | null }) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBundles();
      setBundles(data.bundles || []);
    } catch {
      setBundles([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await scanBundles();
      await load();
    } finally {
      setScanning(false);
    }
  };

  const handleApprove = async (id: string) => {
    await approveBundle(id);
    await load();
  };

  const handleReject = async (id: string) => {
    await rejectBundle(id);
    await load();
  };

  const handleSeal = async (id: string) => {
    await sealBundle(id);
    await load();
  };

  const filtered = filter === "all" ? bundles : bundles.filter((b) =>
    filter === "open" ? b.status === "open" :
    filter === "sealed" ? b.status === "sealed" :
    b.kind === filter
  );

  const unsorted = filtered.filter((b) => b.id.endsWith("-unsorted"));
  const regular = filtered.filter((b) => !b.id.endsWith("-unsorted"));

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text">History</h2>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="text-sm px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {scanning ? "Scanning..." : "Scan"}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {["all", "open", "sealed", "feat", "fix", "refactor", "docs", "chore", "test", "mixed"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2 py-1 rounded transition-colors ${filter === f ? "bg-accent-soft text-accent-text" : "text-muted hover:text-text"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted text-center py-8">Loading bundles...</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted text-center py-8">
          No bundles found. Click "Scan" to analyze commit history.
        </div>
      ) : (
        <>
          {unsorted.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-muted mb-2">Unsorted</h3>
              {unsorted.map((b) => (
                <BundleCard key={b.id} bundle={b} onApprove={handleApprove} onReject={handleReject} onSeal={handleSeal} />
              ))}
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium text-muted mb-2">Bundles</h3>
            {regular.map((b) => (
              <BundleCard key={b.id} bundle={b} onApprove={handleApprove} onReject={handleReject} onSeal={handleSeal} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
