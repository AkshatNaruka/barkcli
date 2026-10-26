import React, { useState } from "react";
import { createThread } from "../lib/api";
import { Icon } from "../components/Icon";

interface UniversalComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (threadId: string) => void;
  boardName?: string;
  initialText?: string;
}

export function UniversalComposer({
  isOpen,
  onClose,
  onCreated,
  boardName,
  initialText = "",
}: UniversalComposerProps) {
  const [text, setText] = useState(initialText);
  const [kind, setKind] = useState("feature");
  const [backend, setBackend] = useState("opencode");
  const [mode, setMode] = useState<"plan_first" | "plan_and_run">("plan_first");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialText) {
      setText(initialText);
    }
  }, [initialText, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await createThread({
        text: trimmed,
        kind,
        backend,
        mode,
        board: boardName,
      });
      if (res && res.thread_id) {
        setText("");
        onClose();
        onCreated(res.thread_id);
      } else {
        setError("Failed to create thread. Check server status.");
      }
    } catch (err: any) {
      setError(err?.message || "Error creating thread");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-bg border border-border rounded-xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-3.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="spark" size={16} />
            <span className="text-xs font-semibold text-text uppercase tracking-wider">
              Universal Composer
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-text rounded"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 space-y-4">
          <div>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to build or paste a complete specification..."
              rows={5}
              className="w-full bg-surface border border-border rounded-lg p-3 text-xs text-text placeholder-muted focus:outline-none focus:border-accent resize-none leading-relaxed"
            />
            <div className="flex justify-between items-center mt-1 text-[11px] text-muted">
              <span>Press Cmd+Enter to dispatch, Escape to cancel.</span>
              <span>{text.length} chars</span>
            </div>
          </div>

          {/* Options grid */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-muted mb-1">
                Type
              </label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text"
              >
                <option value="feature">Feature</option>
                <option value="bug">Bugfix</option>
                <option value="refactor">Refactor</option>
                <option value="task">Task</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-muted mb-1">
                Backend
              </label>
              <select
                value={backend}
                onChange={(e) => setBackend(e.target.value)}
                className="w-full bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text"
              >
                <option value="opencode">opencode (deepseek free)</option>
                <option value="claude">claude</option>
                <option value="codex">codex</option>
                <option value="gemini">gemini</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-muted mb-1">
                Execution Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="w-full bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text"
              >
                <option value="plan_first">Plan first</option>
                <option value="plan_and_run">Just do it</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-3 border-t border-border bg-surface flex items-center justify-between">
          <span className="text-[11px] text-muted">
            {mode === "plan_first"
              ? "Plan first: Review proposed tasks before execution."
              : "Just do it: Plan and immediately run in parallel worktrees."}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md border border-border text-muted hover:text-text hover:bg-white/[0.03] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSubmit()}
              disabled={!text.trim() || submitting}
              className="px-4 py-1.5 text-xs rounded-md bg-accent text-bg font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {submitting ? "Dispatching..." : "Start Intent"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
