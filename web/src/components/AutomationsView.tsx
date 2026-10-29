import React, { useCallback, useEffect, useState } from "react";
import type { ScheduleEntry } from "../lib/types";
import {
  createSchedule,
  deleteSchedule,
  fetchProject,
  fetchSchedules,
  runDueSchedules,
} from "../lib/api";
import { Icon } from "./Icon";
import { QuietSelect } from "./QuietSelect";

interface Props {
  boardName: string | null;
}

function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AutomationsView({ boardName }: Props) {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [intent, setIntent] = useState("");
  const [every, setEvery] = useState("1h");
  const [backend, setBackend] = useState("opencode");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningDue, setRunningDue] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSchedules(await fetchSchedules());
    } catch {
      setError("Could not read schedules. Check the local server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const trimmed = intent.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createSchedule({
        intent: trimmed,
        every,
        backend,
        board: boardName || undefined,
      });
      if (!created) {
        setError("Could not create the schedule. Check the interval and server.");
        return;
      }
      setIntent("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const ok = await deleteSchedule(id);
      if (!ok) {
        setError("Could not remove that schedule.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const runDue = async () => {
    setRunningDue(true);
    setError(null);
    try {
      const ran = await runDueSchedules();
      if (ran === 0) {
        setError("No schedules were due.");
      } else {
        await load();
      }
    } finally {
      setRunningDue(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[960px] px-5 py-5 md:px-7">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent-text">
            <Icon name="clock" size={15} />
          </span>
          <h1 className="text-[18px] font-semibold tracking-tight text-text">Automations</h1>
        </div>
        <p className="mt-2 max-w-[720px] text-[12px] leading-relaxed text-muted">
          Scheduled agent runs. Each due intent invokes the normal autonomy loop in
          an isolated worktree, with your tests as the gate. Run{" "}
          <code className="font-mono text-text/80">barkcli schedule run</code> to
          keep them firing.
        </p>

        <div className="mt-5 rounded-lg border border-border bg-surface p-4">
          <h3 className="text-xs font-semibold text-text mb-3">New schedule</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[260px] flex-1">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Intent</span>
              <input
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void create();
                  }
                }}
                placeholder="What should the agents own?"
                className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <label className="w-[120px]">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Every</span>
              <input
                value={every}
                onChange={(event) => setEvery(event.target.value)}
                placeholder="1h, 30m, 3600"
                className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <label className="w-[150px]">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Backend</span>
              <QuietSelect
                value={backend}
                onChange={(event) => setBackend(event.target.value)}
                className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text"
              >
                <option value="opencode">OpenCode</option>
                <option value="claude-code">Claude Code</option>
                <option value="codex">Codex</option>
              </QuietSelect>
            </label>
            <button
              type="button"
              onClick={() => void create()}
              disabled={!intent.trim() || busy}
              className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Scheduling…" : "Schedule"}
            </button>
            <button
              type="button"
              onClick={() => void runDue()}
              disabled={runningDue}
              className="rounded-md border border-border px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
            >
              {runningDue ? "Running…" : "Run due now"}
            </button>
          </div>
          {error && (
            <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
              {error}
            </div>
          )}
        </div>

        <div className="mt-5">
          <h3 className="text-xs font-semibold text-text mb-3">Schedules</h3>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-12 animate-pulse rounded-md bg-surface" />
              ))}
            </div>
          ) : schedules.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-[12px] text-muted">
              No schedules yet. Add one above, then keep{" "}
              <code className="font-mono text-text/80">barkcli schedule run</code> running.
            </div>
          ) : (
            <div className="space-y-2">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] text-text">{schedule.intent}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted">
                      {schedule.id} · {schedule.backend} · every {formatInterval(schedule.every_secs)} · next{" "}
                      {formatTime(schedule.next_run)}
                      {schedule.last_status ? ` · last: ${schedule.last_status}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(schedule.id)}
                    disabled={busy}
                    className="rounded-md border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
