import { useMemo } from "react";
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

export function UnifiedDiff({
  diff,
  emptyLabel = "No changes in this worktree yet.",
  className = "",
}: {
  diff: string;
  /** Optional guidance when the backend has no diff text. */
  emptyLabel?: string;
  className?: string;
}) {
  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);

  if (!diff.trim()) {
    return (
      <div className={`px-4 py-10 text-center text-[11px] text-muted ${className}`}>
        {emptyLabel}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <pre className={`overflow-x-auto whitespace-pre p-3 font-mono text-[11px] leading-relaxed text-muted ${className}`}>
        {diff}
      </pre>
    );
  }

  return (
    <div className={`space-y-5 ${className}`} aria-label="Unified diff">
      {files.map((file, fileIndex) => (
        <section key={`${file.path}-${fileIndex}`} className="min-w-0">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-border/80 bg-surface/95 px-3 py-2 backdrop-blur">
            <Icon name="doc" size={11} className="shrink-0 text-muted" />
            <span className="min-w-0 truncate font-mono text-[10.5px] text-text">
              {file.path}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[9.5px]">
              {file.additions > 0 && <span className="text-success">+{file.additions}</span>}
              {file.deletions > 0 && <span className="text-danger">−{file.deletions}</span>}
            </span>
          </div>

          {file.binary ? (
            <p className="px-3 py-3 text-[10.5px] text-muted">Binary file changed.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-max">
                {file.hunks.map((block, hunkIndex) => (
                  <div key={hunkIndex}>
                    <div className="border-b border-border/50 bg-bg/60 px-3 py-1 font-mono text-[9.5px] text-muted">
                      {block.header}
                    </div>
                    {block.lines.map((line, lineIndex) => {
                      const tone =
                        line.kind === "add"
                          ? "bg-success/[0.08]"
                          : line.kind === "delete"
                            ? "bg-danger/[0.08]"
                            : "";
                      const sign =
                        line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " ";
                      const signTone =
                        line.kind === "add"
                          ? "text-success"
                          : line.kind === "delete"
                            ? "text-danger"
                            : "text-muted/45";
                      return (
                        <div
                          key={lineIndex}
                          className={`grid grid-cols-[2.5rem_2.5rem_1.25rem_minmax(0,1fr)] font-mono text-[11px] leading-[1.65] ${tone}`}
                        >
                          <span className="select-none pr-2 text-right text-[9.5px] text-muted/45">
                            {line.oldNumber ?? ""}
                          </span>
                          <span className="select-none pr-2 text-right text-[9.5px] text-muted/45">
                            {line.newNumber ?? ""}
                          </span>
                          <span className={`select-none text-center ${signTone}`}>{sign}</span>
                          <code className="whitespace-pre pr-4 text-text">
                            {line.text.length ? line.text : "\u00a0"}
                          </code>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
