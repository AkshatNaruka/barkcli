import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import type { AgentSelection } from "../lib/useAgentSelection";
import { navigate } from "../lib/hashnav";
import { AgentPicker } from "./AgentPicker";
import type { ComposerMode } from "../lib/composer";
import { SelectMenu } from "../components/SelectMenu";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { matchSlashCommands, type SlashCommand } from "../lib/slashCommands";

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
  onQueue,
  busy = false,
  active = false,
  onStop,
  error,
  autoFocus = false,
  onAction,
}: {
  value: string;
  onChange: (value: string) => void;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  agent: AgentSelection;
  onSubmit: () => void;
  onQueue?: () => void;
  busy?: boolean;
  active?: boolean;
  onStop?: () => void;
  error?: string | null;
  autoFocus?: boolean;
  onAction?: (action: string) => void;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissedSlash, setDismissedSlash] = useState(false);

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight || 0, 240)}px`;
  }, [value]);

  const isSlashActive =
    value.startsWith("/") &&
    !dismissedSlash &&
    (!value.includes(" ") || value.indexOf(" ") === -1);

  const matchedCommands = useMemo(
    () => (isSlashActive ? matchSlashCommands(value) : []),
    [isSlashActive, value]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [value]);

  useEffect(() => {
    if (!value.startsWith("/")) {
      setDismissedSlash(false);
    }
  }, [value]);

  const handleSelectSlashCommand = (cmd: SlashCommand) => {
    if (!cmd) return;
    if (cmd.actionType === "mode") {
      onModeChange(cmd.payload as ComposerMode);
      onChange(`${cmd.name} `);
      textarea.current?.focus();
    } else if (cmd.actionType === "agent") {
      if (cmd.payload) {
        agent.restoreChoice(cmd.payload, "");
      }
      onChange("");
      textarea.current?.focus();
    } else if (cmd.actionType === "skill") {
      onChange(`${cmd.name} `);
      textarea.current?.focus();
    } else if (cmd.actionType === "action") {
      if (cmd.payload === "open-agent-picker") {
        onChange("");
        document.querySelector<HTMLButtonElement>(".agent-trigger")?.click();
      } else if (cmd.payload === "open-skills") {
        onChange("");
        navigate("operations", { tool: "skills" });
      } else if (cmd.payload === "context") {
        onChange("");
        navigate("operations", { tool: "context" });
      } else if (cmd.payload === "doctor") {
        onChange("");
        navigate("operations", { tool: "doctor" });
      } else if (cmd.payload === "clear") {
        onChange("");
      } else if (
        cmd.payload === "help" ||
        cmd.payload === "gate" ||
        cmd.payload === "diff" ||
        cmd.payload === "review"
      ) {
        onChange("");
        onAction?.(cmd.payload);
      }
    }
  };

  const placeholder =
    mode === "ask"
      ? "Ask anything about this project, architecture, or codebase… (Type / for commands)"
      : mode === "plan"
      ? "Describe what you want to plan… (Type / for commands)"
      : "What would you like to build? (Type / for commands, agents, skills)";

  return (
    <div className="thread-composer-wrap relative">
      {isSlashActive && matchedCommands.length > 0 && (
        <SlashCommandMenu
          query={value}
          selectedIndex={selectedIndex}
          onSelect={handleSelectSlashCommand}
          onClose={() => setDismissedSlash(true)}
        />
      )}
      {!value.trim() && !active && !busy && (
        <div className="composer-suggestions-bar" aria-label="Suggested prompts">
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
      <form
        className="thread-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!value.trim()) return;
          if (active && onQueue) {
            onQueue();
          } else if (!busy && !active) {
            onSubmit();
          }
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
            if (isSlashActive && matchedCommands.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % matchedCommands.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex(
                  (prev) => (prev - 1 + matchedCommands.length) % matchedCommands.length
                );
                return;
              }
              if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
                event.preventDefault();
                handleSelectSlashCommand(matchedCommands[selectedIndex]);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDismissedSlash(true);
                return;
              }
            }

            if (
              !event.nativeEvent.isComposing &&
              ((event.key === "Enter" && !event.shiftKey) ||
                (event.key === "Enter" && (event.metaKey || event.ctrlKey)))
            ) {
              event.preventDefault();
              if (!value.trim()) return;
              if (active && onQueue) {
                onQueue();
              } else if (!busy && !active) {
                onSubmit();
              }
            }
          }}
        />

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

          <button
            type="button"
            onClick={() => navigate("operations", { tool: "context" })}
            className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono text-muted hover:text-text hover:bg-surface border border-transparent hover:border-border transition-colors"
            title="Inspect project context pack and active rules (AGENTS.md)"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span>Context Primed</span>
          </button>

          <div className="composer-actions-right">
            <span className="composer-hint-key" aria-hidden="true">
              {active ? "↵ queue · ⇧↵ newline" : "↵ send · ⇧↵ newline"}
            </span>
            {active && value.trim() && onQueue && (
              <button
                type="button"
                onClick={onQueue}
                aria-label="Queue message"
                title="Queue message to send after agent finishes"
                className="flex h-7 items-center gap-1 rounded-md border border-border/80 bg-surface px-2 text-[11px] font-medium text-text hover:bg-card transition-colors"
              >
                <Icon name="clock" size={11} className="text-accent" />
                <span>Queue</span>
              </button>
            )}
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
