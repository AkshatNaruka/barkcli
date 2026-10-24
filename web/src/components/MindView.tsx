import React, { useState, useEffect, useCallback } from "react";
import { connectWs, fetchAutopilotStatus, submitIntent, proposePlan, approvePlan, rejectPlan, runReview } from "../lib/api";
import type { AutopilotStatus, PlanProposal } from "../lib/api";
import type { Board, Card } from "../lib/types";
import { navigate } from "../lib/hashnav";
import { Icon } from "./Icon";
import { Lozenge } from "./Lozenge";
import { PriorityBadge } from "./PriorityBadge";
import { LabelChip } from "./LabelChip";

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
  return Boolean(c.blocked_by) || c.links.some((l) => l.ty === "blocked-by");
}

// ── Band: a labelled section of the one-screen control center ──

function Band({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function ManageTile({ label, value, active, danger, title, onClick }: {
  label: string; value: number | null; active?: boolean; danger?: boolean; title?: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title || label}
      className={`flex-1 rounded-lg px-3 py-2.5 text-left transition-colors ${
        active
          ? "bg-accent-soft ring-1 ring-accent/20"
          : "bg-card hover:bg-[color-mix(in_srgb,var(--card-hover)_70%,var(--surface))]"
      }`}
    >
      <div className={`text-lg font-semibold leading-none ${danger ? "text-danger" : active ? "text-accent" : "text-text"}`}>
        {value === null ? "—" : value}
      </div>
      <div className={`text-[11px] mt-1.5 ${active ? "text-accent" : "text-muted"}`}>{label}</div>
    </button>
  );
}

// Mini status lozenge per column: doing → in progress, review → review, blocked always wins.
function miniStatus(c: Card): { tone: "blue" | "amber" | "red"; label: string } | null {
  if (isBlocked(c)) return { tone: "red", label: "Blocked" };
  if (c.column === "doing") return { tone: "blue", label: "In progress" };
  if (c.column === "review") return { tone: "amber", label: "Review" };
  return null;
}

function MiniCard({ card }: { card: Card }) {
  const status = miniStatus(card);
  const bug = card.labels.includes("bug");
  return (
    <button
      onClick={() => navigate("board")}
      title={`${card.id} — open on the board`}
      className="w-full text-left bg-card rounded-md px-2.5 py-2 border border-transparent hover:border-border transition-colors group"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-xs text-text truncate group-hover:text-accent transition-colors">{card.title}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        {card.priority !== "low" && <PriorityBadge priority={card.priority} />}
        {bug && <LabelChip name="bug" />}
        {status && <Lozenge tone={status.tone}>{status.label}</Lozenge>}
        {card.spec_id && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-accent-text" title={`Spec: ${card.spec_id}`}>
            <Icon name="link" size={10} />
            {card.spec_id}
          </span>
        )}
      </div>
    </button>
  );
}

function MiniColumn({ name, cards }: { name: string; cards: Card[] }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted mb-1.5">
        {name}
        <span className="text-muted/70 normal-case">{cards.length}</span>
      </div>
      <div className="space-y-1.5">
        {cards.slice(0, 3).map((c) => <MiniCard key={c.id} card={c} />)}
        {cards.length > 3 && (
          <button onClick={() => navigate("board")} className="text-[11px] text-muted hover:text-accent transition-colors pl-1">
            +{cards.length - 3} more
          </button>
        )}
      </div>
    </div>
  );
}

// ── Agent rows: who is driving, on what ──

const AGENT_DOT: Record<string, string> = {
  Working: "bg-success animate-pulse",
  Idle: "bg-muted",
  Paused: "bg-warning",
};

