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

  if (!isOpen) return null;

  return (
    <AccessibleDialog label={title} onClose={onClose} className="bark-dialog-frameless">
      <div
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0e]/95 backdrop-blur-2xl text-text shadow-2xl shadow-black/90 focus:outline-none flex flex-col"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-4 py-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-md p-1 -ml-1 text-muted-strong transition-colors hover:bg-white/[0.06] hover:text-text cursor-pointer"
              title="Back (Backspace)"
              aria-label="Back"
            >
              <Icon name="arrowLeft" size={16} />
            </button>
          ) : (
            <Icon name="search" size={15} className="-ml-0.5 shrink-0 text-muted-dim" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            aria-label="Search projects"
            className="flex-1 border-0 bg-transparent text-[13.5px] text-text placeholder:text-muted-dim focus:outline-none"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-mono text-muted-dim/60 bg-white/[0.04] border border-white/5 px-1.5 py-0.5 rounded">
            Esc
          </kbd>
        </div>

        <div className="max-h-[380px] overflow-y-auto px-2 pb-2">
          <div className="flex items-center justify-between px-2 pt-2.5 pb-1">
            <span className="text-[10.5px] font-semibold text-muted-dim uppercase tracking-wider">Projects</span>
            {onOpenSources && (
              <button
                type="button"
                onClick={onOpenSources}
                className="flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-white transition-colors cursor-pointer"
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
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white/[0.08] text-text ring-1 ring-white/10 shadow-sm"
                      : "text-muted-strong hover:bg-white/[0.03] hover:text-text"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <ProjectAvatar
                      name={item.isScratch ? "No project" : item.name}
                      size="md"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-text">
                          {item.name}
                        </span>
                        {item.isCurrent && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded">
                            current
                          </span>
                        )}
                      </div>
                      {item.path ? (
                        <span className="truncate text-[11px] text-muted-dim">
                          {item.meta || "Local"} · {item.path}
                        </span>
                      ) : (
                        <span className="truncate text-[11px] text-muted-dim">
                          {item.meta || "Local"} · Start without a repository
                        </span>
                      )}
                    </div>
                  </div>
                  {item.shortcut && (
                    <span className="shrink-0 pl-2 font-mono text-[10.5px] tracking-tight text-muted-dim bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/5">
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

        <div className="flex select-none items-center justify-between border-t border-white/[0.06] bg-black/40 px-3.5 py-2 text-[11px] text-muted-dim">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-white/10 bg-white/[0.04] px-1 py-0.5 text-[10px] text-muted-strong font-mono">↑</kbd>
              <kbd className="rounded border border-white/10 bg-white/[0.04] px-1 py-0.5 text-[10px] text-muted-strong font-mono">↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-strong font-mono">Enter</kbd>
              <span>Select</span>
            </span>
            {onBack && (
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-strong font-mono">Backspace</kbd>
                <span>Back</span>
              </span>
            )}
          </div>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-strong font-mono">Esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>
    </AccessibleDialog>
  );
}
