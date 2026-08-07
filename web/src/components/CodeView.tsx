import React, { useEffect, useMemo, useState } from "react";
import type { Board as BoardType, Card, CardContext } from "../lib/types";
import { codeSearch, fetchContext, syncContext, clearContext } from "../lib/api";

function statusCls(status: string): string {
  switch (status) {
    case "clean": return "bg-success/10 text-success";
    case "changed": return "bg-warning/10 text-warning";
    case "stale": return "bg-danger/10 text-danger";
    default: return "bg-surface text-muted";
  }
}

export function CodeView({
  board,
  onOpenFile,
  onEditCard,
}: {
  board: BoardType;
  onOpenFile: (path: string, line?: number) => void;
  onEditCard: (card: Card) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ path: string; symbols: string[]; cards: string[] }[]>([]);
  const [searching, setSearching] = useState(false);
  const [ctx, setCtx] = useState<Record<string, CardContext> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchContext().then((d) => setCtx(d?.cards || null));
  }, [board.title]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      codeSearch(query.trim()).then((r) => { setResults(r); setSearching(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const cardById = useMemo(() => {
    const m: Record<string, Card> = {};
    for (const c of board.cards) m[c.id] = c;
    return m;
  }, [board.cards]);

  const onSync = async () => {
    setSyncing(true);
    setMessage(null);
    const ok = await syncContext();
    setSyncing(false);
    const d = await fetchContext();
    setCtx(d?.cards || null);
    setMessage(ok ? "Context synced." : "Sync failed.");
    setTimeout(() => setMessage(null), 3000);
  };

  const onClear = async () => {
    await clearContext();
    setCtx(null);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Search */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-text mb-3">Symbol search</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbols… e.g. verify_token, handleKey"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {searching && <p className="text-xs text-muted mt-2">Searching…</p>}
          {!searching && query.trim() && results.length === 0 && (
            <p className="text-xs text-muted mt-2">No matches.</p>
          )}
          <div className="mt-2 space-y-1.5">
            {results.map((r) => (
              <div key={r.path} className="flex items-center gap-2 text-xs border border-border/60 rounded px-2 py-1.5">
                <button onClick={() => onOpenFile(r.path)} className="font-mono text-accent hover:underline truncate" title={r.path}>
                  {r.path}
                </button>
                {r.symbols.map((s) => (
                  <span key={s} className="text-[10px] font-mono bg-bg px-1.5 py-0.5 rounded text-muted-strong shrink-0">{s}</span>
                ))}
                <span className="flex-1" />
                {r.cards.map((id) => (
                  <button
                    key={id}
                    onClick={() => { const c = cardById[id]; if (c) onEditCard(c); }}
                    className="text-[10px] font-mono bg-accent/10 text-accent px-1.5 py-0.5 rounded hover:bg-accent/20 shrink-0"
                  >
                    {id}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Context coverage */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-text">Code context coverage</h3>
            <div className="flex items-center gap-2">
              {message && <span className="text-[11px] text-success">{message}</span>}
              <button
                onClick={onSync}
                disabled={syncing}
                className="text-[11px] px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {syncing ? "Syncing…" : "Sync"}
              </button>
              <button
                onClick={onClear}
                className="text-[11px] px-2 py-1 rounded border border-border text-muted hover:text-danger hover:border-danger transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          {!ctx && <p className="text-xs text-muted">No context yet. Run <span className="font-mono">barkcli context scan</span> in the terminal, or Sync above.</p>}
          {ctx && (
            <div className="space-y-1.5">
              {board.cards.map((card) => {
                const c = ctx[card.id];
                if (!c || c.files.length === 0) return null;
                return (
                  <div key={card.id} className="border border-border/60 rounded p-2.5 space-y-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onEditCard(card)} className="text-xs font-mono text-accent hover:underline">{card.id}</button>
                      <span className="text-xs text-muted truncate">{card.title}</span>
                      <span className="flex-1" />
                      <span className="text-[10px] text-muted font-mono">{c.files.length} file(s)</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {c.files.map((f) => (
                        <button
                          key={f.path}
                          onClick={() => onOpenFile(f.path)}
                          className="flex items-center gap-1.5 text-[10px] font-mono bg-bg rounded px-1.5 py-0.5 hover:text-accent transition-colors"
                          title={f.symbols.join(", ")}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.status === "clean" ? "bg-success" : f.status === "changed" ? "bg-warning" : "bg-danger"}`} />
                          <span className="text-muted-strong truncate max-w-[260px]">{f.path}</span>
                        </button>
                      ))}
                    </div>
                    {c.ai && (
                      <div className="text-[11px] text-muted-strong bg-bg rounded px-2 py-1.5">
                        <span className="text-accent-text font-mono mr-1">ai:</span>
                        {c.ai.summary}
                        {c.ai.model && <span className="text-muted ml-1 font-mono">[{c.ai.model}]</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
