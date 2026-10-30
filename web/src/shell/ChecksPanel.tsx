import React, { useEffect, useState } from "react";
import { fetchProject, runChecks } from "../lib/api";
import { checkState, isActiveRun } from "../lib/run-state";
import type { RunGate, RunRecord, RunCommand } from "../lib/types";
import { Icon } from "../components/Icon";

export function ChecksPanel({ run, data, loading, onResult, onEvidence }: {
  run?: RunRecord; data: RunGate | null; loading: boolean; onResult: (run: RunRecord) => void; onEvidence: () => void;
}) {
  const [command, setCommand] = useState("");
  const [commands, setCommands] = useState<RunCommand[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gate = data?.gate || run?.gate;
  const state = checkState(gate);
  useEffect(() => { setCommand(gate?.command || ""); setError(null); }, [run?.id, gate?.command]);
  useEffect(() => { let cancelled = false; void fetchProject().then((project) => { if (!cancelled) setCommands(project?.commands || []); }); return () => { cancelled = true; }; }, []);
  const check = async () => {
    if (!run || busy) return;
    setBusy(true); setError(null);
    try { onResult(await runChecks(run.id, command)); window.dispatchEvent(new Event("bark-threads-changed")); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not run checks."); }
    finally { setBusy(false); }
  };
  return <div className="checks-panel">
    <h3 className={`text-${state.tone}`}><Icon name={state.tone === "success" ? "check" : state.tone === "danger" ? "warn" : "clock"} size={16} />{busy ? "Running checks…" : state.label}</h3>
    {loading && <p role="status">Refreshing check evidence…</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {gate?.summary && <p className="whitespace-pre-wrap">{gate.summary}</p>}
    {data?.eligibility?.reason && <p className="check-blocker">{data.eligibility.reason}</p>}
    {gate?.verification && <dl><dt>Tested revision</dt><dd><code>{gate.verification.tested_head.slice(0, 12) || "Not recorded"}</code></dd><dt>Target revision</dt><dd><code>{gate.verification.target_head.slice(0, 12) || "Not recorded"}</code></dd><dt>Exit code</dt><dd>{gate.verification.exit_code ?? "Not recorded"}</dd>{gate.finished_at && <><dt>Checked</dt><dd>{new Date(gate.finished_at).toLocaleString()}</dd></>}</dl>}
    {run && run.status !== "merged" ? <form onSubmit={(event) => { event.preventDefault(); void check(); }}>
      <label htmlFor="check-command">Verification command</label>
      <input id="check-command" className="bark-field" value={command} onChange={(event) => setCommand(event.target.value)} list="project-check-commands" placeholder="Detect from project, or enter a command" autoComplete="off" spellCheck={false} />
      <datalist id="project-check-commands">{commands.map((entry) => <option key={entry.id} value={entry.command}>{entry.label}</option>)}</datalist>
      <p>Runs in this build’s isolated worktree. If the target branch moved, Bark updates the worktree first; review the resulting diff again.</p>
      <button className="bark-button" disabled={busy || isActiveRun(run)} type="submit">{busy ? "Checking…" : gate?.command ? "Re-run checks" : "Run checks"}</button>
    </form> : !run && <p>No build has run yet. Checks become available after the agent finishes its worktree changes.</p>}
    {data?.log && <details><summary>Check output</summary><pre>{data.log}</pre></details>}
    <button className="bark-button" onClick={onEvidence}>Evidence & provenance</button>
  </div>;
}
