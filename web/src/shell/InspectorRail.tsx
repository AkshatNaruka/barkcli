import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { fetchThreads } from "../lib/api";
import type { ThreadSummary } from "../lib/types";
import type { Surface } from "../lib/surfaces";

interface LiveTask {
  id: string;
  title: string;
  status: string;
  stalled?: boolean;
  last_seen?: string;
  assigned_agent?: string;
}

interface LiveAttempt {
  id: string;
  task_id?: string;
  title?: string;
  agent_id: string;
  backend: string;
  status: string;
  started_at: string;
  last_heartbeat?: string;
  fresh: boolean;
}

interface AttentionItem {
  key: string;
  title: string;
  tone: "success" | "warning" | "accent";
  label: string;
  at: string;
  meta?: string;
  target: Surface;
}

function ago(iso?: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Persistent right rail. It answers one question at a glance: what is alive,
 * what is stuck, and what needs a human. No tabs, no configuration.
 */
export function InspectorRail({
  boardName,
  collapsed,
  onToggle,
  onNavigate,
}: {
  boardName: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (s: Surface) => void;
}) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [tasks, setTasks] = useState<LiveTask[]>([]);
  const [attempts, setAttempts] = useState<LiveAttempt[]>([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const qs = boardName ? `?name=${encodeURIComponent(boardName)}` : "";
      Promise.all([
        fetchThreads(boardName || undefined),
        fetch(`/api/tasks${qs}`)
          .then((r) => (r.ok ? r.json() : { tasks: [] }))
          .then((d) => (d.tasks || []) as LiveTask[])
          .catch(() => [] as LiveTask[]),
        fetch("/api/run/live")
          .then((r) => (r.ok ? r.json() : { sessions: [] }))
          .then((d) => (d.sessions || []) as LiveAttempt[])
          .catch(() => [] as LiveAttempt[]),
      ])
        .then(([list, taskList, liveList]) => {
          if (!cancelled) {
            setThreads(list);
            setTasks(taskList);
            setAttempts(liveList);
            setOnline(true);
          }
        })
        .catch(() => {
          if (!cancelled) setOnline(false);
        });
    };
    load();
    const id = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [boardName]);

  const { running, stalled, needs, stalledTasks, liveAttempts, liveCount } = useMemo(() => {
    const liveAttempts = attempts
      .filter((attempt) => attempt.fresh && attempt.agent_id !== "merge-train")
      .map((attempt) => ({
        ...attempt,
        title:
          tasks.find((task) => task.id === attempt.task_id)?.title ||
          attempt.title ||
          attempt.task_id ||
          "Agent attempt",
      }));
    const liveTitles = new Set(
      liveAttempts.map((attempt) => attempt.title || "").filter(Boolean)
    );
    const runningThreads = threads.filter(
      (thread) =>
        thread.status_group === "running" && !liveTitles.has(thread.title)
    );
    return {
      running: runningThreads,
      stalled: threads.filter((t) => t.status_group === "stalled"),
      needs: threads.filter((t) => t.status_group === "needs_you"),
      stalledTasks: tasks.filter((t) => t.stalled),
      liveAttempts,
      liveCount: runningThreads.length + liveAttempts.length,
    };
  }, [threads, tasks, attempts]);

  const attention: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = stalledTasks.map((t) => ({
      key: `task-${t.id}`,
      title: t.title,
      tone: "warning",
      label: "stalled task",
      at: t.last_seen || "",
      meta: t.assigned_agent,
      target: "agents",
    }));

    for (const t of stalled) {
      if (!items.some((i) => i.title === t.title)) {
        items.push({
          key: `thread-${t.id}`,
          title: t.title,
          tone: "warning",
          label: "stalled",
          at: t.last_seen || t.updated_at,
          meta: t.backend,
          target: "chat",
        });
      }
    }
    for (const t of needs) {
      items.push({
        key: `need-${t.id}`,
        title: t.title,
        tone: "accent",
        label: "needs you",
        at: t.last_seen || t.updated_at,
        meta: t.backend,
        target: "chat",
      });
    }
    for (const attempt of liveAttempts) {
      const title = attempt.title || attempt.task_id || "Agent attempt";
      if (!items.some((item) => item.title === title)) {
        items.push({
          key: `live-${attempt.id}`,
          title,
          tone: "success",
          label: "running",
          at: attempt.last_heartbeat || attempt.started_at,
          meta: attempt.backend,
          target: "agents",
        });
      }
    }
    for (const t of running) {
      items.push({
        key: `run-${t.id}`,
        title: t.title,
        tone: "success",
        label: "running",
        at: t.last_seen || t.updated_at,
        meta: t.backend,
        target: "chat",
      });
    }
    return items.slice(0, 6);
  }, [stalledTasks, stalled, needs, running, liveAttempts]);

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        title="Open inspector"
        className="w-9 shrink-0 border-l border-border bg-surface/30 flex flex-col items-center py-3 gap-3 text-muted hover:text-text transition-colors"
      >
        <Icon name="chevL" size={14} />
        <span className="text-[9px] uppercase tracking-[0.2em] [writing-mode:vertical-rl]">Now</span>
        {liveCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
      </button>
    );
  }

  const stalledCount = stalled.length + stalledTasks.length;

  return (
    <aside className="w-[288px] shrink-0 border-l border-border bg-surface/30 flex flex-col min-h-0">
      <header className="flex items-center justify-between px-3.5 h-10 shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              online ? (liveCount > 0 ? "bg-success animate-pulse" : "bg-success/60") : "bg-danger"
            }`}
          />
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-strong">Now</span>
        </div>
        <button
          onClick={onToggle}
          title="Collapse inspector"
          className="text-muted hover:text-text p-1 rounded hover:bg-white/[0.04]"
        >
          <Icon name="chevR" size={13} />
        </button>
      </header>

      <div className="px-3 grid grid-cols-3 gap-1.5 shrink-0">
        <Stat label="Live" value={liveCount} tone="success" />
        <Stat label="Stalled" value={stalledCount} tone="warning" />
        <Stat label="Action" value={needs.length} tone="accent" />
      </div>

      <div className="px-3.5 pt-5 pb-2 flex items-center justify-between shrink-0">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Attention</span>
        <span className="text-[10px] font-mono text-muted/70">{attention.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 min-h-0">
        {attention.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <div className="mx-auto w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted mb-2">
              <Icon name="check" size={14} />
            </div>
            <p className="text-[11px] text-muted">Nothing is running.</p>
            <button
              onClick={() => onNavigate("chat")}
              className="mt-2 text-[11px] text-accent-text hover:text-accent"
            >
              Describe the next outcome →
            </button>
          </div>
        ) : (
          attention.map((t) => {
            const tone =
              t.tone === "warning" ? "bg-warning" : t.tone === "accent" ? "bg-accent" : "bg-success";
            return (
              <button
                key={t.key}
                onClick={() => onNavigate(t.target)}
                className="w-full text-left rounded-md px-2 py-2 hover:bg-white/[0.04] transition-colors group"
                title={t.target === "agents" ? "Open Agents to retry or abandon" : "Open chat"}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone} ${t.label === "running" ? "animate-pulse" : ""}`} />
                  <span className="text-[12.5px] text-text truncate flex-1">{t.title}</span>
                  <span className="text-[10px] font-mono text-muted/80 shrink-0">{ago(t.at)}</span>
                </div>
                <div className="pl-3.5 mt-0.5 flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted/80">{t.label}</span>
                  {t.meta && <span className="text-[10px] font-mono text-muted/60">{t.meta}</span>}
                </div>
              </button>
            );
          })
        )}
      </div>

      <footer className="p-2.5 border-t border-border/70 shrink-0 grid grid-cols-2 gap-1.5">
        <button
          onClick={() => onNavigate("board")}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-card/40 px-2 py-1.5 text-[11px] text-muted-strong hover:text-text hover:border-border-strong transition-colors"
        >
          <Icon name="board" size={12} /> Board
        </button>
        <button
          onClick={() => onNavigate("agents")}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-card/40 px-2 py-1.5 text-[11px] text-muted-strong hover:text-text hover:border-border-strong transition-colors"
        >
          <Icon name="users" size={12} /> Agents
        </button>
      </footer>
    </aside>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "accent" }) {
  const color =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-accent-text";
  return (
    <div className="rounded-md border border-border/70 bg-card/30 px-2 py-1.5">
      <div className={`text-[18px] leading-none font-mono tabular-nums ${value > 0 ? color : "text-muted/50"}`}>
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-muted/80">{label}</div>
    </div>
  );
}
