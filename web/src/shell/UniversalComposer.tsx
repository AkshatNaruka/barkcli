import React, { useEffect, useState } from "react";
import { createThread, fetchProviderModels, fetchProviders, startThreadChat } from "../lib/api";
import { preferredModel, rememberModel } from "../lib/models";
import type { ProviderStatus } from "../lib/types";
import { Icon } from "../components/Icon";
import { QuietSelect } from "../components/QuietSelect";

interface UniversalComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (threadId: string) => void;
  boardName?: string;
  initialText?: string;
  initialMode?: "chat" | "plan_first" | "plan_and_run";
}

export function UniversalComposer({
  isOpen,
  onClose,
  onCreated,
  boardName,
  initialText = "",
  initialMode = "plan_first",
}: UniversalComposerProps) {
  const [text, setText] = useState(initialText);
  const [kind, setKind] = useState("feature");
  const [backend, setBackend] = useState("opencode");
  const [mode, setMode] = useState<"chat" | "plan_first" | "plan_and_run">(initialMode);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [model, setModel] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialText) setText(initialText);
    setMode(initialMode);
  }, [initialText, initialMode, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchProviders().then((all) => {
      if (cancelled) return;
      const next = all.filter((provider) => provider.id !== "human");
      setProviders(next);
      setBackend((current) => {
        const ready = next.filter(
          (provider) => provider.available && provider.authenticated !== false
        );
        if (ready.some((provider) => provider.id === current)) return current;
        return ready[0]?.id || next.find((provider) => provider.available)?.id || current;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setModel("");
    setModelOptions([]);
    if (!backend || backend === "human") return;
    fetchProviderModels(backend).then((next) => {
      if (cancelled) return;
      setModelOptions(next);
      const saved = preferredModel(backend);
      if (saved && next.includes(saved)) setModel(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [backend, isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    const selected = providers.find((provider) => provider.id === backend);
    if (selected && !selected.available) {
      setError("That local agent is not installed. Choose another provider or install it first.");
      return;
    }
    if (selected?.authenticated === false) {
      setError(selected.auth_hint || "That local agent is not signed in yet.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await createThread({
        text: trimmed,
        kind,
        backend,
        mode,
        board: boardName,
      });
      if (result?.thread_id) {
        if (mode === "chat") {
          const provider = backend === "claude" ? "claude-code" : backend;
          void startThreadChat(result.thread_id, {
            text: trimmed,
            provider,
            model: model.trim() || undefined,
            board: boardName,
            skip_user_event: true,
          });
        }
        setText("");
        onClose();
        onCreated(result.thread_id);
      } else {
        setError("Could not start the intent. Check that the server is running.");
      }
    } catch (err: any) {
      setError(err?.message || "Error starting the intent");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New intent"
        className="w-full max-w-[560px] overflow-hidden rounded-[12px] border border-border bg-[color-mix(in_srgb,var(--card)_72%,var(--bg))] shadow-2xl"
      >
        <div className="flex h-11 items-center gap-2 border-b border-border/70 px-4">
          <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-accent-soft font-mono text-[10px] font-semibold text-accent-text">
            b
          </span>
          <span className="text-[12px] font-medium text-text">New intent</span>
          {boardName && (
            <>
              <span className="text-muted/35">/</span>
              <span className="font-mono text-[10px] text-muted">{boardName}.board</span>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new intent"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="p-4">
          <textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What outcome should the agents own?"
            aria-label="Intent"
            rows={5}
            className="block min-h-[116px] w-full resize-none bg-transparent text-[13px] leading-[1.7] text-text placeholder:text-muted/60 focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <QuietSelect
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              aria-label="Intent type"
              className="rounded border border-border/60 px-1.5 py-1 text-[10px] text-muted"
            >
              <option value="feature">feature</option>
              <option value="bug">bugfix</option>
              <option value="refactor">refactor</option>
              <option value="task">task</option>
            </QuietSelect>
            <QuietSelect
              value={backend}
              onChange={(event) => setBackend(event.target.value)}
              aria-label="Agent backend"
              className="rounded border border-border/60 px-1.5 py-1 text-[10px] text-muted"
            >
              {providers.length === 0 ? (
                <option value={backend}>{backend}</option>
              ) : (
                providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                    {!provider.available
                      ? " · not installed"
                      : provider.authenticated === false
                        ? " · sign in"
                        : ""}
                  </option>
                ))
              )}
            </QuietSelect>
            <input
              list={`composer-models-${backend}`}
              value={model}
              onChange={(event) => {
                setModel(event.target.value);
                rememberModel(backend, event.target.value);
              }}
              placeholder="CLI default model"
              aria-label="Model"
              title="Models reported by the local CLI for this provider; type any model id"
              className="max-w-[190px] rounded border border-border/60 bg-surface px-1.5 py-1 text-[10px] text-muted focus:border-accent focus:outline-none"
            />
            <datalist id={`composer-models-${backend}`}>
              {modelOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <QuietSelect
              value={mode}
              onChange={(event) => setMode(event.target.value as "plan_first" | "plan_and_run")}
              aria-label="Execution mode"
              className="rounded border border-border/60 px-1.5 py-1 text-[10px] text-muted"
            >
              <option value="chat">ask (read-only)</option>
              <option value="plan_first">plan first</option>
              <option value="plan_and_run">plan & run</option>
            </QuietSelect>

            <span className="ml-auto hidden font-mono text-[9px] text-muted/50 sm:inline">
              {mode === "chat"
                ? "conversation, no worktree"
                : mode === "plan_first"
                  ? "review before dispatch"
                  : "dispatch immediately"}
            </span>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!text.trim() || submitting}
              className="flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[11px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-35"
            >
              {submitting ? "Starting…" : "Start"}
              <Icon name="arrowUp" size={12} />
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded border border-danger/30 bg-danger/10 px-2.5 py-2 text-[11px] text-danger">
              {error}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between font-mono text-[9px] text-muted/45">
            <span>intent → plan → worktree → gate</span>
            <span>⌘↵ to start · esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
