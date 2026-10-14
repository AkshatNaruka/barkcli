import React, { useState, useEffect, useCallback } from "react";
import { fetchBundles, scanBundles, approveBundle, rejectBundle, sealBundle, fetchBundleTree } from "../lib/api";
import type { Bundle } from "../lib/types";

const KIND_COLORS: Record<string, string> = {
  feat: "bg-emerald-500/20 text-emerald-400",
  fix: "bg-red-500/20 text-red-400",
  refactor: "bg-blue-500/20 text-blue-400",
  docs: "bg-purple-500/20 text-purple-400",
  chore: "bg-gray-500/20 text-gray-400",
  test: "bg-yellow-500/20 text-yellow-400",
  mixed: "bg-orange-500/20 text-orange-400",
};

function BundleCard({ bundle, onApprove, onReject, onSeal }: {
  bundle: Bundle;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSeal: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isUnsorted = bundle.id.endsWith("-unsorted");

  return (
    <div className={`border rounded-lg p-3 mb-2 transition-all ${isUnsorted ? "border-dashed border-border bg-card/50" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${KIND_COLORS[bundle.kind] || "bg-gray-500/20 text-gray-400"}`}>
              {bundle.kind}
            </span>
            {bundle.status === "sealed" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">sealed</span>
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
              <button onClick={() => onApprove(bundle.id)} className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">approve</button>
              <button onClick={() => onSeal(bundle.id)} className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30">seal</button>
              <button onClick={() => onReject(bundle.id)} className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30">reject</button>
            </>
          )}
          <button onClick={() => setExpanded(!expanded)} className="text-xs px-2 py-1 rounded hover:bg-border text-muted">
            {expanded ? "▲" : "▼"}
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
          className="text-sm px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
        >
          {scanning ? "Scanning..." : "Scan"}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {["all", "open", "sealed", "feat", "fix", "refactor", "docs", "chore", "test", "mixed"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2 py-1 rounded-full border ${filter === f ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:border-accent"}`}
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
