import React, { useEffect, useState } from "react";
import type { Board as BoardType } from "../lib/types";
import { fetchConfig, type BoardConfig } from "../lib/api";
import { useTheme, type Theme } from "../lib/theme";

export function SettingsView({
  board,
  onSaveBoard,
}: {
  board: BoardType;
  onSaveBoard: (b: BoardType) => void;
}) {
  const [title, setTitle] = useState(board.title);
  const [description, setDescription] = useState(board.description || "");
  const [cols, setCols] = useState(board.columns.map((c) => ({ id: c.id, name: c.name })));
  const [ai, setAi] = useState<BoardConfig["ai"] | null>(null);
  const { theme, setTheme } = useTheme();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => { setTitle(board.title); setDescription(board.description || ""); setCols(board.columns.map((c) => ({ id: c.id, name: c.name }))); }, [board.title, board.description, board.columns]);
  useEffect(() => { fetchConfig().then((c) => setAi(c?.ai ?? null)); }, []);

  const notify = (msg: string) => {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(null), 2500);
  };

  const save = (next: BoardType) => {
    onSaveBoard(next);
    notify("Saved");
  };

  const onSaveTitle = () => {
    const b = { ...board, title: title.trim() || board.title, description: description.trim() || undefined };
    save(b);
  };

  const onRenameColumn = (id: string, name: string) => {
    const nextCols = cols.map((c) => (c.id === id ? { ...c, name } : c));
    setCols(nextCols);
    const b = { ...board, columns: nextCols };
    save(b);
  };

  const onAddColumn = () => {
    const base = "new-column";
    let id = base;
    let i = 2;
    while (cols.some((c) => c.id === id)) { id = `${base}-${i}`; i++; }
    const nextCols = [...cols, { id, name: id }];
    setCols(nextCols);
    save({ ...board, columns: nextCols });
  };

  const onRemoveColumn = (id: string) => {
    if (cols.length <= 1) return;
    const nextCols = cols.filter((c) => c.id !== id);
    setCols(nextCols);
    const first = nextCols[0].id;
    const b = {
      ...board,
      columns: nextCols,
      cards: board.cards.map((c) => (c.column === id ? { ...c, column: first } : c)),
    };
    save(b);
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h3 className="text-xs font-semibold text-text mb-3">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {savedMsg && (
          <div className="text-[11px] text-success bg-success/10 border border-success/20 rounded px-3 py-2">
            {savedMsg}
          </div>
        )}

        {/* Board identity */}
        <Section title="Board">
          <div className="space-y-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={onSaveTitle}
                className="w-full bg-bg border border-border rounded px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={onSaveTitle}
                rows={2}
                className="w-full bg-bg border border-border rounded px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              />
            </label>
          </div>
        </Section>

        {/* Columns */}
        <Section title="Columns">
          <div className="space-y-2">
            {cols.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted w-20 truncate shrink-0">{c.id}</span>
                <input
                  value={c.name}
                  onChange={(e) => onRenameColumn(c.id, e.target.value)}
                  className="flex-1 bg-bg border border-border rounded px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={() => onRemoveColumn(c.id)}
                  disabled={cols.length <= 1}
                  className="text-muted hover:text-danger transition-colors disabled:opacity-30"
                  title="Remove column (cards move to the first column)"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={onAddColumn}
              className="text-[11px] px-2 py-1 rounded border border-border text-muted hover:text-accent hover:border-accent transition-colors"
            >
              + Add column
            </button>
          </div>
        </Section>

        {/* Theme */}
        <Section title="Theme">
          <div className="flex bg-surface rounded-md p-0.5 w-fit border border-border">
            {(["black", "light", "system"] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-1 text-xs rounded font-medium capitalize transition-colors ${
                  theme === t ? "bg-accent text-white" : "text-muted hover:text-text"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Section>

        {/* AI config */}
        <Section title="AI provider">
          {ai ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted w-20">Base URL</span>
                <span className="font-mono text-muted-strong">{ai.base_url || "(default)"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted w-20">Model</span>
                <span className="font-mono text-muted-strong">{ai.model || "(default)"}</span>
              </div>
              <p className="text-[11px] text-muted pt-1">
                Configure with <span className="font-mono">barkcli agent config set</span> in the terminal.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted">No project config found.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
