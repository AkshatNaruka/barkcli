import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibleDialog } from "./AccessibleDialog";
import { Icon } from "./Icon";
import { openProjectDialog, type DesktopProject } from "../lib/desktop";

export interface ProjectSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject?: (project: DesktopProject) => void;
  onBack?: () => void;
}

interface SourceItem {
  id: string;
  title: string;
  description: string;
  icon: "new" | "folder" | "git" | "github" | "azure" | "bitbucket";
  badge?: string;
  disabled?: boolean;
}

const SOURCES: SourceItem[] = [
  {
    id: "new",
    title: "New project",
    description: "Start a new Git repository from a name",
    icon: "new",
  },
  {
    id: "local",
    title: "Local folder",
    description: "Browse a folder on disk",
    icon: "folder",
  },
  {
    id: "git_url",
    title: "Git URL",
    description: "Clone from a remote URL",
    icon: "git",
  },
  {
    id: "github",
    title: "GitHub repository",
    description: "Clone GitHub owner/repo",
    icon: "github",
  },
  {
    id: "azure",
    title: "Azure DevOps repository",
    description: "Clone Azure DevOps project/repository",
    icon: "azure",
    badge: "Setup Required",
  },
  {
    id: "bitbucket",
    title: "Bitbucket repository",
    description: "Clone Bitbucket workspace/repository",
    icon: "bitbucket",
    badge: "Setup Required",
  },
];

