import React, { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

const FILTERS: Array<{ id: string; label: string; icon: IconName }> = [
  { id: "blocked", label: "Blocked", icon: "blocked" },
  { id: "stale", label: "Stale", icon: "clock" },
  { id: "no-spec", label: "No spec", icon: "link" },
  { id: "high", label: "High priority", icon: "flag" },
];

export function BoardFilters({
  chips,
  onToggle,
  onClear,
  hidden,
}: {
  chips: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  hidden: number;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] transition-colors ${
          chips.length
            ? "border-accent/40 bg-accent-soft text-accent-text"
            : "border-border text-muted-strong hover:border-border-strong hover:text-text"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="filter" size={12} />
        Filters
        {chips.length > 0 && (
          <span className="rounded bg-accent/15 px-1 font-mono text-[9px]">{chips.length}</span>
        )}
      </button>

      {open && (
        <div className="board-filter-menu" role="dialog" aria-label="Board filters">
          <div className="board-filter-head">
            <span>Filter cards</span>
            {chips.length > 0 && (
              <button type="button" onClick={onClear}>Clear</button>
            )}
          </div>
          {FILTERS.map((filter) => {
            const active = chips.includes(filter.id);
            return (
              <button
                key={filter.id}
                type="button"
                className={`board-filter-row ${active ? "is-active" : ""}`}
                aria-pressed={active}
                onClick={() => onToggle(filter.id)}
              >
                <Icon name={filter.icon} size={13} />
                <span>{filter.label}</span>
                {active && <Icon name="check" size={13} className="board-filter-check" />}
              </button>
            );
          })}
          {hidden > 0 && (
            <p className="board-filter-foot">{hidden} card{hidden === 1 ? "" : "s"} hidden</p>
          )}
        </div>
      )}
    </div>
  );
}
