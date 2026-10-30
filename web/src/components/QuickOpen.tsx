import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibleDialog } from "./AccessibleDialog";
import type { RepoEntry, RepoFile } from "../lib/types";
import { fetchRepoFile, fetchRepoTree, openInEditor } from "../lib/api";
import { Icon } from "./Icon";

interface QuickOpenProps {
  open: boolean;
  onClose: () => void;
  onAskBark?: (path: string) => void;
}

function score(path: string, query: string): number {
  const haystack = path.toLowerCase();
  const needle = query.toLowerCase();
  if (!needle) return 0;
  const base = path.split("/").pop()?.toLowerCase() || haystack;
  if (base.startsWith(needle)) return 100;
  if (base.includes(needle)) return 80;
  if (haystack.endsWith(`/${needle}`)) return 70;
  if (haystack.includes(needle)) return 50;
  // Subsequence match for paths like "src/app" -> "web/src/App.tsx".
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return 20;
  }
  return -1;
}

export function QuickOpen({ open, onClose, onAskBark }: QuickOpenProps) {
  const [entries, setEntries] = useState<RepoEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<RepoFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(null);
    setFile(null);
    setNotice(null);
    setLoading(true);
    fetchRepoTree(".", 10).then((result) => {
      setEntries((result?.entries || []).filter((entry) => entry.kind === "file"));
      setLoading(false);
    });
  }, [open]);

  const results = useMemo(() => {
    const files = entries
      .map((entry) => ({ entry, rank: score(entry.path, query) }))
      .filter((item) => item.rank >= 0)
      .sort((a, b) => b.rank - a.rank || a.entry.path.localeCompare(b.entry.path))
      .slice(0, 80);
    return files.map((item) => item.entry);
  }, [entries, query]);

  useEffect(() => {
    if (!open) return;
    const next = selected || results[0]?.path || null;
    if (next && next !== selected) setSelected(next);
  }, [open, results, selected]);

  useEffect(() => {
    if (!open || !selected) {
      setFile(null);
      return;
    }
    let cancelled = false;
    setFile(null);
    fetchRepoFile(selected).then((next) => {
      if (!cancelled) setFile(next);
    });
    return () => {
      cancelled = true;
    };
  }, [open, selected]);

  if (!open) return null;

  const move = (delta: number) => {
    if (results.length === 0) return;
    const index = Math.max(0, results.findIndex((entry) => entry.path === selected));
    const next = results[(index + delta + results.length) % results.length];
    setSelected(next.path);
  };

  const copyPath = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected);
      setNotice("Path copied.");
    } catch {
      setNotice(selected);
    }
    window.setTimeout(() => setNotice(null), 1800);
  };

  const ask = () => {
    if (!selected || !onAskBark) return;
    onAskBark(selected);
    onClose();
  };

  const lines = file?.content.split("\n") || [];
  const longFile = lines.length > 800;

  return (
    <AccessibleDialog label="Quick open" onClose={onClose} className="quick-open-dialog">
      <div className="quick-open-body flex h-[min(720px,86vh)] w-full max-w-[1080px] overflow-hidden bg-bg">
        <div className="flex w-[360px] shrink-0 flex-col border-r border-border/80">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3">
            <Icon name="search" size={14} className="text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onClose();
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  move(1);
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  move(-1);
                }
                if (event.key === "Enter" && selected) {
                  event.preventDefault();
                  onAskBark?.(selected);
                  onClose();
                }
              }}
              placeholder="Open file by name or path…"
              aria-label="Search files"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-text placeholder:text-muted/60 focus:outline-none"
            />
            <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted">
              esc
            </kbd>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {loading ? (
              <div className="space-y-2 p-2">
                {[0, 1, 2, 3, 4].map((row) => (
                  <div key={row} className="h-6 animate-pulse rounded bg-surface" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-10 text-center text-[11.5px] leading-relaxed text-muted">
                {entries.length === 0
                  ? "File access needs the local Bark server."
                  : "No files match that search."}
              </div>
            ) : (
              results.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => setSelected(entry.path)}
                  onDoubleClick={() => {
                    if (onAskBark) onAskBark(entry.path);
                    onClose();
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                    selected === entry.path
                      ? "bg-accent-soft text-text"
                      : "text-muted-strong hover:bg-white/[0.04] hover:text-text"
                  }`}
                >
                  <Icon name="doc" size={12} className="shrink-0 text-muted/70" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                    {entry.path}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="flex h-9 shrink-0 items-center justify-between border-t border-border/70 px-3 font-mono text-[9px] text-muted/60">
            <span>↑↓ move · enter ask</span>
            <span>{results.length} files</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-strong">
              {selected || "No file selected"}
            </span>
            {file && (
              <span className="shrink-0 font-mono text-[9.5px] text-muted/60">
                {file.bytes.toLocaleString()} bytes
              </span>
            )}
            <button
              type="button"
              onClick={copyPath}
              disabled={!selected}
              className="h-6 rounded px-2 text-[10px] text-muted transition-colors hover:bg-white/[0.05] hover:text-text disabled:opacity-30"
            >
              Copy path
            </button>
            <button
              type="button"
              onClick={() => selected && openInEditor(selected)}
              disabled={!selected}
              className="h-6 rounded px-2 text-[10px] text-muted transition-colors hover:bg-white/[0.05] hover:text-text disabled:opacity-30"
            >
              Open in editor
            </button>
            <button
              type="button"
              onClick={ask}
              disabled={!selected || !onAskBark}
              className="h-6 rounded bg-accent px-2 text-[10px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              Ask Bark
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close quick open"
              className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.05] hover:text-text"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
          {file ? (
            file.binary ? (
              <div className="flex flex-1 items-center justify-center text-[12px] text-muted">
                Binary file. Open it in your editor.
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto bg-[var(--bg)]">
                <table className="w-full border-collapse font-mono text-[11px] leading-[1.65]">
                  <tbody>
                    {lines.slice(0, 800).map((line, index) => (
                      <tr key={index} className="align-top">
                        <td className="w-12 select-none border-r border-border/50 px-2 text-right text-muted/40">
                          {index + 1}
                        </td>
                        <td className="whitespace-pre-wrap break-all px-3 text-muted-strong">
                          {line || " "}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(longFile || file.truncated) && (
                  <div className="border-t border-border/60 px-4 py-2 text-[10px] text-muted">
                    Preview truncated. Open the file in your editor for the full contents.
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="flex flex-1 items-center justify-center text-[12px] text-muted">
              {selected ? "Reading file…" : "Choose a file"}
            </div>
          )}
          {notice && (
            <div className="border-t border-border/60 px-3 py-1.5 font-mono text-[9.5px] text-success">
              {notice}
            </div>
          )}
        </div>
      </div>
    </AccessibleDialog>
  );
}
