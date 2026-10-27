import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { agentColor } from "../lib/agents";
import { isReplayMode, restartReplay } from "../lib/replay";
import { cardPlanAndRun } from "../lib/api";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  active_tasks: string[];
  completed_tasks: string[];
  failed_tasks: string[];
  last_active?: string;
  last_heartbeat?: string;
  /** Not in the registry — a live session from an unregistered agent. */
  synthetic?: boolean;
}

interface Task {
  id: string;
  card_id: string;
  title: string;
  description: string;
  status: string;
  assigned_agent?: string;
  priority: string;
  created_at: string;
  /** Derived: still active on paper, but no agent heartbeat. */
  stalled?: boolean;
  last_seen?: string;
}

interface LiveSession {
  id: string;
  task_id?: string;
  title?: string;
  agent_id: string;
  backend: string;
  status: string;
  branch?: string;
  worktree_path?: string;
  pid?: number;
  started_at: string;
  last_heartbeat?: string;
  ended_at?: string;
  exit_code?: number;
  note?: string;
  fresh: boolean;
}

interface OrchStatus {
  status?: string;
  cycle_count?: number;
  tasks_dispatched?: number;
  tasks_completed?: number;
  tasks_failed?: number;
}

interface CycleResult {
  tasks_created?: number;
  tasks_dispatched?: number;
  insights?: string[];
}

interface Worker {
  key: string;
  session?: LiveSession;
  task?: Task;
  title: string;
  status: string;
  backend: string;
  branch?: string;
  startedAt?: string;
  endedAt?: string;
  note?: string;
  fresh: boolean;
  active: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  TechLead: "Tech lead",
  Developer: "Developer",
  Reviewer: "Reviewer",
  ScrumMaster: "Scrum master",
  ProductOwner: "Product owner",
  ProjectManager: "Project manager",
};

const ROLE_OPTIONS = [
  ["TechLead", "Tech lead"],
  ["Developer", "Developer"],
  ["Reviewer", "Reviewer"],
  ["ScrumMaster", "Scrum master"],
  ["ProductOwner", "Product owner"],
  ["ProjectManager", "Project manager"],
] as const;

function since(iso?: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function statusLabel(status: string): string {
  if (!status) return "unknown";
  if (status.toLowerCase() === "inprogress") return "in progress";
  return status.replace(/([A-Z])/g, " $1").trim();
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (/(fail|kill|error)/.test(s)) return "var(--danger)";
  if (/(merge|done|complete|pass|success)/.test(s)) return "var(--success)";
  if (/(stall|gate|warn|pause|blocked|need|input)/.test(s)) return "var(--warning)";
  if (/(run|work|progress|start|assign)/.test(s)) return "var(--accent-text)";
  if (/(cancel)/.test(s)) return "var(--muted)";
  return "var(--muted)";
}

function isOpenTask(task: Task): boolean {
  return task.status !== "Completed" && task.status !== "Cancelled";
}

function priorityColor(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "high") return "var(--priority-high)";
  if (p === "medium") return "var(--priority-med)";
  return "var(--priority-low)";
}

function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function isWorking(workers: Worker[]): boolean {
  return workers.some((worker) => worker.active);
}

