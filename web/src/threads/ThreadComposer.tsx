import React, { useEffect, useId, useRef } from "react";
import { Icon } from "../components/Icon";
import type { AgentSelection } from "../lib/useAgentSelection";
import { navigate } from "../lib/hashnav";
import { AgentPicker } from "./AgentPicker";
import type { ComposerMode } from "../lib/composer";

export function ThreadComposer({ value, onChange, mode, onModeChange, agent, onSubmit, busy = false, active = false, onStop, error, autoFocus = false }: {
  value: string; onChange: (value: string) => void; mode: ComposerMode; onModeChange: (mode: ComposerMode) => void;
  agent: AgentSelection; onSubmit: () => void; busy?: boolean; active?: boolean; onStop?: () => void; error?: string | null; autoFocus?: boolean;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight || 0, 220)}px`;
  }, [value]);
  return <div className="thread-composer-wrap">
    <form className="thread-composer" onSubmit={(event) => { event.preventDefault(); if (!busy && !active && value.trim()) onSubmit(); }}>
      <label className="sr-only" htmlFor={`${id}-prompt`}>{mode === "ask" ? "Ask the local agent" : "What do you want to build?"}</label>
      <textarea id={`${id}-prompt`} ref={textarea} data-testid="thread-composer" value={value} onChange={(event) => onChange(event.target.value)}
        autoFocus={autoFocus} name="prompt" rows={3} aria-describedby={`${id}-hint`} placeholder={mode === "ask" ? "Ask about the code or the plan…" : "Type a goal, a bug, or an idea…"}
        onKeyDown={(event) => {
          if (!event.nativeEvent.isComposing && event.key === "Enter" && !event.shiftKey) {
            event.preventDefault(); if (!busy && !active && value.trim()) onSubmit();
          }
        }} />
      <div className="thread-composer-controls">
        <div className="composer-modes" role="group" aria-label="Composer mode">{(["ask", "plan", "build"] as const).map((choice) => <button key={choice} type="button" aria-pressed={mode === choice} disabled={busy} onClick={() => onModeChange(choice)}>{choice === "ask" ? "Ask" : choice === "plan" ? "Plan" : "Build"}</button>)}</div>
        <AgentPicker agent={agent} mode={mode} />
        {active ? <button className="bark-button composer-submit" type="button" data-testid="composer-submit" onClick={onStop} disabled={!onStop || busy}><Icon name="stop" size={13} />Stop</button> : <button className="bark-primary composer-submit" type="submit" data-testid="composer-submit" disabled={!value.trim() || busy || (mode !== "plan" && !agent.ready)}>{busy ? "Starting…" : mode === "ask" ? "Ask" : mode === "plan" ? "Plan changes" : "Build"}<Icon name="arrowUp" size={13} /></button>}
      </div>
    </form>
    {error && <p role="alert" className="composer-error">{error}</p>}
    <p className="composer-hint" id={`${id}-hint`}>{active ? "Your draft stays here while work is running." : mode === "ask" ? "Read-only. Enter to send · Shift+Enter for a new line." : mode === "plan" ? "Prepare a plan for review. Enter to send · Shift+Enter for a new line." : "Build in an isolated worktree. Enter to send · Shift+Enter for a new line."}</p>
    {!agent.ready && !agent.loading && <p className="composer-readiness">{agent.readiness}. <button onClick={() => navigate("operations", { tool: "workspace" })}>Open agent setup</button>{mode === "plan" ? ". You can still prepare a plan." : ". Your draft is saved."}</p>}
  </div>;
}
