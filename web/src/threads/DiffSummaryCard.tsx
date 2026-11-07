import type { RunRecord } from "../lib/types";
import { Icon } from "../components/Icon";

function groupByDir(files: string[]): Array<{ dir: string; files: string[] }> {
  if (files.length === 0) return [];
  const parts = files.map((f) => f.split("/"));
  let prefix = parts[0].slice(0, -1);
  for (const p of parts.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < p.length - 1 && prefix[i] === p[i]) i++;
    prefix = prefix.slice(0, i);
  }
  const dir = prefix.join("/") || ".";
  return [{ dir, files }];
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
  const time = run.ended_at
    ? new Date(run.ended_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <section className="my-2 rounded-lg border border-border/70 bg-surface/25 p-3" aria-label="Changed files summary">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-medium text-text">{files} changed file{files === 1 ? "" : "s"}</span>
          <span className="font-mono text-[12px] text-success">+{adds}</span>
          <span className="font-mono text-[12px] text-danger">−{dels}</span>
        </div>
        <button type="button" onClick={onOpenDiff} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted hover:bg-white/[0.04] hover:text-text">
          <Icon name="doc" size={12} />
          Open diff
        </button>
      </div>
      {groups.length > 0 && (
        <div className="mt-2 space-y-1">
          {groups.map((g) => (
            <div key={g.dir} className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-2 py-1.5 font-mono text-[11.5px] text-muted-strong">
              <span className="truncate"><span className="text-muted">▸ </span>{g.dir}</span>
              <span className="shrink-0 text-[11px]"><span className="text-success">+{adds}</span> <span className="text-danger">−{dels}</span></span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 text-[10.5px] text-muted">
        {onCopy && (
          <button type="button" className="hover:text-text" onClick={() => onCopy(`+${adds} -${dels} in ${files} files`)} title="Copy summary">
            <Icon name="copy" size={11} />
          </button>
        )}
        {run.branch ? <span className="truncate font-mono" title={run.branch}><Icon name="branch" size={11} className="inline mr-1 opacity-70" />{run.branch}</span> : null}
        {time ? <span className="ml-auto">{time}</span> : null}
      </div>
    </section>
  );
}
