import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibleDialog } from "./AccessibleDialog";
import { Icon } from "./Icon";
import { ProjectAvatar } from "./ProjectAvatar";
import { fetchProjects } from "../lib/api";
import {
  SCRATCH_PROJECT_PATH,
  currentProject,
  isScratchPath,
  projectDisplayName,
  recentProjects,
  type DesktopProject,
} from "../lib/desktop";

export interface ProjectPickerItem {
  id: string;
  name: string;
  path: string;
  isScratch?: boolean;
  isCurrent?: boolean;
  shortcut?: string;
  meta?: string;
}

export interface ProjectPickerSelection {
  path: string;
  name: string;
  isScratch?: boolean;
}

export interface ProjectPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (project: ProjectPickerSelection) => void;
  onBack?: () => void;
  onOpenSources?: () => void;
  /** Root of the project currently open, highlighted as “Current”. */
  currentPath?: string | null;
  title?: string;
  /** Show the “No project” scratch destination (default: true). */
  includeScratch?: boolean;
}

/**
 * T3-style project picker: search at the top, one flat Projects list, the
 * current checkout first, “No project” next, then recent projects with their
 * paths and number shortcuts. Used by the new-thread composer and by every
 * surface header, so project context is always one keystroke away.
 */
export function ProjectPickerModal({
  isOpen,
  onClose,
  onSelectProject,
  onBack,
  onOpenSources,
  currentPath,
  title = "Projects",
  includeScratch = true,
}: ProjectPickerModalProps) {
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectPickerItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelectedIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    let cancelled = false;

    const build = async () => {
      const [entries, cur, recents] = await Promise.all([
        fetchProjects(),
        currentProject(),
        recentProjects(),
      ]);
      if (cancelled) return;

      const current =
        currentPath ||
        cur?.path ||
        entries.find((entry) => entry.current)?.path ||
        "";
      const currentEntry = entries.find((entry) => entry.path === current);
      const list: ProjectPickerItem[] = [];
      const seen = new Set<string>();

      if (current) {
        seen.add(current);
        const isScratch = isScratchPath(current);
        list.push({
          id: current,
          name: isScratch
            ? "No project"
            : projectDisplayName(currentEntry?.name || cur?.name, current),
          path: isScratch ? "" : current,
          isScratch,
          isCurrent: true,
          shortcut: "⌘1",
          meta: "Current · Local",
        });
      }

      if (includeScratch && !list.some((item) => item.isScratch)) {
        list.push({
          id: "__scratch__",
          name: "No project",
          path: "",
          isScratch: true,
          shortcut: "⌥⌘N",
          meta: "Local",
        });
      }

      const others: Array<DesktopProject & { isScratch?: boolean }> = [
        ...entries
          .filter((entry) => !entry.current)
          .map((entry) => ({ path: entry.path, name: entry.name })),
        ...recents,
        ...(cur ? [cur] : []),
      ];
      let num = 2;
      for (const project of others) {
        if (!project.path || seen.has(project.path)) continue;
        // Project tools are always scoped to a real folder, so a scratch
        // destination would contradict the surface it is opened from.
        if (!includeScratch && isScratchPath(project.path)) continue;
        seen.add(project.path);
        list.push({
          id: project.path,
          name: projectDisplayName(project.name, project.path),
          path: project.path,
          shortcut: num <= 9 ? `⌘${num}` : undefined,
          meta: "Local",
        });
        num += 1;
      }

      setProjects(list);
    };

    void build();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, currentPath, includeScratch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(q) || project.path.toLowerCase().includes(q)
    );
  }, [projects, query]);

  useEffect(() => {
    setSelectedIndex((previous) =>
      filtered.length ? Math.min(previous, filtered.length - 1) : 0
    );
  }, [filtered.length]);

  if (!isOpen) return null;

  const handleSelect = (item: ProjectPickerItem) => {
    onSelectProject({
      path: item.isScratch ? SCRATCH_PROJECT_PATH : item.path,
      name: item.name,
      isScratch: item.isScratch,
    });
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((previous) =>
        filtered.length ? (previous + 1) % filtered.length : 0
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((previous) =>
        filtered.length ? (previous - 1 + filtered.length) % filtered.length : 0
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = filtered[selectedIndex];
      if (item) handleSelect(item);
      return;
    }
    if (event.key === "Backspace" && !query && onBack) {
      event.preventDefault();
      onBack();
      return;
    }
    if (event.metaKey && event.altKey && (event.key === "n" || event.key === "N")) {
      event.preventDefault();
      const scratch = projects.find((project) => project.isScratch);
      if (scratch) handleSelect(scratch);
      return;
    }
    if (event.metaKey && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      const shortcut = `⌘${event.key}`;
      const target = projects.find((project) => project.shortcut === shortcut);
      if (target) handleSelect(target);
    }
  };

  return (
    <AccessibleDialog label={title} onClose={onClose}>
      <div
        className="w-[620px] max-w-[95vw] overflow-hidden rounded-2xl border border-border bg-card text-text shadow-2xl focus:outline-none"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3.5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-md p-1 -ml-1 text-muted-strong transition-colors hover:bg-surface hover:text-text"
              title="Back (Backspace)"
              aria-label="Back"
            >
              <Icon name="arrowLeft" size={17} />
            </button>
          ) : (
            <Icon name="search" size={15} className="-ml-1 shrink-0 text-muted-dim" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            aria-label="Search projects"
            className="flex-1 border-0 bg-transparent text-[14px] text-text placeholder:text-muted-dim focus:outline-none"
          />
        </div>

        <div className="max-h-[400px] overflow-y-auto p-2">
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-[11px] font-semibold text-muted-dim">Projects</span>
            {onOpenSources && (
              <button
                type="button"
                onClick={onOpenSources}
                className="flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
              >
                <Icon name="plus" size={11} />
                <span>Add project…</span>
              </button>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            {filtered.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? "bg-surface text-text ring-1 ring-white/[0.06]"
                      : "text-muted-strong hover:bg-surface/60 hover:text-text"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <ProjectAvatar
                      name={item.isScratch ? "No project" : item.name}
                      size="md"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-medium text-text">
                        {item.name}
                      </span>
                      {item.path ? (
                        <span className="truncate text-[11.5px] text-muted-dim">
                          {item.meta || "Local"} · {item.path}
                        </span>
                      ) : (
                        <span className="truncate text-[11.5px] text-muted-dim">
                          {item.meta || "Local"} · Start without a repository
                        </span>
                      )}
                    </div>
                  </div>
                  {item.shortcut && (
                    <span className="shrink-0 pl-2 font-mono text-[11px] tracking-tight text-muted-dim">
                      {item.shortcut}
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-[12px] text-muted-dim">
                No matching projects found.
              </div>
            )}
          </div>
        </div>

        <div className="flex select-none items-center gap-4 border-t border-border/70 bg-bg/60 px-4 py-2.5 text-[11px] text-muted-dim">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted-strong">↑</kbd>
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted-strong">↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted-strong">Enter</kbd>
            <span>Select</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted-strong">Backspace</kbd>
            <span>Back</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted-strong">Esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>
    </AccessibleDialog>
  );
}
