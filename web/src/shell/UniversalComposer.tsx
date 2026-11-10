import React, { useEffect, useMemo, useRef, useState } from "react";
import { createThread, startThreadChat, startThreadBuild } from "../lib/api";
import { useAgentSelection } from "../lib/useAgentSelection";
import { useDraft } from "../lib/drafts";
import { ThreadComposer, type ComposerProjectOption } from "../threads/ThreadComposer";
import { Icon } from "../components/Icon";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { useComposerMode } from "../lib/composer";
import { currentProject, openProjectDialog, recentProjects, savedProjects, saveProject, switchProject, isDesktop, type DesktopProject } from "../lib/desktop";

interface UniversalComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (threadId: string) => void;
  boardName?: string;
  initialText?: string;
  initialMode?: "chat" | "plan_first" | "plan_and_run";
  inline?: boolean;
  scope?: string;
}

export function UniversalComposer(props: UniversalComposerProps) {
  if (!props.isOpen) return null;
  return <DraftComposer {...props} />;
}
function DraftComposer({ onClose, onCreated, boardName, initialText = "", initialMode, inline = false, scope = "current-project" }: UniversalComposerProps) {
  const [text, setText] = useDraft(scope, "new", initialText);
  const [mode, setMode] = useComposerMode(scope, initialMode === "chat" ? "ask" : initialMode === "plan_first" ? "plan" : initialMode === "plan_and_run" ? "build" : undefined);
  const agent = useAgentSelection(scope);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<DesktopProject[]>([]);
  const [defaultProject, setDefaultProject] = useState<DesktopProject | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [workspaceStrategy, setWorkspaceStrategy] = useState<"root" | "worktree" | "scratch">("root");
  const created = useRef<string | null>(null);
  const sending = useRef(false);

  useEffect(() => { if (initialText) setText(initialText); }, [initialText, setText]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([currentProject(), recentProjects(), savedProjects()]).then(([cur, recents, saved]) => {
      if (cancelled) return;
      const seen = new Set<string>();
      const list: DesktopProject[] = [];
      if (cur?.path) {
        seen.add(cur.path);
        list.push(cur);
        setDefaultProject(cur);
        setSelectedProject((prev) => prev || cur.path);
      }
      for (const item of saved) {
        if (item.path && !seen.has(item.path)) {
          seen.add(item.path);
          list.push(item);
        }
      }
      for (const item of recents) {
        if (item.path && !seen.has(item.path)) {
          seen.add(item.path);
          list.push(item);
        }
      }
      setProjects(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const projectOptions = useMemo<ComposerProjectOption[]>(() => {
    const opts: ComposerProjectOption[] = projects.map((p) => ({
      value: p.path,
      label: p.name,
      hint: p.path,
    }));
    if (opts.length === 0) {
      const fallbackName = scope && scope !== "current-project" ? scope.split("/").filter(Boolean).pop() || "Current project" : "Current project";
      opts.push({
        value: "",
        label: fallbackName,
        hint: "Bind thread to the active project workspace",
      });
    }
    opts.push({
      value: "__scratch__",
      label: "Scratch (no project)",
      hint: "Start an unbound thread not tied to a specific repository",
    });
    opts.push({
      value: "__open_folder__",
      label: "Open folder…",
      hint: "Choose another project folder on disk",
    });
    return opts;
  }, [projects, scope]);

  const handleProjectChange = async (value: string) => {
    if (value === "__open_folder__") {
      const picked = await openProjectDialog();
      if (picked?.path) {
        setProjects((prev) =>
          prev.some((p) => p.path === picked.path) ? prev : [picked, ...prev]
        );
        setSelectedProject(picked.path);
        if (workspaceStrategy === "scratch") setWorkspaceStrategy("root");
        // Persist to saved projects registry so it appears in Settings and future pickers.
        void saveProject(picked.path).catch(() => {});
      }
      return;
    }
    setSelectedProject(value);
    if (value === "__scratch__") {
      setWorkspaceStrategy("scratch");
    } else if (workspaceStrategy === "scratch") {
      setWorkspaceStrategy("root");
    }
  };

  const submit = async () => {
    if (!text.trim() || sending.current) return;
    sending.current = true; setSubmitting(true); setError(null);
    try {
      if (mode !== "plan" && !agent.ready) throw new Error("Choose an installed, signed-in agent. Your draft is saved.");
      const chosenProject = projects.find((p) => p.path === selectedProject);
      const isCustomProject = Boolean(
        chosenProject && (!defaultProject || chosenProject.path !== defaultProject.path)
      );
      const isScratch = selectedProject === "__scratch__" || workspaceStrategy === "scratch";
      // If the chosen project differs from the active one, switch the desktop
      // app to that project first so execution runs in the correct context.
      if (isCustomProject && chosenProject && isDesktop()) {
        const opened = await switchProject(chosenProject.path, "chat");
        if (!opened) {
          throw new Error("Could not open that project. Your draft is saved.");
        }
        // Persist the thread creation intent so the new project context can
        // resume it after the sidecar restarts.
        try {
          window.sessionStorage.setItem("bark:pending-thread", JSON.stringify({
            text: text.trim(),
            mode: mode === "ask" ? "chat" : mode === "plan" ? "plan_first" : "build",
            board: boardName,
            backend: agent.backend || undefined,
            model: agent.model.trim() || undefined,
            workspaceStrategy,
            projectRoot: chosenProject.path,
            projectName: chosenProject.name,
          }));
        } catch { /* storage optional */ }
        // The switchProject call restarts the sidecar; thread creation will
        // happen in the new context via the pending-thread handoff.
        setText("");
        onClose();
        return;
      }
      const result = created.current ? { thread_id: created.current } : await createThread({
        text: text.trim(), kind: "feature", backend: agent.backend || undefined,
        model: agent.model.trim() || undefined, mode: mode === "ask" ? "chat" : mode === "plan" ? "plan_first" : "build", board: boardName,
        ...(isScratch
          ? { project_name: "Scratch", workspace_strategy: "scratch" }
          : isCustomProject && chosenProject
          ? {
              project_root: chosenProject.path,
              project_name: chosenProject.name,
              ...(workspaceStrategy !== "root" ? { workspace_strategy: workspaceStrategy } : {}),
            }
          : workspaceStrategy !== "root"
          ? { workspace_strategy: workspaceStrategy }
          : {}),
      });
      if (!result?.thread_id) throw new Error("Could not create the thread. Check the server and try again.");
      created.current = result.thread_id;
      if (mode === "build") {
        await startThreadBuild(result.thread_id, {
          provider: agent.backend === "claude" ? "claude-code" : agent.backend,
          model: agent.model.trim() || undefined, role: agent.role,
          prompt: text.trim(), test_cmd: agent.testCommand.trim() || undefined, board: boardName,
        });
      }
      if (mode === "ask") {
        const reply = await startThreadChat(result.thread_id, {
          text: text.trim(), provider: agent.backend === "claude" ? "claude-code" : agent.backend,
          model: agent.model.trim() || undefined, board: boardName, skip_user_event: true,
        });
        if (!reply) throw new Error("The thread was saved, but the local agent did not start. Check its sign-in, then retry this reply.");
      }
      setText(""); onCreated(result.thread_id); onClose();
      window.dispatchEvent(new Event("bark-threads-changed"));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not start. Your draft is saved."); }
    finally { sending.current = false; setSubmitting(false); }
  };
  const content = <div className="new-thread-content">
    <div className="new-thread-intro"><h1>{mode === "ask" ? "Ask about this project" : mode === "plan" ? "What do you want to plan?" : "What do you want to build?"}</h1></div>
    <ThreadComposer
      value={text}
      onChange={setText}
      mode={mode}
      onModeChange={setMode}
      agent={agent}
      onSubmit={submit}
      busy={submitting}
      error={error}
      autoFocus
      projectOptions={projectOptions}
      selectedProject={selectedProject}
      onProjectChange={(val) => void handleProjectChange(val)}
      workspaceStrategy={workspaceStrategy}
      onWorkspaceStrategyChange={setWorkspaceStrategy}
    />
  </div>;
  return inline ? <section className="new-thread-screen" aria-label={mode === "ask" ? "New question" : "New thread"}><header className="thread-header"><button className="bark-icon-button" aria-label="Toggle sidebar" onClick={() => window.dispatchEvent(new CustomEvent("bark-command", { detail: "toggle-sidebar" }))}><Icon name="panel" size={16} /></button><span className="text-muted">{mode === "ask" ? "New question" : "New thread"}</span></header>{content}</section> : <AccessibleDialog label="New thread" onClose={onClose}>{content}<button className="bark-button" onClick={onClose}>Close</button></AccessibleDialog>;
}
