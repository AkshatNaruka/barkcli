// ── Recorded-run replay ──
// The static web app (GitHub Pages) has no `barkcli serve` backend, so the
// Orchestrate view can't show a real in-flight `barkcli run`. This module
// replays a recorded 3-agent run as a pure function of elapsed time: the same
// `/api/run/live` shape, the same task-status transitions, no backend.
//
// Activation: `?run=replay` (or `?replay=1`). The landing page links to
// `/app/?run=replay#/orchestrate`; normal demo usage is untouched.
//
// Timeline (loops every 96s):
//   0s        3 agents start in their own worktrees
//   16s/19s   codex:    gate passes → merged
//   26s/29s   claude:   gate passes → merged
//   38s/41s   opencode: gate passes → merged
//   43s       merge train: 3/3 branches landed in finish order

export interface ReplaySession {
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

interface WorkerSpec {
  id: string;
  agent_id: string;
  backend: string;
  task_id: string;
  title: string;
  branch: string;
  gateAt: number;
  mergedAt: number;
  tests: number;
}

const WORKERS: WorkerSpec[] = [
  {
    id: "codex", agent_id: "codex-1", backend: "codex",
    task_id: "task-8", title: "OAuth callback tests",
    branch: "bark/oauth-callback-tests", gateAt: 16_000, mergedAt: 19_000, tests: 9,
  },
  {
    id: "claude", agent_id: "claude-2", backend: "claude-code",
    task_id: "task-2", title: "Token storage",
    branch: "bark/token-store", gateAt: 26_000, mergedAt: 29_000, tests: 14,
  },
  {
    id: "opencode", agent_id: "opencode-1", backend: "opencode",
    task_id: "task-1", title: "OAuth flow",
    branch: "bark/oauth-flow", gateAt: 38_000, mergedAt: 41_000, tests: 22,
  },
];

const MERGE_TRAIN_AT = 43_000;
const LOOP_MS = 96_000;

let epoch: number | null = null;

export function isReplayMode(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    return q.get("run") === "replay" || q.get("replay") === "1";
  } catch {
    return false;
  }
}

/** Restart the timeline from t=0 (used by the replay banner). */
export function restartReplay(): void {
  epoch = Date.now();
}

function elapsed(now: number): number {
  if (epoch === null) epoch = now;
  return (now - epoch) % LOOP_MS;
}

export function replaySessions(now = Date.now()): ReplaySession[] {
  if (!isReplayMode()) return [];
  const t = elapsed(now);
  const start = epoch ?? now;

  const sessions: ReplaySession[] = WORKERS.map((w) => {
    const merged = t >= w.mergedAt;
    const gated = t >= w.gateAt;
    const status = merged ? "merged" : gated ? "gate passed" : "running";
    return {
      id: `replay-${w.id}`,
      task_id: w.task_id,
      title: w.title,
      agent_id: w.agent_id,
      backend: w.backend,
      status,
      branch: w.branch,
      worktree_path: `/tmp/bark-run/${w.id}`,
      started_at: new Date(start).toISOString(),
      last_heartbeat: new Date(start + Math.min(t, w.gateAt)).toISOString(),
      ended_at: merged ? new Date(start + w.mergedAt).toISOString() : undefined,
      exit_code: merged ? 0 : undefined,
      note: merged
        ? "merged → main"
        : gated
          ? `node test.js · ${w.tests} passed`
          : "gate queued · node test.js",
      fresh: !gated,
    };
  });

  if (t >= MERGE_TRAIN_AT) {
    sessions.push({
      id: "replay-merge-train",
      title: "Merge train",
      agent_id: "merge-train",
      backend: "merge-train",
      status: "merged",
      started_at: new Date(start + MERGE_TRAIN_AT).toISOString(),
      ended_at: new Date(start + MERGE_TRAIN_AT).toISOString(),
      note: "3/3 branches landed · finish order",
      fresh: false,
    });
  }

  return sessions;
}

/**
 * Overlay replay task statuses so the queue panel moves with the live rows.
 * Returns undefined for tasks that aren't part of the recorded run.
 */
export function replayTaskStatus(taskId: string, now = Date.now()): string | undefined {
  if (!isReplayMode()) return undefined;
  const w = WORKERS.find((x) => x.task_id === taskId);
  if (!w) return undefined;
  return elapsed(now) >= w.mergedAt ? "Completed" : "InProgress";
}
