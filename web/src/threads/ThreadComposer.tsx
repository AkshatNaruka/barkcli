import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import type { AgentSelection } from "../lib/useAgentSelection";
import { navigate, updateRouteState } from "../lib/hashnav";
import { AgentPicker } from "./AgentPicker";
import type { ComposerMode } from "../lib/composer";
import { SelectMenu } from "../components/SelectMenu";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { matchSlashCommands, type SlashCommand } from "../lib/slashCommands";
import {
  fileToPromptAttachment,
  formatFileSize,
  type PromptAttachment,
} from "../lib/attachments";
import { useVoiceDictation } from "../lib/voice";

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

export const WORKSPACE_STRATEGIES = [
  { value: "root", label: "Project root", hint: "Bind thread directly to the project directory" },
  { value: "worktree", label: "Worktree", hint: "Isolate agent changes in a dedicated git worktree" },
];

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
  workspaceStrategy,
  onWorkspaceStrategyChange,
  footer,
  attachments,
  onAttachmentsChange,
  showSuggestions = false,
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
  workspaceStrategy?: "root" | "worktree";
  onWorkspaceStrategyChange?: (value: "root" | "worktree") => void;
  /** Scope/checkout bar rendered inside the composer card (new threads only). */
  footer?: React.ReactNode;
  /** Files attached to the prompt */
  attachments?: PromptAttachment[];
  onAttachmentsChange?: React.Dispatch<React.SetStateAction<PromptAttachment[]>> | ((attachments: PromptAttachment[]) => void);
  /** Whether to show prompt suggestion chips (disabled on new thread screen to match T3 Code) */
  showSuggestions?: boolean;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissedSlash, setDismissedSlash] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const [localAttachments, setLocalAttachments] = useState<PromptAttachment[]>([]);
  const currentAttachments = attachments ?? localAttachments;

  const updateAttachments = useCallback(
    (updater: (prev: PromptAttachment[]) => PromptAttachment[]) => {
      const next = updater(currentAttachments);
      if (onAttachmentsChange) {
        (onAttachmentsChange as (atts: PromptAttachment[]) => void)(next);
      } else {
        setLocalAttachments(next);
      }
    },
    [currentAttachments, onAttachmentsChange]
  );

  const clearAttachments = useCallback(() => {
    if (onAttachmentsChange) {
      (onAttachmentsChange as (atts: PromptAttachment[]) => void)([]);
    } else {
      setLocalAttachments([]);
    }
  }, [onAttachmentsChange]);

  const handleVoiceTranscript = useCallback((transcript: string) => {
    if (!transcript) return;
    onChange(value.trimEnd() ? `${value.trimEnd()} ${transcript}` : transcript);
  }, [onChange, value]);

  const {
    isSupported: isVoiceSupported,
    isListening,
    isTranscribing,
    error: voiceError,
    toggleListening,
    stopListening,
  } = useVoiceDictation({
    onTranscript: handleVoiceTranscript,
  });

  const addFiles = useCallback(async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const newAtts: PromptAttachment[] = [];
    for (const file of list) {
      try {
        const att = await fileToPromptAttachment(file);
        newAtts.push(att);
      } catch (err) {
        console.warn("Failed to attach file", file.name, err);
      }
    }
    if (newAtts.length > 0) {
      updateAttachments((prev) => [...prev, ...newAtts]);
    }
  }, [updateAttachments]);

  const removeAttachment = useCallback((id: string) => {
    updateAttachments((prev) => prev.filter((a) => a.id !== id));
  }, [updateAttachments]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsDragging(false);
      dragCounter.current = 0;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void addFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      void addFiles(e.clipboardData.files);
    }
  };

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
        onAction?.("context");
        updateRouteState({ panel: "context" });
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
      {showSuggestions && !value.trim() && !active && !busy && (
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
        className={`thread-composer ${isDragging ? "is-drag-over ring-2 ring-accent/60" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onSubmit={(event) => {
          event.preventDefault();
          if (!value.trim() && currentAttachments.length === 0) return;
          if (isListening) stopListening();
          if (active && onQueue) {
            onQueue();
          } else if (!busy && !active) {
            onSubmit();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="file-attachment-input"
          onChange={handleFileSelect}
        />

        {isDragging && (
          <div className="composer-drag-overlay" aria-hidden="true">
            <div className="flex flex-col items-center gap-1.5 p-4 text-center">
              <Icon name="paperclip" size={22} className="text-accent animate-bounce" />
              <span className="text-[12.5px] font-medium text-text">Drop files to attach to prompt</span>
              <span className="text-[10.5px] text-muted">Supports images, source code, data, and documents</span>
            </div>
          </div>
        )}

        {currentAttachments.length > 0 && (
          <div className="composer-attachment-tray" aria-label="Attached files">
            {currentAttachments.map((att) => (
              <div key={att.id} className="composer-attachment-chip group">
                {att.isImage && att.dataUrl ? (
                  <img src={att.dataUrl} alt={att.name} className="composer-attachment-thumb" />
                ) : (
                  <Icon name={att.isImage ? "image" : "file"} size={12} className="text-muted/80 shrink-0" />
                )}
                <span className="composer-attachment-name" title={att.name}>
                  {att.name}
                </span>
                <span className="composer-attachment-size font-mono text-[9.5px] text-muted/60">
                  {formatFileSize(att.size)}
                </span>
                <button
                  type="button"
                  className="composer-attachment-remove"
                  onClick={() => removeAttachment(att.id)}
                  aria-label={`Remove ${att.name}`}
                  title="Remove attachment"
                >
                  <Icon name="x" size={10} />
                </button>
              </div>
            ))}
            {currentAttachments.length > 1 && (
              <button
                type="button"
                onClick={clearAttachments}
                className="text-[10.5px] text-muted hover:text-danger px-1 transition-colors"
                title="Clear all attachments"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        <label className="sr-only" htmlFor={`${id}-prompt`}>
          {mode === "ask" ? "Ask the local agent" : "What do you want to build?"}
        </label>
        <textarea
          id={`${id}-prompt`}
          ref={textarea}
          data-testid="thread-composer"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={handlePaste}
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
              if (!value.trim() && currentAttachments.length === 0) return;
              if (isListening) stopListening();
              if (active && onQueue) {
                onQueue();
              } else if (!busy && !active) {
                onSubmit();
              }
            }
          }}
        />

        <div className="thread-composer-controls">
          <div className="composer-actions-left">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="composer-btn-secondary inline-flex items-center justify-center rounded-md p-1.5 text-muted hover:text-text hover:bg-surface transition-colors"
              title="Attach files (images, code, documents) — or drag & drop"
              aria-label="Attach files"
            >
              <Icon name="paperclip" size={15} />
              {currentAttachments.length > 0 && (
                <span className="inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold text-white ml-0.5">
                  {currentAttachments.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                onAction?.("context");
                updateRouteState({ panel: "context" });
              }}
              className="sr-only"
              title="Inspect project context pack and active rules (AGENTS.md)"
              aria-label="Context Primed"
            >
              Context Primed
            </button>
          </div>

          <div className="composer-actions-right">
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
              onClick={toggleListening}
              disabled={isTranscribing}
              className={`composer-btn-secondary inline-flex items-center justify-center rounded-md p-1.5 transition-colors ${
                isListening
                  ? "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25"
                  : isTranscribing
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "text-muted hover:text-text hover:bg-surface"
              }`}
              title={
                !isVoiceSupported
                  ? "Microphone input not supported in this environment"
                  : isTranscribing
                  ? "Transcribing your audio…"
                  : isListening
                  ? "Listening… Click to stop dictation"
                  : "Voice dictation (Speak to write in prompt)"
              }
              aria-label={
                isTranscribing
                  ? "Transcribing voice"
                  : isListening
                  ? "Stop voice dictation"
                  : "Voice dictation"
              }
            >
              <Icon
                name={isTranscribing ? "refresh" : "mic"}
                size={14}
                className={
                  isTranscribing
                    ? "text-accent animate-spin"
                    : isListening
                    ? "text-danger animate-pulse"
                    : ""
                }
              />
              {isListening && (
                <span className="hidden xs:inline-flex items-center gap-1 font-mono text-[10px] text-danger font-semibold ml-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-danger animate-ping" />
                  <span>Listening…</span>
                </span>
              )}
            </button>

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
                <Icon name="stop" size={14} />
              </button>
            ) : (
              <button
                className="bark-primary composer-submit"
                type="submit"
                data-testid="composer-submit"
                aria-label={busy ? "Starting" : mode === "plan" ? "Prepare plan" : "Send message"}
                title={mode === "plan" ? "Prepare plan (Enter)" : "Send message (Enter)"}
                disabled={(!value.trim() && currentAttachments.length === 0) || busy || (mode !== "plan" && !agent.ready)}
              >
                <Icon name="arrowUp" size={15} />
              </button>
            )}
          </div>
        </div>
      </form>
      {footer ? (
        footer
      ) : workspaceStrategy && onWorkspaceStrategyChange ? (
        <div className="composer-scope-bar">
          <div className="composer-workspace-trigger-wrap">
            <Icon name="folder" size={12} className="text-muted" />
            <SelectMenu
              className="composer-workspace-select"
              value={workspaceStrategy}
              options={WORKSPACE_STRATEGIES}
              ariaLabel="Workspace strategy"
              disabled={busy}
              onChange={(val) => onWorkspaceStrategyChange(val as "root" | "worktree")}
            />
          </div>
        </div>
      ) : null}
      {(error || voiceError) && (
        <p role="alert" className="composer-error">
          {error || voiceError}
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
