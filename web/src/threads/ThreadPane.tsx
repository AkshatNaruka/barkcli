import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Card, ThreadEvent, ThreadDetail, RunRecord, ProviderStatus, ProjectSnapshot } from "../lib/types";

const threadDetailCache = new Map<string, ThreadDetail>();

function threadCacheKey(threadId: string, boardName?: string, scope?: string): string {
  return `${scope || ""}:${boardName || ""}:${threadId}`;
}

/** @internal test-only: clears the module thread detail cache. */
export function clearThreadDetailCache(): void {
  threadDetailCache.clear();
}

function isLowImportanceThreadEvent(event: ThreadEvent): boolean {
  const text = (event.text || "").trim().toLowerCase();
  return text === "context primed" || text === "context loaded";
}
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
  gitCommit,
  mergeRun,
  openInEditor,
} from "../lib/api";
import { notify as desktopNotify } from "../lib/desktop";
import { activeChatTurn, useComposerMode } from "../lib/composer";
import { Icon } from "../components/Icon";
import { relativeTime, formatElapsed } from "../lib/threads";
import { isDemoMode } from "../lib/demo";
import { navigate } from "../lib/hashnav";
import { ThreadComposer } from "./ThreadComposer";
import { AssistantMessageCard, LiveAgentWorkingBubble, useElapsedSeconds } from "./AssistantMessageCard";
import { StepExplorer } from "./StepExplorer";
import { QueuedMessagesPanel, type QueuedMessage } from "./QueuedMessagesPanel";
import { CodeBlock } from "./CodeBlock";
import { ExecutionTimeline } from "../components/ExecutionTimeline";
import { RunReviewCard } from "./RunReviewCard";
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

function formatErrorMessage(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-text underline underline-offset-2 hover:opacity-80 break-all"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

/** Render provider replies as readable prose and code without raw HTML or remote images. */
function Prose({ text, onRunCommand }: { text: string; onRunCommand?: (cmd: string) => void }) {
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
            <CodeBlock onRun={onRunCommand} {...props}>
              {children}
            </CodeBlock>
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
  const date = new Date(iso);
  const absolute = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <time
      dateTime={iso}
      className="font-mono text-[9.5px] text-muted/65 tabular-nums"
      title={date.toLocaleString()}
    >
      {absolute} · {relativeTime(iso)}
    </time>
  );
}

function splitThinkingContent(text: string): { thinking: string | null; body: string } {
  const match = /<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/i.exec(text);
  if (!match) return { thinking: null, body: text };
  const thinking = match[1].trim();
  const body = text.replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/i, "").trim();
  return { thinking: thinking || null, body };
}

