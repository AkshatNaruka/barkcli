import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  cleanupWorktrees,
  fetchWorktreeInventory,
  type ManagedWorktree,
  type WorktreeCategory,
  type WorktreeInventory,
} from "../lib/api";
import { Icon } from "./Icon";

const CATEGORY_META: Record<
  WorktreeCategory,
  { label: string; className: string }
> = {
  merged: {
    label: "Merged",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  stale: {
    label: "Stale",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  active: {
    label: "In use",
    className: "bg-accent/10 text-accent-text border-accent/25",
  },
  unmerged: {
    label: "Unmerged",
    className: "bg-white/[0.04] text-muted border-border",
  },
};

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatAge(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 60) return "just now";
  const days = Math.floor(secs / 86_400);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(secs / 3_600);
  if (hours >= 1) return `${hours}h ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

function Pane({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <header>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}

function CategoryBadge({ entry }: { entry: ManagedWorktree }) {
  const meta = CATEGORY_META[entry.category];
  return (
    <span
      className={`inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded border ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export function WorktreesSettings() {
  const [inventory, setInventory] = useState<WorktreeInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    const next = await fetchWorktreeInventory();
    setInventory(next);
    setLoadFailed(next === null);
    setSelected(new Set());
    setConfirming(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = inventory?.entries ?? [];
  const candidates = useMemo(
    () => entries.filter((entry) => entry.removable),
    [entries]
  );
  const selectedEntries = useMemo(
    () => candidates.filter((entry) => selected.has(entry.slug)),
    [candidates, selected]
  );
  const selectedBytes = selectedEntries.reduce(
    (total, entry) => total + entry.size_bytes,
    0
  );
  const allSelected =
    candidates.length > 0 && selectedEntries.length === candidates.length;

  const toggle = (slug: string) => {
    setNotice(null);
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleAll = () => {
    setNotice(null);
    setError(null);
    setSelected(allSelected ? new Set() : new Set(candidates.map((entry) => entry.slug)));
  };

  const confirmCleanup = async () => {
    if (selectedEntries.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const result = await cleanupWorktrees(
      selectedEntries.map((entry) => entry.slug),
      false
    );
    setBusy(false);
    if (!result) {
      setError("The cleanup request failed. Nothing was removed.");
      return;
    }
    setInventory(result.inventory);
    setSelected(new Set());
    setConfirming(false);
    setNotice(
      result.removed_count > 0
        ? `Removed ${result.removed_count} worktree${result.removed_count === 1 ? "" : "s"} and freed ${formatBytes(result.reclaimed_bytes)}.`
        : "Nothing was removed; every selected worktree changed since the list was loaded."
    );
    const failed = result.outcomes.filter((outcome) => outcome.error);
    if (failed.length > 0) {
      setError(`${failed.length} worktree${failed.length === 1 ? "" : "s"} could not be removed: ${failed[0].error}`);
    }
    if (result.skipped.length > 0 && failed.length === 0) {
      setError(
        `${result.skipped.length} worktree${result.skipped.length === 1 ? " is" : "s are"} no longer safe to remove and ${result.skipped.length === 1 ? "was" : "were"} kept.`
      );
    }
  };

  if (loading && !inventory) {
    return (
      <Pane title="Agent Worktrees" description="Loading worktrees…">
        <div className="flex items-center gap-2 text-[11.5px] text-muted">
          <Icon name="refresh" size={13} className="animate-spin" />
          <span>Measuring checkouts on disk</span>
        </div>
      </Pane>
    );
  }

  if (loadFailed || !inventory) {
    return (
      <Pane
        title="Agent Worktrees"
        description="Bark could not read this project's worktrees. The local server may be restarting."
      >
        <button type="button" className="bark-button" onClick={() => void load()}>
          <Icon name="refresh" size={13} />
          Try again
        </button>
      </Pane>
    );
  }

  return (
    <>
      <Pane
        title="Agent Worktrees"
        description={`Every agent attempt gets an isolated checkout under .board/worktrees, branched from ${inventory.base_branch}. Removing a checkout is permanent.`}
      >
        <dl className="settings-facts">
          <div>
            <dt>On disk</dt>
            <dd>
              {entries.length} worktree{entries.length === 1 ? "" : "s"} ·{" "}
              {formatBytes(inventory.total_bytes)}
            </dd>
          </div>
          <div>
            <dt>Reclaimable</dt>
            <dd className={inventory.reclaimable_bytes > 0 ? "is-warn" : undefined}>
              {inventory.removable_count === 0
                ? "Nothing safe to remove right now"
                : `${formatBytes(inventory.reclaimable_bytes)} across ${inventory.removable_count} worktree${inventory.removable_count === 1 ? "" : "s"}`}
            </dd>
          </div>
        </dl>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="bark-button"
            onClick={() => void load()}
            disabled={loading || busy}
          >
            <Icon name="refresh" size={12} className={loading ? "animate-spin" : undefined} />
            Refresh
          </button>
          {candidates.length > 0 && (
            <button type="button" className="bark-button" onClick={toggleAll} disabled={busy}>
              <Icon name="checkSquare" size={12} />
              {allSelected ? "Clear selection" : `Select ${candidates.length} reclaimable`}
            </button>
          )}
        </div>
      </Pane>

      {notice && (
        <div
          role="status"
          className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[11.5px] text-emerald-400"
        >
          <Icon name="check" size={13} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2 text-[11.5px] text-danger"
        >
          <Icon name="warn" size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Pane
        title="Checkouts"
        description="Merged and stale worktrees are removable. A worktree with a live run, uncommitted changes, or unmerged commits is kept."
      >
        {entries.length === 0 ? (
          <p className="text-[11.5px] text-muted">
            No agent worktrees. Bark creates one here for every agent attempt and removes it when
            the work is merged.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 -my-1">
            {entries.map((entry) => {
              const checked = selected.has(entry.slug);
              const canSelect = entry.removable;
              return (
                <li key={entry.slug} className="py-2.5 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border bg-bg disabled:opacity-40"
                    checked={checked}
                    disabled={!canSelect || busy}
                    onChange={() => toggle(entry.slug)}
                    aria-label={`Select ${entry.branch || entry.slug} for cleanup`}
                    title={entry.reason}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11.5px] text-text truncate">
                        {entry.branch || entry.slug}
                      </span>
                      <CategoryBadge entry={entry} />
                      {entry.dirty && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-warning/25 bg-warning/10 text-warning">
                          uncommitted
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-muted font-mono truncate" title={entry.path}>
                      {entry.path}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-muted">
                      {entry.reason} · last touched {formatAge(entry.age_secs)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-mono text-muted-strong tabular-nums">
                    {formatBytes(entry.size_bytes)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Pane>

      {candidates.length > 0 && (
        <Pane
          title="Clean up"
          description={
            confirming
              ? "This cannot be undone. Branches merged into the base branch are deleted; unmerged stale branches are kept so their commits survive."
              : "Pick the checkouts to remove, then review what will be freed before anything is deleted."
          }
        >
          {confirming ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-danger/25 bg-danger/[0.05] px-3 py-2.5">
                <p className="text-[12px] font-medium text-text">
                  Remove {selectedEntries.length} worktree
                  {selectedEntries.length === 1 ? "" : "s"} and free{" "}
                  {formatBytes(selectedBytes)}?
                </p>
                <p className="mt-1 text-[11px] text-muted leading-relaxed">
                  Their checkouts are deleted from disk. This only touches{" "}
                  <code className="font-mono">.board/worktrees</code>; your project folder and
                  the main checkout are untouched.
                </p>
                <ul className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
                  {selectedEntries.map((entry) => (
                    <li
                      key={entry.slug}
                      className="flex items-baseline justify-between gap-3 text-[10.5px] font-mono text-muted"
                    >
                      <span className="truncate">{entry.branch || entry.slug}</span>
                      <span className="shrink-0">{formatBytes(entry.size_bytes)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="bark-primary text-xs"
                  onClick={() => void confirmCleanup()}
                  disabled={busy}
                >
                  <Icon name="trash" size={12} />
                  {busy
                    ? "Removing…"
                    : `Remove ${selectedEntries.length} and free ${formatBytes(selectedBytes)}`}
                </button>
                <button
                  type="button"
                  className="bark-button text-xs"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="bark-primary text-xs"
                onClick={() => setConfirming(true)}
                disabled={selectedEntries.length === 0 || busy}
              >
                <Icon name="trash" size={12} />
                Review cleanup
              </button>
              <span className="text-[11px] text-muted">
                {selectedEntries.length === 0
                  ? "Select at least one worktree."
                  : `${selectedEntries.length} selected · ${formatBytes(selectedBytes)}`}
              </span>
            </div>
          )}
        </Pane>
      )}
    </>
  );
}
