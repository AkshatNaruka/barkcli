import { Fragment, useMemo, useState } from "react";
import type { ReviewState } from "../lib/types";
import { Icon } from "./Icon";

export interface DiffLine {
  kind: "context" | "add" | "delete";
  oldNumber?: number;
  newNumber?: number;
  text: string;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath?: string;
  path: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  binary?: boolean;
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;
const GIT_FILE_RE = /^diff --git a\/(.+?) b\/(.+)$/;

function cleanPath(path: string): string {
  return path.replace(/^[ab]\//, "").replace(/^"|"$/g, "");
}

/**
 * Parse the unified diff the sidecar returns. Git's `diff --git` headers are
 * optional: some gates return a bare `---/+++` blob, and the renderer still
 * needs to show something useful.
 */
export function parseUnifiedDiff(text: string): DiffFile[] {
  if (!text.trim()) return [];

  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNumber = 0;
  let newNumber = 0;

  const startFile = (path?: string, oldPath?: string) => {
    current = {
      path: path ? cleanPath(path) : "diff",
      oldPath: oldPath ? cleanPath(oldPath) : undefined,
      additions: 0,
      deletions: 0,
      hunks: [],
    };
    files.push(current);
    hunk = null;
  };

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const gitFile = raw.match(GIT_FILE_RE);
    if (gitFile) {
      startFile(gitFile[2], gitFile[1]);
      continue;
    }

    if (raw.startsWith("--- ")) {
      if (!current) startFile(undefined, raw.slice(4));
      current!.oldPath = cleanPath(raw.slice(4));
      continue;
    }
    if (raw.startsWith("+++ ")) {
      if (!current) startFile(raw.slice(4));
      current!.path = cleanPath(raw.slice(4));
      continue;
    }

    if (raw.startsWith("Binary files ") || raw === "GIT binary patch") {
      if (!current) startFile();
      current!.binary = true;
      continue;
    }

    const hunkMatch = raw.match(HUNK_RE);
    if (hunkMatch) {
      if (!current) startFile();
      oldNumber = Number(hunkMatch[1]);
      newNumber = Number(hunkMatch[2]);
      hunk = {
        header: raw,
        oldStart: oldNumber,
        newStart: newNumber,
        lines: [],
      };
      current!.hunks.push(hunk);
      continue;
    }

    if (!current || !hunk) continue;
    if (raw.startsWith("\\ No newline")) continue;

    const prefix = raw[0];
    const content = raw.slice(1);
    if (prefix === "+") {
      hunk.lines.push({ kind: "add", newNumber, text: content });
      newNumber++;
      files[files.length - 1].additions++;
    } else if (prefix === "-") {
      hunk.lines.push({ kind: "delete", oldNumber, text: content });
      oldNumber++;
      files[files.length - 1].deletions++;
    } else if (prefix === " " || raw === "") {
      hunk.lines.push({ kind: "context", oldNumber, newNumber, text: content });
      oldNumber++;
      newNumber++;
    }
  }

  return files;
}

function lineLabel(line?: number) {
  return line ? `line ${line}` : "file";
}

function CommentComposer({
  label,
  draft,
  setDraft,
  busy,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  label: string;
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="border-y border-accent/30 bg-surface px-3 py-2">
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-wide text-muted/60">
        <Icon name="comment" size={9} />
        Comment on {label}
      </div>
      <textarea
        autoFocus={autoFocus}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
          if (event.key === "Escape") onCancel();
        }}
        rows={2}
        placeholder="What should change?"
        className="mt-1.5 w-full resize-y rounded border border-border bg-bg px-2 py-1.5 text-[11px] text-text outline-none focus:border-accent/60"
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !draft.trim()}
          className="rounded bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
        >
          Add comment
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:text-text"
        >
          Cancel
        </button>
        <span className="ml-auto text-[9px] text-muted/45">⌘↵ to add</span>
      </div>
    </div>
  );
}

