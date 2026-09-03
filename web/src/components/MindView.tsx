import React, { useState, useEffect, useCallback } from "react";
import { connectWs } from "../lib/api";

interface MindSnapshot {
  board_name: string;
  generated_at: string;
  stats: { total: number; by_column: Record<string, number>; by_priority: Record<string, number> };
  blockers: { card_id: string; title: string; blocked_by: string[]; column: string }[];
  stale_cards: { id: string; title: string; column: string; days: number }[];
  next_actions: { action: string; reason: string }[];
  recent_history: any[];
  recent_sessions: any[];
  top_memories: any[];
  velocity: { total_done: number; total_points: number; avg_effort: number } | null;
  active_sprint?: { name: string } | null;
  digest?: string;
}

export function MindView({ boardName }: { boardName: string | null }) {
  const [snap, setSnap] = useState<MindSnapshot | null>(null);
  const [digest, setDigest] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const params = boardName ? `?name=${encodeURIComponent(boardName)}` : "";
    const token = new URLSearchParams(window.location.search).get("token");
    const q = params + (token ? `${params ? "&" : "?"}token=${encodeURIComponent(token)}` : "");
    const [a, b] = await Promise.all([
      fetch(`/api/mind${q}`).then(r => r.json()).catch(() => null),
      fetch(`/api/mind/digest${q}`).then(r => r.json()).catch(() => null),
    ]);
    if (a && !a.error) setSnap(a);
    if (b && b.digest) setDigest(b.digest);
    setLoading(false);
  }, [boardName]);

  useEffect(() => {
    setLoading(true);
    load();
    // Live reload via WebSocket (mind sync triggers .board/mind/*.json → ws reload)
    const clean = connectWs(() => load());
    return clean;
  }, [load]);

  if (loading) return <div className="p-6 text-sm text-muted">Loading mind...</div>;
  if (!snap) return <div className="p-6 text-sm text-muted">No mind yet. Run <code>barkcli mind sync</code> or click Sync</div>;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">Mind — {snap.board_name}</h2>
          <span className="text-xs text-muted font-mono">{snap.generated_at?.slice(0, 16)} · live via WS</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setSyncing(true);
              await load();
              setSyncing(false);
            }}
            className="text-xs px-3 py-1.5 rounded border border-border hover:border-border-strong text-muted hover:text-text"
          >
            {syncing ? "Syncing…" : "⟳ Sync"}
          </button>
          {digest && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(digest).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90"
            >
              {copied ? "Copied!" : "⧉ Copy digest"}
            </button>
          )}
        </div>
      </div>

      {/* Health */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface border border-border rounded-lg p-3">
          <h3 className="text-xs font-semibold text-muted mb-2">Board Health</h3>
          <p className="text-sm text-text">Total {snap.stats.total} cards</p>
          <div className="mt-2 space-y-1 text-xs">
            {Object.entries(snap.stats.by_column).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className="text-text font-mono">{String(v)}</span></div>
            ))}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <h3 className="text-xs font-semibold text-muted mb-2">Sprint / Velocity</h3>
          <p className="text-sm text-text">{snap.active_sprint ? snap.active_sprint.name : "No active sprint"}</p>
          {snap.velocity ? (
            <p className="text-xs text-muted mt-1">Done {snap.velocity.total_done} cards · {snap.velocity.total_points} pts · avg {snap.velocity.avg_effort.toFixed(1)}</p>
          ) : (
            <p className="text-xs text-muted mt-1">No velocity yet</p>
          )}
        </div>
      </div>

      {/* Blockers & Stale */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface border border-border rounded-lg p-3">
          <h3 className="text-xs font-semibold text-muted mb-2">Blockers</h3>
          {snap.blockers.length === 0 ? (
            <p className="text-xs text-muted">No blockers</p>
          ) : (
            snap.blockers.map(b => (
              <div key={b.card_id} className="text-xs py-1 border-b border-border/50 last:border-0">
                <span className="text-text">{b.title}</span>
                <span className="text-muted"> ({b.card_id}) → {b.blocked_by.join(", ")}</span>
              </div>
            ))
          )}
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <h3 className="text-xs font-semibold text-muted mb-2">Stale &gt;7d</h3>
          {snap.stale_cards.length === 0 ? (
            <p className="text-xs text-muted">No stale cards</p>
          ) : (
            snap.stale_cards.map(s => (
              <div key={s.id} className="text-xs py-1 border-b border-border/50 last:border-0">
                <span className="text-text">{s.title}</span>
                <span className="text-muted"> ({s.column}, {s.days}d)</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Next Actions */}
      <div className="bg-surface border border-border rounded-lg p-3">
        <h3 className="text-xs font-semibold text-muted mb-2">Next Actions</h3>
        {snap.next_actions.map((a, i) => (
          <div key={i} className="flex items-start gap-2 text-xs py-1">
            <span className="text-accent font-mono">{i + 1}.</span>
            <span className="text-text font-mono bg-card px-1 rounded">{a.action}</span>
            <span className="text-muted">{a.reason}</span>
          </div>
        ))}
      </div>

      {/* Digest preview */}
      {digest && (
        <div className="bg-surface border border-border rounded-lg p-3">
          <h3 className="text-xs font-semibold text-muted mb-2">Digest (paste into agent prompt)</h3>
          <pre className="text-[11px] text-muted whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">{digest.slice(0, 3000)}</pre>
        </div>
      )}
    </div>
  );
}
