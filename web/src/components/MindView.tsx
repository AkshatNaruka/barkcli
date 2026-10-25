import React, { useState, useEffect, useCallback } from "react";
import { connectWs, fetchAutopilotStatus, submitIntent, proposePlan, approvePlan, rejectPlan, runReview } from "../lib/api";
import type { AutopilotStatus, PlanProposal } from "../lib/api";
import type { Board, Card } from "../lib/types";
import { navigate } from "../lib/hashnav";
import { Icon } from "./Icon";
import { AgentRail, type RailAgent } from "./AgentRail";
import { isReplayMode, replaySessions, restartReplay } from "../lib/replay";

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

interface QueueTask {
  id: string;
  card_id?: string;
  title: string;
  status: string;
  assigned_agent?: string | null;
  priority?: string;
}

interface AgentRec {
  id: string;
  name: string;
  role?: string;
  status: string;
  active_tasks?: string[];
}

function isBlocked(c: Card): boolean {
  return Boolean(c.blocked_by) || Boolean(c.links && c.links.some((l) => l.ty === "blocked-by"));
}

function statusChip(c: Card): string | null {
  if (isBlocked(c)) return null;
  if (c.column === "doing") return "In progress";
  if (c.column === "review") return "Review";
  return null;
}

// ── Card: the mockup's quiet dark tile — title, chips, spec link ──

function MindCard({ card }: { card: Card }) {
  const chip = statusChip(card);
  const bug = Boolean(card.labels && card.labels.includes("bug"));
  const blocked = isBlocked(card);
  return (
    <button
      onClick={() => navigate("board")}
      title={`${card.id} — open on the board`}
      className={`w-full text-left rounded-lg border bg-card px-3 py-2.5 transition-colors ${
        blocked
          ? "border-danger/50 hover:border-danger"
          : "border-border hover:border-border-strong"
      }`}
    >
      <div className="text-[13px] text-text leading-snug truncate">{card.title}</div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {card.priority === "high" && (
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-danger bg-danger-soft rounded px-1.5 py-0.5">
            High
          </span>
        )}
        {bug && (
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-danger bg-danger-soft rounded px-1.5 py-0.5">
            Bug
          </span>
        )}
        {chip && (
          <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-muted-strong border border-border rounded px-1.5 py-0.5">
            {chip}
          </span>
        )}
        {blocked && (
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-danger">Blocked</span>
        )}
        {card.spec_id && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-accent-text" title={`Spec: ${card.spec_id}`}>
            <Icon name="link" size={10} />
            spec
          </span>
        )}
      </div>
    </button>
  );
}

