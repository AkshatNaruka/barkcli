import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Board, ProjectSummary } from "../lib/types";
import { isDesktop, projectSummaries, revealProject, switchProject } from "../lib/desktop";
import { navigate } from "../lib/hashnav";
import { Icon, type IconName } from "../components/Icon";
import { AccessibleDialog } from "../components/AccessibleDialog";

type ProjectFilter = "all" | "review" | "dirty" | "setup";

interface ProjectsDashboardProps {
  currentRoot?: string;
  currentName?: string;
  currentBoard?: Board | null;
  currentBoardName?: string | null;
  currentBoards?: string[];
  currentAgents?: number;
  onOpenFolder: () => void;
  onNotify: (message: string) => void;
}

const FILTERS: Array<{ id: ProjectFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "review", label: "Needs review" },
  { id: "dirty", label: "Uncommitted" },
  { id: "setup", label: "Setup" },
];

const TONES = ["copper", "moss", "sky", "iris", "rose", "amber"] as const;

function initials(name: string): string {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
    .slice(0, 2) || "PR";
}

function toneFor(path: string): string {
  let hash = 0;
  for (let index = 0; index < path.length; index += 1) {
    hash = (hash * 31 + path.charCodeAt(index)) >>> 0;
  }
  return `is-${TONES[hash % TONES.length]}`;
}

function compactPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

function relativeEpoch(seconds?: number | null): string {
  if (!seconds) return "No activity yet";
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (delta < 60) return "Just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 86400 * 30) return `${Math.floor(delta / 86400)}d ago`;
  return `${Math.floor(delta / (86400 * 30))}mo ago`;
}

function reviewCount(project: ProjectSummary): number {
  return project.boards.reduce((sum, board) => sum + board.review, 0);
}

function openCount(project: ProjectSummary): number {
  return project.boards.reduce((sum, board) => sum + board.cards - board.done, 0);
}

function needsSetup(project: ProjectSummary): boolean {
  return !project.available || project.boards.length === 0 || project.agents === 0;
}

function statusFor(project: ProjectSummary): { label: string; tone: string } {
  if (!project.available) return { label: "Missing folder", tone: "muted" };
  if (project.board_files > 0 && project.boards.length === 0) {
    return { label: "Board unreadable", tone: "warn" };
  }
  if (project.boards.length === 0) return { label: "Setup needed", tone: "warn" };
  const review = reviewCount(project);
  if (review > 0) return { label: `${review} to review`, tone: "review" };
  if (project.git && !project.git.clean) {
    return {
      label: `${project.git.changes} uncommitted`,
      tone: "warn",
    };
  }
  if (project.agents === 0) return { label: "No agents", tone: "muted" };
  return { label: "Ready", tone: "ok" };
}

function makeFallback({
  root,
  name,
  board,
  boardName,
  boards,
  agents,
}: {
  root?: string;
  name?: string;
  board?: Board | null;
  boardName?: string | null;
  boards?: string[];
  agents?: number;
}): ProjectSummary | null {
  if (!root) return null;
  const cards = board?.cards || [];
  const columns = cards.reduce<Record<string, number>>((counts, card) => {
    counts[card.column] = (counts[card.column] || 0) + 1;
    return counts;
  }, {});
  return {
    path: root,
    name: name || root.split("/").filter(Boolean).pop() || "project",
    current: true,
    available: true,
    board_files: 1,
    boards: [
      {
        name: boardName || boards?.[0] || "board",
        cards: cards.length,
        todo: columns.todo || 0,
        doing: columns.doing || 0,
        review: columns.review || 0,
        done: columns.done || 0,
      },
    ],
    active_board: boardName || boards?.[0] || null,
    agents: agents || 0,
    threads: 0,
    last_active: Math.floor(Date.now() / 1000),
    git: null,
  };
}

