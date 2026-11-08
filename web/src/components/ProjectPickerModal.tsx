import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibleDialog } from "./AccessibleDialog";
import { Icon } from "./Icon";
import { ProjectAvatar } from "./ProjectAvatar";
import { currentProject, recentProjects, type DesktopProject } from "../lib/desktop";

export interface ProjectPickerItem {
  id: string;
  name: string;
  path: string;
  isScratch?: boolean;
  pinned?: boolean;
  shortcut?: string;
}

export interface ProjectPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (project: DesktopProject | { path: string; name: string; isScratch?: boolean }) => void;
  onBack?: () => void;
  onOpenSources?: () => void;
}

export function ProjectPickerModal({
  isOpen,
  onClose,
  onSelectProject,
  onBack,
  onOpenSources,
}: ProjectPickerModalProps) {
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectPickerItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 50);

    let cancelled = false;
    void Promise.all([currentProject(), recentProjects()]).then(([cur, recents]) => {
      if (cancelled) return;
      const list: ProjectPickerItem[] = [];
      const seen = new Set<string>();

      // 1. Current / Primary project
      if (cur?.path) {
        seen.add(cur.path);
        list.push({
          id: cur.path,
          name: cur.name,
          path: cur.path,
          shortcut: "⌘1",
        });
      }

      // 2. No project (Scratch workspace)
      list.push({
        id: "__scratch__",
        name: "No project",
        path: "",
        isScratch: true,
        shortcut: "⌥⌘N",
      });

      // 3. Other recent projects
      let num = 2;
      for (const r of recents) {
        if (r.path && !seen.has(r.path)) {
          seen.add(r.path);
          list.push({
            id: r.path,
            name: r.name,
            path: r.path,
            shortcut: num <= 9 ? `⌘${num}` : undefined,
          });
          num += 1;
        }
      }

      // If list is small (e.g. only 1 project), populate standard known directories if relevant
      setProjects(list);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q)
    );
  }, [projects, query]);

  useEffect(() => {
    setSelectedIndex((prev) => (filtered.length > 0 ? Math.min(prev, filtered.length - 1) : 0));
  }, [filtered.length]);

  if (!isOpen) return null;

  const handleSelect = (item: ProjectPickerItem) => {
    if (item.isScratch) {
      onSelectProject({ path: "__scratch__", name: "No project", isScratch: true });
    } else {
      onSelectProject({ path: item.path, name: item.name });
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      }
      return;
    }

    if (e.key === "Backspace" && !query && onBack) {
      e.preventDefault();
      onBack();
      return;
    }

    // Direct shortcut handling (⌘1 - ⌘9 or ⌥⌘N)
    if (e.metaKey && e.altKey && (e.key === "n" || e.key === "N")) {
      e.preventDefault();
      const scratch = projects.find((p) => p.isScratch);
      if (scratch) handleSelect(scratch);
      return;
    }

    if (e.metaKey && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const num = parseInt(e.key, 10);
      const target = projects.find((p) => p.shortcut === `⌘${num}`);
      if (target) handleSelect(target);
      return;
    }
  };

  return (
    <AccessibleDialog
      label="Projects"
      onClose={onClose}
    >
      <div
        className="w-[580px] max-w-[95vw] bg-[#0c0c0e] border border-[#27272a] shadow-2xl rounded-2xl overflow-hidden text-text flex flex-col focus:outline-none"
        onKeyDown={handleKeyDown}
      >
        {/* Header bar with Back button and search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#222226]">
          <button
            type="button"
            onClick={onBack || onClose}
            className="text-muted-strong hover:text-text p-1 -ml-1 rounded transition-colors"
            title="Back (Backspace / Esc)"
            aria-label="Back"
          >
            <Icon name="arrowLeft" size={17} />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent border-0 text-[14px] text-text placeholder-muted-dim focus:outline-none"
          />
        </div>

        {/* Modal List Body */}
        <div className="p-2 max-h-[380px] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-[11px] font-semibold text-muted-dim">Projects</span>
            {onOpenSources && (
              <button
                type="button"
                onClick={onOpenSources}
                className="text-[11px] font-medium text-accent hover:underline flex items-center gap-1"
              >
                <Icon name="plus" size={11} />
                <span>Add project…</span>
              </button>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            {filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors ${
                    isSelected
                      ? "bg-[#18181c] text-text"
                      : "text-muted-strong hover:bg-[#141417] hover:text-text"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <ProjectAvatar name={item.isScratch ? "No project" : item.name} size="md" />
                    <div className="min-w-0 flex flex-col flex-1">
                      <span className="text-[13px] font-medium text-text truncate">
                        {item.name}
                      </span>
                      {item.path ? (
                        <span className="text-[11.5px] text-muted-dim truncate">
                          Local · {item.path}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 pl-2">
                    {item.pinned && (
                      <Icon name="pin" size={12} className="text-muted-dim" />
                    )}
                    {item.shortcut && (
                      <span className="text-[11px] font-mono text-muted-dim tracking-tight">
                        {item.shortcut}
                      </span>
                    )}
                  </div>
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

        {/* Modal Footer with Keyboard Navigation hints */}
        <div className="flex items-center gap-4 px-4 py-2.5 bg-[#09090b] border-t border-[#1c1c20] text-[11px] text-muted-dim select-none">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#a1a1aa] text-[10px] border border-[#2d2d34]">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#a1a1aa] text-[10px] border border-[#2d2d34]">↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#a1a1aa] text-[10px] border border-[#2d2d34]">Enter</kbd>
            <span>Select</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#a1a1aa] text-[10px] border border-[#2d2d34]">Backspace</kbd>
            <span>Back</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#a1a1aa] text-[10px] border border-[#2d2d34]">Esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>
    </AccessibleDialog>
  );
}