export function MindView({ boardName, board }: { boardName: string | null; board: Board | null }) {
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
  const [specs, setSpecs] = useState<unknown[]>([]);
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [agents, setAgents] = useState<AgentRec[]>([]);

  const replay = isReplayMode();
  const [replayNonce, setReplayNonce] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const params = boardName ? `?name=${encodeURIComponent(boardName)}` : "";
    const token = new URLSearchParams(window.location.search).get("token");
    const q = params + (token ? `${params ? "&" : "?"}token=${encodeURIComponent(token)}` : "");
    const [a, b, c, d, e, f] = await Promise.all([
      fetch(`/api/mind${q}`).then(r => r.json()).catch(() => null),
      fetch(`/api/mind/digest${q}`).then(r => r.json()).catch(() => null),
      fetchAutopilotStatus(boardName || undefined),
      fetch(`/api/specs${q}`).then(r => r.json()).then(j => j.specs || []).catch(() => []),
      fetch(`/api/tasks${boardName ? `?name=${encodeURIComponent(boardName)}` : ""}`).then(r => r.json()).then(j => j.tasks || []).catch(() => []),
      fetch("/api/agents").then(r => r.json()).then(j => j.agents || []).catch(() => []),
    ]);
    if (a && !a.error) setSnap(a);
    if (b && b.digest) setDigest(b.digest);
    if (c) setAuto(c);
    setSpecs(Array.isArray(d) ? d : []);
    setTasks(Array.isArray(e) ? e : []);
    setAgents(Array.isArray(f) ? f : []);
    setLoading(false);
  }, [boardName]);

  useEffect(() => {
    setLoading(true);
    load();
    // Live reload via WebSocket (mind sync triggers ws reload)
    const clean = connectWs(() => load());
    return clean;
  }, [load]);

  // Replay mode: re-render on a 500ms tick so agent rows animate as a pure
  // function of elapsed time. No backend involved (static Pages demo).
  useEffect(() => {
    if (!replay) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [replay, replayNonce]);

  if (loading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (!board && !snap) {
    return <div className="p-6 text-sm text-muted">No snapshot yet — press Sync or run <code>barkcli mind sync</code></div>;
  }

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

  // ── Derived view model — board prop is authoritative; the snapshot adds
  // server-computed attention + next actions.
  const cards = board?.cards || [];
  const open = cards.filter((c) => c.column !== "done");
  const byColumn = (col: string) => open.filter((c) => c.column === col);
  const pending = tasks.filter((t) => t.status === "Pending").length;
  const activeTasks = tasks.filter((t) => t.status === "InProgress" || t.status === "Assigned");
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const agentWork = (a: AgentRec): string | null => {
    const tid = a.active_tasks?.[0];
    if (tid && taskById.has(tid)) return taskById.get(tid)!.title;
    const live = activeTasks.find((t) => t.assigned_agent === a.id);
    if (live) return live.title;
    return null;
  };

  // Footer: "Next:" — dispatch line wins, else the snapshot's top action.
  const topAction = snap?.next_actions?.[0];
  const nextText = pending > 0
    ? `dispatch ${pending} pending`
    : topAction
      ? topAction.action.replace(/^barkcli\s+/, "").trim() || topAction.action
      : null;
  const nextReason = pending > 0
    ? `${pending} task${pending === 1 ? "" : "s"} in the queue — ${activeTasks.length} active`
    : topAction?.reason;
  const nextCommands = snap?.next_actions?.map((a) => a.action) || [];
  const onNext = () => {
    if (pending > 0) navigate("orchestrate");
    else if (topAction) navigator.clipboard.writeText(topAction.action).catch(() => {});
  };

  const boardTitle = snap?.board_name || board?.title || boardName || "";

  // Replay sessions → agent rail rows, in the mockup's order.
  const sessions = replay ? replaySessions(now) : [];
  const railAgents: RailAgent[] = replay
    ? (() => {
        const order = ["opencode-1", "claude-2", "codex-1"];
        const rows: RailAgent[] = sessions
          .filter((s) => s.backend !== "merge-train")
          .sort((a, b) => order.indexOf(a.agent_id) - order.indexOf(b.agent_id))
          .map((s) => ({ id: s.id, name: s.agent_id, work: s.title || s.note || null, status: s.status }));
        const train = sessions.find((s) => s.backend === "merge-train");
        if (train) {
          rows.push({ id: train.id, name: "merge-train", work: train.note || "branches landed", status: "merged" });
        }
        rows.push({ id: "human-you", name: "human-you", work: "Review queue", status: "human", human: true });
        return rows;
      })()
    : agents
        .filter((a) => a.status !== "Evicted")
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          name: a.name,
          work: agentWork(a),
          status: a.status,
          human: a.id.startsWith("human"),
        }));

  const restart = () => {
    restartReplay();
    setReplayNonce((n) => n + 1);
    setNow(Date.now());
  };

  const columns = (board?.columns || []).filter((c) => c.id !== "done");

  return (
    <div className="h-full flex min-w-0">
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Command row — the human's steering wheel */}
        <div className="px-5 pt-4 pb-2.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted min-w-0">
            <span className="text-[13px] font-medium text-text">Mind</span>
            <span className="truncate">{boardTitle}</span>
            <span className="inline-flex items-center gap-1 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${replay ? "bg-warning" : "bg-success animate-pulse"}`} />
              {replay ? "Replay" : "Live"}
            </span>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {digest && (
              <button
                onClick={copyDigest}
                className="text-[11px] px-2.5 py-1.5 rounded-md border border-border text-muted hover:text-text hover:border-border-strong inline-flex items-center gap-1.5"
              >
                <Icon name="copy" size={12} />
                {copied ? "Copied" : "Copy digest"}
              </button>
            )}
            <button
              onClick={async () => {
                setSyncing(true);
                await load();
                setSyncing(false);
              }}
              title="Sync"
              className="p-2 rounded-md text-muted hover:text-text hover:bg-white/[0.04] disabled:opacity-50"
              disabled={syncing}
            >
              <Icon name="refresh" size={14} />
            </button>
          </div>
        </div>

        {/* Intent — one field, no heading, question as placeholder */}
        <div className="px-5 pb-3 shrink-0">
          <div className="bg-card rounded-lg border border-border focus-within:border-accent/50 flex items-center gap-2 p-1.5 pl-3">
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
        </div>

        {/* Autopilot — one strip, numbers for orientation, one decision */}
        {auto && (
          <div className="px-5 pb-3 shrink-0">
            <div className="rounded-lg border border-border bg-surface/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[11px] font-medium text-text shrink-0">Autopilot · {auto.phase_label}</span>
                {auto.needs_human && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" title="Needs a human decision" />}
                <div className="flex gap-2.5 text-[10px] text-muted">
                  <span title="Todo cards without a plan">unplanned {auto.counts.todo_unplanned}</span>
                  <span title="Plans awaiting your approval">proposals {auto.counts.pending_proposals}</span>
                  <span title="Queued tasks">queued {auto.counts.queue_pending + auto.counts.queue_active}</span>
                  <span title="Cards in review">review {auto.counts.in_review}</span>
                </div>
              </div>
              {auto.human_prompt && (
                <p className="text-[10px] text-muted mt-1.5">{auto.human_prompt}</p>
              )}
              {proposal && (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-[10px] text-muted">
                    {proposal.children.length} slices · effort {proposal.estimated_total_effort} · risk {proposal.risk_level}
                  </p>
                  {proposal.children.map((c, i) => (
                    <div key={i} className="text-[11px]">
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
                    className="text-[11px] px-2.5 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Propose plan
                  </button>
                )}
                {phaseKey === "AwaitingPlanApproval" && proposal && (
                  <>
                    <button
                      onClick={() => act(() => approvePlan(proposal.card_id, boardName || undefined))}
                      disabled={acting}
                      className="text-[11px] px-2.5 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      Approve plan
                    </button>
                    <button
                      onClick={() => act(() => rejectPlan(proposal.card_id, undefined, boardName || undefined))}
                      disabled={acting}
                      className="text-[11px] px-2 py-1.5 rounded-md text-muted hover:text-text hover:bg-white/[0.04] disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
                {!["NeedsPlan", "AwaitingPlanApproval"].includes(phaseKey) && (phaseKey === "AwaitingMerge" || auto.counts.in_review > 0) && (
                  <button
                    onClick={() => act(() => runReview(boardName || undefined))}
                    disabled={acting}
                    className="text-[11px] px-2.5 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Run review
                  </button>
                )}
                {auto.agent_action && !auto.needs_human && (
                  <span className="text-[10px] text-muted">{auto.agent_action}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Board — the mockup's three quiet columns */}
        <div className="flex-1 min-h-0 overflow-x-auto px-5 pb-5">
          <div className="flex gap-3 h-full min-w-[720px]">
            {columns.map((col) => {
              const colCards = byColumn(col.id);
              return (
                <section
                  key={col.id}
                  className="flex-1 min-w-0 rounded-xl border border-border bg-surface flex flex-col"
                >
                  <div className="flex items-center justify-between px-4 pt-3.5 pb-2 shrink-0">
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                      {col.name}
                    </span>
                    <span className="text-[10px] font-mono text-muted/80">{colCards.length}</span>
                  </div>
                  <div className="px-2.5 pb-3 space-y-2 overflow-y-auto column-scroll min-h-[40px]">
                    {colCards.slice(0, 4).map((c) => (
                      <MindCard key={c.id} card={c} />
                    ))}
                    {colCards.length > 4 && (
                      <button
                        onClick={() => navigate("board")}
                        className="text-[11px] text-muted hover:text-accent transition-colors pl-1"
                      >
                        +{colCards.length - 4} more
                      </button>
                    )}
                    {colCards.length === 0 && (
                      <p className="text-[11px] text-muted/70 text-center py-4">No cards</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      <AgentRail
        agents={railAgents}
        next={nextText}
        onNext={onNext}
        replay={replay}
        onRestart={restart}
      />
    </div>
  );
}
