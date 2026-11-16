import React, { useEffect, useRef, useState } from "react";
import { createThread, startThreadChat, startThreadBuild } from "../lib/api";
import { useAgentSelection } from "../lib/useAgentSelection";
import { useDraft } from "../lib/drafts";
import { ThreadComposer } from "../threads/ThreadComposer";
import { Icon } from "../components/Icon";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { ProjectAvatar } from "../components/ProjectAvatar";
import { ProjectPickerModal, type ProjectPickerSelection } from "../components/ProjectPickerModal";
import { useComposerMode } from "../lib/composer";
import {
  SCRATCH_PROJECT_PATH,
  isDesktop,
  isScratchPath,
  projectDisplayName,
  switchProject,
} from "../lib/desktop";

interface UniversalComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (threadId: string) => void;
  boardName?: string;
  initialText?: string;
  initialMode?: "chat" | "plan_first" | "plan_and_run";
  inline?: boolean;
  scope?: string;
  /** Project that is currently open. A thread started here runs in it. */
  projectName?: string | null;
  projectRoot?: string;
  projectBranch?: string | null;
  projectReady?: boolean;
  onOpenProject?: () => void;
  /** Start the composer on “No project” (⌥⌘N). */
  initialScratch?: boolean;
}

export function UniversalComposer(props: UniversalComposerProps) {
  if (!props.isOpen) return null;
  return <DraftComposer {...props} />;
}

type PendingThread = {
  text: string;
  mode: "chat" | "plan_first" | "build";
  backend?: string;
  model?: string;
  workspaceStrategy: "root" | "worktree" | "scratch";
};