export function UnifiedDiff({
  diff,
  onlyPath,
  emptyLabel = "No changes in this worktree yet.",
  className = "",
  review,
  onToggleViewed,
  onAddComment,
  onResolveComment,
  onDeleteComment,
  onOpenLine,
}: {
  diff: string;
  onlyPath?: string;
  /** Optional guidance when the backend has no diff text. */
  emptyLabel?: string;
  className?: string;
  /** Persisted review state for this run/card. */
  review?: ReviewState | null;
  onToggleViewed?: (path: string, viewed: boolean) => void;
  onAddComment?: (
    path: string,
    line: number | undefined,
    side: string | undefined,
    body: string
  ) => void | Promise<void>;
  onResolveComment?: (id: string, resolved: boolean) => void;
  onDeleteComment?: (id: string) => void;
  onOpenLine?: (path: string, line?: number) => void;
}) {
  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const [active, setActive] = useState<{
    path: string;
    line?: number;
    side?: string;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const [wrapLines, setWrapLines] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const visibleFiles = useMemo(
    () => files.filter((file) => !onlyPath || file.path === onlyPath),
    [files, onlyPath]
  );

  const totals = useMemo(
    () =>
      visibleFiles.reduce(
        (acc, file) => {
          acc.additions += file.additions;
          acc.deletions += file.deletions;
          return acc;
        },
        { additions: 0, deletions: 0 }
      ),
    [visibleFiles]
  );

  const allCollapsed =
    visibleFiles.length > 0 && visibleFiles.every((f) => Boolean(collapsedFiles[f.path]));

  const toggleAllCollapsed = () => {
    if (allCollapsed) {
      setCollapsedFiles({});
    } else {
      const next: Record<string, boolean> = {};
      for (const f of visibleFiles) next[f.path] = true;
      setCollapsedFiles(next);
    }
  };

  if (!diff.trim()) {
    return (
      <div className={`px-4 py-10 text-center text-[11px] text-muted ${className}`}>
        {emptyLabel}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <pre
        className={`overflow-x-auto whitespace-pre p-3 font-mono text-[11px] leading-relaxed text-muted ${className}`}
      >
        {diff}
      </pre>
    );
  }

  const submitComment = async () => {
    if (!active || !onAddComment || !draft.trim()) return;
    setBusy(true);
    try {
      await onAddComment(active.path, active.line, active.side, draft.trim());
      setDraft("");
      setActive(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`space-y-3 ${className}`} aria-label="Unified diff">
      {/* Diff Sub-Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-surface/40 px-3 py-1.5 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-bg/70 px-2 py-0.5 font-medium text-text">
            <span>Changes</span>
            <span className="text-[9px] text-muted">▾</span>
          </span>
          <span className="text-[10.5px] text-muted">vs</span>
          <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-bg/70 px-2 py-0.5 font-mono text-[10.5px] text-muted-strong">
            <span>origin/master</span>
            <span className="text-[9px] text-muted">▾</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className="font-mono text-[10.5px] font-medium text-muted-strong"
            title={`+${totals.additions} −${totals.deletions}`}
          >
            {`+${totals.additions} / −${totals.deletions}`}
          </span>
          <button
            type="button"
            onClick={toggleAllCollapsed}
            title={allCollapsed ? "Expand all files" : "Collapse all files"}
            className="rounded border border-border/70 bg-bg/60 px-1.5 py-0.5 text-[10px] font-medium text-muted transition-colors hover:border-border-strong hover:text-text"
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
          <button
            type="button"
            onClick={() => setWrapLines((w) => !w)}
            title="Toggle line wrap"
            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              wrapLines
                ? "border-accent/40 bg-accent-soft text-accent-text"
                : "border-border/70 bg-bg/60 text-muted hover:text-text"
            }`}
          >
            Wrap
          </button>
        </div>
      </div>

      {onlyPath && !files.some((file) => file.path === onlyPath) && (
        <p role="alert" className="p-4 text-warning">
          That file is not in this revision. Choose All files to continue.
        </p>
      )}
      {visibleFiles.map((file, fileIndex) => {
        const viewed = Boolean(review?.files?.[file.path]?.viewed);
        const isCollapsed = Boolean(collapsedFiles[file.path]);
        const isNewFile = file.deletions === 0 && file.additions > 0;
        const comments = (review?.comments || []).filter(
          (comment) => comment.path === file.path
        );
        const openComments = comments.filter((comment) => !comment.resolved);
        return (
          <section key={`${file.path}-${fileIndex}`} className="min-w-0">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-border/80 bg-surface/95 px-3 py-2 backdrop-blur">
              <button
                type="button"
                onClick={() =>
                  setCollapsedFiles((prev) => ({
                    ...prev,
                    [file.path]: !prev[file.path],
                  }))
                }
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-white/[0.06] hover:text-text"
                aria-label={isCollapsed ? `Expand ${file.path}` : `Collapse ${file.path}`}
              >
                <span className="text-[10px]">{isCollapsed ? "▸" : "▾"}</span>
              </button>
              <span
                className={`shrink-0 rounded px-1 py-0.2 font-mono text-[9.5px] font-semibold ${
                  isNewFile
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-accent-soft text-accent-text"
                }`}
              >
                {isNewFile ? "A" : "M"}
              </span>
              <button
                type="button"
                onClick={() => onOpenLine?.(file.path)}
                className="min-w-0 truncate text-left font-mono text-[11px] text-text hover:text-accent-text"
                title="Open in editor"
              >
                {file.path}
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(file.path);
                  setCopiedPath(file.path);
                  setTimeout(() => setCopiedPath(null), 1200);
                }}
                title="Copy file path"
                className="shrink-0 rounded px-1 py-0.5 text-[9.5px] text-muted/70 hover:bg-white/[0.06] hover:text-text"
              >
                {copiedPath === file.path ? "Copied" : "Copy"}
              </button>
              <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
                {file.additions > 0 && (
                  <span className="rounded bg-emerald-500/10 px-1 py-0.2 font-semibold text-emerald-400">
                    +{file.additions}
                  </span>
                )}
                {file.deletions > 0 && (
                  <span className="rounded bg-rose-500/10 px-1 py-0.2 font-semibold text-rose-400">
                    −{file.deletions}
                  </span>
                )}
              </span>
              {onAddComment && (
                <button
                  type="button"
                  onClick={() =>
                    setActive({
                      path: file.path,
                      line: undefined,
                      side: undefined,
                    })
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-border/70 px-1.5 py-0.5 text-[9px] text-muted hover:text-text"
                  title="Comment on this file"
                >
                  <Icon name="comment" size={9} /> Comment
                </button>
              )}
              {onToggleViewed && (
                <button
                  type="button"
                  aria-pressed={viewed}
                  onClick={() => onToggleViewed(file.path, !viewed)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] ${
                    viewed
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-border/70 text-muted hover:text-text"
                  }`}
                  title={viewed ? "Mark as not viewed" : "Mark as viewed"}
                >
                  <Icon name={viewed ? "check" : "eye"} size={9} />
                  {viewed ? "Viewed" : "View"}
                </button>
              )}
            </div>

            {comments.length > 0 && (
              <div className="border-b border-border/60 bg-bg/40 px-3 py-2">
                <div className="flex items-center gap-2 text-[9px] uppercase tracking-wide text-muted/60">
                  <Icon name="comment" size={9} />
                  {openComments.length} open · {comments.length} total
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`rounded border px-2 py-1.5 text-[10px] ${
                        comment.resolved
                          ? "border-border/50 text-muted/50"
                          : "border-warning/25 bg-warning-soft text-text"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] text-muted/65">
                          {lineLabel(comment.line)}
                        </span>
                        {comment.side && (
                          <span className="font-mono text-[8.5px] uppercase text-muted/50">
                            {comment.side}
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-1">
                          {onResolveComment && (
                            <button
                              type="button"
                              onClick={() =>
                                onResolveComment(comment.id, !comment.resolved)
                              }
                              className="rounded px-1 py-0.5 text-[9px] text-muted hover:bg-white/[0.05] hover:text-text"
                            >
                              {comment.resolved ? "Reopen" : "Resolve"}
                            </button>
                          )}
                          {onDeleteComment && (
                            <button
                              type="button"
                              onClick={() => onDeleteComment(comment.id)}
                              className="rounded px-1 py-0.5 text-[9px] text-muted/60 hover:bg-danger-soft hover:text-danger"
                              aria-label="Delete comment"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{comment.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {active?.path === file.path && active.line === undefined && (
              <CommentComposer
                label="file"
                draft={draft}
                setDraft={setDraft}
                busy={busy}
                onSubmit={() => void submitComment()}
                onCancel={() => {
                  setActive(null);
                  setDraft("");
                }}
                autoFocus
              />
            )}

            {!isCollapsed &&
              (file.binary ? (
                <p className="px-3 py-3 text-[10.5px] text-muted">Binary file changed.</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className={wrapLines ? "w-full" : "min-w-max"}>
                    {file.hunks.map((block, hunkIndex) => (
                      <div key={hunkIndex}>
                        <div className="border-b border-border/50 bg-bg/60 px-3 py-1 font-mono text-[9.5px] text-muted">
                          {block.header}
                        </div>
                        {block.lines.map((line, lineIndex) => {
                          const tone =
                            line.kind === "add"
                              ? "bg-emerald-500/[0.13] border-l-2 border-emerald-500"
                              : line.kind === "delete"
                                ? "bg-rose-500/[0.13] border-l-2 border-rose-500"
                                : "border-l-2 border-transparent";
                          const sign =
                            line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " ";
                          const signTone =
                            line.kind === "add"
                              ? "text-emerald-400 font-bold"
                              : line.kind === "delete"
                                ? "text-rose-400 font-bold"
                                : "text-muted/45";
                          const codeTone =
                            line.kind === "add"
                              ? "text-emerald-200"
                              : line.kind === "delete"
                                ? "text-rose-300 opacity-90 line-through/50"
                                : "text-text";
                          const oldNumTone =
                            line.kind === "delete"
                              ? "text-rose-400/70"
                              : "text-muted/45";
                          const newNumTone =
                            line.kind === "add"
                              ? "text-emerald-400/70"
                              : "text-muted/45";
                          const lineNumber = line.newNumber ?? line.oldNumber;
                          const side = line.kind === "delete" ? "old" : "new";
                          return (
                            <Fragment key={lineIndex}>
                              <div
                                className={`group relative grid grid-cols-[2.5rem_2.5rem_1.25rem_minmax(0,1fr)] font-mono text-[11px] leading-[1.65] ${tone}`}
                              >
                                <span className={`select-none pr-2 text-right text-[9.5px] ${oldNumTone}`}>
                                  {line.oldNumber ?? ""}
                                </span>
                                <span className={`select-none pr-2 text-right text-[9.5px] ${newNumTone}`}>
                                  {line.newNumber ?? ""}
                                </span>
                                <span className={`select-none text-center ${signTone}`}>
                                  {sign}
                                </span>
                                <code
                                  className={`${
                                    wrapLines ? "whitespace-pre-wrap break-all" : "whitespace-pre"
                                  } pr-10 ${codeTone}`}
                                >
                                  {line.text.length ? line.text : "\u00a0"}
                                </code>
                                {onAddComment && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActive({
                                        path: file.path,
                                        line: lineNumber,
                                        side,
                                      })
                                    }
                                    className="absolute right-2 top-0.5 hidden rounded border border-border/80 bg-surface px-1 text-[9px] text-muted hover:text-text group-hover:inline-flex"
                                    aria-label={`Comment on ${file.path} line ${lineNumber ?? ""}`}
                                    title="Add inline comment"
                                  >
                                    +
                                  </button>
                                )}
                              </div>
                              {active?.path === file.path &&
                                active.line === lineNumber &&
                                active.side === side && (
                                  <CommentComposer
                                    label={lineLabel(lineNumber)}
                                    draft={draft}
                                    setDraft={setDraft}
                                    busy={busy}
                                    onSubmit={() => void submitComment()}
                                    onCancel={() => {
                                      setActive(null);
                                      setDraft("");
                                    }}
                                    autoFocus
                                  />
                                )}
                            </Fragment>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
