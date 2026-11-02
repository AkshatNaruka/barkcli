import React, { useEffect, useId, useRef } from "react";
import { Icon } from "../components/Icon";
import type { AgentSelection } from "../lib/useAgentSelection";
import { navigate } from "../lib/hashnav";
import { AgentPicker } from "./AgentPicker";
import type { ComposerMode } from "../lib/composer";
import { SelectMenu } from "../components/SelectMenu";

const MODES = [
  { value: "build", label: "Build", hint: "Make changes with your agent" },
  { value: "plan", label: "Plan", hint: "Prepare a plan before building" },
  { value: "ask", label: "Ask", hint: "Read-only conversation" },
];

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
        autoFocus={autoFocus} name="prompt" rows={2} aria-describedby={`${id}-hint`} placeholder={mode === "ask" ? "Ask about this project…" : mode === "plan" ? "Describe what you want to plan…" : "What would you like to build?"}
        onKeyDown={(event) => {
          if (!event.nativeEvent.isComposing && event.key === "Enter" && !event.shiftKey) {
            event.preventDefault(); if (!busy && !active && value.trim()) onSubmit();
          }
        }} />
      <div className="thread-composer-controls">
        <SelectMenu className="composer-mode-select" value={mode} options={MODES} ariaLabel="Composer mode" disabled={busy} onChange={(value) => onModeChange(value as ComposerMode)} />
        <AgentPicker agent={agent} mode={mode} />
        {active ? <button className="bark-button composer-submit" type="button" data-testid="composer-submit" aria-label="Stop" title="Stop" onClick={onStop} disabled={!onStop || busy}><Icon name="stop" size={15} /></button> : <button className="bark-primary composer-submit" type="submit" data-testid="composer-submit" aria-label={busy ? "Starting" : mode === "plan" ? "Prepare plan" : "Send message"} title={mode === "plan" ? "Prepare plan (Enter)" : "Send message (Enter)"} disabled={!value.trim() || busy || (mode !== "plan" && !agent.ready)}><Icon name="arrowUp" size={16} /></button>}
      </div>
    </form>
    {error && <p role="alert" className="composer-error">{error}</p>}
    <p className="sr-only" id={`${id}-hint`}>{active ? "Your draft stays here while work is running." : mode === "ask" ? "Read-only. Enter to send. Shift+Enter for a new line." : mode === "plan" ? "Prepare a plan for review. Enter to send. Shift+Enter for a new line." : "Enter to send. Shift+Enter for a new line. Changes are made in an isolated worktree."}</p>
    {!agent.ready && !agent.loading && <p className="composer-readiness">{agent.readiness}. <button onClick={() => navigate("operations", { tool: "workspace" })}>Open agent setup</button>{mode === "plan" ? ". You can still prepare a plan." : ". Your draft is saved."}</p>}
  </div>;
}
