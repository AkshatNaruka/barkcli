import React, { useEffect, useRef, useState } from "react";
import { createThread, startThreadChat } from "../lib/api";
import { useAgentSelection } from "../lib/useAgentSelection";
import { useDraft } from "../lib/drafts";
import { ThreadComposer } from "../threads/ThreadComposer";
import { Icon } from "../components/Icon";
import { AccessibleDialog } from "../components/AccessibleDialog";

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
function DraftComposer({ onClose, onCreated, boardName, initialText = "", initialMode = "plan_first", inline = false, scope = "current-project" }: UniversalComposerProps) {
  const [text, setText] = useDraft(scope, "new", initialText);
  const [mode, setMode] = useState<"ask" | "build">(initialMode === "chat" ? "ask" : "build");
  const agent = useAgentSelection(scope);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const created = useRef<string | null>(null);
  const sending = useRef(false);
  useEffect(() => { if (initialText) setText(initialText); }, [initialText, setText]);
  const submit = async () => {
    if (!text.trim() || sending.current) return;
    sending.current = true; setSubmitting(true); setError(null);
    try {
      if (mode === "ask" && !agent.ready) throw new Error("Choose an installed, signed-in agent before asking. Your draft is saved.");
      const result = created.current ? { thread_id: created.current } : await createThread({
        text: text.trim(), kind: "feature", backend: agent.backend || undefined,
        model: agent.model.trim() || undefined, mode: mode === "ask" ? "chat" : "plan_first", board: boardName,
      });
      if (!result?.thread_id) throw new Error("Could not create the thread. Check the server and try again.");
      created.current = result.thread_id;
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
    <div className="new-thread-intro"><h1>{mode === "ask" ? "Ask about this project" : "What do you want to build?"}</h1><p>{mode === "ask" ? "A read-only conversation with your local coding agent." : "Describe the outcome. Review the plan, then build in an isolated worktree."}</p></div>
    <ThreadComposer value={text} onChange={setText} mode={mode} onModeChange={setMode} agent={agent} onSubmit={submit} busy={submitting} error={error} autoFocus />
  </div>;
  return inline ? <section className="new-thread-screen" aria-label="New thread"><header className="thread-header"><button className="bark-icon-button" aria-label="Toggle sidebar" onClick={() => window.dispatchEvent(new CustomEvent("bark-command", { detail: "toggle-sidebar" }))}><Icon name="panel" size={16} /></button><span className="text-muted">New thread</span><button className="bark-icon-button ml-auto" aria-label="Toggle surfaces" title="Toggle surfaces (⌘J)" onClick={() => window.dispatchEvent(new CustomEvent("bark-command", { detail: "toggle-workbench" }))}><Icon name="panel" size={16} /></button></header>{content}</section> : <AccessibleDialog label="New thread" onClose={onClose}>{content}<button className="bark-button" onClick={onClose}>Close</button></AccessibleDialog>;
}
