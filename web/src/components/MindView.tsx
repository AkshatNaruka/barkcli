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
    // Live reload via WebSocket (mind sync triggers ws reload)
    const clean = connectWs(() => load());
    return clean;
  }, [load]);

  if (loading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (!snap) return <div className="p-6 text-sm text-muted">No snapshot yet — press Sync or run <code>barkcli mind sync</code></div>;

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

  const copyDigest = () => {
    navigator.clipboard.writeText(digest).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const hasAttention = snap.blockers.length > 0 || snap.stale_cards.length > 0;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3 max-w-3xl">
      {/* Command row — the human's steering wheel */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted min-w-0">
          <span className="font-medium text-text">Mind</span>
          <span className="truncate">{snap.board_name}</span>
          <span className="inline-flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Live
          </span>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={async () => {
              setSyncing(true);
              await load();
              setSyncing(false);
            }}
            title="Sync"
            className="p-2 rounded-md text-muted hover:text-text hover:bg-surface disabled:opacity-50"
            disabled={syncing}
          >
            <Icon name="refresh" size={14} />
          </button>
          {digest && (
            <button
              onClick={copyDigest}
              className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover inline-flex items-center gap-1.5"
            >
              <Icon name="copy" size={13} />
              {copied ? "Copied" : "Copy digest"}
            </button>
          )}
        </div>
      </div>

      {/* Intent — one field, no heading, question as placeholder */}
      <div className="bg-card rounded-lg border border-transparent focus-within:border-accent/40 flex items-center gap-2 p-1.5 pl-3">
        <input
          type="text"
          value={intent}
          onChange={e => setIntent(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="What should get done?"
          className="flex-1 bg-transparent text-sm text-text placeholder:text-muted/70 focus:outline-none min-w-0"
        />
        <select
          value={intentKind}
          onChange={e => setIntentKind(e.target.value)}
          title="Card type"
          className="bg-transparent text-xs text-muted focus:outline-none pr-0.5"
        >
          <option value="auto">Auto</option>
          <option value="feature">Feature</option>
          <option value="bug">Bug</option>
        </select>
        <button
          onClick={submit}
          disabled={!intent.trim() || submitting}
          className="px-3.5 py-1.5 bg-accent text-white text-sm rounded-md font-medium hover:bg-accent-hover disabled:opacity-40"
        >
          {submitting ? "Adding…" : "Add"}
        </button>
      </div>

      {/* Autopilot — one strip, numbers for orientation, one decision */}
      {auto && (
        <div className={`rounded-lg p-2.5 ${auto.needs_human ? "bg-accent-soft" : "bg-card"}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs font-semibold text-text shrink-0">Autopilot · {auto.phase_label}</span>
            <div className="flex gap-2.5 text-[11px] text-muted">
              <span title="Todo cards without a plan">unplanned {auto.counts.todo_unplanned}</span>
              <span title="Plans awaiting your approval">proposals {auto.counts.pending_proposals}</span>
              <span title="Queued tasks">queued {auto.counts.queue_pending + auto.counts.queue_active}</span>
              <span title="Cards in review">review {auto.counts.in_review}</span>
            </div>
          </div>
          {auto.human_prompt && (
            <p className="text-xs text-text mt-1.5">{auto.human_prompt}</p>
          )}
          {proposal && (
            <div className="mt-1.5 space-y-0.5">
              <p className="text-[11px] text-muted">
                {proposal.children.length} slices · effort {proposal.estimated_total_effort} · risk {proposal.risk_level}
              </p>
              {proposal.children.map((c, i) => (
                <div key={i} className="text-xs">
                  <span className="text-text">{c.title}</span>
                  {c.acceptance_criteria.length > 0 && <span className="text-muted"> — {c.acceptance_criteria[0]}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {phaseKey === "NeedsPlan" && (
              <button
                onClick={() => {
                  const m = auto.agent_action?.match(/'([^']+)'/);
                  if (m) act(() => proposePlan(m[1], boardName || undefined));
                }}
                disabled={acting}
                className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Propose plan
              </button>
            )}
            {phaseKey === "AwaitingPlanApproval" && proposal && (
              <>
                <button
                  onClick={() => act(() => approvePlan(proposal.card_id, boardName || undefined))}
                  disabled={acting}
                  className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  Approve plan
                </button>
                <button
                  onClick={() => act(() => rejectPlan(proposal.card_id, undefined, boardName || undefined))}
                  disabled={acting}
                  className="text-xs px-2.5 py-1.5 rounded-md text-muted hover:text-text hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}
            {!["NeedsPlan", "AwaitingPlanApproval"].includes(phaseKey) && (phaseKey === "AwaitingMerge" || auto.counts.in_review > 0) && (
              <button
                onClick={() => act(() => runReview(boardName || undefined))}
                disabled={acting}
                className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Run review
              </button>
            )}
            {auto.agent_action && !auto.needs_human && (
              <span className="text-[11px] text-muted">{auto.agent_action}</span>
            )}
          </div>
        </div>
      )}

      {/* Column counts — compact cells, numbers as the content */}
      <div className="flex flex-wrap gap-2">
        {["todo", "doing", "review", "done"].filter(c => snap.stats.by_column[c] !== undefined).map(c => (
          <div key={c} className="flex-1 bg-card rounded-lg px-3 py-2.5 min-w-[72px]">
            <div className="text-lg font-semibold text-text leading-none">{snap.stats.by_column[c]}</div>
            <div className="text-[11px] text-muted mt-1.5 capitalize">{c}</div>
          </div>
        ))}
        {snap.active_sprint && (
          <div className="flex-1 bg-card rounded-lg px-3 py-2.5 min-w-[110px]">
            <div className="text-lg font-semibold text-text leading-none">
              {snap.velocity ? snap.velocity.total_done : "—"}
            </div>
            <div className="text-[11px] text-muted mt-1.5 truncate" title={snap.velocity ? `${snap.velocity.total_points} pts · avg ${snap.velocity.avg_effort.toFixed(1)}` : undefined}>
              {snap.velocity ? `done in ${snap.active_sprint.name}` : snap.active_sprint.name}
            </div>
          </div>
        )}
      </div>

      {/* Needs attention — hidden entirely when there is nothing to say */}
      {hasAttention && (
        <div className="grid grid-cols-2 gap-3">
          {snap.blockers.length > 0 && (
            <div className="bg-card rounded-lg p-3">
              <h3 className="text-[11px] font-medium text-muted mb-1.5">Blocked</h3>
              {snap.blockers.map(b => (
                <button
                  key={b.card_id}
                  onClick={() => navigate("board")}
                  title={`${b.card_id} — blocked by ${b.blocked_by.join(", ")}`}
                  className="block w-full text-left text-xs py-1 truncate hover:text-accent transition-colors"
                >
                  <span className="text-text">{b.title}</span>
                  <span className="text-muted"> ← {b.blocked_by[0]}</span>
                </button>
              ))}
            </div>
          )}
          {snap.stale_cards.length > 0 && (
            <div className="bg-card rounded-lg p-3">
              <h3 className="text-[11px] font-medium text-muted mb-1.5">Stale 7d+</h3>
              {snap.stale_cards.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate("board")}
                  title={`${s.id} — ${s.column}, untouched ${s.days} days`}
                  className="block w-full text-left text-xs py-1 truncate hover:text-accent transition-colors"
                >
                  <span className="text-text">{s.title}</span>
                  <span className="text-muted"> · {s.days}d</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Next actions — plain sentences, command in tooltip, click to copy */}
      {snap.next_actions.length > 0 && (
        <div className="bg-card rounded-lg p-3">
          <h3 className="text-[11px] font-medium text-muted mb-1">Next actions</h3>
          {snap.next_actions.map((a, i) => {
            const short = a.action.replace(/^barkcli\s+\S+\s+/, "");
            return (
              <button
                key={i}
                onClick={() => navigator.clipboard.writeText(a.action).catch(() => {})}
                title={`${a.action} — click to copy`}
                className="block w-full text-left text-xs py-1 hover:text-accent transition-colors truncate"
              >
                <span className="text-muted mr-1.5">{i + 1}</span>
                <span className="text-text">{short}</span>
                <span className="text-muted"> · {a.reason}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
