import React, { useEffect, useState } from "react";
import { ping, isVscode, type PingResponse } from "../lib/api";
import { isDemoMode } from "../lib/demo";

// ── Server liveness chip (GET /api/ping) ─────────────────────────────
// One quiet line of chrome, like the git branch/commit chip beside it:
// green dot + latency when the daemon answers, red dot + "offline" when it
// does not. The tooltip carries the ping payload the header has no room for
// (version, uptime, authoritative server timestamp).
//
// 30s is deliberately slow: a cached ping is a lie (the server sends
// `cache-control: no-store`), but liveness does not need to be real-time.
// A background tab throttles timers, so we re-check as soon as it is visible
// again, and a click forces a check.

const POLL_MS = 30_000;

type ServerState =
  | { kind: "checking" }
  | { kind: "online"; payload: PingResponse; latencyMs: number }
  | { kind: "offline"; error: string; checkedAt: string }
  // The daemon answered, but without /api/ping (pre-SPEC-007 build).
  | { kind: "legacy"; checkedAt: string }
  | { kind: "demo" };

function formatUptime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** Render an ISO instant as a compact UTC clock (millis precision). */
function clock(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return `${new Date(ms).toISOString().slice(11, 23)}Z`;
}

export function ServerStatus() {
  const demo = isDemoMode();
  const [state, setState] = useState<ServerState>(
    demo ? { kind: "demo" } : { kind: "checking" }
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (demo) {
      setState({ kind: "demo" });
      return;
    }

    let alive = true;
    let inFlight = false;
    let timer: number | undefined;

    const check = async () => {
      if (inFlight) return;
      inFlight = true;
      const started = performance.now();
      try {
        const payload = await ping();
        if (!alive) return;
        setState({
          kind: "online",
          payload,
          latencyMs: Math.max(1, Math.round(performance.now() - started)),
        });
      } catch (err) {
        if (!alive) return;
        const error = err instanceof Error ? err.message : "unreachable";
        const checkedAt = new Date().toISOString();
        // A 404 means the server is up but predates the ping route — do not
        // call that "offline" (it would be a false alarm on an old daemon).
        setState(
          /: 404$/.test(error) ? { kind: "legacy", checkedAt } : { kind: "offline", error, checkedAt }
        );
      } finally {
        inFlight = false;
        if (alive) timer = window.setTimeout(check, POLL_MS);
      }
    };

    void check();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) window.clearTimeout(timer);
      void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [demo, nonce]);

  // The VS Code webview talks over postMessage, not HTTP — there is no daemon
  // to ping, and an "offline" badge there would be a false alarm.
  if (isVscode) return null;

  let dot = "bg-muted animate-pulse";
  let label = "checking";
  let tone = "text-muted";
  let title = "Checking barkcli server…";

  switch (state.kind) {
    case "online":
      dot = "bg-success";
      label = `ok ${state.latencyMs}ms`;
      title = `barkcli v${state.payload.version} · up ${formatUptime(
        state.payload.uptime_seconds
      )} · ${clock(state.payload.timestamp)} — click to re-check`;
      break;
    case "offline":
      dot = "bg-danger";
      label = "offline";
      tone = "text-danger";
      title = `Cannot reach barkcli (${state.error}) — last checked ${clock(
        state.checkedAt
      )}, click to retry`;
      break;
    case "legacy":
      dot = "bg-warning";
      label = "no ping";
      tone = "text-warning";
      title = `This barkcli daemon predates /api/ping (404) — restart it after upgrading, last checked ${clock(
        state.checkedAt
      )}`;
      break;
    case "demo":
      dot = "bg-warning";
      label = "demo";
      title = "Demo mode — no live barkcli server";
      break;
    default:
      break;
  }

  return (
    <button
      type="button"
      onClick={() => setNonce((n) => n + 1)}
      disabled={state.kind === "demo"}
      title={title}
      aria-label={title}
      className={`hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono ${tone} bg-surface border border-border hover:border-border-strong disabled:hover:border-border rounded px-1.5 py-0.5 shrink-0 transition-colors`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
