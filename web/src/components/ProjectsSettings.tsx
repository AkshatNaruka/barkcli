import React, { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { ProjectAvatar } from "./ProjectAvatar";
import { ProjectSourcesModal } from "./ProjectSourcesModal";
import {
  currentProject,
  openTerminal,
  recentProjects,
  savedProjects,
  removeSavedProject,
  revealProject,
  switchProject,
  type DesktopProject,
} from "../lib/desktop";

export interface ProjectsSettingsProps {
  onClose?: () => void;
  onOpenSources?: () => void;
}

export function ProjectsSettings({ onClose, onOpenSources }: ProjectsSettingsProps) {
  const [projects, setProjects] = useState<Array<DesktopProject & { isScratch?: boolean }>>([]);
  const [selectedProject, setSelectedProject] = useState<DesktopProject | null>(null);
  const [editingName, setEditingName] = useState("");
  const [projectScope, setProjectScope] = useState("all");
  const [envScope, setEnvScope] = useState("all");
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([currentProject(), recentProjects(), savedProjects()]).then(([cur, recents, saved]) => {
      if (cancelled) return;
      const list: Array<DesktopProject & { isScratch?: boolean }> = [];
      const seen = new Set<string>();

      if (cur?.path) {
        seen.add(cur.path);
        list.push(cur);
      }

      list.push({
        name: "No project",
        path: "~/.barkcli/scratch",
        isScratch: true,
      });

      for (const s of saved) {
        if (s.path && !seen.has(s.path)) {
          seen.add(s.path);
          list.push(s);
        }
      }

      for (const r of recents) {
        if (r.path && !seen.has(r.path)) {
          seen.add(r.path);
          list.push(r);
        }
      }
      setProjects(list);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectProject = (proj: DesktopProject & { isScratch?: boolean }) => {
    if (proj.isScratch) return;
    setSelectedProject(proj);
    setEditingName(proj.name);
  };

  const handleSaveProjectName = () => {
    if (!selectedProject || !editingName.trim()) return;
    setProjects((prev) =>
      prev.map((p) => (p.path === selectedProject.path ? { ...p, name: editingName.trim() } : p))
    );
    setSelectedProject((prev) => (prev ? { ...prev, name: editingName.trim() } : null));
  };

  return (
    <div className="flex flex-col h-full text-text overflow-y-auto">
      {/* Breadcrumb Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2 text-[14px]">
          <span className="text-muted-dim hover:text-text cursor-pointer transition-colors" onClick={() => setSelectedProject(null)}>
            Settings
          </span>
          <span className="text-muted-dim">/</span>
          <span className="font-semibold text-text">Projects</span>
          {selectedProject && (
            <>
              <span className="text-muted-dim">/</span>
              <span className="text-accent font-medium">{selectedProject.name}</span>
            </>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-muted-dim hover:text-text p-1 rounded-md transition-colors"
            title="Close"
            aria-label="Close"
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </header>

      <div className="p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">
        {selectedProject ? (
          /* Project Detail View */
          <div className="flex flex-col gap-5">
            <button
              type="button"
              onClick={() => setSelectedProject(null)}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-dim hover:text-text self-start transition-colors"
            >
              <Icon name="arrowLeft" size={14} />
              <span>Back to all projects</span>
            </button>

            <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl">
              <ProjectAvatar name={selectedProject.name} size="lg" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-semibold text-text">{selectedProject.name}</h3>
                <p className="text-[12px] text-muted-dim font-mono truncate">{selectedProject.path}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 bg-card border border-border rounded-xl p-5">
              <h4 className="text-[13px] font-semibold text-text">Project Settings</h4>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-muted-strong">Display Name</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 max-w-md bg-surface border border-border rounded-lg px-3 py-1.5 text-[13px] text-text focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={handleSaveProjectName}
                    className="px-3 py-1.5 bg-accent text-accent-text text-[12px] font-medium rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => switchProject(selectedProject.path)}
                  className="px-3 py-1.5 text-[12px] font-medium bg-surface hover:bg-card-hover border border-border rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Icon name="play" size={13} />
                  <span>Switch Workspace</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await removeSavedProject(selectedProject.path);
                    setProjects((prev) => prev.filter((p) => p.path !== selectedProject.path));
                    setSelectedProject(null);
                  }}
                  className="px-3 py-1.5 text-[12px] font-medium bg-surface hover:bg-card-hover border border-border rounded-lg flex items-center gap-1.5 transition-colors text-danger"
                >
                  <Icon name="trash" size={13} />
                  <span>Remove from saved</span>
                </button>
                <button
                  type="button"
                  onClick={() => revealProject(selectedProject.path)}
                  className="px-3 py-1.5 text-[12px] font-medium bg-surface hover:bg-card-hover border border-border rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Icon name="folder" size={13} />
                  <span>Reveal in Finder</span>
                </button>
                <button
                  type="button"
                  onClick={() => openTerminal(selectedProject.path)}
                  className="px-3 py-1.5 text-[12px] font-medium bg-surface hover:bg-card-hover border border-border rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Icon name="terminal" size={13} />
                  <span>Open Terminal</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Project Overview & Card List Matching Screenshot 3 */
          <>
            {/* Scope selectors */}
            <div className="flex items-center gap-2 text-[13px] text-muted-strong flex-wrap">
              <span>Applying settings for</span>
              <div className="relative inline-block">
                <select
                  value={projectScope}
                  onChange={(e) => setProjectScope(e.target.value)}
                  className="appearance-none bg-[#1c1c21] border border-[#2e2e34] hover:border-[#3e3e46] text-text text-[12.5px] font-medium px-2.5 py-1 pr-6 rounded-lg cursor-pointer focus:outline-none"
                >
                  <option value="all">All projects</option>
                  {projects.filter((p) => !p.isScratch).map((p) => (
                    <option key={p.path} value={p.path}>{p.name}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-dim text-[10px]">▼</span>
              </div>
              <span>across</span>
              <div className="relative inline-block">
                <select
                  value={envScope}
                  onChange={(e) => setEnvScope(e.target.value)}
                  className="appearance-none bg-[#1c1c21] border border-[#2e2e34] hover:border-[#3e3e46] text-text text-[12.5px] font-medium px-2.5 py-1 pr-6 rounded-lg cursor-pointer focus:outline-none"
                >
                  <option value="all">All environments</option>
                  <option value="local">Local macOS</option>
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-dim text-[10px]">▼</span>
              </div>
            </div>

            {/* Subhead instructions */}
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-muted-dim">
                Choose a project to manage its name, icon, checkouts and actions.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (onOpenSources) onOpenSources();
                  else setShowSources(true);
                }}
                className="text-[12px] font-medium text-accent hover:underline flex items-center gap-1"
              >
                <Icon name="plus" size={12} />
                <span>Add project…</span>
              </button>
            </div>

            {/* Project Cards Container */}
            <div className="bg-[#101014] border border-[#27272a] rounded-xl overflow-hidden divide-y divide-[#1e1e24] shadow-sm">
              {projects.map((proj) => (
                <div
                  key={proj.path || proj.name}
                  onClick={() => handleSelectProject(proj)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                    proj.isScratch ? "cursor-default" : "hover:bg-[#16161c] cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <ProjectAvatar name={proj.name} size="md" />
                    <div className="min-w-0 flex flex-col">
                      <span className="text-[13.5px] font-medium text-text truncate">
                        {proj.name}
                      </span>
                      <span className="text-[12px] text-muted-dim font-mono truncate">
                        {proj.path}
                      </span>
                    </div>
                  </div>
                  {!proj.isScratch && (
                    <Icon name="chevR" size={14} className="text-muted-dim shrink-0 ml-3" />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ProjectSourcesModal
        isOpen={showSources}
        onClose={() => setShowSources(false)}
        onSelectProject={(p) => {
          setProjects((prev) => (prev.some((x) => x.path === p.path) ? prev : [p, ...prev]));
          setShowSources(false);
        }}
      />
    </div>
  );
}
