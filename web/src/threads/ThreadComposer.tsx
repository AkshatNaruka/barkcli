import React, { useEffect, useId, useRef } from "react";
import { Icon } from "../components/Icon";
import type { AgentSelection } from "../lib/useAgentSelection";
import { navigate } from "../lib/hashnav";

export function ThreadComposer({ value, onChange, mode, onModeChange, agent, onSubmit, busy = false, active = false, onStop, error, autoFocus = false }: {
  value: string; onChange: (value: string) => void; mode: "ask" | "build"; onModeChange: (mode: "ask" | "build") => void;
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
          if (!event.nativeEvent.isComposing && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault(); if (!busy && !active && value.trim()) onSubmit();
          }
        }} />
      <div className="thread-composer-controls">
        <div className="composer-modes" role="group" aria-label="Composer mode">{(["ask", "build"] as const).map((choice) => <button key={choice} type="button" aria-pressed={mode === choice} onClick={() => onModeChange(choice)}>{choice === "ask" ? "Ask" : "Build"}</button>)}</div>
        <details className="agent-picker">
          <summary aria-label="Agent and model"><Icon name="robot" size={14} /><span>{agent.selected?.name || agent.backend || "Choose agent"}</span><span className="agent-model-label">{agent.model || "CLI default"}</span><Icon name="arrowDown" size={10} /></summary>
          <div className="agent-picker-menu">
            <label htmlFor={`${id}-agent`}>Agent</label>
            <select id={`${id}-agent`} value={agent.backend} onChange={(event) => agent.setBackend(event.target.value)} className="bark-field">
              {!agent.backend && <option value="">Choose an agent</option>}
              {agent.backend && !agent.selected && <option value={agent.backend}>{agent.backend} · unavailable</option>}
              {agent.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}{!provider.available ? " · not installed" : provider.authenticated === false ? " · sign in" : ""}</option>)}
            </select>
            <label htmlFor={`${id}-model`}>Model</label>
            <input id={`${id}-model`} className="bark-field" aria-label="Model" list={`${id}-models`} value={agent.model} onChange={(event) => agent.setModel(event.target.value)} placeholder="CLI default" spellCheck={false} autoComplete="off" />
            <datalist id={`${id}-models`}>{agent.modelOptions.map((model) => <option key={model} value={model} />)}</datalist>
            <p>{mode === "build" ? "Bark prepares the plan offline. This agent and model are used when you approve the build." : "Used for this read-only reply."}</p>
            <p role="status">{agent.readiness}</p>
            {!agent.ready && !agent.loading && <div className="flex gap-2"><button type="button" className="bark-button" onClick={agent.recheck}>Recheck</button><button type="button" className="bark-button" onClick={() => navigate("operations", { tool: "workspace" })}>Agent setup</button></div>}
            {mode === "build" && <details><summary>Build options</summary>
              <label htmlFor={`${id}-role`}>Role</label><select id={`${id}-role`} className="bark-field" value={agent.role} onChange={(event) => agent.setRole(event.target.value)}>{agent.roles.length ? agent.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>) : <option value="builder">Builder</option>}</select>
              <label htmlFor={`${id}-checks`}>Verification command</label><input id={`${id}-checks`} className="bark-field" value={agent.testCommand} onChange={(event) => agent.setTestCommand(event.target.value)} placeholder="Detect from this project" spellCheck={false} autoComplete="off" />
              <p>A custom command runs in the isolated worktree. Checks must pass before merge.</p>
            </details>}
          </div>
        </details>
        {active ? <button className="bark-button composer-submit" type="button" data-testid="composer-submit" onClick={onStop} disabled={!onStop || busy}><Icon name="stop" size={13} />Stop {mode === "ask" ? "reply" : "build"}</button> : <button className="bark-primary composer-submit" type="submit" data-testid="composer-submit" disabled={!value.trim() || busy || (mode === "ask" && !agent.ready)}>{busy ? "Starting…" : mode === "ask" ? "Ask" : "Plan changes"}<Icon name="arrowUp" size={13} /></button>}
      </div>
    </form>
    {error && <p role="alert" className="composer-error">{error}</p>}
    <p className="composer-hint" id={`${id}-hint`}>{active ? "Your draft stays here while work is running." : mode === "ask" ? "Read-only. ⌘Return to ask." : "Review the plan before building. ⌘Return to plan."}</p>
    {!agent.ready && !agent.loading && <p className="composer-readiness">{agent.readiness}. <button onClick={() => navigate("operations", { tool: "workspace" })}>Open agent setup</button>{mode === "build" ? ". You can still prepare a plan." : ". Your draft is saved."}</p>}
  </div>;
}