function AgentRow({ agent, work, sessions }: { agent: AgentRec; work: string | null; sessions: any[] }) {
  const last = sessions.find((s) => s.agent === agent.id);
  const text = work || (last ? last.summary : null) || "—";
  return (
    <button
      onClick={() => navigate("orchestrate")}
      title={`${agent.id} — ${agent.role || "agent"} · ${agent.status}`}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-card hover:bg-[color-mix(in_srgb,var(--card-hover)_70%,var(--surface))] transition-colors text-left"
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${AGENT_DOT[agent.status] || "bg-warning"}`} />
      <span className="text-xs font-mono text-text shrink-0">{agent.name}</span>
      <span className="text-xs text-muted truncate min-w-0">{text}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted ml-auto shrink-0">{agent.status}</span>
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

  // ── Derived view model — board prop is authoritative for the Build band;
  // the mind snapshot adds server-computed attention + next actions.
  const cards = board?.cards || [];
  const open = cards.filter((c) => c.column !== "done");
  const blockers = snap?.blockers ?? open.filter(isBlocked).map((c) => ({
    card_id: c.id, title: c.title, column: c.column,
    blocked_by: c.blocked_by ? [c.blocked_by] : c.links.filter((l) => l.ty === "blocked-by").map((l) => l.target),
  }));
  const weekAgo = Date.now() - 7 * 86400000;
  const stale = snap?.stale_cards ?? open
    .filter((c) => Date.parse(c.updated_at || "") < weekAgo)
    .map((c) => ({ id: c.id, title: c.title, column: c.column, days: Math.floor((Date.now() - Date.parse(c.updated_at || "")) / 86400000) }));
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

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 pb-3 space-y-4 max-w-4xl w-full mx-auto">
        {/* Command row — the human's steering wheel */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted min-w-0">
            <span className="font-medium text-text">Mind</span>
            <span className="truncate">{boardTitle}</span>
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

        {/* Manage — the three core surfaces, counts as the content */}
        <Band label="Manage">
          <div className="flex flex-wrap gap-2">
            <ManageTile
              label="Mind"
              value={blockers.length}
              active
              danger={blockers.length > 0}
              title={blockers.length > 0 ? `${blockers.length} blocked · ${stale.length} stale 7d+` : stale.length > 0 ? `${stale.length} stale 7d+` : "Nothing needs attention"}
              onClick={() => { setSyncing(true); load(); setSyncing(false); }}
            />
            <ManageTile
              label="Board"
              value={open.length}
              title={`${byColumn("todo").length} todo · ${byColumn("doing").length} doing · ${byColumn("review").length} review`}
              onClick={() => navigate("board")}
            />
            <ManageTile
              label="Specs"
              value={specs.length || null}
              title={`${specs.length} specification(s) — requirements, acceptance criteria, traceability`}
              onClick={() => navigate("specs")}
            />
          </div>
        </Band>

        {/* Build — the live work: who's driving + the doing columns */}
        <Band
          label="Build"
          right={
            <button onClick={() => navigate("orchestrate")} className="text-[11px] text-muted hover:text-accent transition-colors">
              Agents · {agents.length}
            </button>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MiniColumn name="Todo" cards={byColumn("todo")} />
            <MiniColumn name="Doing" cards={byColumn("doing")} />
          </div>
          {open.length === 0 && (
            <p className="text-xs text-muted">Board is clear — queue the next intent above.</p>
          )}
        </Band>

        {/* Review — cards waiting on a human decision */}
        {byColumn("review").length > 0 && (
          <Band label="Review">
            <div className="space-y-1.5">
              {byColumn("review").slice(0, 3).map((c) => <MiniCard key={c.id} card={c} />)}
              {byColumn("review").length > 3 && (
                <button onClick={() => navigate("board")} className="text-[11px] text-muted hover:text-accent transition-colors pl-1">
                  +{byColumn("review").length - 3} more
                </button>
              )}
            </div>
          </Band>
        )}

        {/* Agents — live roster; falls back to recent sessions when none registered */}
        {(agents.length > 0 || snap?.recent_sessions?.length) && (
          <Band label="Agents">
            <div className="space-y-1.5">
              {agents.length > 0
                ? agents.filter(a => a.status !== "Evicted").slice(0, 5).map((a) => (
                    <AgentRow key={a.id} agent={a} work={agentWork(a)} sessions={snap?.recent_sessions || []} />
                  ))
                : (snap?.recent_sessions || []).slice(0, 3).map((s, i) => (
                    <button
                      key={i}
                      onClick={() => navigate("orchestrate")}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-card hover:bg-[color-mix(in_srgb,var(--card-hover)_70%,var(--surface))] transition-colors text-left"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-muted shrink-0" />
                      <span className="text-xs font-mono text-text shrink-0">{s.agent}</span>
                      <span className="text-xs text-muted truncate min-w-0">{s.summary}</span>
                    </button>
                  ))}
            </div>
          </Band>
        )}
      </div>

      {/* Next — the one action that moves the loop; click dispatches/copies */}
      <div className="shrink-0 border-t border-border bg-surface/70 backdrop-blur px-4 py-2">
        <button
          onClick={onNext}
          title={nextReason || "Nothing queued"}
          className="max-w-4xl mx-auto w-full flex items-center gap-2 text-left group min-w-0"
        >
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent shrink-0">
            <Icon name="arrowFlat" size={12} /> Next
          </span>
          {nextText ? (
            <>
              <span className="text-xs text-text truncate group-hover:text-accent transition-colors">{nextText}</span>
              {nextReason && <span className="text-[11px] text-muted truncate hidden sm:inline"> · {nextReason}</span>}
            </>
          ) : (
            <span className="text-xs text-muted truncate">nothing queued — add an intent above</span>
          )}
          {nextCommands.length > 1 && (
            <span className="ml-auto text-[10px] text-muted shrink-0 hidden md:inline" title={nextCommands.join("\n")}>
              +{nextCommands.length - 1} actions
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