function UserMessageCard({
  event,
  copied,
  onCopy,
  onReuse,
}: {
  event: ThreadEvent;
  copied: boolean;
  onCopy: () => void;
  onReuse: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = event.text.length > 500 || event.text.split("\n").length > 7;

  let displayText = event.text;
  if (isLong && !expanded) {
    const lines = event.text.split("\n");
    if (lines.length > 7) {
      displayText = lines.slice(0, 6).join("\n") + "…";
    } else {
      displayText = event.text.slice(0, 400) + "…";
    }
  }

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
            onClick={onReuse}
            className="chat-action-btn"
            aria-label="Reuse prompt"
            title="Reuse in composer"
          >
            <Icon name="pencil" size={11} />
            <span>Reuse</span>
          </button>
          <button
            type="button"
            onClick={onCopy}
            className="chat-action-btn"
            aria-label="Copy prompt"
            title="Copy prompt"
          >
            <Icon name={copied ? "check" : "copy"} size={11} />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <span className="chat-message-time">
            <EventTime iso={event.created_at} />
          </span>
        </div>
      </div>
      <div className="chat-user-text">
        {displayText}
        {isLong && (
          <div>
            <button
              type="button"
              className="chat-user-toggle"
              onClick={() => setExpanded((val) => !val)}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          </div>
        )}
      </div>
    </article>
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
  const checks = checkState(run.gate);
  return (
    <section className="run-summary-compact" aria-label={`Run ${run.ordinal}`}>
      <div className="run-summary-compact-meta">
        <span className="run-summary-pill" title={`${run.provider} / ${run.model || "CLI default"}`}>
          Attempt {run.ordinal} · {run.provider}
        </span>
        <span className={`run-summary-pill ${checks.tone === "danger" ? "is-danger" : checks.tone === "success" ? "is-success" : checks.tone === "warning" ? "is-warning" : ""}`}>
          {checks.label}
        </span>
      </div>
      <details className="run-summary-technical">
        <summary>Technical details</summary>
        <dl>
          <dt>Branch</dt><dd>{run.branch || "Not created"}</dd>
          <dt>Worktree</dt><dd>{run.worktree || "Not created"}</dd>
          <dt>Agent / model</dt><dd>{run.provider} / {run.model || "CLI default"}</dd>
        </dl>
      </details>
      <div className="flex flex-wrap gap-2 mt-2">
        {checksPassed(run.gate) && <button className="bark-button" onClick={onVerify} disabled={busy}>Independently verify</button>}
        {!isActiveRun(run) && run.status !== "merged" && <button className="bark-button" onClick={onBuildOn} disabled={busy}>Build on this run</button>}
      </div>
    </section>
  );
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
  const [gitMenuOpen, setGitMenuOpen] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
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

  const handleRetryWith = (provider: string, targetModel: string) => {
    agent.selectChoice(provider, targetModel);
    const lastUserText = [...(thread?.events || [])]
      .reverse()
      .find((e) => e.kind === "user")?.text;
    if (!input.trim() && lastUserText) {
      setInput(lastUserText);
    }
    const composer = document.querySelector<HTMLTextAreaElement>('[data-testid="thread-composer"]');
    composer?.focus();
  };

  const handleRetryLastPrompt = () => {
    const lastUserText = [...(thread?.events || [])]
      .reverse()
      .find((e) => e.kind === "user")?.text;
    if (lastUserText) {
      setInput(lastUserText);
    }
    const composer = document.querySelector<HTMLTextAreaElement>('[data-testid="thread-composer"]');
    composer?.focus();
  };

  useEffect(() => {
    selectCardRef.current = onSelectCard;
    refreshInboxRef.current = onRefreshInbox;
  }, [onSelectCard, onRefreshInbox]);

  useEffect(() => { onThreadChange?.(thread); }, [thread, onThreadChange]);

  useEffect(() => {
    if (threadId && thread) threadDetailCache.set(threadCacheKey(threadId, boardName, scope), thread);
  }, [threadId, thread, boardName, scope]);

  useEffect(() => {
    if (stickToBottom.current) messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    else setNewOutput(true);
  }, [thread?.events, chatBusy]);

  useEffect(() => {
    if (!threadId) return;
    stickToBottom.current = true;
    setNewOutput(false);
    const id = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [threadId]);

  useEffect(() => {
    if (!threadId) {
      setThread(null);
      setLoadError(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const key = threadCacheKey(threadId, boardName, scope);
    const cached = threadDetailCache.get(key);
    if (cached) {
      setThread(cached);
      setLoading(false);
      setLoadError(false);
      const turn = activeChatTurn(cached.events || []);
      setChatBusy(Boolean(turn));
    } else {
      setThread(null);
      setLoadError(false);
      setLoading(true);
      setChatBusy(false);
    }
    fetchThread(threadId, boardName)
      .then((data) => {
        if (cancelled) return;
        if (data) threadDetailCache.set(key, data);
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
        if (!data) setLoadError(!cached);
      })
      .catch(() => {
        if (!cancelled && !threadDetailCache.has(key)) setLoadError(true);
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

  const handleComposerAction = (action: string) => {
    if (action === "gate") {
      if (latestRun) void handleVerifyRun(latestRun);
      else setActionStatus("No active run to verify yet. Start a build first.");
    } else if (action === "diff") {
      if (onOpenInspector) {
        onOpenInspector();
        window.dispatchEvent(new CustomEvent("bark-open-inspector-tab", { detail: "diff" }));
      } else {
        navigate("operations", { tool: "diff" });
      }
    } else if (action === "review") {
      if (onReview) onReview();
      else navigate("operations", { tool: "review" });
    } else if (action === "help") {
      setActionStatus(
        "Available slash commands: /build, /plan, /ask, /claude, /opencode, /codex, /agent, /tdd, /mvp, /review, /security, /refactor, /skills, /gate, /diff, /context, /doctor, /clear, /help"
      );
    }
  };

  const handleSendMessage = async () => {
    let text = input.trim();
    if (!text || !threadId || submitting || chatBusy || activeRun || sendLock.current) return;

    let targetMode = chatMode;

    if (text.startsWith("/")) {
      const parts = text.split(/\s+/);
      const commandName = parts[0].toLowerCase();
      const restText = text.slice(parts[0].length).trim();

      if (commandName === "/build") {
        setChatMode("build");
        targetMode = "build";
        text = restText;
        if (!text) {
          setInput("");
          return;
        }
      } else if (commandName === "/plan") {
        setChatMode("plan");
        targetMode = "plan";
        text = restText;
        if (!text) {
          setInput("");
          return;
        }
      } else if (commandName === "/ask") {
        setChatMode("ask");
        targetMode = "ask";
        text = restText;
        if (!text) {
          setInput("");
          return;
        }
      } else if (commandName === "/claude" || commandName === "/claude-code") {
        agent.restoreChoice("claude-code", "");
        setActionStatus("Switched agent to Claude Code");
        setInput(restText);
        if (!restText) return;
        text = restText;
      } else if (commandName === "/opencode") {
        agent.restoreChoice("opencode", "");
        setActionStatus("Switched agent to OpenCode");
        setInput(restText);
        if (!restText) return;
        text = restText;
      } else if (commandName === "/codex" || commandName === "/openai") {
        agent.restoreChoice("codex", "");
        setActionStatus("Switched agent to OpenAI Codex");
        setInput(restText);
        if (!restText) return;
        text = restText;
      } else if (commandName === "/agent") {
        setInput("");
        document.querySelector<HTMLButtonElement>(".agent-trigger")?.click();
        return;
      } else if (commandName === "/tdd") {
        setChatMode("build");
        targetMode = "build";
        text = restText ? `[TDD Red-Green-Refactor]: ${restText}` : "";
        if (!text) {
          setInput("/tdd ");
          return;
        }
      } else if (commandName === "/mvp") {
        setChatMode("build");
        targetMode = "build";
        text = restText ? `[MVP pattern]: ${restText}` : "";
        if (!text) {
          setInput("/mvp ");
          return;
        }
      } else if (commandName === "/security") {
        setChatMode("build");
        targetMode = "build";
        text = restText
          ? `[Security Audit]: ${restText}`
          : "Audit codebase for vulnerabilities, exposed secrets, and unhandled security boundaries.";
      } else if (commandName === "/refactor") {
        setChatMode("build");
        targetMode = "build";
        text = restText ? `[Refactor workflow]: ${restText}` : "";
        if (!text) {
          setInput("/refactor ");
          return;
        }
      } else if (commandName === "/skills") {
        setInput("");
        navigate("operations", { tool: "skills" });
        return;
      } else if (commandName === "/gate" || commandName === "/test") {
        setInput("");
        if (latestRun) void handleVerifyRun(latestRun);
        else setActionStatus("No active run to verify yet. Start a build first.");
        return;
      } else if (commandName === "/diff") {
        setInput("");
        if (onOpenInspector) {
          onOpenInspector();
          window.dispatchEvent(new CustomEvent("bark-open-inspector-tab", { detail: "diff" }));
        } else {
          navigate("operations", { tool: "diff" });
        }
        return;
      } else if (commandName === "/context" || commandName === "/digest") {
        setInput("");
        navigate("operations", { tool: "context" });
        return;
      } else if (commandName === "/doctor") {
        setInput("");
        navigate("operations", { tool: "doctor" });
        return;
      } else if (commandName === "/clear") {
        setInput("");
        return;
      } else if (commandName === "/review") {
        setInput("");
        if (onReview) onReview();
        else navigate("operations", { tool: "review" });
        return;
      } else if (commandName === "/help") {
        setInput("");
        setActionStatus(
          "Available slash commands: /build, /plan, /ask, /claude, /opencode, /codex, /agent, /tdd, /mvp, /review, /security, /refactor, /skills, /gate, /diff, /context, /doctor, /clear, /help"
        );
        return;
      }
    }

    sendLock.current = true;
    setSubmitting(true);
    setSendError(null);
    try {
      if (targetMode === "ask") {
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
      if (targetMode === "build") {
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
    if (chatBusy || activeRun) setActivityOpen(true);
  }, [chatBusy, activeRun?.id]);

  const elapsedSeconds = useElapsedSeconds(chatBusy || Boolean(activeRun));
  const lastEvent = displayEvents.length > 0 ? displayEvents[displayEvents.length - 1] : null;
  const isLastEventAssistant = Boolean(
    lastEvent && (lastEvent.kind === "assistant" || lastEvent.kind === "assistant_delta")
  );
  const showWorkingBubble = (chatBusy || Boolean(activeRun)) && !isLastEventAssistant;

  const latestActivity = activityEvents.length > 0 ? activityEvents[activityEvents.length - 1] : null;
  const workingStatusText = activeRun
    ? `Building in worktree ${activeRun.worktree || ""}`
    : latestActivity
    ? (latestActivity.data?.name || latestActivity.text.slice(0, 60) || "Analyzing project…")
    : "Thinking…";

  const recentActivities = useMemo(() => {
    return activityEvents.slice(-3).map((ev) => {
      const isGate = ev.kind === "gate";
      const rawLabel = isGate ? checkState(ev.data as any).label : ev.data?.name || ev.text.slice(0, 80) || ev.kind;
      const label = typeof rawLabel === "string" ? rawLabel : JSON.stringify(rawLabel);
      const lower = label.toLowerCase();
      const isRead = lower.includes("read") || lower.includes("inspect") || lower.includes("search") || lower.includes("find");
      const isExec = lower.includes("run") || lower.includes("bash") || lower.includes("terminal") || lower.includes("exec") || lower.includes("command");
      const isFile = lower.includes("write") || lower.includes("edit") || lower.includes("patch") || lower.includes("file");
      const icon = isGate ? "check" : isRead ? "eye" : isExec ? "terminal" : isFile ? "doc" : "spark";
      const color = isGate ? "text-success" : isRead ? "text-muted-strong" : isExec ? "text-warning" : isFile ? "text-accent-text" : "text-muted";
      return { id: ev.id, label, icon, color, time: relativeTime(ev.created_at) };
    });
  }, [activityEvents]);

  const wasBusyRef = useRef(false);
  useEffect(() => {
    const isNowBusy = Boolean(chatBusy || activeRun || submitting);
    if (wasBusyRef.current && !isNowBusy && queuedMessages.length > 0 && threadId) {
      const next = queuedMessages[0];
      setQueuedMessages((prev) => prev.slice(1));
      void postThreadMessage(threadId, next.text, { board: boardName }).then(() => {
        void fetchThread(threadId, boardName).then((updated) => {
          if (updated) setThread(updated);
        });
      });
    }
    wasBusyRef.current = isNowBusy;
  }, [chatBusy, activeRun, submitting, queuedMessages, threadId, boardName]);

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
        <div className="thread-header-lead">
          <button
            className="bark-icon-button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("bark-command", { detail: "toggle-sidebar" })
              )
            }
            aria-label="Toggle thread list"
            title="Thread list"
          >
            <Icon name="panel" size={15} />
          </button>
          <div className="thread-breadcrumb">
            <span className="thread-crumb-project">{project?.name || "barkcli"}</span>
            <Icon name="chevR" size={11} className="thread-crumb-sep" />
            <span className="thread-crumb-title" title={card?.title || threadId}>
              {card?.title || threadId}
            </span>
            <span className={`thread-status-dot${activeRun ? " is-live" : ""}`} aria-hidden="true" />
          </div>
          <span className="thread-header-meta" title={`isolated worktree: .board/worktrees/${card?.id || threadId}`}>
            <span className={`thread-column-chip is-${card?.column || "todo"}`}>
              {card?.column || "todo"}
            </span>
            <span className="thread-meta-id">{card?.id || threadId}</span>
          </span>
        </div>

        <div className="thread-header-actions" role="toolbar" aria-label="Thread actions">
          {/* Thread Changes Pill (t3.codes style) */}
          {onReview && (
            <button
              type="button"
              onClick={onReview}
              aria-label="Inspect thread changes"
              title="Inspect thread changes and diff"
              className="thread-action-changes flex h-7 items-center gap-1.5 px-2.5 rounded-lg border border-border/80 bg-surface/70 hover:bg-surface text-text text-[11.5px] font-medium transition-colors"
            >
              <Icon name="code" size={13} className="text-muted" />
              <span>Changes</span>
              {latestRun && latestRun.diff_stats.files > 0 ? (
                <span className="flex items-center gap-1 font-mono text-[10.5px]">
                  <span className="text-success font-semibold">+{latestRun.diff_stats.additions}</span>
                  <span className="text-rose-400 font-semibold">-{latestRun.diff_stats.deletions}</span>
                  <span className="text-muted/60">({latestRun.diff_stats.files})</span>
                </span>
              ) : (
                <span className="font-mono text-[10px] text-muted/60">0</span>
              )}
            </button>
          )}

          {/* Thread Git Workflow Dropdown (t3.codes style) */}
          <div className="thread-action-git relative">
            <button
              type="button"
              onClick={() => setGitMenuOpen((prev) => !prev)}
              aria-label="Git workflow options"
              title="Git worktree & branch workflow"
              className="flex h-7 items-center gap-1.5 px-2 rounded-lg border border-border/80 bg-surface/70 hover:bg-surface text-text text-[11.5px] font-medium transition-colors"
            >
              <Icon name="branch" size={12} className="text-accent" />
              <span className="font-mono text-[11px] max-w-[100px] truncate">
                {card?.id || threadId}
              </span>
              <Icon name="chevDown" size={10} className="text-muted/60" />
            </button>
            {gitMenuOpen && (
              <div
                className="absolute right-0 top-8 z-50 w-52 rounded-lg border border-border bg-card p-1 shadow-xl text-xs"
                onClick={() => setGitMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    const msg = prompt("Commit message:", `feat(${card?.id || threadId}): update`);
                    if (msg) void gitCommit(msg, [], card?.id || threadId || undefined);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface hover:text-text transition-colors"
                >
                  <Icon name="check" size={12} />
                  <span>Commit changes…</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (latestRun?.id) void mergeRun(latestRun.id, true);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface hover:text-text transition-colors"
                >
                  <Icon name="cycle" size={12} />
                  <span>Merge worktree to main</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (latestRun) void handleVerifyRun(latestRun);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface hover:text-text transition-colors"
                >
                  <Icon name="pulse" size={12} />
                  <span>Run acceptance gate</span>
                </button>
                <div className="my-1 border-t border-border/50" />
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("bark-command", { detail: "open-terminal" })
                    );
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-muted-strong hover:bg-surface hover:text-text transition-colors"
                >
                  <Icon name="terminal" size={12} />
                  <span>Open terminal in worktree</span>
                </button>
              </div>
            )}
          </div>

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
              className={`thread-action-inspector flex h-7 items-center gap-1.5 px-2.5 rounded-lg border text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                inspectorOpen
                  ? "bg-white/[0.1] border-border-strong text-text shadow-xs"
                  : "bg-surface/80 border-border/70 text-muted hover:bg-surface hover:text-text"
              }`}
            >
              <Icon name="panel" size={13} />
              <span>Inspector</span>
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

          {!loading && !loadError && thread?.events.length === 0 && !chatBusy && !activeRun && (
            <div className="thread-empty">
              <span className="thread-empty-mark"><Icon name="spark" size={18} /></span>
              <p className="thread-empty-title">Start the thread</p>
              <p className="thread-empty-copy">Describe what you want to build, plan, or ask about.</p>
            </div>
          )}

          {!loading && thread && (displayEvents.length > 0 || chatBusy || activeRun || activityEvents.length > 0 || latestRun) && (
            <div className="chat-messages">
              {(() => {
                const latestFailedEvent = [...displayEvents].reverse().find((e) => e.kind === "run_failed");
                return displayEvents.filter((e) => !isLowImportanceThreadEvent(e)).map((event, eventIdx, visibleEvents) => {
                if (event.kind === "user") {
                  return (
                    <UserMessageCard
                      key={`${event.id}:${event.seq}`}
                      event={event}
                      copied={copiedId === event.id}
                      onCopy={() => handleCopyText(event.id, event.text)}
                      onReuse={() => handleReusePrompt(event.text)}
                    />
                  );
                }

                if (event.kind === "assistant" || event.kind === "assistant_delta") {
                  const isStreaming = event.kind === "assistant_delta";
                  const isLatest = eventIdx === visibleEvents.length - 1;
                  return (
                    <AssistantMessageCard
                      key={`${event.id}:${event.seq}`}
                      event={event}
                      isStreaming={isStreaming}
                      isLatest={isLatest}
                      copied={copiedId === event.id}
                      onCopy={() => handleCopyText(event.id, event.text)}
                      onRunCommand={(cmd) => {
                        setInput(cmd);
                      }}
                      onScrollToBottom={() => {
                        if (stickToBottom.current) {
                          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                        }
                      }}
                    >
                      {(textToRender) => (
                        <Prose
                          text={textToRender}
                          onRunCommand={(cmd) => {
                            setInput(cmd);
                          }}
                        />
                      )}
                    </AssistantMessageCard>
                  );
                }

                if (event.kind === "approval_requested" || event.kind === "question") {
                  const data = event.data || {};
                  const approvalRunId = data.run_id || event.run_id;
                  const mergeApproval =
                    event.kind === "approval_requested" &&
                    data.kind === "merge" &&
                    Boolean(approvalRunId);

                  const matchingRun = approvalRunId ? runs.find((r) => r.id === approvalRunId) : null;
                  if (mergeApproval && matchingRun) {
                    return (
                      <div key={`${event.id}:${event.seq}`} className="my-3">
                        <RunReviewCard
                          run={matchingRun}
                          onApprove={() => handleApproval(event, true)}
                          onReject={() => handleApproval(event, false)}
                        />
                      </div>
                    );
                  }
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
                  if (failed) {
                    const isLatestFailure = event.id === latestFailedEvent?.id;
                    const isExitCodeOnly =
                      event.text.trim().toLowerCase().startsWith("provider exited with code") ||
                      event.text.trim().toLowerCase().startsWith("process exited with code");
                    const prevEvent = eventIdx > 0 ? visibleEvents[eventIdx - 1] : null;

                    // If this is an exit code message and we already have a failure event, suppress redundant card
                    if (isExitCodeOnly && displayEvents.some((e, i) => i !== eventIdx && e.kind === "run_failed")) {
                      return null;
                    }

                    // For older historical failures in the thread, render a compact muted note
                    if (!isLatestFailure) {
                      return (
                        <div
                          key={`${event.id}:${event.seq}`}
                          className="my-1.5 flex items-center gap-2 rounded-lg border border-border/40 bg-surface/40 px-3 py-1.5 text-[11px] text-muted font-mono"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0" />
                          <span className="truncate flex-1">{event.text}</span>
                          <span className="ml-auto text-muted/50 text-[10px] shrink-0">
                            <EventTime iso={event.created_at} />
                          </span>
                        </div>
                      );
                    }

                    const isQuotaOrLimit =
                      event.text.toLowerCase().includes("limit reached") ||
                      event.text.toLowerCase().includes("quota") ||
                      event.text.toLowerCase().includes("not supported") ||
                      event.text.toLowerCase().includes("429") ||
                      event.text.toLowerCase().includes("exited with code 1") ||
                      event.text.toLowerCase().includes("failed to start");
                    const claudeAvailable = agent.providers.some(
                      (p) => (p.id === "claude-code" || p.id === "claude") && p.available && p.authenticated !== false
                    );
                    const opencodeAvailable = agent.providers.some(
                      (p) => p.id === "opencode" && p.available
                    );

                    return (
                      <div
                        key={`${event.id}:${event.seq}`}
                        className="my-3 flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 text-[12px] shadow-sm"
                        role="alert"
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-mono font-medium bg-amber-500/10 text-amber-300 border border-amber-500/25">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <span>{isQuotaOrLimit ? "Quota Notice" : "Agent Notice"}</span>
                          </span>
                          <span className="ml-auto text-muted/60 text-[10.5px] font-mono">
                            <EventTime iso={event.created_at} />
                          </span>
                        </div>

                        <div className="text-[12.5px] leading-relaxed text-zinc-200 font-sans break-words">
                          {formatErrorMessage(event.text)}
                        </div>

                        {isQuotaOrLimit && (
                          <div className="mt-1 pt-3 border-t border-border/60 flex flex-col gap-2.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-strong font-mono">
                              <Icon name="spark" size={12} className="text-accent" />
                              <span>Quick Recovery — switch agent or model to continue:</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {claudeAvailable && agent.backend !== "claude-code" && (
                                <button
                                  type="button"
                                  onClick={() => handleRetryWith("claude-code", "claude-haiku-5.5")}
                                  className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 hover:bg-accent/20 px-3 py-1 font-mono text-[11px] font-semibold text-accent-text transition-all cursor-pointer shadow-sm"
                                >
                                  <Icon name="robot" size={12} />
                                  <span>Switch to Claude Code</span>
                                </button>
                              )}
                              {opencodeAvailable && (
                                <button
                                  type="button"
                                  onClick={() => handleRetryWith("opencode", "opencode/pulse-alpha-free")}
                                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1 font-mono text-[11px] font-semibold text-emerald-300 transition-all cursor-pointer shadow-sm"
                                >
                                  <Icon name="robot" size={12} />
                                  <span>Switch to Pulse Alpha (Free)</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  const btn = document.querySelector<HTMLButtonElement>(".agent-trigger");
                                  btn?.click();
                                }}
                                className="rounded-lg border border-border hover:border-border-strong bg-card hover:bg-card-hover px-2.5 py-1 font-mono text-[11px] text-muted-strong hover:text-text transition-colors cursor-pointer"
                              >
                                Choose Model…
                              </button>
                              <button
                                type="button"
                                onClick={handleRetryLastPrompt}
                                className="flex items-center gap-1.5 rounded-lg border border-border hover:border-border-strong bg-card hover:bg-card-hover px-2.5 py-1 font-mono text-[11px] text-muted-strong hover:text-text transition-colors cursor-pointer"
                              >
                                <Icon name="refresh" size={11} />
                                <span>Retry Prompt</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className={`flex flex-wrap items-center gap-2 text-[11.5px] font-medium ${
                        interrupted ? "text-warning" : "text-success"
                      }`}
                    >
                      <Icon
                        name={interrupted ? "stop" : "check"}
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
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent shrink-0">
                          <Icon name="doc" size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="text-[13.5px] font-semibold text-text">
                              Proposed Plan
                            </h3>
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
                          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-strong font-normal">
                            {proposal.rationale || "Proposed plan with atomic tasks."}
                          </p>
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
                                {(child.test_command || child.target_files?.length > 0) && (
                                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                                    {child.test_command && (
                                      <span className="font-mono text-[9px] bg-accent-soft text-accent-text px-1.5 py-0.2 rounded border border-accent/20">
                                        Gate: {child.test_command}
                                      </span>
                                    )}
                                    {child.target_files?.map((f: string) => (
                                      <span key={f} className="font-mono text-[9px] bg-surface text-muted px-1 py-0.2 rounded border border-border">
                                        {f}
                                      </span>
                                    ))}
                                  </div>
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
                            onClick={handleApprovePlan}
                            disabled={startingRun || !agent.ready || Boolean(activeRun)}
                            className="h-8 rounded-lg bg-white hover:bg-zinc-200 px-4 text-[12px] font-semibold text-black transition-all disabled:opacity-40 shadow-xs cursor-pointer"
                          >
                            {startingRun ? "Starting…" : "Approve and Run"}
                          </button>
                          <button
                            type="button"
                            onClick={handleRejectPlan}
                            className="h-8 rounded-lg border border-border bg-card hover:bg-card-hover px-3 text-[12px] font-medium text-muted-strong hover:text-text transition-colors cursor-pointer"
                          >
                            Request Changes
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
              });
            })()}

            </div>
          )}

          {!loading && !loadError && (latestRun || activityEvents.length > 0 || chatBusy || activeRun) && (() => {
            const stepCount = activityEvents.filter(
              (e) => e.kind === "tool_call" || e.kind === "file_change" || e.kind === "gate"
            ).length;
            const hasTimeline = Boolean(activeRun?.trace || latestRun?.trace);
            const isWorking = chatBusy || Boolean(activeRun);
            return (
              <details
                className="thread-details group mt-3"
                open={activityOpen}
                onToggle={(event) => setActivityOpen(event.currentTarget.open)}
              >
                <summary className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/80 bg-surface/60 hover:bg-surface text-muted hover:text-text text-[11.5px] font-medium transition-colors cursor-pointer select-none">
                  <Icon name={isWorking ? "pulse" : "eye"} size={13} className={isWorking ? "text-accent-text" : "text-muted-strong"} />
                  <span>{isWorking ? "Working" : "Details"}</span>
                  {isWorking && elapsedSeconds > 0 ? (
                    <span className="font-mono text-[10px] text-muted">{formatElapsed(elapsedSeconds)}</span>
                  ) : null}
                  {(stepCount > 0 || activityEvents.length > 0) && (
                    <span className="ml-1 px-1.5 py-0.2 rounded bg-card border border-border text-[10px] font-mono text-muted-strong">
                      {stepCount > 0 ? `${stepCount} ${stepCount === 1 ? "step" : "steps"}` : activityEvents.length}
                    </span>
                  )}
                  <Icon
                    name="chevR"
                    size={11}
                    className={`ml-1 text-muted/60 transition-transform duration-150 motion-reduce:transition-none ${activityOpen ? "rotate-90" : ""}`}
                  />
                </summary>
                {activityOpen && (
                  <div className="thread-details-content space-y-3">
                    {isWorking && (
                      <LiveAgentWorkingBubble
                        backend={activeRun?.provider || backend}
                        statusText={workingStatusText}
                        elapsedSeconds={elapsedSeconds}
                        recentActivities={recentActivities}
                      />
                    )}
                    {(stepCount > 0 || isWorking) && (
                      <section aria-label="Steps" className="rounded-lg border border-border/50 bg-surface/20 p-2.5">
                        <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted">
                          <Icon name="spark" size={11} />
                          Steps
                        </div>
                        <StepExplorer
                          disclosure={false}
                          running={isWorking}
                          events={activityEvents}
                          intent={thread?.card?.title || ""}
                          onOpenFile={(path, line) => {
                            void openInEditor(path, line);
                          }}
                        />
                      </section>
                    )}
                    {hasTimeline && (
                      <section aria-label="Execution timeline">
                        <ExecutionTimeline trace={activeRun?.trace || latestRun?.trace} className="mb-0" />
                      </section>
                    )}
                    {latestRun && (
                      <RunSummaryCard
                        run={latestRun}
                        busy={runBusyId === latestRun.id || startingRun}
                        onVerify={() => handleVerifyRun(latestRun)}
                        onBuildOn={() => handleStartRun(latestRun.id)}
                      />
                    )}
                    {activityEvents.length > 0 && (
                      <section aria-label="Technical activity" className="thread-activity mt-0">
                        <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted">
                          <Icon name="terminal" size={11} />
                          Technical activity
                        </div>
                        {activityEvents.map((event) => {
                          const isGate = event.kind === "gate";
                          const rawLabel = isGate
                            ? checkState(event.data as any).label
                            : event.data?.name || event.text.slice(0, 100) || event.kind;
                          const label = typeof rawLabel === "string" ? rawLabel : JSON.stringify(rawLabel);
                          const lower = label.toLowerCase();
                          const isRead =
                            lower.includes("read") ||
                            lower.includes("inspect") ||
                            lower.includes("search") ||
                            lower.includes("find");
                          const isExec =
                            lower.includes("run") ||
                            lower.includes("bash") ||
                            lower.includes("terminal") ||
                            lower.includes("exec") ||
                            lower.includes("command");
                          const isFile =
                            lower.includes("write") ||
                            lower.includes("edit") ||
                            lower.includes("patch") ||
                            lower.includes("file");

                          return (
                            <details
                              key={event.id}
                              className="group/act rounded-md border border-border/40 bg-transparent"
                            >
                              <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1 text-[10.5px] font-mono text-muted hover:text-muted-strong [&::-webkit-details-marker]:hidden">
                                <span className={isGate ? "text-success" : isExec ? "text-warning" : "text-muted"}>
                                  <Icon
                                    name={isGate ? "check" : isRead ? "eye" : isExec ? "terminal" : isFile ? "doc" : "spark"}
                                    size={11}
                                  />
                                </span>
                                <span className="min-w-0 flex-1 truncate">{label}</span>
                                <span className="shrink-0 text-[10px] text-muted/60">
                                  <EventTime iso={event.created_at} />
                                </span>
                                <span
                                  className="shrink-0 text-[10px] text-muted/50 transition-transform group-open/act:rotate-90"
                                  aria-hidden="true"
                                >
                                  ▸
                                </span>
                              </summary>
                              <pre className="mx-2 mb-2 max-h-[220px] overflow-auto rounded border border-border/50 bg-bg/40 p-2 text-[10.5px] font-mono text-muted-strong">
                                {event.text}
                                {event.data ? `\n${JSON.stringify(event.data, null, 2)}` : ""}
                              </pre>
                            </details>
                          );
                        })}
                      </section>
                    )}
                  </div>
                )}
              </details>
            );
          })()}
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

        {!loading && !loadError && (latestRun || chatBusy || card) && (() => {
          const checks = latestRun ? checkState(latestRun.gate) : null;
          const statusLabel = chatBusy ? "Working" : activeRun ? runLabel(activeRun) : latestRun ? runLabel(latestRun) : "";
          const statusTone = !chatBusy && !activeRun ? checks?.tone : undefined;
          const isFailed = Boolean(!chatBusy && !activeRun && latestRun && (latestRun.status === "failed" || checks?.tone === "danger"));
          const branch = latestRun?.branch || card?.id || threadId || "";
          const hasFiles = Boolean(latestRun && latestRun.diff_stats.files > 0 && onReview);
          const canRetry = Boolean(
            latestRun &&
              ["failed", "interrupted", "cancelled"].includes(latestRun.status) &&
              !activeRun
          );
          return (
            <div className="thread-statusbar" role="status" aria-live="polite" aria-label="Thread status">
              <div className="thread-statusbar-left">
                {branch ? (
                  <span className="thread-statusbar-item" title={latestRun?.worktree || `Isolated worktree for ${branch}`}>
                    <Icon name="branch" size={12} />
                    <span className="thread-statusbar-mono">{branch}</span>
                  </span>
                ) : null}
                {statusLabel ? (
                  <span className={`thread-statusbar-item ${chatBusy || activeRun ? "is-active" : statusTone === "danger" || isFailed ? "is-danger" : statusTone === "success" ? "is-success" : statusTone === "warning" ? "is-warning" : ""}`}>
                    {(chatBusy || activeRun) ? <span className="chat-working-dot" aria-hidden="true" /> : (
                      <Icon name={statusTone === "success" ? "check" : statusTone === "danger" || isFailed ? "warn" : statusTone === "warning" ? "warn" : "pulse"} size={12} />
                    )}
                    <span>{statusLabel}</span>
                  </span>
                ) : null}
              </div>
              <div className="thread-statusbar-right">
                {hasFiles ? (
                  <button
                    className="thread-statusbar-action"
                    onClick={onReview}
                    aria-label={`${latestRun!.diff_stats.files} ${latestRun!.diff_stats.files === 1 ? "file" : "files"} changed`}
                  >
                    <Icon name="code" size={12} />
                    <span>{latestRun!.diff_stats.files} {latestRun!.diff_stats.files === 1 ? "file" : "files"}</span>
                  </button>
                ) : null}
                {canRetry ? (
                  <button className="thread-statusbar-action" disabled={startingRun} onClick={() => handleStartRun(latestRun!.id)}>
                    <Icon name="refresh" size={12} />
                    <span>Retry</span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })()}
        {latestRun?.error && !activeRun && !chatBusy && (
          <p className="composer-error" role="alert">
            {latestRun.error}
          </p>
        )}
        {newOutput && (
          <button
            className="jump-to-latest"
            aria-label="Jump to latest messages"
            onClick={() => {
              stickToBottom.current = true;
              setNewOutput(false);
              messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
            }}
          >
            Jump to latest
          </button>
        )}
        <QueuedMessagesPanel
          messages={queuedMessages}
          onSendNow={(id) => {
            const target = queuedMessages.find((m) => m.id === id);
            if (!target) return;
            setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
            if (threadId) {
              void postThreadMessage(threadId, target.text, { board: boardName }).then(() => {
                void fetchThread(threadId, boardName).then((next) => {
                  if (next) setThread(next);
                });
              });
            }
          }}
          onEdit={(id) => {
            const target = queuedMessages.find((m) => m.id === id);
            if (!target) return;
            setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
            setInput(target.text);
          }}
          onDelete={(id) => {
            setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
          }}
        />
        <ThreadComposer
          value={input}
          onChange={setInput}
          mode={chatMode}
          onModeChange={setChatMode}
          agent={agent}
          onSubmit={handleSendMessage}
          onQueue={() => {
            const text = input.trim();
            if (!text) return;
            setQueuedMessages((prev) => [
              ...prev,
              {
                id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                text,
                createdAt: new Date().toISOString(),
                mode: chatMode,
              },
            ]);
            setInput("");
          }}
          onAction={handleComposerAction}
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