function stashPendingThread(payload: PendingThread): boolean {
  try {
    window.sessionStorage.setItem("bark:pending-thread", JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function DraftComposer({
  onClose,
  onCreated,
  boardName,
  initialText = "",
  initialMode,
  inline = false,
  scope = "current-project",
  projectName,
  projectRoot,
  projectBranch,
  projectReady = true,
  onOpenProject,
  initialScratch = false,
}: UniversalComposerProps) {
  const [text, setText] = useDraft(scope, "new", initialText);
  const [mode, setMode] = useComposerMode(
    scope,
    initialMode === "chat"
      ? "ask"
      : initialMode === "plan_first"
      ? "plan"
      : initialMode === "plan_and_run"
      ? "build"
      : undefined
  );
  const agent = useAgentSelection(scope);
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selection, setSelection] = useState<ProjectPickerSelection | null>(
    initialScratch
      ? { path: SCRATCH_PROJECT_PATH, name: "No project", isScratch: true }
      : null
  );
  const [workspaceStrategy, setWorkspaceStrategy] = useState<"root" | "worktree">("root");
  const created = useRef<string | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    if (initialText) setText(initialText);
  }, [initialText, setText]);

  const currentPath = projectRoot && projectRoot !== "current-project" ? projectRoot : "";
  const currentIsScratch = isScratchPath(currentPath);
  const currentName = currentPath
    ? projectDisplayName(projectName, currentPath)
    : projectName?.trim() || "this project";

  // No explicit choice means "the project that is open" — including the
  // scratch workspace, which is a real project with no repository.
  const target: ProjectPickerSelection | null =
    selection ??
    (currentPath
      ? {
          path: currentIsScratch ? SCRATCH_PROJECT_PATH : currentPath,
          name: currentIsScratch ? "No project" : currentName,
          isScratch: currentIsScratch,
        }
      : null);

  // Only an explicit scratch destination means "no project"; an unknown root
  // (browser before the snapshot loads) still targets the running project.
  const noProject = Boolean(target?.isScratch) || isScratchPath(target?.path);
  const projectLabel = noProject ? "No project" : target?.name || currentName;
  const heading =
    mode === "ask"
      ? noProject
        ? "What do you want to ask?"
        : `Ask about ${projectLabel}`
      : mode === "plan"
      ? noProject
        ? "What do you want to plan?"
        : `What should we plan in ${projectLabel}?`
      : noProject
      ? "What should we build?"
      : `What should we build in ${projectLabel}?`;

  const chooseProject = (next: ProjectPickerSelection) => {
    created.current = null;
    setError(null);
    setSelection(next);
  };

  const useCurrentProject = () => {
    created.current = null;
    setError(null);
    setSelection(null);
  };

  const submit = async () => {
    if (!text.trim() || sending.current) return;
    sending.current = true;
    setSubmitting(true);
    setError(null);
    const prompt = text.trim();
    const composerMode = mode === "ask" ? "chat" : mode === "plan" ? "plan_first" : "build";
    const strategy = noProject ? "scratch" : workspaceStrategy;
    try {
      if (mode !== "plan" && !agent.ready)
        throw new Error("Choose an installed, signed-in agent. Your draft is saved.");

      // A thread executes inside a checkout, so a thread for another project
      // switches Bark to that project first and resumes here afterwards.
      const needsSwitch =
        Boolean(target) &&
        ((noProject && !currentIsScratch) ||
          (!noProject && Boolean(currentPath) && target?.path !== currentPath));

      if (needsSwitch && target) {
        if (!isDesktop()) {
          throw new Error(
            noProject
              ? "“No project” needs the Bark desktop app. Open it here to start a scratch thread."
              : `Switch to ${target.name} in the Bark desktop app, or run \`barkcli serve\` in that folder. Your draft is saved.`
          );
        }
        const stashed = stashPendingThread({
          text: prompt,
          mode: composerMode,
          backend: agent.backend || undefined,
          model: agent.model.trim() || undefined,
          workspaceStrategy: strategy,
        });
        if (!stashed) throw new Error("Could not hand the draft to the other project. Your draft is saved.");
        setSwitching(true);
        setText("");
        onClose();
        const opened = await switchProject(noProject ? SCRATCH_PROJECT_PATH : target.path, "chat");
        if (!opened) {
          try {
            window.sessionStorage.removeItem("bark:pending-thread");
          } catch {
            /* storage is optional */
          }
          setSwitching(false);
          setText(prompt);
          throw new Error("Could not open that project. Your draft is saved.");
        }
        return;
      }

      const result = created.current
        ? { thread_id: created.current }
        : await createThread({
            text: prompt,
            kind: "feature",
            backend: agent.backend || undefined,
            model: agent.model.trim() || undefined,
            mode: composerMode,
            board: boardName,
            ...(strategy === "scratch"
              ? { workspace_strategy: "scratch" }
              : strategy !== "root"
              ? { workspace_strategy: strategy }
              : {}),
          });
      if (!result?.thread_id)
        throw new Error("Could not create the thread. Check the server and try again.");
      created.current = result.thread_id;
      if (mode === "build") {
        await startThreadBuild(result.thread_id, {
          provider: agent.backend === "claude" ? "claude-code" : agent.backend,
          model: agent.model.trim() || undefined,
          role: agent.role,
          prompt,
          test_cmd: agent.testCommand.trim() || undefined,
          board: boardName,
        });
      }
      if (mode === "ask") {
        const reply = await startThreadChat(result.thread_id, {
          text: prompt,
          provider: agent.backend === "claude" ? "claude-code" : agent.backend,
          model: agent.model.trim() || undefined,
          board: boardName,
          skip_user_event: true,
        });
        if (!reply)
          throw new Error(
            "The thread was saved, but the local agent did not start. Check its sign-in, then retry this reply."
          );
      }
      setText("");
      onCreated(result.thread_id);
      onClose();
      window.dispatchEvent(new Event("bark-threads-changed"));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not start. Your draft is saved.");
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };

  const footer = (
    <div className="composer-scope-bar">
      <button
        type="button"
        className="composer-scope-project"
        onClick={() => setPickerOpen(true)}
        title="Choose the project this thread runs in"
        aria-haspopup="dialog"
      >
        <ProjectAvatar name={projectLabel} size="xs" />
        <span className="composer-scope-name">{projectLabel}</span>
        <Icon name="chevDown" size={11} className="text-muted-dim" />
      </button>
      <span className="composer-scope-divider" aria-hidden="true" />
      {!noProject && projectBranch ? (
        <span className="composer-scope-meta">
          <Icon name="branch" size={11} />
          <span>{projectBranch}</span>
        </span>
      ) : null}
      <span className="composer-scope-meta">
        <Icon name="key" size={10} />
        <span>Local</span>
      </span>
      {switching && (
        <span className="composer-scope-meta composer-scope-switching" role="status">
          Switching project…
        </span>
      )}
    </div>
  );

  const content = (
    <div className="new-thread-content">
      <div className="new-thread-intro">
        <h1>{heading}</h1>
        <button
          type="button"
          className="new-thread-subaction"
          onClick={() => {
            if (noProject) {
              if (projectReady && !currentIsScratch) useCurrentProject();
              else setPickerOpen(true);
            } else {
              created.current = null;
              setError(null);
              setSelection({ path: SCRATCH_PROJECT_PATH, name: "No project", isScratch: true });
            }
          }}
        >
          {noProject
            ? projectReady && !currentIsScratch
              ? `or work in ${currentName}`
              : "or choose a project"
            : "or start without a project"}
        </button>
      </div>
      <ThreadComposer
        value={text}
        onChange={setText}
        mode={mode}
        onModeChange={setMode}
        agent={agent}
        onSubmit={submit}
        busy={submitting || switching}
        error={error}
        autoFocus
        workspaceStrategy={noProject ? undefined : workspaceStrategy}
        onWorkspaceStrategyChange={noProject ? undefined : setWorkspaceStrategy}
        footer={footer}
      />
    </div>
  );

  return (
    <>
      {inline ? (
        <section
          className="new-thread-screen"
          aria-label={mode === "ask" ? "New question" : "New thread"}
        >
          <header className="thread-header">
            <button
              className="bark-icon-button"
              aria-label="Toggle sidebar"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("bark-command", { detail: "toggle-sidebar" })
                )
              }
            >
              <Icon name="panel" size={16} />
            </button>
            <span className="text-muted">
              {mode === "ask" ? "New question" : "New thread"}
            </span>
          </header>
          {content}
        </section>
      ) : (
        <AccessibleDialog label="New thread" onClose={onClose}>
          {content}
        </AccessibleDialog>
      )}
      <ProjectPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentPath={currentPath || null}
        onSelectProject={chooseProject}
        onOpenSources={
          onOpenProject
            ? () => {
                setPickerOpen(false);
                onOpenProject();
              }
            : undefined
        }
      />
    </>
  );
}
