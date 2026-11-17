import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Rule } from "../lib/types";
import { createRule, deleteRule, fetchRules } from "../lib/api";
import { Icon } from "./Icon";
import { AccessibleDialog } from "./AccessibleDialog";

const RULE_PRESETS = [
  {
    title: "Acceptance Gate Contract",
    body: "Project tests are the acceptance gate. Never report a task complete without executing and passing all related project tests.",
  },
  {
    title: "Preserve Comments & Docstrings",
    body: "Maintain documentation integrity. Preserve all existing comments and docstrings that are unrelated to code changes.",
  },
  {
    title: "No Secrets in Worktrees",
    body: "Never write secrets, tokens, or credential files to disk. Reference environment variables through secure configuration.",
  },
  {
    title: "Isolated Git Worktrees",
    body: "Every autonomous task runs in its own clean worktree branch; only passing branches merge to master via the merge train.",
  },
];

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function RulesView({
  boardName,
  projectName,
}: {
  boardName?: string | null;
  projectName?: string | null;
} = {}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [copiedTitle, setCopiedTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRules(await fetchRules());
    } catch {
      setError("Could not read rules. Check the local server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, boardName, projectName]);

  const openComposer = () => {
    setComposerOpen(true);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const create = async (customTitle?: string, customBody?: string) => {
    const t = (customTitle || title).trim();
    const b = (customBody || body).trim() || "Describe the rule here.";
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await createRule(t, b);
      if (!ok) {
        setError("Could not save the rule.");
        return;
      }
      if (!customTitle) {
        setTitle("");
        setBody("");
        setComposerOpen(false);
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ruleTitle: string) => {
    setBusy(true);
    setError(null);
    try {
      const ok = await deleteRule(ruleTitle);
      if (!ok) {
        setError("Could not remove that rule.");
        return;
      }
      setSelectedRule((current) => (current?.title === ruleTitle ? null : current));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copy = async (rule: Rule) => {
    try {
      await navigator.clipboard.writeText(rule.body);
      setCopiedTitle(rule.title);
      setTimeout(() => setCopiedTitle((current) => (current === rule.title ? null : current)), 2000);
    } catch {
      setSelectedRule(rule);
    }
  };

  const filteredRules = useMemo(() => {
    if (!searchQuery.trim()) return rules;
    const q = searchQuery.toLowerCase();
    return rules.filter(
      (r) => r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q)
    );
  }, [rules, searchQuery]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-5 py-5 md:px-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent-text">
              <Icon name="doc" size={15} />
            </span>
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight text-text">Rules</h1>
              {projectName && (
                <p className="text-[10.5px] font-mono text-muted">
                  {projectName}{boardName ? ` · ${boardName}` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-border bg-card px-2 py-0.5 font-mono text-xs text-muted">
              {rules.length} rule{rules.length === 1 ? "" : "s"} in AGENTS.md
            </span>
            {!composerOpen && (
              <button
                type="button"
                onClick={openComposer}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <Icon name="plus" size={12} />
                New rule
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 max-w-[720px] text-[12px] leading-relaxed text-muted">
          Rules live in <code className="font-mono text-text/80">AGENTS.md</code> and are injected
          into every agent context pack. Click a card to read the full rule; edit that file
          directly for larger changes.
        </p>

        {error && (
          <div role="alert" className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[11px] text-danger">
            {error}
          </div>
        )}

        {/* New rule creator — collapsed until asked for, so the grid stays above the fold. */}
        {composerOpen && (
          <div className="mt-4 rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-text">New rule</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPresets(!showPresets)}
                  className="text-[11px] text-accent-text hover:underline"
                >
                  {showPresets ? "Hide presets" : "Browse presets"}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode(!previewMode)}
                  className="text-[11px] text-muted hover:text-text"
                >
                  {previewMode ? "Edit" : "Preview"}
                </button>
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  aria-label="Close new rule"
                  className="rounded p-1 text-muted hover:bg-white/[0.05] hover:text-text"
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            </div>

            {showPresets && (
              <div className="mb-4 grid grid-cols-1 gap-2 rounded border border-border bg-card p-3 sm:grid-cols-2">
                {RULE_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTitle(preset.title);
                      setBody(preset.body);
                      setShowPresets(false);
                    }}
                    className="group rounded border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-surface"
                  >
                    <p className="text-xs font-medium text-text group-hover:text-accent-text">
                      {preset.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{preset.body}</p>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <input
                ref={titleRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Rule title (e.g. Always verify with tests)"
                aria-label="Rule title"
                className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {previewMode ? (
                <div className="min-h-[96px] whitespace-pre-wrap rounded-md border border-border bg-bg p-3 text-xs leading-relaxed text-text">
                  {body.trim() || (
                    <span className="italic text-muted">Rule body preview will appear here...</span>
                  )}
                </div>
              ) : (
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={4}
                  placeholder="What must every agent do or avoid?"
                  aria-label="Rule instructions"
                  className="w-full resize-none rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={!title.trim() || busy}
                  className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? "Saving…" : "Add rule"}
                </button>
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-[12px] text-muted hover:text-text"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Current rules: a Keep-style grid so long bodies stop pushing the page down. */}
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-text">
              Current rules
              {searchQuery.trim() && (
                <span className="ml-1.5 font-normal text-muted">
                  {filteredRules.length} of {rules.length}
                </span>
              )}
            </h3>
            {rules.length > 0 && (
              <div className="relative w-48 sm:w-64">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter rules..."
                  className="w-full rounded border border-border bg-surface py-1 pl-7 pr-2 text-xs text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <span className="pointer-events-none absolute left-2 top-1.5 text-muted">
                  <Icon name="search" size={12} />
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="h-[148px] animate-pulse rounded-lg bg-surface" />
              ))}
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-[12px] text-muted">
              {searchQuery
                ? "No rules match your search."
                : "No rules yet. Add one above, or edit AGENTS.md."}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredRules.map((rule) => (
                <li key={rule.title}>
                  <article className="flex h-full flex-col rounded-lg border border-border bg-card transition-colors hover:border-border-strong">
                    <button
                      type="button"
                      onClick={() => setSelectedRule(rule)}
                      className="flex-1 px-3.5 py-3 text-left"
                      aria-label={`Read rule ${rule.title}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <h4 className="truncate text-[12.5px] font-medium text-text">
                          {rule.title}
                        </h4>
                      </div>
                      <p className="mt-1.5 line-clamp-5 whitespace-pre-line text-[11.5px] leading-relaxed text-muted">
                        {rule.body}
                      </p>
                    </button>
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 px-2.5 py-1.5">
                      <span className="font-mono text-[9.5px] text-muted">
                        {wordCount(rule.body)} words
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void copy(rule)}
                          className="rounded px-1.5 py-0.5 text-[9.5px] text-muted hover:bg-white/[0.05] hover:text-text"
                          title="Copy rule body"
                        >
                          {copiedTitle === rule.title ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(rule.title)}
                          disabled={busy}
                          className="rounded border border-border px-1.5 py-0.5 text-[9.5px] text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {selectedRule && (
        <AccessibleDialog
          label={`Rule ${selectedRule.title}`}
          onClose={() => setSelectedRule(null)}
          className="rule-dialog"
        >
          <div className="flex items-start gap-2 border-b border-border px-4 py-3">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-semibold leading-snug text-text">
                {selectedRule.title}
              </h2>
              <p className="mt-0.5 font-mono text-[9.5px] text-muted">
                {wordCount(selectedRule.body)} words · AGENTS.md
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedRule(null)}
              aria-label="Close rule"
              className="rounded p-1 text-muted hover:bg-white/[0.05] hover:text-text"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted-strong">
              {selectedRule.body}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            <button
              type="button"
              onClick={() => void copy(selectedRule)}
              className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-[11px] text-muted hover:text-text"
            >
              <Icon name={copiedTitle === selectedRule.title ? "check" : "copy"} size={11} />
              {copiedTitle === selectedRule.title ? "Copied" : "Copy body"}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void remove(selectedRule.title)}
                disabled={busy}
                className="rounded border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
              >
                Remove rule
              </button>
              <button
                type="button"
                onClick={() => setSelectedRule(null)}
                className="rounded bg-surface px-2.5 py-1 text-[11px] text-text hover:bg-card-hover"
              >
                Close
              </button>
            </div>
          </div>
        </AccessibleDialog>
      )}
    </div>
  );
}