export function ProjectSourcesModal({
  isOpen,
  onClose,
  onSelectProject,
  onBack,
}: ProjectSourcesModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(1); // default to Local folder
  const [cloningUrl, setCloningUrl] = useState(false);
  const [inputUrl, setInputUrl] = useState("");
  const [newProjectMode, setNewProjectMode] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(1);
      setCloningUrl(false);
      setNewProjectMode(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SOURCES;
    return SOURCES.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    setSelectedIndex((prev) => (filtered.length > 0 ? Math.min(prev, filtered.length - 1) : 0));
  }, [filtered.length]);

  if (!isOpen) return null;

  const handleSelect = async (item: SourceItem) => {
    if (item.id === "local") {
      const picked = await openProjectDialog();
      if (picked) {
        onSelectProject?.(picked);
        onClose();
      }
    } else if (item.id === "git_url" || item.id === "github") {
      setCloningUrl(true);
    } else if (item.id === "new") {
      setNewProjectMode(true);
    } else if (item.badge === "Setup Required") {
      window.alert(`${item.title} requires service integration setup in Settings.`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        void handleSelect(filtered[selectedIndex]);
      }
    } else if (e.key === "Backspace" && !query && onBack) {
      e.preventDefault();
      onBack();
    }
  };

  const renderIcon = (type: SourceItem["icon"]) => {
    switch (type) {
      case "new":
        return <Icon name="folderPlus" size={18} className="text-muted-strong" />;
      case "folder":
        return <Icon name="folder" size={18} className="text-muted-strong" />;
      case "git":
        return <Icon name="link" size={18} className="text-muted-strong" />;
      case "github":
        return (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className="text-muted-strong">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
        );
      case "azure":
        return (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className="text-[#0078d4]">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "bitbucket":
        return (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className="text-[#0052cc]">
            <path d="M2.65 3.5a1.2 1.2 0 0 0-1.18 1.44l2.84 14.86c.1.53.56.91 1.1.91h13.18c.54 0 1-.38 1.1-.91l2.84-14.86a1.2 1.2 0 0 0-1.18-1.44H2.65zm9.84 11.23H8.38l-1.04-5.46h9.32l-1.04 5.46z" />
          </svg>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <AccessibleDialog
      label="Sources"
      onClose={onClose}
      className="bark-dialog-frameless"
    >
      <div
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0e]/95 backdrop-blur-2xl text-text shadow-2xl shadow-black/90 focus:outline-none flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Header bar with Back button and search input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.08]">
          <button
            type="button"
            onClick={onBack || onClose}
            className="text-muted-strong hover:text-text p-1 -ml-1 rounded-md transition-colors hover:bg-white/[0.06] cursor-pointer"
            title="Back (Backspace / Esc)"
            aria-label="Back"
          >
            <Icon name="arrowLeft" size={16} />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent border-0 text-[13.5px] text-text placeholder:text-muted-dim focus:outline-none"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-mono text-muted-dim/60 bg-white/[0.04] border border-white/5 px-1.5 py-0.5 rounded">
            Esc
          </kbd>
        </div>

        {/* Modal Body */}
        {cloningUrl ? (
          <div className="p-5 flex flex-col gap-3.5">
            <h4 className="text-[13px] font-semibold text-text">Clone Git Repository</h4>
            <input
              type="text"
              autoFocus
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://github.com/owner/repo.git or owner/repo"
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-text placeholder:text-muted-dim focus:outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputUrl.trim()) {
                  window.alert(`Cloning ${inputUrl.trim()} into projects...`);
                  setCloningUrl(false);
                  onClose();
                } else if (e.key === "Escape") {
                  setCloningUrl(false);
                }
              }}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCloningUrl(false)}
                className="px-3 py-1.5 text-[12px] text-muted-dim hover:text-text rounded-md cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (inputUrl.trim()) {
                    window.alert(`Cloning ${inputUrl.trim()} into projects...`);
                    setCloningUrl(false);
                    onClose();
                  }
                }}
                className="px-3.5 py-1.5 text-[12px] font-medium bg-accent text-accent-text rounded-lg cursor-pointer hover:opacity-95 transition-all shadow-sm"
              >
                Clone
              </button>
            </div>
          </div>
        ) : newProjectMode ? (
          <div className="p-5 flex flex-col gap-3.5">
            <h4 className="text-[13px] font-semibold text-text">Start New Project</h4>
            <input
              type="text"
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="project-name"
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-text placeholder:text-muted-dim focus:outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newProjectName.trim()) {
                  window.alert(`Initializing new repository for ${newProjectName.trim()}...`);
                  setNewProjectMode(false);
                  onClose();
                } else if (e.key === "Escape") {
                  setNewProjectMode(false);
                }
              }}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNewProjectMode(false)}
                className="px-3 py-1.5 text-[12px] text-muted-dim hover:text-text rounded-md cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newProjectName.trim()) {
                    window.alert(`Initializing new repository for ${newProjectName.trim()}...`);
                    setNewProjectMode(false);
                    onClose();
                  }
                }}
                className="px-3.5 py-1.5 text-[12px] font-medium bg-accent text-accent-text rounded-lg cursor-pointer hover:opacity-95 transition-all shadow-sm"
              >
                Create
              </button>
            </div>
          </div>
        ) : (
          <div className="px-2 pb-2 max-h-[380px] overflow-y-auto">
            <div className="px-2 pt-2.5 pb-1 text-[10.5px] font-semibold text-muted-dim uppercase tracking-wider">Sources</div>
            <div className="flex flex-col gap-0.5">
              {filtered.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-white/[0.08] text-text ring-1 ring-white/10 shadow-sm"
                        : "text-muted-strong hover:bg-white/[0.03] hover:text-text"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="shrink-0 flex items-center justify-center w-5 h-5">
                        {renderIcon(item.icon)}
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className="text-[13px] font-medium text-text truncate">
                          {item.title}
                        </span>
                        <span className="text-[11px] text-muted-dim truncate mt-0.5">
                          {item.description}
                        </span>
                      </div>
                    </div>
                    {item.badge && (
                      <span className="shrink-0 text-[10px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/25 px-2 py-0.5 rounded-full font-mono">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="px-4 py-8 text-center text-[12px] text-muted-dim">
                  No matching sources found.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer with Keyboard Navigation hints */}
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
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-strong font-mono">Backspace</kbd>
              <span>Back</span>
            </span>
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
