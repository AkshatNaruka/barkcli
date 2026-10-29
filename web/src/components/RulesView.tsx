import React, { useCallback, useEffect, useState } from "react";
import type { Rule } from "../lib/types";
import { createRule, deleteRule, fetchRules } from "../lib/api";
import { Icon } from "./Icon";

export function RulesView() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
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

  const create = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await createRule(trimmed, body.trim() || "Describe the rule here.");
      if (!ok) {
        setError("Could not save the rule.");
        return;
      }
      setTitle("");
      setBody("");
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[960px] px-5 py-5 md:px-7">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent-text">
            <Icon name="doc" size={15} />
          </span>
          <h1 className="text-[18px] font-semibold tracking-tight text-text">Rules</h1>
        </div>
        <p className="mt-2 max-w-[720px] text-[12px] leading-relaxed text-muted">
          Rules live in <code className="font-mono text-text/80">AGENTS.md</code> and are
          injected into every agent context pack. Edit that file directly for larger
          changes; these controls append and remove sections.
        </p>

        <div className="mt-5 rounded-lg border border-border bg-surface p-4">
          <h3 className="text-xs font-semibold text-text mb-3">New rule</h3>
          <div className="space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Rule title"
              className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              placeholder="What must every agent do or avoid?"
              className="w-full resize-none rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void create()}
                disabled={!title.trim() || busy}
                className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Saving…" : "Add rule"}
              </button>
              {error && <span className="text-[11px] text-danger">{error}</span>}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-xs font-semibold text-text mb-3">Current rules</h3>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-16 animate-pulse rounded-md bg-surface" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-[12px] text-muted">
              No rules yet. Add one above, or edit <code className="font-mono text-text/80">AGENTS.md</code>.
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.title} className="rounded-md border border-border bg-card px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-text">{rule.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">
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
