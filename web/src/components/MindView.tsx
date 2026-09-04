import React, { useState, useEffect, useCallback } from "react";
import { connectWs, fetchAutopilotStatus, submitIntent, proposePlan, approvePlan, rejectPlan, runReview } from "../lib/api";
import type { AutopilotStatus, PlanProposal } from "../lib/api";
import { navigate } from "../lib/hashnav";
import { Icon } from "./Icon";

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
  const [auto, setAuto] = useState<AutopilotStatus | null>(null);
  const [intent, setIntent] = useState("");
  const [intentKind, setIntentKind] = useState("auto");
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const params = boardName ? `?name=${encodeURIComponent(boardName)}` : "";
    const token = new URLSearchParams(window.location.search).get("token");
    const q = params + (token ? `${params ? "&" : "?"}token=${encodeURIComponent(token)}` : "");
    const [a, b, c] = await Promise.all([
      fetch(`/api/mind${q}`).then(r => r.json()).catch(() => null),
      fetch(`/api/mind/digest${q}`).then(r => r.json()).catch(() => null),
      fetchAutopilotStatus(boardName || undefined),
    ]);
    if (a && !a.error) setSnap(a);
    if (b && b.digest) setDigest(b.digest);
    if (c) setAuto(c);
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

  const act = async (fn: () => Promise<any>) => {
    setActing(true);
    try { await fn(); } catch {}
    setActing(false);
    load();
  };

  const phaseKey = auto ? (typeof auto.phase === "string" ? auto.phase : Object.keys(auto.phase as any)[0]) : "";
  const proposal: PlanProposal | null = (auto as any)?.proposal || null;

  const submit = async () => {
    const text = intent.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      await submitIntent(text, intentKind === "auto" ? undefined : intentKind, boardName || undefined);
      setIntent("");
    } catch {}
    setSubmitting(false);
    load();
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Intent box — the human's steering wheel. No CLI needed. */}
      <div className="bg-surface border border-border rounded-lg p-3">
        <h3 className="text-xs font-semibold text-muted mb-2">What should get done?</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={intent}
            onChange={e => setIntent(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="Describe intent in plain language — e.g. Add Google OAuth"
            className="flex-1 bg-card border border-border rounded px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent"
          />
          <select
            value={intentKind}
            onChange={e => setIntentKind(e.target.value)}
            className="bg-card border border-border rounded px-2 py-2 text-xs text-text"
          >
            <option value="auto">Auto</option>
            <option value="feature">Feature</option>
            <option value="bug">Bug</option>
          </select>
          <button
            onClick={submit}
            disabled={!intent.trim() || submitting}
            className="px-4 py-2 bg-accent text-white text-sm rounded font-medium hover:bg-accent/90 disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {/* Autopilot gate — human decisions surface here, agents do the rest. */}
      {auto && (
        <div className={`border rounded-lg p-3 ${auto.needs_human ? "bg-accent/5 border-accent/30" : "bg-surface border-border"}`}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-semibold text-muted">Autopilot · {auto.phase_label}</h3>
            <div className="flex gap-3 text-[11px] text-muted font-mono">
              <span title="Todo cards without a plan">unplanned {auto.counts.todo_unplanned}</span>
              <span title="Plans awaiting your approval">proposals {auto.counts.pending_proposals}</span>
              <span title="Queued tasks">queued {auto.counts.queue_pending + auto.counts.queue_active}</span>
              <span title="Cards in review">review {auto.counts.in_review}</span>
            </div>
          </div>
          {auto.human_prompt && (
            <p className="text-sm text-text mb-2">{auto.human_prompt}</p>
          )}
          {proposal && (
            <div className="mb-2 bg-card border border-border rounded p-2">
              <p className="text-xs font-medium text-text mb-1">
                Proposed: {proposal.children.length} slices · effort {proposal.estimated_total_effort} · risk {proposal.risk_level}
              </p>
              <ul className="space-y-0.5">
                {proposal.children.map((c, i) => (
                  <li key={i} className="text-xs text-muted">
                    <span className="text-text">{c.title}</span>
                    <span className="font-mono"> [{c.priority}]</span>
                    {c.acceptance_criteria.length > 0 && <span> — {c.acceptance_criteria[0]}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {phaseKey === "NeedsPlan" && (
              <button
                onClick={() => {
                  const m = auto.agent_action?.match(/'([^']+)'/);
                  if (m) act(() => proposePlan(m[1], boardName || undefined));
                }}
                disabled={acting}
                className="text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
              >
                Propose plan
              </button>
            )}
            {phaseKey === "AwaitingPlanApproval" && proposal && (
              <>
                <button
                  onClick={() => act(() => approvePlan(proposal.card_id, boardName || undefined))}
                  disabled={acting}
                  className="text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  Approve plan
                </button>
                <button
                  onClick={() => act(() => rejectPlan(proposal.card_id, undefined, boardName || undefined))}
                  disabled={acting}
                  className="text-xs px-3 py-1.5 rounded border border-border text-muted hover:text-text disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}
            {(phaseKey === "AwaitingMerge" || (auto.counts.in_review > 0)) && (
              <button
                onClick={() => act(() => runReview(boardName || undefined))}
                disabled={acting}
                className="text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
              >
                Run review
              </button>
            )}
            {auto.agent_action && !auto.needs_human && (
              <span className="text-[11px] text-muted self-center">{auto.agent_action}</span>
            )}
          </div>
        </div>
      )}
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
            className="text-xs px-3 py-1.5 rounded border border-border hover:border-border-strong text-muted hover:text-text inline-flex items-center gap-1.5"
          >
            <Icon name="refresh" size={13} />
            {syncing ? "Syncing…" : "Sync"}
          </button>
          {digest && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(digest).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 inline-flex items-center gap-1.5"
            >
              <Icon name="copy" size={13} />
              {copied ? "Copied!" : "Copy digest"}
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
              <button
                key={b.card_id}
                onClick={() => navigate("board")}
                title="Open in Board"
                className="w-full text-left text-xs py-1 border-b border-border/50 last:border-0 hover:text-accent transition-colors"
              >
                <span className="text-text">{b.title}</span>
                <span className="text-muted"> ({b.card_id}) → {b.blocked_by.join(", ")}</span>
              </button>
            ))
          )}
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <h3 className="text-xs font-semibold text-muted mb-2">Stale &gt;7d</h3>
          {snap.stale_cards.length === 0 ? (
            <p className="text-xs text-muted">No stale cards</p>
          ) : (
            snap.stale_cards.map(s => (
              <button
                key={s.id}
                onClick={() => navigate("board")}
                title="Open in Board"
                className="w-full text-left text-xs py-1 border-b border-border/50 last:border-0 hover:text-accent transition-colors"
              >
                <span className="text-text">{s.title}</span>
                <span className="text-muted"> ({s.column}, {s.days}d)</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Next Actions */}
      <div className="bg-surface border border-border rounded-lg p-3">
        <h3 className="text-xs font-semibold text-muted mb-2">Next Actions</h3>
        {snap.next_actions.map((a, i) => (
          <button
            key={i}
            onClick={() => navigator.clipboard.writeText(a.action).catch(() => {})}
            title="Click to copy command"
            className="w-full flex items-start gap-2 text-xs py-1 text-left hover:bg-surface rounded px-1 -mx-1 transition-colors"
          >
            <span className="text-accent font-mono">{i + 1}.</span>
            <span className="text-text font-mono bg-card px-1 rounded">{a.action}</span>
            <span className="text-muted">{a.reason}</span>
          </button>
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
