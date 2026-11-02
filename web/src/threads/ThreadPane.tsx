import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Card, ThreadEvent, ThreadDetail, RunRecord, ProviderStatus, ProjectSnapshot } from "../lib/types";
import {
  fetchThread,
  postThreadMessage,
  startThreadChat,
  stopThreadChat,
  approveRun,
  streamThreadUrl,
  startThreadRun,
  startThreadBuild,
  stopRun,
  verifyContribution,
} from "../lib/api";
import { notify as desktopNotify } from "../lib/desktop";
import { activeChatTurn, useComposerMode } from "../lib/composer";
import { Icon } from "../components/Icon";
import { relativeTime } from "../lib/threads";
import { isDemoMode } from "../lib/demo";
import { ThreadComposer } from "./ThreadComposer";
import { CodeBlock } from "./CodeBlock";
import { useAgentSelection } from "../lib/useAgentSelection";
import { useDraft } from "../lib/drafts";
import { runLabel, checkState, checksPassed, isActiveRun } from "../lib/run-state";
import type { ThreadActionTarget } from "../shell/ThreadActionsMenu";

interface ThreadPaneProps {
  scope?: string;
  project?: ProjectSnapshot | null;
  onThreadChange?: (thread: ThreadDetail | null) => void;
  threadId: string | null;
  boardName?: string;
  inspectorOpen?: boolean;
  onSelectCard?: (card: Card) => void;
  onOpenInspector?: () => void;
  onReview?: () => void;
  onRefreshInbox?: () => void;
  onThreadMenu?: (target: ThreadActionTarget, x: number, y: number) => void;
}

const MESSAGE_KINDS = new Set(["user", "assistant", "assistant_delta", "plan_proposed", "plan_approved", "question", "approval_requested", "merge"]);
function isMessage(event: ThreadEvent): boolean {
  return MESSAGE_KINDS.has(event.kind) || (event.kind === "run_failed" && (!event.run_id || event.run_id.startsWith("chat_")));
}