/** Build the agent → subagent tree from registered agents, tasks, and live attempts. */
function buildWorkers(agent: Agent, sessions: LiveSession[], tasks: Task[]): Worker[] {
  const byTask = new Map(tasks.map((task) => [task.id, task]));
  const workers: Worker[] = [];
  const seenTasks = new Set<string>();

  const ownSessions = sessions
    .filter((session) => session.agent_id === agent.id && session.agent_id !== "merge-train")
    .sort((a, b) => Number(b.fresh) - Number(a.fresh) || b.started_at.localeCompare(a.started_at));

  for (const session of ownSessions) {
    const task = session.task_id ? byTask.get(session.task_id) : undefined;
    const active =
      session.fresh ||
      (task ? task.status === "InProgress" || task.status === "Assigned" : false);
    workers.push({
      key: session.id,
      session,
      task,
      title: task?.title || session.title || session.task_id || "Agent attempt",
      status: session.status,
      backend: session.backend,
      branch: session.branch,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      note: session.note,
      fresh: session.fresh,
      active,
    });
    if (session.task_id) seenTasks.add(session.task_id);
  }

  for (const taskId of agent.active_tasks ?? []) {
    if (seenTasks.has(taskId)) continue;
    const task = byTask.get(taskId);
    if (task && (task.status === "Completed" || task.status === "Failed")) continue;
    const active = !task || task.status === "InProgress" || task.status === "Assigned";
    workers.push({
      key: `${agent.id}-${taskId}`,
      task,
      title: task?.title || taskId,
      status: task?.status || "Assigned",
      backend: agent.id.toLowerCase().includes("human") ? "human" : "assigned",
      startedAt: task?.created_at,
      fresh: false,
      active,
    });
    seenTasks.add(taskId);
  }

  for (const task of tasks) {
    if (task.assigned_agent !== agent.id) continue;
    if (task.status !== "InProgress" && task.status !== "Assigned") continue;
    if (seenTasks.has(task.id)) continue;
    workers.push({
      key: `${agent.id}-${task.id}`,
      task,
      title: task.title,
      status: task.status,
      backend: agent.id.toLowerCase().includes("human") ? "human" : "assigned",
      startedAt: task.created_at,
      fresh: false,
      active: true,
    });
    seenTasks.add(task.id);
  }

  // Active attempts first, then freshest finished ones. Keep a session id
  // guard so a task that appears in multiple sources is only shown once.
  const unique = workers.filter(
    (worker, index) => workers.findIndex((w) => w.key === worker.key) === index
  );
  return unique.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      Number(b.fresh) - Number(a.fresh) ||
      (b.startedAt ?? "").localeCompare(a.startedAt ?? "")
  );
}

