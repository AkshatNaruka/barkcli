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

  return (
    <AccessibleDialog
      label="Sources"
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

        {/* Modal Body */}
        {cloningUrl ? (
          <div className="p-5 flex flex-col gap-4">
            <h4 className="text-[13px] font-semibold text-text">Clone Git Repository</h4>
            <input
              type="text"
              autoFocus
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://github.com/owner/repo.git or owner/repo"
              className="w-full bg-[#16161a] border border-[#2e2e34] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
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
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloningUrl(false)}
                className="px-3 py-1.5 text-[12px] text-muted hover:text-text rounded cursor-pointer"
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
                className="px-3.5 py-1.5 text-[12px] font-medium bg-accent text-accent-text rounded-lg cursor-pointer"
              >
                Clone
              </button>
            </div>
          </div>
        ) : newProjectMode ? (
          <div className="p-5 flex flex-col gap-4">
            <h4 className="text-[13px] font-semibold text-text">Start New Project</h4>
            <input
              type="text"
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="project-name"
              className="w-full bg-[#16161a] border border-[#2e2e34] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
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
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewProjectMode(false)}
                className="px-3 py-1.5 text-[12px] text-muted hover:text-text rounded cursor-pointer"
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
                className="px-3.5 py-1.5 text-[12px] font-medium bg-accent text-accent-text rounded-lg cursor-pointer"
              >
                Create
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2.5 max-h-[min(480px,calc(85vh-120px))] overflow-y-auto">
            <div className="px-3 py-1 text-[11px] font-semibold text-muted-dim uppercase tracking-wider">Sources</div>
            <div className="flex flex-col gap-1 mt-0.5">
              {filtered.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[#18181c] text-text ring-1 ring-white/10"
                        : "text-muted-strong hover:bg-[#141417] hover:text-text"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 flex items-center justify-center w-5 h-5">
                        {renderIcon(item.icon)}
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className="text-[13px] font-medium text-text truncate">
                          {item.title}
                        </span>
                        <span className="text-[11.5px] text-muted-dim truncate">
                          {item.description}
                        </span>
                      </div>
                    </div>
                    {item.badge && (
                      <span className="shrink-0 text-[10.5px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
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
        <div className="flex items-center gap-4 px-4 py-2.5 bg-[#09090b] border-t border-[#1c1c20] text-[11px] text-muted-dim select-none">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#a1a1aa] text-[10px] border border-[#2d2d34] font-mono">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#a1a1aa] text-[10px] border border-[#2d2d34] font-mono">↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#a1a1aa] text-[10px] border border-[#2d2d34] font-mono">Enter</kbd>
            <span>Select</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#a1a1aa] text-[10px] border border-[#2d2d34] font-mono">Backspace</kbd>
            <span>Back</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#a1a1aa] text-[10px] border border-[#2d2d34] font-mono">Esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>
    </AccessibleDialog>
  );
}
