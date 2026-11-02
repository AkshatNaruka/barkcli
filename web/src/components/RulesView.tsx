import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Rule } from "../lib/types";
import { createRule, deleteRule, fetchRules } from "../lib/api";
import { Icon } from "./Icon";

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

export function RulesView() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [load]);

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
      await load();
    } finally {
      setBusy(false);
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
      <div className="mx-auto max-w-[960px] px-5 py-5 md:px-7">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent-text">
              <Icon name="doc" size={15} />
            </span>
            <h1 className="text-[18px] font-semibold tracking-tight text-text">Rules</h1>
          </div>
          <span className="text-xs text-muted font-mono bg-card px-2 py-0.5 rounded border border-border">
            {rules.length} rule{rules.length === 1 ? "" : "s"} in AGENTS.md
          </span>
        </div>
        <p className="mt-2 max-w-[720px] text-[12px] leading-relaxed text-muted">
          Rules live in <code className="font-mono text-text/80">AGENTS.md</code> and are
          injected into every agent context pack. Edit that file directly for larger
          changes; these controls append and remove sections.
        </p>

        {/* New rule creator */}
        <div className="mt-5 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-text">New rule</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPresets(!showPresets)}
                className="text-[11px] text-accent-text hover:underline"
              >
                {showPresets ? "Hide Presets" : "Browse Presets"}
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode(!previewMode)}
                className="text-[11px] text-muted hover:text-text"
              >
                {previewMode ? "Edit" : "Preview"}
              </button>
            </div>
          </div>

          {showPresets && (
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-card p-3 rounded border border-border">
              {RULE_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setTitle(preset.title);
                    setBody(preset.body);
                    setShowPresets(false);
                  }}
                  className="text-left p-2 rounded hover:bg-surface border border-transparent hover:border-border transition-colors group"
                >
                  <p className="text-xs font-medium text-text group-hover:text-accent-text">{preset.title}</p>
                  <p className="text-[11px] text-muted line-clamp-2 mt-0.5">{preset.body}</p>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Rule title (e.g. Always verify with tests)"
              aria-label="Rule title"
              className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {previewMode ? (
              <div className="min-h-[96px] rounded-md border border-border bg-bg p-3 text-xs text-text whitespace-pre-wrap leading-relaxed">
                {body.trim() || <span className="text-muted italic">Rule body preview will appear here...</span>}
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
              {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
            </div>
          </div>
        </div>

        {/* Current rules list with search filter */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-xs font-semibold text-text">Current rules</h3>
            {rules.length > 0 && (
              <div className="relative w-48 sm:w-64">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter rules..."
                  className="w-full rounded border border-border bg-surface pl-7 pr-2 py-1 text-xs text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <span className="absolute left-2 top-1.5 text-muted pointer-events-none">
                  <Icon name="search" size={12} />
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-16 animate-pulse rounded-md bg-surface" />
              ))}
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-[12px] text-muted">
              {searchQuery ? "No rules match your search." : "No rules yet. Add one above, or edit AGENTS.md."}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRules.map((rule) => (
                <div key={rule.title} className="rounded-md border border-border bg-card px-3 py-2.5 hover:border-border-strong transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        <p className="text-[12.5px] font-medium text-text">{rule.title}</p>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">
                        {rule.body}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(rule.title)}
                      disabled={busy}
                      className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