/** Render provider replies as readable prose and code without raw HTML or remote images. */
function Prose({ text }: { text: string }) {
  return (
    <div className="chat-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        skipHtml
        disallowedElements={["img"]}
        components={{
          a: ({ node, children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          pre: ({ node, children, ...props }) => (
            <CodeBlock {...props}>{children}</CodeBlock>
          ),
          code: ({ node, className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="chat-inline-code" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function EventTime({ iso }: { iso: string }) {
  return (
    <time
      dateTime={iso}
      className="font-mono text-[9.5px] text-muted/65"
      title={new Date(iso).toLocaleString()}
    >
      {relativeTime(iso)}
    </time>
  );
}

/**
 * Providers stream assistant text as many small deltas. Render one bubble per
 * turn instead of one bubble per token, and let the final message replace the
 * streaming bubble.
 */
function coalesceAssistantEvents(events: ThreadEvent[]): ThreadEvent[] {
  const out: ThreadEvent[] = [];
  for (const event of events) {
    if (event.kind === "assistant_delta") {
      const key = event.turn_id || event.run_id || "";
      const last = out[out.length - 1];
      if (
        key &&
        last?.kind === "assistant_delta" &&
        (last.turn_id || last.run_id || "") === key
      ) {
        out[out.length - 1] = {
          ...last,
          text: `${last.text}${event.text}`,
          created_at: event.created_at,
        };
        continue;
      }
      out.push(event);
      continue;
    }
    if (event.kind === "assistant") {
      const key = event.turn_id || event.run_id || "";
      const last = out[out.length - 1];
      if (
        key &&
        last?.kind === "assistant_delta" &&
        (last.turn_id || last.run_id || "") === key
      ) {
        out[out.length - 1] = event;
        continue;
      }
    }
    out.push(event);
  }
  return out;
}

function RunSummaryCard({ run, busy, onVerify, onBuildOn }: {
  run: RunRecord; busy: boolean; onVerify: () => void; onBuildOn: () => void;
}) {
  return <section className="run-summary" aria-label={`Run ${run.ordinal}`}>
    <dl><dt>Attempt</dt><dd>{run.ordinal}</dd><dt>Agent / model</dt><dd>{run.provider} / {run.model || "CLI default"}</dd>
      <dt>Branch</dt><dd>{run.branch || "Not created"}</dd><dt>Worktree</dt><dd>{run.worktree || "Not created"}</dd>
      <dt>Checks</dt><dd>{checkState(run.gate).label}</dd></dl>
    <div className="flex flex-wrap gap-2 mt-3">
      {checksPassed(run.gate) && <button className="bark-button" onClick={onVerify} disabled={busy}>Independently verify</button>}
      {!isActiveRun(run) && run.status !== "merged" && <button className="bark-button" onClick={onBuildOn} disabled={busy}>Build on this run</button>}
    </div>
  </section>;
}

export function ThreadPane({
  scope = "current-project",
  project,
  onThreadChange,
  threadId,
  boardName,
  inspectorOpen,
  onSelectCard,
  onOpenInspector,
  onReview,
  onRefreshInbox,
  onThreadMenu,
}: ThreadPaneProps) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [input, setInput] = useDraft(scope, threadId || "new");
  const agent = useAgentSelection(scope);
  const { backend, role, setRole, providers, model } = agent;
  const [connectionError, setConnectionError] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [newOutput, setNewOutput] = useState(false);
  const stickToBottom = useRef(true);
  const sendLock = useRef(false);
  const pendingBuild = useRef<string | null>(null);
  const runLock = useRef(false);
  const selectionRestored = useRef(false);
  const [chatMode, setChatMode] = useComposerMode(scope);
  const [sendError, setSendError] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [startingRun, setStartingRun] = useState(false);
  const [runBusyId, setRunBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectCardRef = useRef(onSelectCard);
  const refreshInboxRef = useRef(onRefreshInbox);

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleReusePrompt = (text: string) => {
    setInput(text);
    const composer = document.querySelector<HTMLTextAreaElement>('[data-testid="thread-composer"]');
    composer?.focus();
  };

  useEffect(() => {
    selectCardRef.current = onSelectCard;
    refreshInboxRef.current = onRefreshInbox;
  }, [onSelectCard, onRefreshInbox]);

  useEffect(() => { onThreadChange?.(thread); }, [thread, onThreadChange]);

  useEffect(() => {
    if (stickToBottom.current) messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    else setNewOutput(true);
  }, [thread?.events]);

  useEffect(() => {
    if (!threadId) {
      setThread(null);
      setLoadError(false);
      return;
    }
    let cancelled = false;
    setThread(null);
    setLoadError(false);
    setLoading(true);
    setChatBusy(false);
    fetchThread(threadId, boardName)
      .then((data) => {
        if (cancelled) return;
        setThread(data);
        if (!selectionRestored.current && data) {
          const choice = [...data.events].reverse().find((event) => event.kind === "user" && event.data?.backend && event.data.backend !== "board");
          if (choice) agent.restoreChoice(choice.data!.backend, choice.data!.model || "");
          selectionRestored.current = true;
        }
        const turn = activeChatTurn(data?.events || []);
        setChatBusy(Boolean(turn));
        if (data?.card) {
          selectCardRef.current?.(data.card);
          const cardRole = data.card.labels
            ?.find((label) => label.startsWith("role:"))
            ?.slice(5);
          if (cardRole) setRole(cardRole);
        }
        if (!data) setLoadError(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, boardName, reloadKey]);

  useEffect(() => {
    const turn = activeChatTurn(thread?.events || []);
    setChatBusy(Boolean(turn));
  }, [thread?.events]);

  useEffect(() => {
    if (!threadId || isDemoMode()) return;
    const url = streamThreadUrl(threadId);
    let eventSource: EventSource | null = null;
    let disposed = false;
    let refreshing = false;
    let refreshAgain = false;
    const refreshSnapshot = async () => {
      if (refreshing) { refreshAgain = true; return; }
      refreshing = true;
      try {
        do {
          refreshAgain = false;
          const next = await fetchThread(threadId, boardName);
          if (!disposed && next) setThread(next);
        } while (!disposed && refreshAgain);
      } finally { refreshing = false; }
    };
    try {
      eventSource = new EventSource(url);
      eventSource.onopen = () => { setConnectionError(false); void refreshSnapshot(); };
      eventSource.onerror = () => setConnectionError(true);
      eventSource.onmessage = (event) => {
        if (disposed) return;
        try {
          const parsed: ThreadEvent = JSON.parse(event.data);
          if (!parsed?.id) return;
          setThread((prev) => {
            if (!prev) return prev;
            if (prev.events.some((e) => e.id === parsed.id)) return prev;
            return { ...prev, events: [...prev.events, parsed] };
          });
          if (
            parsed.kind === "run_started" ||
            parsed.kind === "run_completed" ||
            parsed.kind === "run_failed" ||
            parsed.kind === "run_interrupted" ||
            parsed.kind === "gate" ||
            parsed.kind === "diff" ||
            parsed.kind === "merge"
          ) {
            void refreshSnapshot();
          }
          if (
            (parsed.kind === "run_completed" ||
              parsed.kind === "run_failed" ||
              parsed.kind === "chat_done") &&
            typeof document !== "undefined" &&
            document.hidden
          ) {
            void desktopNotify(
              "Bark",
              parsed.kind === "run_failed"
                ? parsed.text || "An agent run failed."
                : "An agent finished and is ready for review."
            );
          }
          if (
            !["assistant", "assistant_delta", "tool_call", "usage", "log"].includes(
              parsed.kind
            )
          ) {
            refreshInboxRef.current?.();
          }
        } catch {
          // Heartbeats and non-JSON frames are not events.
        }
      };
    } catch {
      // EventSource is an enhancement; the REST snapshot still works.
    }
    return () => { disposed = true; eventSource?.close(); };
  }, [threadId, boardName]);

  const handleSendMessage = async () => {
    const text = input.trim();
    if (!text || !threadId || submitting || chatBusy || activeRun || sendLock.current) return;
    sendLock.current = true;
    setSubmitting(true);
    setSendError(null);
    try {
      if (chatMode === "ask") {
        const provider = backend === "claude" ? "claude-code" : backend;
        const started = await startThreadChat(threadId, {
          text,
          provider,
          model: model.trim() || undefined,
          board: boardName,
        });
        if (!started) {
          setInput(text);
          setActionStatus(
            "The local agent did not accept the message. Check its sign-in and try again."
          );
          return;
        }
        setInput("");
        stickToBottom.current = true;
        setChatBusy(true);
        const next = await fetchThread(threadId, boardName);
        if (next) setThread(next);
        refreshInboxRef.current?.();
        return;
      }
      if (chatMode === "build") {
        if (!agent.ready) throw new Error("Choose an installed, signed-in agent before building. Your draft is saved.");
        if (pendingBuild.current !== text) {
          const saved = await postThreadMessage(threadId, text, {
            author: "you", backend, model: model.trim() || undefined, mode: "build", board: boardName,
          });
          if (!saved) throw new Error("Could not save your prompt. Check the local server and try again.");
          pendingBuild.current = text;
        }
        const run = await startThreadBuild(threadId, {
          provider: backend === "claude" ? "claude-code" : backend,
          model: model.trim() || undefined, role, prompt: text, board: boardName,
          test_cmd: agent.testCommand.trim() || undefined,
          parent_run_id: latestRun && latestRun.status !== "merged" ? latestRun.id : undefined,
        });
        pendingBuild.current = null;
        setInput("");
        stickToBottom.current = true;
        setThread((previous) => previous ? { ...previous, runs: [...(previous.runs || []), run] } : previous);
        const next = await fetchThread(threadId, boardName);
        if (next) setThread(next);
        refreshInboxRef.current?.();
        return;
      }
      const event = await postThreadMessage(threadId, text, {
        author: "you",
        backend, model: model.trim() || undefined, mode: "plan_first",
        board: boardName,
      });
      if (!event) { setActionStatus("Could not prepare the plan. Your draft is saved; check the server and retry."); return; }
      setInput("");
      const refreshed = await fetchThread(threadId, boardName);
      if (refreshed) setThread(refreshed);
      if (event) {
        setThread((prev) => {
          if (!prev) return prev;
          if (prev.events.some((e) => e.id === event.id)) return prev;
          return { ...prev, events: [...prev.events, event] };
        });
      }
      refreshInboxRef.current?.();
    } catch (error) {
      setInput(text);
      setSendError(error instanceof Error ? error.message : "Message did not send. Check the server, then try again.");
    } finally {
      sendLock.current = false;
      setSubmitting(false);
    }
  };

  const handleStopChat = async () => {
    if (!threadId || !chatBusy) return;
    setActionStatus("Stopping the reply…");
    await stopThreadChat(threadId);
    setChatBusy(false);
    setActionStatus(null);
    window.setTimeout(() => setActionStatus(null), 2500);
  };

  const runs = thread?.runs || [];
  const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;
  const activityEvents = (thread?.events || []).filter((event) => !isMessage(event) && event.kind !== "chat_done");
  const displayEvents = useMemo(
    () => coalesceAssistantEvents((thread?.events || []).filter(isMessage)),
    [thread?.events]
  );
  const activeRun =
    [...runs].reverse().find(isActiveRun) || null;

  useEffect(() => {
    if (!threadId || (!activeRun && !chatBusy)) return;
    let disposed = false;
    let inFlight = false;
    const timer = window.setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await fetchThread(threadId, boardName);
        if (!disposed && next) setThread(next);
      } finally { inFlight = false; }
    }, 1500);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [threadId, boardName, Boolean(activeRun), chatBusy]);

  const latestUserText = [...(thread?.events || [])]
    .reverse()
    .find((event) => event.kind === "user")?.text;
  const providerChoices: Array<
    Pick<ProviderStatus, "id" | "name" | "available" | "authenticated" | "auth_hint">
  > = providers;

  const handleStartRun = async (parentRunId?: string, planEventId?: string) => {
    if (!threadId || startingRun || runLock.current) return;
    const selected = providerChoices.find((provider) => provider.id === backend);
    if (!selected?.available) {
      setActionStatus("That local agent is not installed. Install it or choose another provider in Settings.");
      return;
    }
    if (selected.authenticated === false) {
      setActionStatus(
        selected.auth_hint ||
          "That local agent is not signed in. Open Settings, authenticate it, then try again."
      );
      return;
    }
    runLock.current = true;
    setStartingRun(true);
    setActionStatus(null);
    try {
      const provider = backend === "claude" ? "claude-code" : backend;
      const run = await startThreadRun(threadId, {
        provider,
        model: model.trim() || undefined,
        role,
        prompt: latestUserText,
        parent_run_id: parentRunId,
        plan_event_id: planEventId,
        board: boardName,
        test_cmd: agent.testCommand.trim() || undefined,
      });
      if (!run) {
        setActionStatus(
          "Could not start the run. Commit or stash tracked changes, then check that the provider is installed and authenticated."
        );
        return;
      }
      setThread((prev) =>
        prev
          ? {
              ...prev,
              runs: [...(prev.runs || []).filter((item) => item.id !== run.id), run],
            }
          : prev
      );
      setActionStatus(null);
      const refreshed = await fetchThread(threadId, boardName);
      if (refreshed) setThread(refreshed);
      refreshInboxRef.current?.();
    } finally {
      runLock.current = false;
      setStartingRun(false);
    }
  };

  const handleStopRun = async (run: RunRecord) => {
    setRunBusyId(run.id);
    setActionStatus("Stopping the run…");
    try {
      const stopped = await stopRun(run.id);
      if (stopped) {
        setThread((prev) =>
          prev
            ? {
                ...prev,
                runs: (prev.runs || []).map((item) => (item.id === stopped.id ? stopped : item)),
              }
            : prev
        );
        setActionStatus(null);
      } else {
        setActionStatus("The run could not be stopped. It may already have finished.");
      }
    } finally {
      setRunBusyId(null);
    }
  };

  const handleVerifyRun = async (run: RunRecord) => {
    setRunBusyId(run.id);
    setActionStatus("Re-running the gate as an independent verifier…");
    try {
      const result = await verifyContribution(run.id, "human", "Verified from the run summary");
      if (result?.ok) {
        const updated = await fetchThread(threadId!, boardName);
        if (updated) setThread(updated);
        setActionStatus("Independent verification recorded.");
        refreshInboxRef.current?.();
      } else {
        setActionStatus("Verification failed or the run is not ready for reproduction.");
      }
    } finally {
      setRunBusyId(null);
    }
  };

  const handleApprovePlan = async () => {
    const plan = [...(thread?.events || [])].reverse().find((event) => event.kind === "plan_proposed");
    if (plan) await handleStartRun(undefined, plan.id);
  };

  const handleRejectPlan = async () => {
    setChatMode("plan");
    if (!input.trim()) setInput("Revise the plan: ");
    document.querySelector<HTMLTextAreaElement>('[data-testid="thread-composer"]')?.focus();
  };

  const handleApproval = async (event: ThreadEvent, approved: boolean) => {
    const runId = event.data?.run_id || event.run_id;
    if (!runId || !threadId) return;
    const key = `${event.id}:${approved ? "yes" : "no"}`;
    setApprovalBusyId(key);
    setActionStatus(approved ? "Approving and merging…" : "Rejecting the merge…");
    try {
      const result = await approveRun(
        runId,
        approved,
        approved ? "Approved from Chat" : "Rejected from Chat",
        approved && event.data?.kind === "merge"
      );
      const updated = await fetchThread(threadId, boardName);
      if (updated) setThread(updated);
      setActionStatus(
        result
          ? approved
            ? "Approved. The branch is merging."
            : "Rejected. The run stays inspectable."
          : "The approval could not be recorded."
      );
      refreshInboxRef.current?.();
    } finally {
      setApprovalBusyId(null);
    }
  };

  if (!threadId) return null;

  const card = thread?.card;
  const approvedPlans = new Set(
    (thread?.events || [])
      .filter((event) => event.kind === "plan_approved")
      .map((event) => Date.parse(event.created_at))
  );

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-bg">
      <header className="thread-header">
        <button
          className="bark-icon-button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("bark-command", { detail: "toggle-sidebar" })
            )
          }
          aria-label="Toggle sidebar"
        >
          <Icon name="panel" size={16} />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-text">
            {card?.title || threadId}
          </span>
          {card?.column && (
            <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-mono text-muted uppercase tracking-wider">
              {card.column}
            </span>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {onThreadMenu && (
            <button
              type="button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onThreadMenu(
                  {
                    id: threadId,
                    title: card?.title || threadId,
                    pinned: Boolean(card?.pinned),
                    settled: card?.column === "done",
                  },
                  rect.right - 220,
                  rect.bottom + 6
                );
              }}
              aria-label="Thread actions"
              title="Thread actions"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <Icon name="dots" size={15} />
            </button>
          )}
          {onOpenInspector && (
            <button
              type="button"
              onClick={onOpenInspector}
              aria-label={inspectorOpen ? "Hide thread panel" : "Show thread panel"}
              aria-pressed={inspectorOpen}
              title={inspectorOpen ? "Hide thread panel (⌘J)" : "Show thread panel (⌘J)"}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                inspectorOpen
                  ? "bg-surface text-text shadow-xs"
                  : "text-muted hover:bg-surface hover:text-text"
              }`}
            >
              <Icon name="panel" size={15} />
            </button>
          )}
        </div>
      </header>

      {connectionError && (
        <div className="connection-notice" role="status">
          Connection interrupted. Reconnecting… Your draft is saved.
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto min-h-0 thread-events"
        onScroll={(event) => {
          const node = event.currentTarget;
          stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
          if (stickToBottom.current) setNewOutput(false);
        }}
      >
        <div className="thread-conversation">
          {loading && (
            <div className="space-y-6" aria-label="Loading thread">
              {[0, 1, 2].map((row) => (
                <div key={row} className="space-y-2">
                  <div className="h-2.5 w-20 animate-pulse rounded bg-surface" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-surface/80" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-surface/60" />
                </div>
              ))}
            </div>
          )}

          {!loading && loadError && (
            <div className="mx-auto max-w-[420px] py-16 text-center" role="alert">
              <div className="text-[13px] font-semibold text-text">Could not load this thread</div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                The server may still be starting, or the thread was moved. Your board is untouched.
              </p>
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                className="mt-4 h-7 rounded-md border border-border px-3 text-[11.5px] font-medium text-muted-strong transition-colors hover:border-border-strong hover:text-text hover:bg-surface"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !loadError && thread?.events.length === 0 && (
            <div className="py-16 text-center text-[12px] text-muted">
              <span className="flex h-10 w-10 mx-auto items-center justify-center rounded-xl bg-surface text-muted mb-3">
                <Icon name="robot" size={20} />
              </span>
              <p className="font-medium text-text text-[13px]">No messages yet</p>
              <p className="mt-1 text-muted text-[11.5px]">Choose Build, Plan, or Ask below to start.</p>
            </div>
          )}

          {!loading && thread && displayEvents.length > 0 && (
            <div className="chat-messages">
              {displayEvents.map((event) => {
                if (event.kind === "user") {
                  return (
                    <article
                      key={`${event.id}:${event.seq}`}
                      className="chat-message chat-message-user group"
                      aria-label="Your message"
                    >
                      <div className="chat-user-header">
                        <span className="chat-user-author">You</span>
                        <div className="chat-user-actions">
                          <button
                            type="button"
                            onClick={() => handleReusePrompt(event.text)}
                            className="chat-action-btn"
                            aria-label="Reuse prompt"
                            title="Reuse in composer"
                          >
                            <Icon name="pencil" size={11} />
                            <span>Reuse</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyText(event.id, event.text)}
                            className="chat-action-btn"
                            aria-label="Copy prompt"
                            title="Copy prompt"
                          >
                            <Icon name={copiedId === event.id ? "check" : "copy"} size={11} />
                            <span>{copiedId === event.id ? "Copied" : "Copy"}</span>
                          </button>
                          <span className="chat-message-time">
                            <EventTime iso={event.created_at} />
                          </span>
                        </div>
                      </div>
                      <div className="chat-user-text">{event.text}</div>
                    </article>
                  );
                }

                if (event.kind === "assistant" || event.kind === "assistant_delta") {
                  const isStreaming = event.kind === "assistant_delta";
                  return (
                    <article
                      key={`${event.id}:${event.seq}`}
                      className="chat-message chat-message-assistant group"
                      aria-label="Agent reply"
                      aria-busy={isStreaming}
                    >
                      <div className="chat-assistant-header">
                        <div className="flex items-center gap-2">
                          <span className="chat-assistant-avatar">
                            <Icon name="robot" size={13} />
                          </span>
                          <span className="chat-assistant-name">
                            {event.author === "you" ? "Assistant" : event.author || "Bark Agent"}
                          </span>
                          {isStreaming && (
                            <span className="chat-streaming-badge">
                              <span className="chat-working-dot animate-pulse" />
                              <span>Streaming…</span>
                            </span>
                          )}
                        </div>
                        <div className="chat-assistant-actions">
                          <button
                            type="button"
                            onClick={() => handleCopyText(event.id, event.text)}
                            className="chat-action-btn"
                            aria-label="Copy reply"
                            title="Copy reply"
                          >
                            <Icon name={copiedId === event.id ? "check" : "copy"} size={11} />
                            <span>{copiedId === event.id ? "Copied" : "Copy"}</span>
                          </button>
                          <span className="chat-message-time">
                            <EventTime iso={event.created_at} />
                          </span>
                        </div>
                      </div>
                      <Prose text={event.text} />
                    </article>
                  );
                }

                if (event.kind === "approval_requested" || event.kind === "question") {
                  const data = event.data || {};
                  const approvalRunId = data.run_id || event.run_id;
                  const mergeApproval =
                    event.kind === "approval_requested" &&
                    data.kind === "merge" &&
                    Boolean(approvalRunId);
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className="rounded-xl border border-warning/40 bg-warning/5 p-3.5 shadow-xs"
                    >
                      <div className="flex items-center gap-2 text-[12px] font-medium text-warning">
                        <Icon name="warn" size={14} />
                        {event.kind === "approval_requested" ? "Approval requested" : "Agent question"}
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-strong">
                        {data.title || data.text || event.text}
                      </p>
                      {data.detail && (
                        <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-muted/80 bg-surface/60 rounded p-2">
                          {data.detail}
                        </p>
                      )}
                      {mergeApproval ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleApproval(event, true)}
                            disabled={approvalBusyId !== null}
                            className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            {approvalBusyId?.endsWith(":yes") ? "Merging…" : "Approve & merge"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproval(event, false)}
                            disabled={approvalBusyId !== null}
                            className="rounded-md border border-border px-3 py-1.5 text-[11px] text-muted-strong transition-colors hover:bg-surface hover:text-text disabled:opacity-40"
                          >
                            Reject
                          </button>
                          {data.branch && (
                            <span className="font-mono text-[10px] text-muted/70 bg-surface px-2 py-0.5 rounded">
                              {data.branch}
                            </span>
                          )}
                        </div>
                      ) : Array.isArray(data.options) && data.options.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {data.options.map((option: string) => (
                            <span
                              key={option}
                              className="rounded border border-border px-2.5 py-1 font-mono text-[9.5px] text-muted bg-surface/50"
                            >
                              {option}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                if (
                  event.kind === "run_completed" ||
                  event.kind === "run_failed" ||
                  event.kind === "run_interrupted"
                ) {
                  const failed = event.kind === "run_failed";
                  const interrupted = event.kind === "run_interrupted";
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className={`flex flex-wrap items-center gap-2 text-[11.5px] font-medium ${
                        failed ? "text-danger" : interrupted ? "text-warning" : "text-success"
                      }`}
                    >
                      <Icon
                        name={failed ? "warn" : interrupted ? "stop" : "check"}
                        size={12}
                      />
                      <span>{event.text}</span>
                      <EventTime iso={event.created_at} />
                    </div>
                  );
                }

                if (event.kind === "plan_proposed") {
                  const proposal = event.data || {};
                  const children: any[] = Array.isArray(proposal.children) ? proposal.children : [];
                  const latestProposal = [...(thread?.events || [])]
                    .reverse()
                    .find((item) => item.kind === "plan_proposed");
                  const isApproved =
                    latestProposal?.id !== event.id ||
                    [...approvedPlans].some(
                      (approvedAt) => approvedAt >= Date.parse(event.created_at)
                    );
                  return (
                    <section
                      key={`${event.id}:${event.seq}`}
                      className="plan-card my-4 rounded-xl border border-border/80 bg-card p-4 shadow-xs"
                      aria-label="Plan proposal"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-warning/50 text-[10px] text-warning bg-warning/10 font-bold">
                          ●
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="text-[13px] font-semibold text-text">
                              Plan · {children.length || 0} steps
                            </h3>
                            <span className="font-mono text-[10px] text-muted/70 bg-surface px-1.5 py-0.5 rounded">
                              Bark plan · offline
                            </span>
                            <span
                              className={`ml-auto font-mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${
                                isApproved
                                  ? "text-success bg-success/10"
                                  : "text-warning bg-warning/10"
                              }`}
                            >
                              {isApproved ? "approved" : "waiting"}
                            </span>
                          </div>
                          {proposal.rationale && (
                            <p className="mt-2 text-[12px] leading-relaxed text-muted bg-surface/40 p-2.5 rounded-lg border border-border/40">
                              {proposal.rationale}
                            </p>
                          )}
                        </div>
                      </div>

                      {children.length > 0 && (
                        <ol className="mt-3 divide-y divide-border/50 border-y border-border/50">
                          {children.map((child, index) => (
                            <li
                              key={`${child.title}-${index}`}
                              className="flex gap-3 py-2.5 items-start"
                            >
                              <span className="w-5 shrink-0 pt-0.5 font-mono text-[10px] text-muted/60 font-semibold">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[12px] font-medium text-text">
                                    {child.title}
                                  </span>
                                  {child.effort != null && (
                                    <span className="font-mono text-[9.5px] text-muted/70 bg-surface px-1.5 py-0.5 rounded">
                                      {child.effort}h
                                    </span>
                                  )}
                                </div>
                                {child.description && (
                                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                                    {child.description}
                                  </p>
                                )}
                                {Array.isArray(child.acceptance_criteria) &&
                                  child.acceptance_criteria.length > 0 && (
                                    <p className="mt-1 font-mono text-[9.5px] text-muted/70">
                                      Acceptance: {child.acceptance_criteria.join(" · ")}
                                    </p>
                                  )}
                              </div>
                              {child.priority && (
                                <span className="self-center font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-surface text-muted/70 font-semibold">
                                  {child.priority}
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}

                      {!isApproved && (
                        <dl className="execution-summary mt-3">
                          <dt>Build with</dt>
                          <dd>
                            {agent.selected?.name || agent.backend || "Choose an agent below"} /{" "}
                            {model || "CLI default"}
                          </dd>
                          <dt>Workspace</dt>
                          <dd>
                            Isolated worktree
                            {project?.git?.branch ? ` from ${project.git.branch}` : ""}
                          </dd>
                          <dt>Checks</dt>
                          <dd>
                            {agent.testCommand ||
                              project?.verification_command ||
                              "Not configured — choose a verification command in Build options"}
                          </dd>
                        </dl>
                      )}
                      {!isApproved && (
                        <div className="mt-3.5 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={handleRejectPlan}
                            className="h-7.5 rounded-md px-3 text-[11.5px] text-muted transition-colors hover:bg-surface hover:text-text border border-border/70"
                          >
                            Request plan changes
                          </button>
                          <button
                            type="button"
                            onClick={handleApprovePlan}
                            disabled={startingRun || !agent.ready || Boolean(activeRun)}
                            className="h-7.5 rounded-md bg-accent px-3.5 text-[11.5px] font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            {startingRun ? "Starting…" : "Approve plan & build"}
                          </button>
                        </div>
                      )}
                    </section>
                  );
                }

                if (event.kind === "plan_approved") {
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className="flex items-center gap-2 text-[11.5px] font-medium text-success"
                    >
                      <Icon name="check" size={13} className="shrink-0" />
                      <span>{event.text}</span>
                      <EventTime iso={event.created_at} />
                    </div>
                  );
                }

                if (event.kind === "merge") {
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className="flex items-center gap-2 text-[11.5px] font-medium text-accent-text"
                    >
                      <Icon name="branch" size={12} className="shrink-0" />
                      <span>{event.text}</span>
                      <EventTime iso={event.created_at} />
                    </div>
                  );
                }

                return (
                  <div
                    key={`${event.id}:${event.seq}`}
                    className="text-[11.5px] leading-relaxed text-muted"
                  >
                    <span className="font-medium text-muted-strong">{event.author}</span>
                    <span className="mx-2 text-muted/40">·</span>
                    {event.text}
                    <span className="ml-2 font-mono text-[9px] text-muted/50">
                      {relativeTime(event.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !loadError && (latestRun || activityEvents.length > 0) && (
            <details
              className="thread-details"
              open={activityOpen}
              onToggle={(event) => setActivityOpen(event.currentTarget.open)}
            >
              <summary>Details</summary>
              {activityOpen && (
                <div className="thread-details-content">
                  {latestRun && (
                    <RunSummaryCard
                      run={latestRun}
                      busy={runBusyId === latestRun.id || startingRun}
                      onVerify={() => handleVerifyRun(latestRun)}
                      onBuildOn={() => handleStartRun(latestRun.id)}
                    />
                  )}
                  {activityEvents.length > 0 && (
                    <div className="thread-activity" aria-label="Technical activity">
                      {activityEvents.map((event) => (
                        <details key={event.id}>
                          <summary>
                            {event.kind === "gate"
                              ? checkState(event.data as any).label
                              : event.data?.name || event.text.slice(0, 100) || event.kind}{" "}
                            <EventTime iso={event.created_at} />
                          </summary>
                          <pre>
                            {event.text}
                            {event.data ? `\n${JSON.stringify(event.data, null, 2)}` : ""}
                          </pre>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </details>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="thread-composer-dock">
        {actionStatus && (
          <div className="composer-action-note" role="status">
            <span>{actionStatus}</span>
            <button
              className="bark-icon-button"
              onClick={() => setActionStatus(null)}
              aria-label="Dismiss status"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        )}
        {!loading && !loadError && (latestRun || chatBusy) && (
          <div className="thread-outcome" role="status" aria-live="polite">
            <span
              className={`thread-outcome-label ${
                !chatBusy &&
                (latestRun?.status === "failed" || checkState(latestRun?.gate).tone === "danger")
                  ? "text-danger"
                  : "text-muted"
              }`}
            >
              {(chatBusy || activeRun) && <span className="chat-working-dot" aria-hidden="true" />}
              {chatBusy ? "Working…" : latestRun ? runLabel(latestRun) : ""}
            </span>
            {latestRun && latestRun.diff_stats.files > 0 && onReview && (
              <button className="chat-text-action" onClick={onReview}>
                <Icon name="code" size={13} />
                {latestRun.diff_stats.files}{" "}
                {latestRun.diff_stats.files === 1 ? "file" : "files"} changed
              </button>
            )}
            {latestRun &&
              ["failed", "interrupted", "cancelled"].includes(latestRun.status) &&
              !activeRun && (
                <button
                  className="chat-text-action"
                  disabled={startingRun}
                  onClick={() => handleStartRun(latestRun.id)}
                >
                  Retry
                </button>
              )}
          </div>
        )}
        {latestRun?.error && !activeRun && !chatBusy && (
          <p className="composer-error" role="alert">
            {latestRun.error}
          </p>
        )}
        {newOutput && (
          <button
            className="jump-to-latest"
            onClick={() => {
              stickToBottom.current = true;
              setNewOutput(false);
              messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
            }}
          >
            Jump to latest
          </button>
        )}
        <ThreadComposer
          value={input}
          onChange={setInput}
          mode={chatMode}
          onModeChange={setChatMode}
          agent={agent}
          onSubmit={handleSendMessage}
          busy={submitting || startingRun || Boolean(runBusyId)}
          error={sendError}
          active={chatBusy || Boolean(activeRun)}
          onStop={
            chatBusy
              ? handleStopChat
              : activeRun
              ? () => void handleStopRun(activeRun)
              : undefined
          }
        />
      </div>
    </section>
  );
}
