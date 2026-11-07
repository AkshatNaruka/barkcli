import { useState } from "react";
import type { RunRecord } from "../lib/types";
import { Icon } from "../components/Icon";

function groupByDir(files: string[]): Array<{ dir: string; files: string[] }> {
  if (files.length === 0) return [];
  const map = new Map<string, string[]>();
  for (const f of files) {
    const parts = f.split("/");
    const dir = parts.length > 2 ? parts.slice(0, 2).join("/") : parts.slice(0, -1).join("/") || ".";
    const existing = map.get(dir) || [];
    existing.push(f);
    map.set(dir, existing);
  }
  return Array.from(map.entries()).map(([dir, list]) => ({ dir, files: list }));
}

export function DiffSummaryCard({
  run,
  onOpenDiff,
  onCopy,
}: {
  run: RunRecord;
  onOpenDiff: () => void;
  onCopy?: (text: string) => void;
}) {
  const files = run.diff_stats?.files ?? 0;
  if (files === 0) return null;
  const adds = run.diff_stats?.additions ?? 0;
  const dels = run.diff_stats?.deletions ?? 0;
  const groups = groupByDir(run.files_touched || []);
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({});
  const time = run.ended_at
    ? new Date(run.ended_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <section
      className="my-2 rounded-xl border border-border/80 bg-surface/25 p-3"
      aria-label="Changed files summary"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="font-semibold text-text">
            {files} changed file{files === 1 ? "" : "s"}
          </span>
          <span className="font-mono text-[11.5px] font-semibold text-emerald-400">+{adds}</span>
          <span className="font-mono text-[11.5px] font-semibold text-rose-400">−{dels}</span>
        </div>
        <button
          type="button"
          onClick={onOpenDiff}
          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-surface/60 px-2 py-0.5 text-[11px] font-medium text-muted-strong transition-colors hover:bg-surface hover:text-text"
        >
          <Icon name="doc" size={11} />
          Open diff
        </button>
      </div>
      {groups.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {groups.map((g) => {
            const isCollapsed = Boolean(collapsedDirs[g.dir]);
            return (
              <div key={g.dir} className="rounded-lg border border-border/50 bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedDirs((prev) => ({ ...prev, [g.dir]: !prev[g.dir] }))
                  }
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left font-mono text-[11.5px] text-muted-strong hover:text-text"
                >
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <span className="text-[10px] text-muted">{isCollapsed ? "▸" : "▾"}</span>
                    <Icon name="folder" size={12} className="shrink-0 text-muted" />
                    <span className="truncate">{g.dir}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] text-muted">
                    {g.files.length} file{g.files.length === 1 ? "" : "s"}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="border-t border-border/40 px-3 py-1 space-y-0.5">
                    {g.files.map((filePath) => {
                      const rel = filePath.startsWith(`${g.dir}/`)
                        ? filePath.slice(g.dir.length + 1)
                        : filePath;
                      return (
                        <button
                          key={filePath}
                          type="button"
                          onClick={onOpenDiff}
                          className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left font-mono text-[11px] text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
                        >
                          <span className="flex min-w-0 items-center gap-1.5 truncate">
                            <Icon name="doc" size={11} className="shrink-0 text-muted/70" />
                            <span className="truncate">{rel}</span>
                          </span>
                          <span className="shrink-0 text-[10.5px]">
                            <span className="text-emerald-400">+{Math.max(1, Math.round(adds / Math.max(1, files)))}</span>{" "}
                            <span className="text-rose-400">−{Math.round(dels / Math.max(1, files))}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 text-[10.5px] text-muted">
        {onCopy && (
          <button
            type="button"
            className="hover:text-text"
            onClick={() => onCopy(`+${adds} -${dels} in ${files} files`)}
            title="Copy summary"
          >
            <Icon name="copy" size={11} />
          </button>
        )}
        {run.branch ? (
          <span className="truncate font-mono" title={run.branch}>
            <Icon name="branch" size={11} className="mr-1 inline opacity-70" />
            {run.branch}
          </span>
        ) : null}
        {time ? <span className="ml-auto">{time}</span> : null}
      </div>
    </section>
  );
}