function Wave({ active, className = "" }: { active: boolean; className?: string }) {
  return (
    <span className={`agent-wave ${active ? "" : "is-idle"} ${className}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} />
      ))}
    </span>
  );
}

function StatusPill({ status, label }: { status: string; label?: string }) {
  const color = statusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-[2px] text-[8.5px] font-mono uppercase tracking-[0.08em]"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: color }} />
      {label ?? statusLabel(status)}
    </span>
  );
}

function MiniBars({ color = "var(--muted)" }: { color?: string }) {
  return (
    <span className="flex items-end gap-[2px] h-3" style={{ color }} aria-hidden="true">
      {[4, 7, 9, 6].map((height, i) => (
        <span key={i} className="w-[2px] rounded-sm" style={{ height, background: "currentColor", opacity: 0.65 - i * 0.1 }} />
      ))}
    </span>
  );
}

function StatTile({
  label,
  value,
  tone,
  hint,
  visual,
}: {
  label: string;
  value: number;
  tone: string;
  hint: string;
  visual: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2.5 flex items-center gap-3 min-w-0">
      <div className="text-[22px] leading-none font-semibold tabular-nums shrink-0" style={{ color: tone }}>
        {value}
      </div>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-[0.14em] text-muted">{label}</div>
        <div className="text-[9.5px] text-muted/70 truncate mt-0.5">{hint}</div>
      </div>
      <div className="ml-auto shrink-0">{visual}</div>
    </div>
  );
}

function WorkerRow({
  worker,
  replay,
  onStop,
}: {
  worker: Worker;
  replay: boolean;
  onStop: (session: LiveSession) => void;
}) {
  const statusTone = statusColor(worker.status);
  const canStop = Boolean(worker.session?.fresh && worker.session && !replay && !worker.session.id.startsWith("replay-"));
  return (
    <div className="relative">
      <span className="absolute -left-[11px] top-[15px] w-[11px] h-px bg-border" />
      <div
        className={`relative rounded-md border px-2.5 py-2 transition-colors ${
          worker.active
            ? "border-border/80 bg-surface/60"
            : "border-border/50 bg-transparent opacity-75"
        } ${worker.fresh ? "agent-scan" : ""}`}
        style={
          worker.fresh
            ? { borderColor: `color-mix(in srgb, ${statusTone} 28%, var(--border))` }
            : undefined
        }
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              background: statusTone,
              boxShadow: worker.fresh
                ? `0 0 0 3px color-mix(in srgb, ${statusTone} 12%, transparent)`
                : undefined,
            }}
          />
          <span className={`text-[11px] truncate ${worker.active ? "text-text" : "text-muted"}`}>
            {worker.title}
          </span>
          {canStop && worker.session && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStop(worker.session!);
              }}
              title="Stop this attempt"
              className="ml-auto p-0.5 rounded text-muted/70 hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <Icon name="stop" size={10} />
            </button>
          )}
          <span className={`${canStop ? "" : "ml-auto"} text-[8.5px] font-mono text-muted/80 uppercase shrink-0`}>
            {worker.backend}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 min-w-0 text-[9px] font-mono text-muted">
          <span className="inline-flex items-center gap-1 shrink-0" style={{ color: statusTone }}>
            <span className="w-1 h-1 rounded-full bg-current" />
            {statusLabel(worker.status)}
          </span>
          {worker.branch && (
            <span className="inline-flex items-center gap-1 min-w-0 truncate opacity-80">
              <Icon name="branch" size={9} />
              {worker.branch.replace(/^bark\//, "").replace(/^refs\/heads\//, "")}
            </span>
          )}
          <span className="ml-auto shrink-0 opacity-70">{worker.active ? since(worker.startedAt) : ""}</span>
        </div>
        {worker.note && (
          <div className="mt-1 text-[9px] text-muted/70 truncate">{worker.note}</div>
        )}
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  workers,
  brand,
  replay,
  removeArmed,
  onRemove,
  onStop,
}: {
  agent: Agent;
  workers: Worker[];
  brand: string | null;
  replay: boolean;
  removeArmed: boolean;
  onRemove: (agent: Agent) => void;
  onStop: (session: LiveSession) => void;
}) {
  const color = brand ?? "var(--accent)";
  const working = isWorking(workers);
  const active = workers.filter((worker) => worker.active);
  const shown = workers.slice(0, 4);
  const hidden = Math.max(0, workers.length - shown.length);
  const activeCount = active.length;
  const workerSeen = workers
    .map((worker) => worker.session?.last_heartbeat || worker.startedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop();
  const lastSeen = agent.last_heartbeat || agent.last_active || workerSeen;

  return (
    <article
      className="group relative overflow-hidden rounded-xl border bg-card transition-colors"
      style={{
        borderColor: working
          ? `color-mix(in srgb, ${color} 22%, var(--border))`
          : "var(--border)",
      }}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: working ? color : "var(--border)" }}
      />
      <header className="pl-4 pr-3 pt-3 pb-2 flex items-start gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-mono font-semibold shrink-0"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 13%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
          }}
        >
          {initials(agent.name) || <Icon name="robot" size={13} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-[12.5px] font-medium text-text truncate">{agent.name}</h3>
            {activeCount > 0 && (
              <span className="text-[9px] font-mono text-accent-text/90 shrink-0">
                {activeCount} {activeCount === 1 ? "subagent" : "subagents"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9.5px] text-muted">{ROLE_LABEL[agent.role] ?? agent.role}</span>
            <span className="text-muted/30">·</span>
            <span className={`text-[9.5px] ${working ? "text-accent-text" : "text-muted"}`}>
              {working ? "working" : "idle"}
            </span>
          </div>
        </div>
        <span className="mt-1 shrink-0" style={{ color: working ? color : "var(--muted)" }}>
          <Wave active={working} className={working ? "" : "text-muted/40"} />
        </span>
        {!agent.synthetic && (
          <button
            type="button"
            onClick={() => onRemove(agent)}
            title={removeArmed ? "Click again to remove" : "Remove agent"}
            aria-label={removeArmed ? "Confirm remove agent" : "Remove agent"}
            className={`ml-1 shrink-0 rounded text-muted/60 hover:text-danger transition-all ${
              removeArmed
                ? "px-1.5 py-0.5 text-[9px] bg-danger/10 text-danger opacity-100"
                : "p-1 opacity-0 group-hover:opacity-100"
            }`}
          >
            {removeArmed ? "remove?" : <Icon name="x" size={11} />}
          </button>
        )}
      </header>

      <div className="pl-4 pr-3 pb-2.5">
        {shown.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border/70 px-2.5 py-2 text-[10px] text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-muted/40" />
            Waiting for the next task
            <span className="ml-auto opacity-60">idle</span>
          </div>
        ) : (
          <div className="relative pl-[11px] space-y-1.5">
            <span className="absolute left-0 top-2 bottom-2 w-px bg-border/80" />
            {shown.map((worker) => (
              <WorkerRow
                key={worker.key}
                worker={worker}
                replay={replay}
                onStop={onStop}
              />
            ))}
            {hidden > 0 && (
              <div className="pl-[11px] text-[9px] font-mono text-muted/70">+{hidden} earlier attempts</div>
            )}
          </div>
        )}
      </div>

      <footer className="pl-4 pr-3 py-2 border-t border-border/60 flex items-center gap-3 text-[9px] text-muted">
        <span>{agent.completed_tasks?.length ?? 0} done</span>
        {(agent.failed_tasks?.length ?? 0) > 0 && (
          <span className="text-danger">{agent.failed_tasks.length} failed</span>
        )}
        <span className="text-muted/60">{activeCount} active</span>
        <span className="ml-auto flex items-center gap-1">
          <Icon name="clock" size={9} />
          {lastSeen
            ? since(lastSeen) === "just now"
              ? "just now"
              : `${since(lastSeen)} ago`
            : "never seen"}
        </span>
      </footer>
    </article>
  );
}

function RegisterAgentModal({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Developer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = async () => {
    if (!id.trim() || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id.trim(), name: name.trim(), role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Could not register this agent");
      }
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full bg-card border border-border rounded-md px-2.5 py-2 text-[12px] text-text placeholder:text-muted/50 outline-none focus:border-accent/70";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[16vh] px-4 bg-black/60 backdrop-blur-[2px]"
      onMouseDown={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Register agent"
    >
      <div
        className="w-full max-w-[380px] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="h-12 px-4 flex items-center gap-2 border-b border-border">
          <div className="w-6 h-6 rounded-md bg-accent-soft text-accent-text flex items-center justify-center">
            <Icon name="users" size={13} />
          </div>
          <div>
            <h2 className="text-[12.5px] font-medium text-text">Register agent</h2>
            <p className="text-[9.5px] text-muted">A name, a role, and a lane.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.05]"
            title="Close"
            aria-label="Close"
          >
            <Icon name="x" size={13} />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <label className="block">
            <span className="block text-[9px] uppercase tracking-[0.14em] text-muted mb-1">Agent id</span>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              className={field}
              placeholder="reviewer-2"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="block text-[9px] uppercase tracking-[0.14em] text-muted mb-1">Display name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
              placeholder="Reviewer 2"
            />
          </label>
          <label className="block">
            <span className="block text-[9px] uppercase tracking-[0.14em] text-muted mb-1">Role</span>
            <div className="relative">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={`${field} appearance-none cursor-pointer pr-8`}
              >
                {ROLE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Icon
                name="chevR"
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-muted pointer-events-none"
              />
            </div>
          </label>
          {error && <p className="text-[10.5px] text-danger">{error}</p>}
          <p className="text-[9.5px] text-muted/70 leading-relaxed">
            Agents appear in the orchestra and can be assigned to cards. Work runs in an isolated worktree.
          </p>
        </div>

        <footer className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-8 px-3 rounded-md border border-border text-[11px] text-muted hover:text-text disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!id.trim() || !name.trim() || busy}
            className="h-8 px-3.5 rounded-md bg-accent text-white text-[11px] font-medium hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? "Registering…" : "Register"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function QueueRow({
  task,
  onRetry,
  onAbandon,
  onDelete,
}: {
  task: Task;
  onRetry: (task: Task) => void;
  onAbandon: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const color = task.stalled ? "var(--warning)" : statusColor(task.status);
  const done = task.status === "Completed";
  return (
    <div
      className={`group rounded-md border px-2.5 py-2 transition-colors ${
        task.stalled
          ? "border-warning/25 bg-warning/[0.035]"
          : "border-transparent hover:border-border/80 hover:bg-card"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
        <span className={`text-[11px] truncate ${done ? "text-muted line-through" : "text-text"}`}>
          {task.title}
        </span>
        {task.stalled && (
          <span className="text-[8px] font-mono uppercase tracking-wide text-warning shrink-0">stalled</span>
        )}
        <button
          type="button"
          onClick={() => onDelete(task)}
          title="Delete task"
          aria-label="Delete task"
          className="ml-auto p-0.5 rounded text-muted/50 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <Icon name="x" size={10} />
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[9px] text-muted min-w-0">
        <span
          className="font-mono font-semibold shrink-0"
          style={{ color: priorityColor(task.priority) }}
          title={`${task.priority} priority`}
        >
          {task.priority.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate">{task.assigned_agent || "unassigned"}</span>
        <span className="text-muted/40">·</span>
        <span className="shrink-0">{since(task.created_at)}</span>
        {task.stalled && (
          <span className="ml-auto shrink-0 text-warning/80">no heartbeat</span>
        )}
      </div>
      {task.stalled && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onRetry(task)}
            className="h-6 px-2 rounded border border-accent/35 text-accent-text text-[9.5px] hover:bg-accent-soft"
          >
            retry
          </button>
          <button
            type="button"
            onClick={() => onAbandon(task)}
            className="h-6 px-2 rounded border border-border text-muted text-[9.5px] hover:text-warning"
          >
            abandon
          </button>
          <span className="ml-auto text-[9px] text-warning/70">
            seen {since(task.last_seen || task.created_at)}
          </span>
        </div>
      )}
    </div>
  );
}

export function OrchestrateView({ boardName }: { boardName: string | null }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [live, setLive] = useState<LiveSession[]>([]);
  const [status, setStatus] = useState<OrchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<"open" | "pending" | "done">("open");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [removeArmed, setRemoveArmed] = useState<string | null>(null);
  const [cycleBusy, setCycleBusy] = useState(false);
  const [cycleResult, setCycleResult] = useState<CycleResult | null>(null);
  const alive = useRef(true);
  const replay = isReplayMode();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      const [agentsRes, tasksRes, statusRes, liveRes] = await Promise.all([
        fetch("/api/agents").then((r) => r.json()).catch(() => null),
        fetch(`/api/tasks${boardName ? `?name=${encodeURIComponent(boardName)}` : ""}`)
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/orchestrate/status").then((r) => r.json()).catch(() => null),
        fetch("/api/run/live").then((r) => r.json()).catch(() => null),
      ]);
      if (!alive.current) return;

      if (agentsRes && Array.isArray((agentsRes as { agents?: Agent[] }).agents)) {
        setAgents((agentsRes as { agents: Agent[] }).agents);
      }
      if (tasksRes && Array.isArray((tasksRes as { tasks?: Task[] }).tasks)) {
        setTasks((tasksRes as { tasks: Task[] }).tasks);
      }
      if (statusRes) setStatus(statusRes as OrchStatus);
      if (liveRes && Array.isArray((liveRes as { sessions?: LiveSession[] }).sessions)) {
        setLive((liveRes as { sessions: LiveSession[] }).sessions);
      }
      if (!agentsRes && !tasksRes && !liveRes) {
        setError("The board server is not answering. Reconnecting…");
      } else {
        setError(null);
      }
      setLoading(false);
    },
    [boardName]
  );

  useEffect(() => {
    load(true);
    const timer = window.setInterval(() => load(false), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  const agentCards = useMemo(() => {
    const cards = agents.map((agent) => ({
      agent,
      workers: buildWorkers(agent, live, tasks),
    }));
    const known = new Set(agents.map((agent) => agent.id));
    for (const session of live) {
      if (session.agent_id === "merge-train" || known.has(session.agent_id)) continue;
      known.add(session.agent_id);
      const synthetic: Agent = {
        id: session.agent_id,
        name: session.agent_id,
        role: "Worker",
        status: session.fresh ? "Working" : "Idle",
        active_tasks: [],
        completed_tasks: [],
        failed_tasks: [],
        synthetic: true,
      };
      cards.push({ agent: synthetic, workers: buildWorkers(synthetic, live, tasks) });
    }
    return cards.sort(
      (a, b) =>
        Number(isWorking(b.workers)) - Number(isWorking(a.workers)) ||
        a.agent.name.localeCompare(b.agent.name)
    );
  }, [agents, live, tasks]);

  const workingCount = agentCards.filter((card) => isWorking(card.workers)).length;
  const idleCount = agentCards.length - workingCount;
  const openTasks = tasks.filter(isOpenTask);
  const pendingCount = tasks.filter((task) => task.status === "Pending").length;
  const doneCount = tasks.filter((task) => task.status === "Completed").length;
  const stalled = tasks.filter((task) => task.stalled);
  const mergeSession = live.find((session) => session.agent_id === "merge-train");
  const mergedSessions = live.filter((session) => /merge|pass/i.test(session.status));
  const freshCount = live.filter((session) => session.fresh).length;

  const queueTasks = useMemo(() => {
    const rank = (task: Task) => {
      if (task.stalled) return 0;
      if (
        task.status === "Failed" ||
        task.status === "Blocked" ||
        task.status === "NeedsInput"
      ) {
        return 1;
      }
      if (task.status === "InProgress") return 2;
      if (task.status === "Assigned") return 3;
      if (task.status === "Pending") return 4;
      return 5;
    };
    return tasks
      .filter((task) => {
        if (queueFilter === "open") return isOpenTask(task);
        if (queueFilter === "pending") return task.status === "Pending";
        return task.status === "Completed";
      })
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }, [tasks, queueFilter]);

  const onRemove = (agent: Agent) => {
    if (agent.synthetic) return;
    if (removeArmed !== agent.id) {
      setRemoveArmed(agent.id);
      window.setTimeout(() => {
        setRemoveArmed((current) => (current === agent.id ? null : current));
      }, 2800);
      return;
    }
    setRemoveArmed(null);
    fetch(`/api/agents/${encodeURIComponent(agent.id)}`, { method: "DELETE" })
      .then(() => load(false))
      .catch(() => setActionError("Could not remove that agent."));
  };

  const onStop = async (session: LiveSession) => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(session.id)}/stop`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("stop failed");
      await load(false);
    } catch {
      setActionError("Could not stop that attempt.");
    }
  };

  const onRetry = async (task: Task) => {
    if (!task.card_id) return;
    try {
      await cardPlanAndRun(task.card_id, undefined, boardName || undefined);
      await load(false);
    } catch {
      setActionError("Could not dispatch a retry.");
    }
  };

  const onAbandon = async (task: Task) => {
    try {
      await fetch(`/api/tasks/${encodeURIComponent(task.id)}/fail`, { method: "POST" });
      await load(false);
    } catch {
      setActionError("Could not abandon that task.");
    }
  };

  const onDeleteTask = async (task: Task) => {
    try {
      await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      await load(false);
    } catch {
      setActionError("Could not delete that task.");
    }
  };

  const runCycle = async () => {
    if (cycleBusy) return;
    setCycleBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/orchestrate/cycle", { method: "POST" });
      if (!res.ok) throw new Error("cycle failed");
      setCycleResult(await res.json());
      await load(false);
    } catch {
      setActionError("The orchestration cycle could not run.");
    } finally {
      setCycleBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="h-[68px] border-b border-border/70 px-4 flex items-center">
          <div className="h-3 w-28 rounded bg-surface animate-pulse" />
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 p-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
        <div className="flex-1 p-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(286px, 1fr))" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 pt-3.5 pb-3 border-b border-border/70 shrink-0">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-medium text-text">Agents</h2>
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted">
                <span className="relative flex h-1.5 w-1.5">
                  {workingCount > 0 && (
                    <span className="absolute inline-flex h-full w-full rounded-full bg-success agent-ping" />
                  )}
                  <span
                    className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                      workingCount > 0 ? "bg-success" : "bg-muted/50"
                    }`}
                  />
                </span>
                {workingCount} working
              </span>
            </div>
            <p className="text-[11px] text-muted mt-1">
              Agents and subagents, live from the board.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={runCycle}
              disabled={cycleBusy}
              className="h-8 px-3 rounded-md border border-border text-[11.5px] text-muted hover:text-text hover:border-border-strong flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <Icon name="cycle" size={12} />
              {cycleBusy ? "Running…" : "Run cycle"}
            </button>
            <button
              type="button"
              onClick={() => setRegisterOpen(true)}
              className="h-8 px-3 rounded-md bg-accent text-white text-[11.5px] font-medium hover:bg-accent-hover flex items-center gap-1.5"
            >
              <Icon name="users" size={12} />
              Register
            </button>
          </div>
        </div>

        {replay && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-accent/20 bg-accent-soft px-2.5 py-1.5 text-[10px] text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span>Replaying a recorded 3-agent run</span>
            <button
              type="button"
              onClick={() => {
                restartReplay();
                load(false);
              }}
              className="ml-auto text-accent-text hover:text-accent"
            >
              restart
            </button>
          </div>
        )}

        {(error || actionError) && (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-danger">
            <Icon name="warn" size={11} />
            <span>{actionError || error}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setActionError(null);
              }}
              className="ml-auto text-muted hover:text-text"
              aria-label="Dismiss"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 px-4 py-3 border-b border-border/70 shrink-0">
        <StatTile
          label="Working"
          value={workingCount}
          tone="var(--accent)"
          hint={`${freshCount} live ${freshCount === 1 ? "attempt" : "attempts"}`}
          visual={<Wave active={workingCount > 0} className="text-accent" />}
        />
        <StatTile
          label="Queued"
          value={pendingCount}
          tone="var(--text)"
          hint="waiting for a slot"
          visual={<MiniBars color="var(--muted-strong)" />}
        />
        <StatTile
          label="Idle"
          value={idleCount}
          tone="var(--muted-strong)"
          hint="ready to claim"
          visual={
            <span className="flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full border border-muted-strong/40" />
              ))}
            </span>
          }
        />
        <StatTile
          label="Stalled"
          value={stalled.length}
          tone={stalled.length ? "var(--warning)" : "var(--muted)"}
          hint={stalled.length ? "needs a decision" : "all leases fresh"}
          visual={
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{
                color: stalled.length ? "var(--warning)" : "var(--success)",
                background: stalled.length
                  ? "color-mix(in srgb, var(--warning) 10%, transparent)"
                  : "color-mix(in srgb, var(--success) 10%, transparent)",
              }}
            >
              <Icon name={stalled.length ? "warn" : "check"} size={12} />
            </span>
          }
        />
      </div>

      <div className="flex-1 flex flex-col xl:flex-row min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 space-y-3">
            {mergeSession && (
              <div
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
                style={{
                  borderColor: "color-mix(in srgb, var(--success) 25%, var(--border))",
                  background: "color-mix(in srgb, var(--success) 6%, transparent)",
                }}
              >
                <span className="w-5 h-5 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                  <Icon name="check" size={11} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-success">Merge train</div>
                  <div className="text-[9.5px] text-muted truncate">
                    {mergeSession.note || "Branches are landing"}
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap gap-1">
                  {mergedSessions.slice(0, 3).map((session) => (
                    <span
                      key={session.id}
                      className="text-[9px] font-mono px-1.5 py-[2px] rounded bg-success/10 text-success"
                    >
                      {session.backend}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {agentCards.length === 0 ? (
              <div className="h-[260px] flex flex-col items-center justify-center gap-3 text-center">
                <span className="w-12 h-12 rounded-full bg-accent-soft text-accent-text flex items-center justify-center">
                  <Icon name="users" size={22} />
                </span>
                <div>
                  <p className="text-[13px] text-text">No agents in the orchestra</p>
                  <p className="text-[11px] text-muted mt-1">Register one, or run a cycle and let the board assign work.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRegisterOpen(true)}
                    className="h-8 px-3 rounded-md bg-accent text-white text-[11.5px] hover:bg-accent-hover"
                  >
                    Register agent
                  </button>
                  <button
                    type="button"
                    onClick={runCycle}
                    className="h-8 px-3 rounded-md border border-border text-[11.5px] text-text hover:border-border-strong"
                  >
                    Run a cycle
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="grid gap-3 items-start"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(286px, 1fr))" }}
              >
                {agentCards.map(({ agent, workers }) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    workers={workers}
                    brand={agentColor(agent.id, agent.name)}
                    replay={replay}
                    removeArmed={removeArmed === agent.id}
                    onRemove={onRemove}
                    onStop={onStop}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="xl:w-[340px] border-t xl:border-t-0 xl:border-l border-border/70 flex flex-col min-h-0 max-h-[42%] xl:max-h-none bg-surface/20 shrink-0">
          <div className="h-11 px-3 flex items-center gap-2 border-b border-border/70 shrink-0">
            <h3 className="text-[12px] font-medium text-text">Queue</h3>
            <span className="text-[9.5px] font-mono text-muted">{openTasks.length}</span>
            <button
              type="button"
              onClick={() => load(false)}
              className="ml-auto p-1 rounded text-muted hover:text-text hover:bg-white/[0.04]"
              title="Refresh"
              aria-label="Refresh queue"
            >
              <Icon name="refresh" size={12} />
            </button>
          </div>
          <div className="h-9 px-2 flex items-center gap-1 border-b border-border/70 shrink-0">
            {(
              [
                { id: "open", label: "Open", count: openTasks.length },
                { id: "pending", label: "Pending", count: pendingCount },
                { id: "done", label: "Done", count: doneCount },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setQueueFilter(filter.id)}
                className={`h-6 px-2 rounded-md text-[10.5px] transition-colors inline-flex items-center gap-1 ${
                  queueFilter === filter.id
                    ? "bg-accent-soft text-accent-text"
                    : "text-muted hover:text-text"
                }`}
              >
                {filter.label}
                <span className="text-[9px] font-mono opacity-60">{filter.count}</span>
              </button>
            ))}
            {stalled.length > 0 && (
              <span className="ml-auto text-[9px] font-mono text-warning">{stalled.length} stalled</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
            {queueTasks.length === 0 ? (
              <div className="h-full min-h-[120px] flex flex-col items-center justify-center gap-2 text-center px-4">
                <span className="w-8 h-8 rounded-full bg-white/[0.03] text-muted flex items-center justify-center">
                  <Icon name="inbox" size={14} />
                </span>
                <p className="text-[10.5px] text-muted">
                  {queueFilter === "done" ? "Nothing finished yet" : "The queue is clear"}
                </p>
              </div>
            ) : (
              queueTasks.map((task) => (
                <QueueRow
                  key={task.id}
                  task={task}
                  onRetry={onRetry}
                  onAbandon={onAbandon}
                  onDelete={onDeleteTask}
                />
              ))
            )}
          </div>
          <div className="border-t border-border/70 p-3 shrink-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[9px] uppercase tracking-[0.14em] text-muted">Orchestration</span>
              <span className="text-[9px] font-mono text-muted/60">{status?.status || "idle"}</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[
                { label: "cycles", value: status?.cycle_count ?? 0, color: "var(--text)" },
                { label: "sent", value: status?.tasks_dispatched ?? 0, color: "var(--muted-strong)" },
                { label: "done", value: status?.tasks_completed ?? 0, color: "var(--success)" },
                { label: "failed", value: status?.tasks_failed ?? 0, color: "var(--danger)" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-[12px] font-mono tabular-nums" style={{ color: stat.color }}>
                    {stat.value}
                  </div>
                  <div className="text-[8px] uppercase tracking-wide text-muted">{stat.label}</div>
                </div>
              ))}
            </div>
            {cycleResult && (
              <div className="mt-2 rounded-md border border-border/70 bg-card px-2 py-1.5 text-[9.5px] text-muted">
                <span className="text-text">{cycleResult.tasks_created ?? 0}</span> created ·{" "}
                <span className="text-text">{cycleResult.tasks_dispatched ?? 0}</span> dispatched
                {cycleResult.insights?.slice(0, 1).map((insight, index) => (
                  <div key={index} className="mt-1 text-accent-text truncate">
                    {insight}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {registerOpen && (
        <RegisterAgentModal
          onClose={() => setRegisterOpen(false)}
          onRegistered={() => {
            setRegisterOpen(false);
            load(false);
          }}
        />
      )}
    </div>
  );
}
