import { useCallback, useEffect, useState } from "react";
import { fetchWorkingTreeDiff, openInEditor } from "../lib/api";
import type { WorkingTreeDiff } from "../lib/types";
import { UnifiedDiff } from "../components/UnifiedDiff";
import { Icon } from "../components/Icon";

/**
 * Project working-tree changes (uncommitted edits + untracked files).
 *
 * This is the top-right "Changes" surface entry point: it is project-scoped,
 * not thread-scoped, so it works before a thread exists.
 */
export function WorkingTreeDiffView({ onClose }: { onClose?: () => void }) {
  const [data, setData] = useState<WorkingTreeDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchWorkingTreeDiff()
      .then((next) => {
        if (cancelled) return;
        if (next) setData(next);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  const files = data?.files.length ?? 0;
  const hasPatch = Boolean(data?.diff && data.diff.trim().length > 0);

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-bg" aria-label="Working tree changes">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <Icon name="code" size={13} className="text-muted-strong" />
        <span className="text-[12px] font-semibold text-text">Working tree</span>
        {data?.branch && (
          <span className="flex items-center gap-1 rounded border border-border/70 bg-surface/60 px-1.5 py-0.5 font-mono text-[9.5px] text-muted">
            <Icon name="branch" size={9} />
            {data.branch}
          </span>
        )}
        {data && !loading && (
          <span className="flex items-center gap-1.5 text-[10.5px]">
            <span className="font-mono text-[10px] text-muted-strong">
              {files} {files === 1 ? "file" : "files"}
            </span>
            <span className="font-mono text-[10px] font-semibold text-emerald-400">+{data.additions}</span>
            <span className="font-mono text-[10px] font-semibold text-rose-400">−{data.deletions}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh working tree changes"
            title="Refresh changes"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <Icon name="refresh" size={12} className={loading ? "animate-spin" : undefined} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close changes"
              title="Close changes"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !data && (
          <div className="space-y-3 p-4" role="status" aria-label="Loading working tree changes">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="space-y-1.5">
                <div className="h-2.5 w-32 animate-pulse rounded bg-surface" />
                <div className="h-3 w-full animate-pulse rounded bg-surface/70" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-surface/50" />
              </div>
            ))}
          </div>
        )}

        {!loading && failed && (
          <div className="p-4" role="alert">
            <p className="text-[12px] font-semibold text-text">Could not read working tree changes</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              The project may be unavailable, or git may not be installed. Your files are untouched.
            </p>
            <button
              type="button"
              onClick={refresh}
              className="mt-3 h-7 rounded-md border border-border px-3 text-[11.5px] font-medium text-muted-strong transition-colors hover:border-border-strong hover:bg-surface hover:text-text"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !failed && data && !hasPatch && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-muted-strong">
              <Icon name="check" size={16} />
            </span>
            <p className="text-[13px] font-semibold text-text">Working tree clean</p>
            <p className="max-w-[300px] text-[11.5px] leading-relaxed text-muted">
              No uncommitted edits in the project. Changes made by a thread stay in its own worktree until merged.
            </p>
          </div>
        )}

        {!loading && !failed && hasPatch && (
          <div className="px-2 pb-6 pt-2">
            {data?.truncated && (
              <p className="mx-2 mb-2 rounded-md border border-warning/40 bg-warning-soft px-2.5 py-1.5 text-[10.5px] leading-relaxed text-warning" role="status">
                Patch is large and was truncated. Review the remaining files in your editor.
              </p>
            )}
            <UnifiedDiff
              diff={data!.diff}
              emptyLabel="No changes in the working tree."
              onOpenLine={(path, line) => void openInEditor(path, line)}
            />
          </div>
        )}
      </div>
    </section>
  );
}
