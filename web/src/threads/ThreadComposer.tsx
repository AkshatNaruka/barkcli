import React, { useEffect, useId, useRef } from "react";
import { Icon } from "../components/Icon";
import type { AgentSelection } from "../lib/useAgentSelection";
import { navigate } from "../lib/hashnav";
import { AgentPicker } from "./AgentPicker";
import type { ComposerMode } from "../lib/composer";
import { SelectMenu } from "../components/SelectMenu";

const MODES = [
  { value: "build", label: "Build", hint: "Make changes with your agent in an isolated worktree" },
  { value: "plan", label: "Plan", hint: "Prepare a step-by-step plan before building" },
  { value: "ask", label: "Ask", hint: "Read-only conversation about this project" },
];

const SUGGESTIONS: Record<ComposerMode, string[]> = {
  build: ["Add regression test", "Refactor for clarity", "Fix failing tests"],
  plan: ["Plan new feature", "Architecture refactor plan", "Security review plan"],
  ask: ["Explain project architecture", "Where are runs stored?", "How do gates work?"],
};

export function ThreadComposer({
  value,
  onChange,
  mode,
  onModeChange,
  agent,
  onSubmit,
  busy = false,
  active = false,
  onStop,
  error,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  agent: AgentSelection;
  onSubmit: () => void;
  busy?: boolean;
  active?: boolean;
  onStop?: () => void;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight || 0, 240)}px`;
  }, [value]);

  const placeholder =
    mode === "ask"
      ? "Ask anything about this project, architecture, or codebase…"
      : mode === "plan"
      ? "Describe what you want to plan… The agent will break it into steps."
      : "What would you like to build? (e.g. 'Add dark mode toggle to navbar')";

  return (
    <div className="thread-composer-wrap">
      <form
        className="thread-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !active && value.trim()) onSubmit();
        }}
      >
        <label className="sr-only" htmlFor={`${id}-prompt`}>
          {mode === "ask" ? "Ask the local agent" : "What do you want to build?"}
        </label>
        <textarea
          id={`${id}-prompt`}
          ref={textarea}
          data-testid="thread-composer"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus={autoFocus}
          name="prompt"
          rows={2}
          aria-describedby={`${id}-hint`}
          placeholder={placeholder}
          onKeyDown={(event) => {
            if (
              !event.nativeEvent.isComposing &&
              event.key === "Enter" &&
              !event.shiftKey
            ) {
              event.preventDefault();
              if (!busy && !active && value.trim()) onSubmit();
            }
          }}
        />

        {!value.trim() && !active && !busy && (
          <div className="composer-suggestions" aria-label="Suggested prompts">
            {SUGGESTIONS[mode]?.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="suggestion-chip"
                onClick={() => {
                  onChange(suggestion);
                  textarea.current?.focus();
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div className="thread-composer-controls">
          <SelectMenu
            className="composer-mode-select"
            value={mode}
            options={MODES}
            ariaLabel="Composer mode"
            disabled={busy}
            onChange={(value) => onModeChange(value as ComposerMode)}
          />
          <AgentPicker agent={agent} mode={mode} />

          <div className="composer-actions-right">
            <span className="composer-hint-key" aria-hidden="true">
              ↵ send · ⇧↵ newline
            </span>
            {active ? (
              <button
                className="bark-button composer-submit composer-stop"
                type="button"
                data-testid="composer-submit"
                aria-label="Stop"
                title="Stop execution"
                onClick={onStop}
                disabled={!onStop || busy}
              >
                <Icon name="stop" size={15} />
              </button>
            ) : (
              <button
                className="bark-primary composer-submit"
                type="submit"
                data-testid="composer-submit"
                aria-label={busy ? "Starting" : mode === "plan" ? "Prepare plan" : "Send message"}
                title={mode === "plan" ? "Prepare plan (Enter)" : "Send message (Enter)"}
                disabled={!value.trim() || busy || (mode !== "plan" && !agent.ready)}
              >
                <Icon name="arrowUp" size={16} />
              </button>
            )}
          </div>
        </div>
      </form>
      {error && (
        <p role="alert" className="composer-error">
          {error}
        </p>
      )}
      <p className="sr-only" id={`${id}-hint`}>
        {active
          ? "Your draft stays here while work is running."
          : mode === "ask"
          ? "Read-only. Enter to send. Shift+Enter for a new line."
          : mode === "plan"
          ? "Prepare a plan for review. Enter to send. Shift+Enter for a new line."
          : "Enter to send. Shift+Enter for a new line. Changes are made in an isolated worktree."}
      </p>
      {!agent.ready && !agent.loading && (
        <p className="composer-readiness">
          {agent.readiness}.{" "}
          <button onClick={() => navigate("operations", { tool: "workspace" })}>
            Open agent setup
          </button>
          {mode === "plan" ? ". You can still prepare a plan." : ". Your draft is saved."}
        </p>
      )}
    </div>
  );
}