export function ProjectsDashboard({
  currentRoot,
  currentName,
  currentBoard,
  currentBoardName,
  currentBoards,
  currentAgents,
  onOpenFolder,
  onNotify,
}: ProjectsDashboardProps) {
  const fallback = useMemo(
    () =>
      makeFallback({
        root: currentRoot,
        name: currentName,
        board: currentBoard,
        boardName: currentBoardName,
        boards: currentBoards,
        agents: currentAgents,
      }),
    [currentRoot, currentName, currentBoard, currentBoardName, currentBoards, currentAgents]
  );
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [switching, setSwitching] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");

  const load = useCallback(async () => {
    if (!isDesktop()) {
      setProjects(fallback ? [fallback] : []);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await projectSummaries();
      setProjects(next.length ? next : fallback ? [fallback] : []);
      setError(null);
    } catch {
      setProjects(fallback ? [fallback] : []);
      setError("Could not read recent projects.");
    } finally {
      setLoading(false);
    }
  }, [fallback]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isDesktop()) return;
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  const openProject = async (project: ProjectSummary, target: "chat" | "review" = "chat") => {
    if (!project.available) {
      onNotify(`${project.name} is no longer on disk. Open the folder again.`);
      return;
    }
    if (project.path === currentRoot) {
      navigate(target);
      return;
    }
    if (switching) return;
    setSwitching(project.path);
    const opened = await switchProject(project.path, target);
    if (!opened) {
      setSwitching(null);
      onNotify(`Could not open ${project.name}. The current project is still open.`);
      return;
    }
    void projectSummaries().then((next) => setProjects(next.length ? next : projects));
    setSwitching(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((project) => {
        if (filter === "review" && reviewCount(project) === 0) return false;
        if (filter === "dirty" && (!project.git || project.git.clean)) return false;
        if (filter === "setup" && !needsSetup(project)) return false;
        if (!q) return true;
        return [project.name, project.path, project.git?.branch, project.git?.last_commit]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (a.current !== b.current) return a.current ? -1 : 1;
        const review = reviewCount(b) - reviewCount(a);
        if (review !== 0) return review;
        return (b.last_active || 0) - (a.last_active || 0);
      });
  }, [projects, query, filter]);

  const totals = useMemo(
    () => ({
      projects: projects.length,
      open: projects.reduce((sum, project) => sum + openCount(project), 0),
      review: projects.reduce((sum, project) => sum + reviewCount(project), 0),
      agents: projects.reduce((sum, project) => sum + project.agents, 0),
      dirty: projects.filter((project) => project.git && !project.git.clean).length,
    }),
    [projects]
  );

  const attention = useMemo(() => {
    const items: Array<{
      project: ProjectSummary;
      label: string;
      detail: string;
      icon: IconName;
      tone: string;
    }> = [];
    for (const project of projects) {
      const review = reviewCount(project);
      if (review > 0) {
        items.push({
          project,
          label: `${review} change${review === 1 ? "" : "s"} to review`,
          detail: project.name,
          icon: "eye",
          tone: "review",
        });
      }
      if (project.git && !project.git.clean) {
        items.push({
          project,
          label: `${project.git.changes} uncommitted change${project.git.changes === 1 ? "" : "s"}`,
          detail: project.name,
          icon: "branch",
          tone: "warn",
        });
      }
      if (project.available && project.agents === 0) {
        items.push({
          project,
          label: "No agents hired",
          detail: project.name,
          icon: "users",
          tone: "muted",
        });
      }
      if (!project.available) {
        items.push({
          project,
          label: "Folder is missing",
          detail: project.name,
          icon: "warn",
          tone: "warn",
        });
      }
    }
    return items.slice(0, 5);
  }, [projects]);

  const current = projects.find((project) => project.path === currentRoot);
  const desktop = isDesktop();

  return (
    <div className="projects-screen">
      <header className="projects-header">
        <div className="projects-heading">
          <button
            type="button"
            className="bark-icon-button projects-sidebar-toggle"
            aria-label="Toggle sidebar"
            onClick={() => window.dispatchEvent(new CustomEvent("bark-command", { detail: "toggle-sidebar" }))}
          >
            <Icon name="panel" size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-muted">Settings</span>
              <span className="text-muted-dim">/</span>
              <span className="text-text font-semibold">Projects</span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Choose a project to manage its checkouts, threads, and workspace actions.
            </p>
          </div>
        </div>
        <div className="projects-actions">
          <button type="button" className="projects-quiet-button" onClick={() => void load()} title="Refresh projects">
            <Icon name="refresh" size={13} />
            Refresh
          </button>
          <button type="button" className="bark-primary" onClick={onOpenFolder}>
            <Icon name="plus" size={13} />
            Open folder
          </button>
          <button
            type="button"
            className="bark-icon-button ml-1 text-muted hover:text-text"
            onClick={() => navigate("chat")}
            aria-label="Close"
            title="Close (Esc)"
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      </header>

      <div className="projects-toolbar">
        <label className="projects-search">
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, paths, or branches…"
            aria-label="Search projects"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              <Icon name="x" size={12} />
            </button>
          )}
        </label>
        <div className="projects-filters" role="group" aria-label="Filter projects">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            const count =
              item.id === "all"
                ? projects.length
                : item.id === "review"
                  ? projects.filter((project) => reviewCount(project) > 0).length
                  : item.id === "dirty"
                    ? projects.filter((project) => project.git && !project.git.clean).length
                    : projects.filter(needsSetup).length;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                className={active ? "is-active" : ""}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                {count > 0 && <span>{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="projects-view-toggle" role="group" aria-label="Project layout">
          <button type="button" aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => setView("grid")}>
            <Icon name="grid" size={13} />
          </button>
          <button type="button" aria-pressed={view === "list"} aria-label="List view" onClick={() => setView("list")}>
            <Icon name="list" size={13} />
          </button>
        </div>
        <span className="projects-count">
          {filtered.length} of {projects.length}
        </span>
      </div>

      {error && (
        <div className="projects-error" role="alert">
          <Icon name="warn" size={13} />
          {error}
          <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      )}

      <div className="projects-layout">
        <aside className="projects-pulse" aria-label="Workspace overview">
          <section className="pulse-card">
            <header>
              <h2>Workspace</h2>
              <span>{desktop ? "Local" : "Browser"}</span>
            </header>
            <div className="pulse-stats">
              <div>
                <strong>{totals.projects}</strong>
                <span>Projects</span>
              </div>
              <div>
                <strong>{totals.open}</strong>
                <span>Open cards</span>
              </div>
              <div className={totals.review > 0 ? "is-attention" : ""}>
                <strong>{totals.review}</strong>
                <span>To review</span>
              </div>
              <div>
                <strong>{totals.agents}</strong>
                <span>Agents hired</span>
              </div>
            </div>
            {totals.dirty > 0 && (
              <p className="pulse-note-line">
                <Icon name="branch" size={11} />
                {totals.dirty} project{totals.dirty === 1 ? "" : "s"} with uncommitted work
              </p>
            )}
          </section>

          <section className="pulse-card">
            <header>
              <h2>Needs attention</h2>
              <span>{attention.length || "Clear"}</span>
            </header>
            {attention.length === 0 ? (
              <p className="pulse-empty">
                <Icon name="check" size={13} />
                Every project is clear. Start a thread when you are ready.
              </p>
            ) : (
              <div className="pulse-attention">
                {attention.map((item) => (
                  <button
                    key={`${item.project.path}:${item.label}`}
                    type="button"
                    onClick={() => openProject(item.project, item.icon === "eye" ? "review" : "chat")}
                    disabled={Boolean(switching)}
                  >
                    <span className={`pulse-attention-icon is-${item.tone}`}>
                      <Icon name={item.icon} size={12} />
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <Icon name="chevR" size={11} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="pulse-card is-quiet">
            <h2>Local by design</h2>
            <p>
              Bark reads boards, git, and agent files directly on this Mac. No project
              data leaves the machine.
            </p>
            {!desktop && (
              <p className="pulse-browser-note">
                Recent projects appear here in the Bark Mac app.
              </p>
            )}
          </section>
        </aside>

        <section className="projects-list" aria-label="All projects">
          <header className="projects-list-head">
            <div>
              <h2>{filter === "all" ? "All projects" : FILTERS.find((item) => item.id === filter)?.label}</h2>
              <p>
                {current
                  ? `Current: ${current.name}`
                  : "Choose a project to open its board, threads, and agents."}
              </p>
            </div>
            <span>{filtered.length}</span>
          </header>

          {loading ? (
            <div className="projects-grid" aria-busy="true">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="project-card is-skeleton">
                  <div className="project-avatar" />
                  <div className="project-skeleton-lines">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="projects-empty">
              <span className="projects-empty-icon"><Icon name="grid" size={20} /></span>
              <h3>{projects.length === 0 ? "No projects yet" : "No matching projects"}</h3>
              <p>
                {projects.length === 0
                  ? "Open a folder with a .board/ or .git/ directory to get started."
                  : "Try a different search or filter."}
              </p>
              {projects.length === 0 ? (
                <button type="button" className="bark-primary" onClick={onOpenFolder}>
                  <Icon name="plus" size={13} />
                  Open folder
                </button>
              ) : (
                <button type="button" className="bark-button" onClick={() => { setQuery(""); setFilter("all"); }}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className={`projects-grid ${view === "list" ? "is-list" : ""}`}>
              {filtered.map((project) => {
                const status = statusFor(project);
                const review = reviewCount(project);
                const open = openCount(project);
                const activeBoard = project.boards.find((board) => board.name === project.active_board) || project.boards[0];
                return (
                  <button
                    key={project.path}
                    type="button"
                    data-testid={`project-card-${project.name}`}
                    className={`project-card ${project.current ? "is-current" : ""} ${!project.available ? "is-missing" : ""}`}
                    onClick={() => openProject(project)}
                    disabled={switching === project.path}
                  >
                    <div className="project-card-head">
                      <span className={`project-avatar ${toneFor(project.path)}`}>{initials(project.name)}</span>
                      <span className="project-card-title">
                        <strong>{project.name}</strong>
                        <small title={project.path}>{compactPath(project.path)}</small>
                      </span>
                      <span className={`project-status is-${status.tone}`}>{status.label}</span>
                    </div>

                    <div className="project-card-git">
                      <Icon name="branch" size={11} />
                      <span>{project.git?.branch || "No git repository"}</span>
                      {project.git && (
                        <>
                          <span className="project-dot">·</span>
                          <span className={project.git.clean ? "is-clean" : "is-dirty"}>
                            {project.git.clean ? "Clean" : `${project.git.changes} changed`}
                          </span>
                        </>
                      )}
                    </div>

                    <p className="project-card-commit">
                      {project.git?.last_commit || "No commits yet"}
                    </p>

                    <div className="project-card-metrics">
                      <span><strong>{open}</strong> open</span>
                      <span className={review > 0 ? "is-review" : ""}><strong>{review}</strong> review</span>
                      <span><strong>{project.agents}</strong> agents</span>
                    </div>

                    <div className="project-card-foot">
                      <span>
                        {activeBoard
                          ? `${activeBoard.name} · ${activeBoard.cards} cards`
                          : project.board_files > 0
                            ? `${project.board_files} board file${project.board_files === 1 ? "" : "s"} · unreadable`
                            : "No board"}
                        {project.boards.length > 1 ? ` · ${project.boards.length} boards` : ""}
                      </span>
                      <span>{relativeEpoch(project.last_active)}</span>
                    </div>

                    {project.current && <span className="project-current-mark">Current</span>}
                  </button>
                );
              })}
            </div>
          )}

          {desktop && projects.length > 0 && (
            <p className="projects-footnote">
              Showing {projects.length} local project{projects.length === 1 ? "" : "s"} Bark has opened.
              Use <button type="button" onClick={() => void revealProject(currentRoot)}>Reveal current folder</button> in Finder.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
