import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Card, ThreadEvent, ThreadDetail, RunRecord, ProviderStatus, RoleDef, ProjectSnapshot } from "../lib/types";
import {
  fetchThread,
  postThreadMessage,
  startThreadChat,
  stopThreadChat,
  approveRun,
  approvePlan,
  rejectPlan,
  streamThreadUrl,
  fetchSessionTranscript,
  stopSession,
  steerSession,
  forkSession,
  raceTask,
  startThreadRun,
  stopRun,
  mergeRun,
  verifyContribution,
  fetchProviders,
  fetchProviderModels,
  fetchRoles,
} from "../lib/api";
import { notify as desktopNotify } from "../lib/desktop";
import { preferredModel, rememberModel } from "../lib/models";
import { Icon } from "../components/Icon";
import { QuietSelect } from "../components/QuietSelect";
import { relativeTime } from "../lib/threads";
import { isDemoMode } from "../lib/demo";
import { ThreadComposer } from "./ThreadComposer";
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

function columnTone(column?: string): string {
  if (column === "review") return "text-warning";
  if (column === "doing") return "text-success";
  if (column === "done") return "text-muted";
  return "text-muted";
}

function columnLabel(column?: string): string {
  if (!column) return "draft";
  return column === "review" ? "needs you" : column === "doing" ? "running" : column;
}

/** Small prose renderer: paragraphs, bullets, and headings without a full markdown dependency. */
function Prose({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="whitespace-pre-wrap">
        {paragraph.join("\n")}
      </p>
    );
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-2 space-y-1 pl-0">
        {list.map((item, index) => (
          <li key={index} className="flex gap-2.5">
            <span className="mt-[0.1em] shrink-0 text-[11px] text-muted/70" aria-hidden="true">•</span>
            <span className="whitespace-pre-wrap">{item}</span>
          </li>
        ))}
      </ul>
    );
    list = [];
  };

  for (const line of text.split("\n")) {
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      list.push(line.slice(2));
    } else if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="pt-1 text-[13px] font-semibold text-text">
          {line.slice(2)}
        </h3>
      );
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return <div className="space-y-3 text-[13px] leading-[1.7] text-text/90">{blocks}</div>;
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

function runStatusLabel(status: RunRecord["status"]): string {
  switch (status) {
    case "queued":
    case "starting":
      return "starting";
    case "running":
    case "waiting":
      return "running";
    case "needs_review":
      return "needs review";
    case "passed":
      return "gate passed";
    case "failed":
      return "failed";
    case "interrupted":
      return "stopped";
    case "cancelled":
      return "cancelled";
    case "merged":
      return "merged";
    default:
      return status;
  }
}

function runStatusTone(status: RunRecord["status"]): string {
  if (status === "failed" || status === "cancelled") return "text-danger";
  if (status === "interrupted") return "text-warning";
  if (status === "passed" || status === "merged") return "text-success";
  if (status === "needs_review") return "text-accent-text";
  return "text-muted-strong";
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

function RunSummaryCard({ run, busy, onStop, onRetry, onReview, onVerify, onBuildOn }: {
  run: RunRecord; busy: boolean; onStop: () => void; onRetry: () => void; onMerge: () => void;
  onReview?: () => void; onVerify?: () => void; verifying?: boolean; onBuildOn?: () => void;
}) {
  const active = isActiveRun(run);
  const state = checkState(run.gate);
  return <section className="run-summary" aria-label={`Run ${run.ordinal}`}>
    <div className="run-summary-top"><span className={`run-state ${run.status === "merged" || checksPassed(run.gate) ? "text-success" : run.status === "failed" ? "text-danger" : "text-muted-strong"}`}>{runLabel(run)}</span><span className="text-muted">{run.provider}</span>
      <div className="ml-auto flex gap-2">{active ? <button className="bark-button" onClick={onStop} disabled={busy}>Stop build</button> : <>{onReview && run.worktree && <button className="bark-button" onClick={onReview}>Review changes</button>}{["failed", "interrupted", "cancelled"].includes(run.status) && <button className="bark-button" onClick={onRetry} disabled={busy}>Retry build</button>}</>}</div>
    </div>
    <p>{run.diff_stats.files} files changed{run.branch ? ` in ${run.branch}` : ""}</p>
    {run.error && <p className="text-danger" role="alert">{run.error}</p>}
    <details><summary>Run details</summary><dl><dt>Attempt</dt><dd>{run.ordinal}</dd><dt>Agent / model</dt><dd>{run.provider} / {run.model || "CLI default"}</dd><dt>Worktree</dt><dd>{run.worktree || "Not created"}</dd><dt>Checks</dt><dd>{state.label}</dd></dl>
      <div className="flex flex-wrap gap-2 mt-3">{checksPassed(run.gate) && onVerify && <button className="bark-button" onClick={onVerify} disabled={busy}>Independently verify</button>}{!active && onBuildOn && <button className="bark-button" onClick={onBuildOn} disabled={busy}>Build on this run</button>}</div>
    </details>
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
  const { backend, setBackend, role, setRole, providers, model, setModel, modelOptions, roles } = agent;
  const [connectionError, setConnectionError] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [newOutput, setNewOutput] = useState(false);
  const stickToBottom = useRef(true);
  const sendLock = useRef(false);
  const runLock = useRef(false);
  const selectionRestored = useRef(false);
  const [chatMode, setChatMode] = useState<"ask" | "build">("ask");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatTurnId, setChatTurnId] = useState<string | null>(null);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [transcriptSessionId, setTranscriptSessionId] = useState<string | null>(null);
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [steerSessionId, setSteerSessionId] = useState<string | null>(null);
  const [steerPrompt, setSteerPrompt] = useState("");
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [startingRun, setStartingRun] = useState(false);
  const [runBusyId, setRunBusyId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectCardRef = useRef(onSelectCard);
  const refreshInboxRef = useRef(onRefreshInbox);

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
    setChatTurnId(null);
    fetchThread(threadId, boardName)
      .then((data) => {
        if (cancelled) return;
        setThread(data);
        if (!selectionRestored.current && data) {
          const choice = [...data.events].reverse().find((event) => event.kind === "user" && event.data?.backend && event.data.backend !== "board");
          if (choice) agent.restoreChoice(choice.data!.backend, choice.data!.model || "");
          selectionRestored.current = true;
        }
        const last = data?.events?.[data.events.length - 1];
        const activeChat =
          last?.run_id?.startsWith("chat_") &&
          last.kind !== "chat_done" &&
          last.kind !== "run_failed" &&
          last.kind !== "run_interrupted";
        setChatBusy(Boolean(activeChat));
        setChatTurnId(activeChat ? last?.run_id || null : null);
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
    if (!threadId || isDemoMode()) return;
    const url = streamThreadUrl(threadId);
    let eventSource: EventSource | null = null;
    let disposed = false;
    try {
      eventSource = new EventSource(url);
      eventSource.onopen = () => setConnectionError(false);
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
            fetchThread(threadId, boardName).then((next) => {
              if (!disposed && next) setThread(next);
            });
          }
          if (parsed.kind === "chat_done") {
            setChatBusy(false);
            setChatTurnId(null);
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

  useEffect(() => {
    if (!transcriptSessionId && !steerSessionId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTranscriptSessionId(null);
      setSteerSessionId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [transcriptSessionId, steerSessionId]);

  const handleSendMessage = async () => {
    const text = input.trim();
    if (!text || !threadId || submitting || chatBusy || sendLock.current) return;
    sendLock.current = true;
    setSubmitting(true);
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
        setChatTurnId(started.turn_id);
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
    } catch {
      setInput(text);
      setActionStatus("Message did not send. Check the server, then try again.");
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
    setChatTurnId(null);
    setActionStatus("Reply stopped.");
    window.setTimeout(() => setActionStatus(null), 2500);
  };

  const runs = thread?.runs || [];
  const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;
  const activityKinds = new Set(["tool_call", "file_change", "run_status", "run_started", "log", "usage", "diff", "context_compiled", "gate"]);
  const activityEvents = (thread?.events || []).filter((event) => activityKinds.has(event.kind));
  const displayEvents = useMemo(
    () => coalesceAssistantEvents(thread?.events || []).filter((event) => !["tool_call", "file_change", "run_status", "run_started", "log", "usage", "diff", "context_compiled", "gate"].includes(event.kind)),
    [thread?.events]
  );
  const activeRun =
    [...runs].reverse().find(isActiveRun) || null;
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
    setActionStatus("Creating an isolated worktree and starting the agent…");
    try {
      const provider = backend === "claude" ? "claude-code" : backend;
      const run = await startThreadRun(threadId, {
        provider,
        model: model.trim() || undefined,
        role,
        prompt: latestUserText,
        parent_run_id: parentRunId,
        plan_event_id: planEventId,
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
      setActionStatus(`Build started in ${run.branch || "an isolated worktree"}.`);
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
        setActionStatus("Run stopped. The worktree is preserved for resume or review.");
      } else {
        setActionStatus("The run could not be stopped. It may already have finished.");
      }
    } finally {
      setRunBusyId(null);
    }
  };

  const handleMergeRun = async (run: RunRecord) => {
    if (!checksPassed(run.gate)) return;
    const ok = window.confirm(
      `Merge ${run.branch || "this run"} into the current branch?\n\nThis merges the reviewed, gate-passing work into main.`
    );
    if (!ok) return;
    setRunBusyId(run.id);
    setActionStatus("Merging the passing branch…");
    try {
      const merged = await mergeRun(run.id, true);
      if (merged) {
        const updated = await fetchThread(threadId!, boardName);
        if (updated) setThread(updated);
        setActionStatus("Merged. The card is marked done.");
      } else {
        setActionStatus("Merge failed. Resolve the conflict, then retry from the worktree.");
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
    setChatMode("build");
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

  const handleViewTranscript = async (sessionId: string) => {
    setTranscriptSessionId(sessionId);
    setTranscriptLoading(true);
    const res = await fetchSessionTranscript(sessionId, 60);
    setTranscriptLines(
      res?.lines?.length
        ? res.lines
        : ["No transcript records available yet for this worker session."]
    );
    setTranscriptLoading(false);
  };

  const handleStopSession = async (sessionId: string) => {
    setActionStatus("Stopping worker session…");
    await stopSession(sessionId);
    setActionStatus("Worker session stopped.");
    window.setTimeout(() => setActionStatus(null), 3000);
  };

  const handleSteerSession = async (sessionId: string) => {
    if (!steerPrompt.trim()) return;
    setActionStatus("Steering worker session…");
    await steerSession(sessionId, steerPrompt.trim());
    setSteerPrompt("");
    setSteerSessionId(null);
    setActionStatus("Steering direction sent to worker.");
    window.setTimeout(() => setActionStatus(null), 3000);
  };

  const handleForkSession = async (sessionId: string) => {
    setActionStatus("Forking worker session…");
    await forkSession(sessionId);
    setActionStatus("New branch worker session forked.");
    window.setTimeout(() => setActionStatus(null), 3000);
  };

  const handleRaceTask = async (taskId: string) => {
    setActionStatus("Starting agent race…");
    await raceTask(taskId, "opencode", "claude");
    setActionStatus("Race dispatched between opencode and claude.");
    window.setTimeout(() => setActionStatus(null), 3000);
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
      {actionStatus && (
        <div role="status" aria-live="polite" className="flex shrink-0 items-center justify-between border-b border-border/70 bg-accent-soft px-4 py-1.5 text-[10.5px] text-accent-text">
          <span>{actionStatus}</span>
          <button
            type="button"
            onClick={() => setActionStatus(null)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted hover:text-text"
            aria-label="Dismiss status"
          >
            <Icon name="x" size={11} />
          </button>
        </div>
      )}

      <header className="thread-header">
        <button className="bark-icon-button" onClick={() => window.dispatchEvent(new CustomEvent("bark-command", { detail: "toggle-sidebar" }))} aria-label="Toggle sidebar"><Icon name="panel" size={16} /></button>
        <div className="flex min-w-0 items-center gap-2">
          {boardName && (
            <>
              <span className="hidden shrink-0 font-mono text-[10px] text-muted/70 sm:inline">
                {boardName}.board
              </span>
              <span className="hidden text-muted/30 sm:inline">/</span>
            </>
          )}
          <span className="min-w-0 truncate text-[12.5px] font-medium text-text">
            {card?.title || threadId}
          </span>
          <span
            className={`hidden shrink-0 items-center gap-1 text-[10px] font-medium sm:flex ${columnTone(card?.column)}`}
          >
            <span
              className={`h-1 w-1 rounded-full ${
                card?.column === "doing"
                  ? "bg-success"
                  : card?.column === "review"
                    ? "bg-warning"
                    : "bg-muted/50"
              }`}
            />
            {columnLabel(card?.column)}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {chatBusy && (
            <span className="mr-1 flex items-center gap-1.5 font-mono text-[9.5px] text-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              thinking
              <button
                type="button"
                onClick={handleStopChat}
                className="ml-0.5 rounded px-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                title={chatTurnId ? `Stop ${chatTurnId}` : "Stop reply"}
              >
                stop
              </button>
            </span>
          )}
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
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.05] hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <Icon name="dots" size={15} />
            </button>
          )}
          {onOpenInspector && (
            <button
              type="button"
              onClick={onOpenInspector}
              aria-label={inspectorOpen ? "Hide surfaces" : "Show surfaces"}
              aria-pressed={inspectorOpen}
              title={inspectorOpen ? "Hide surfaces (⌘J)" : "Show surfaces (⌘J)"}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                inspectorOpen
                  ? "bg-surface text-text"
                  : "text-muted hover:bg-white/[0.05] hover:text-text"
              }`}
            >
              <Icon name="panel" size={15} />
            </button>
          )}
        </div>
      </header>

      {connectionError && <div className="connection-notice" role="status">Connection interrupted. Reconnecting… Your draft is saved.</div>}
      <div className="flex-1 overflow-y-auto min-h-0 thread-events" onScroll={(event) => { const node = event.currentTarget; stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100; if (stickToBottom.current) setNewOutput(false); }}>
        <div className="mx-auto w-full max-w-[780px] px-5 py-6 sm:px-7">
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
              <div className="text-[12.5px] font-medium text-text">Could not load this thread</div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                The server may still be starting, or the thread was moved. Your board is untouched.
              </p>
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                className="mt-4 h-7 rounded-md border border-border px-2.5 text-[11px] text-muted-strong transition-colors hover:border-border-strong hover:text-text"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !loadError && thread?.events.length === 0 && (
            <div className="py-12 text-center text-[12px] text-muted">
              No messages in this thread yet. Send a prompt below to begin.
            </div>
          )}

          {!loading && !loadError && latestRun && (
            <div className="mb-6">
              <RunSummaryCard
                run={latestRun}
                busy={runBusyId === latestRun.id || startingRun}
                onStop={() => handleStopRun(latestRun)}
                onRetry={() => handleStartRun(latestRun.id)}
                onMerge={() => handleMergeRun(latestRun)}
                onReview={onReview}
                onVerify={() => handleVerifyRun(latestRun)}
                verifying={runBusyId === latestRun.id}
                onBuildOn={() => handleStartRun(latestRun.id)}
              />
            </div>
          )}

          {activityEvents.length > 0 && <details className="thread-activity" open={activityOpen} onToggle={(event) => setActivityOpen(event.currentTarget.open)}>
            <summary>Activity <span>{activityEvents.length} operations</span></summary>
            {activityOpen && <div>{activityEvents.map((event) => <details key={event.id}><summary>{event.kind === "gate" ? checkState(event.data as any).label : event.data?.name || event.text.slice(0, 120)} <EventTime iso={event.created_at} /></summary><pre>{event.text}{event.data ? `\n${JSON.stringify(event.data, null, 2)}` : ""}</pre></details>)}</div>}
          </details>}
          {!loading && thread && displayEvents.length > 0 && (
            <div className="space-y-7">
              {displayEvents.map((event) => {
                const at = new Date(event.created_at);
                const localTime = at.toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                if (event.kind === "user") {
                  return (
                    <article key={`${event.id}:${event.seq}`} className="group">
                      <div className="mb-2 flex items-center gap-2 text-[10px] text-muted">
                        <span className="font-medium text-muted-strong">You</span>
                        <span className="text-muted/40">·</span>
                        <EventTime iso={event.created_at} />
                      </div>
                      <div className="border-l border-border-strong pl-3.5 text-[13px] leading-[1.7] text-muted-strong whitespace-pre-wrap">
                        {event.text}
                      </div>
                    </article>
                  );
                }

                if (event.kind === "assistant" || event.kind === "assistant_delta") {
                  return (
                    <article key={`${event.id}:${event.seq}`}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-accent-soft font-mono text-[10px] font-semibold text-accent-text">
                          b
                        </span>
                        <span className="text-[11.5px] font-medium text-text">
                          {event.author || "Bark"}
                        </span>
                        <span className="text-[10px] text-muted/40">·</span>
                        <EventTime iso={event.created_at} />
                        {event.kind === "assistant_delta" && (
                          <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted/40">
                            streaming
                          </span>
                        )}
                        <span className="ml-auto hidden font-mono text-[9px] text-muted/45 sm:inline">
                          {localTime}
                        </span>
                      </div>
                      <Prose text={event.text} />
                    </article>
                  );
                }

                if (event.kind === "run_started" || event.kind === "run_status") {
                  const running = event.kind === "run_started";
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className="flex flex-wrap items-center gap-2 border-l-2 border-accent/40 py-0.5 pl-3 text-[10.5px] text-muted"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          running ? "animate-pulse bg-success" : "bg-accent/70"
                        }`}
                      />
                      <span className="text-muted-strong">{event.text}</span>
                      <EventTime iso={event.created_at} />
                    </div>
                  );
                }

                if (event.kind === "tool_call") {
                  const data = event.data || {};
                  const input =
                    data.input && Object.keys(data.input).length > 0
                      ? JSON.stringify(data.input, null, 2)
                      : "";
                  return (
                    <details
                      key={`${event.id}:${event.seq}`}
                      className="overflow-hidden rounded-lg border border-border/70 bg-surface/20"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[10.5px] text-muted-strong">
                        <Icon name="robot" size={11} className="text-accent-text" />
                        <span className="font-medium">{data.name || "tool"}</span>
                        <span className="font-mono text-[9px] text-muted/55">
                          {data.status || "completed"}
                        </span>
                        <EventTime iso={event.created_at} />
                        <Icon name="arrowDown" size={10} className="ml-auto text-muted/50" />
                      </summary>
                      {input && (
                        <pre className="max-h-56 overflow-auto border-t border-border/60 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted">
                          {input}
                        </pre>
                      )}
                    </details>
                  );
                }

                if (event.kind === "file_change") {
                  const data = event.data || {};
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className="flex flex-wrap items-center gap-2 font-mono text-[9.5px] text-muted"
                    >
                      <Icon name="code" size={10} className="text-accent-text/80" />
                      <span className="text-muted-strong">{data.path || event.text}</span>
                      {data.additions != null && (
                        <span className="text-success/80">+{data.additions}</span>
                      )}
                      {data.deletions != null && (
                        <span className="text-danger/80">−{data.deletions}</span>
                      )}
                    </div>
                  );
                }

                if (event.kind === "diff") {
                  const data = event.data || {};
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-surface/20 px-3 py-1.5 font-mono text-[9.5px] text-muted"
                    >
                      <Icon name="code" size={10} />
                      <span className="text-muted-strong">{data.files || 0} files</span>
                      <span className="text-success/80">+{data.additions || 0}</span>
                      <span className="text-danger/80">−{data.deletions || 0}</span>
                      <EventTime iso={event.created_at} />
                    </div>
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
                      className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 text-[11px] font-medium text-warning">
                        <Icon name="warn" size={12} />
                        {event.kind === "approval_requested" ? "Approval requested" : "Agent question"}
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-strong">
                        {data.title || data.text || event.text}
                      </p>
                      {data.detail && (
                        <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted/70">
                          {data.detail}
                        </p>
                      )}
                      {mergeApproval ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleApproval(event, true)}
                            disabled={approvalBusyId !== null}
                            className="rounded bg-accent px-2.5 py-1 text-[10.5px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            {approvalBusyId?.endsWith(":yes") ? "Merging…" : "Approve & merge"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproval(event, false)}
                            disabled={approvalBusyId !== null}
                            className="rounded border border-border px-2.5 py-1 text-[10.5px] text-muted-strong transition-colors hover:bg-white/[0.04] hover:text-text disabled:opacity-40"
                          >
                            Reject
                          </button>
                          {data.branch && (
                            <span className="font-mono text-[9.5px] text-muted/60">
                              {data.branch}
                            </span>
                          )}
                        </div>
                      ) : Array.isArray(data.options) && data.options.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {data.options.map((option: string) => (
                            <span
                              key={option}
                              className="rounded border border-border px-2 py-0.5 font-mono text-[9px] text-muted"
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
                      className={`flex flex-wrap items-center gap-2 text-[11px] ${
                        failed ? "text-danger" : interrupted ? "text-warning" : "text-success"
                      }`}
                    >
                      <Icon
                        name={failed ? "warn" : interrupted ? "stop" : "check"}
                        size={11}
                      />
                      <span>{event.text}</span>
                      <EventTime iso={event.created_at} />
                    </div>
                  );
                }

                if (event.kind === "chat_done") {
                  return null;
                }

                if (event.kind === "usage") {
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted/55"
                    >
                      {event.text} · <EventTime iso={event.created_at} />
                    </div>
                  );
                }

                if (event.kind === "log") {
                  return (
                    <details key={`${event.id}:${event.seq}`} className="text-[10px] text-muted/65">
                      <summary className="cursor-pointer list-none font-mono text-[9px] uppercase tracking-[0.1em] text-muted/45">
                        log · {event.text.slice(0, 80)}
                      </summary>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[9.5px] leading-relaxed text-muted/70">
                        {event.text}
                      </pre>
                    </details>
                  );
                }

                if (event.kind === "plan_proposed") {
                  const proposal = event.data || {};
                  const children: any[] = Array.isArray(proposal.children) ? proposal.children : [];
                  const latestProposal = [...(thread?.events || [])].reverse().find((item) => item.kind === "plan_proposed");
                  const isApproved = latestProposal?.id !== event.id || [...approvedPlans].some(
                    (approvedAt) => approvedAt >= Date.parse(event.created_at)
                  );
                  return (
                    <section
                      key={`${event.id}:${event.seq}`}
                      className="border-y border-border/80 py-4"
                      aria-label="Plan proposal"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-warning/50 text-[9px] text-warning">
                          ●
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="text-[12.5px] font-medium text-text">
                              Plan · {children.length || 0} steps
                            </h3>
                            <span className="font-mono text-[9.5px] text-muted/65">
                              Bark plan · offline
                            </span>
                            <span className="ml-auto font-mono text-[9.5px] text-muted/55">
                              {isApproved ? "approved" : "waiting"}
                            </span>
                          </div>
                          {proposal.rationale && (
                            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                              {proposal.rationale}
                            </p>
                          )}
                        </div>
                      </div>

                      {children.length > 0 && (
                        <ol className="mt-4 divide-y divide-border/60 border-y border-border/60">
                          {children.map((child, index) => (
                            <li key={`${child.title}-${index}`} className="flex gap-3 py-2.5">
                              <span className="w-4 shrink-0 pt-0.5 font-mono text-[9.5px] text-muted/55">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[12px] font-medium text-text">
                                    {child.title}
                                  </span>
                                  {child.effort != null && (
                                    <span className="font-mono text-[9px] text-muted/60">
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
                                    <p className="mt-1 font-mono text-[9.5px] text-muted/65">
                                      ✓ {child.acceptance_criteria.join(" · ")}
                                    </p>
                                  )}
                              </div>
                              {child.priority && (
                                <span className="self-center font-mono text-[9px] uppercase text-muted/55">
                                  {child.priority}
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}

                      {!isApproved && <dl className="execution-summary"><dt>Build with</dt><dd>{agent.selected?.name || agent.backend || "Choose an agent below"} / {model || "CLI default"}</dd><dt>Workspace</dt><dd>Isolated worktree{project?.git?.branch ? ` from ${project.git.branch}` : ""}</dd><dt>Checks</dt><dd>{agent.testCommand || project?.verification_command || "Not configured — choose a verification command in Build options"}</dd></dl>}
                      {!isApproved && (
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={handleRejectPlan}
                            className="h-7 rounded-md px-2.5 text-[11px] text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
                          >
                            Request plan changes
                          </button>
                          <button
                            type="button"
                            onClick={handleApprovePlan}
                            disabled={startingRun || !agent.ready || Boolean(activeRun)}
                            className="h-7 rounded-md bg-accent px-3 text-[11px] font-medium text-bg transition-opacity hover:opacity-90"
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
                    <div key={`${event.id}:${event.seq}`} className="flex items-center gap-2 text-[11.5px] text-success">
                      <Icon name="check" size={13} className="shrink-0" />
                      <span>{event.text}</span>
                      <EventTime iso={event.created_at} />
                    </div>
                  );
                }

                if (event.kind === "task_spawned") {
                  const taskId = event.data?.task_id || "task";
                  const sessionId = event.data?.session_id;
                  const branch = event.data?.branch;
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className="rounded-lg border border-border/80 bg-surface/30 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex gap-[2px]" aria-hidden="true">
                          {[0, 1, 2, 3].map((bar) => (
                            <span
                              key={bar}
                              className="h-3 w-[2px] animate-pulse rounded-full bg-success/80"
                              style={{ animationDelay: `${bar * 120}ms` }}
                            />
                          ))}
                        </span>
                        <span className="text-[11.5px] font-medium text-text">
                          Worker running
                        </span>
                        <span className="font-mono text-[9.5px] text-muted/70">{taskId}</span>
                        {branch && (
                          <span className="hidden items-center gap-1 font-mono text-[9.5px] text-muted/60 md:flex">
                            <Icon name="branch" size={10} />
                            {branch}
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-0.5">
                          {sessionId && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleViewTranscript(sessionId)}
                                title="Live transcript"
                                aria-label="View live transcript"
                                className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
                              >
                                <Icon name="doc" size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSteerSessionId(sessionId);
                                  setSteerPrompt("");
                                }}
                                title="Steer worker"
                                aria-label="Steer worker"
                                className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
                              >
                                <Icon name="comment" size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleForkSession(sessionId)}
                                title="Fork worker"
                                aria-label="Fork worker"
                                className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
                              >
                                <Icon name="branch" size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStopSession(sessionId)}
                                title="Stop worker"
                                aria-label="Stop worker"
                                className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                              >
                                <Icon name="stop" size={11} />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRaceTask(taskId)}
                            title="Race workers"
                            aria-label="Race workers"
                            className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
                          >
                            <Icon name="pulse" size={12} />
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 pl-4 text-[11px] leading-relaxed text-muted">{event.text}</p>
                    </div>
                  );
                }

                if (event.kind === "agent_output") {
                  return (
                    <div key={`${event.id}:${event.seq}`} className="overflow-hidden rounded-lg border border-border/80">
                      <div className="flex items-center gap-2 border-b border-border/60 bg-surface/60 px-3 py-1.5 font-mono text-[9px] text-muted">
                        <Icon name="code" size={11} />
                        worker output
                        <EventTime iso={event.created_at} />
                      </div>
                      <pre className="max-h-44 overflow-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-muted-strong">
                        {event.text}
                      </pre>
                    </div>
                  );
                }

                if (event.kind === "gate") {
                  const passed = checksPassed(event.data as any);
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className={`flex flex-wrap items-center gap-2 border-l-2 py-1 pl-3 text-[11.5px] ${
                        passed ? "border-success/70" : "border-danger/70"
                      }`}
                    >
                      <span className={`font-medium ${passed ? "text-success" : "text-danger"}`}>
                        {checkState(event.data as any).label}
                      </span>
                      <span className="text-muted">{event.text}</span>
                      {event.data?.command && (
                        <code className="w-full truncate font-mono text-[9.5px] text-muted/65">
                          $ {event.data.command}
                        </code>
                      )}
                      <EventTime iso={event.created_at} />
                    </div>
                  );
                }

                if (event.kind === "merge") {
                  return (
                    <div key={`${event.id}:${event.seq}`} className="flex items-center gap-2 text-[11.5px] text-accent-text">
                      <Icon name="branch" size={12} className="shrink-0" />
                      <span>{event.text}</span>
                      <EventTime iso={event.created_at} />
                    </div>
                  );
                }

                return (
                  <div key={`${event.id}:${event.seq}`} className="text-[11.5px] leading-relaxed text-muted">
                    <span className="font-medium text-muted-strong">{event.author}</span>
                    <span className="mx-2 text-muted/40">·</span>
                    {event.text}
                    <span className="ml-2 font-mono text-[9px] text-muted/50">
                      {relativeTime(event.created_at)}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {transcriptSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Session transcript">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[10px] border border-border bg-bg shadow-2xl">
            <div className="flex h-11 items-center justify-between border-b border-border/80 px-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[11.5px] font-medium text-text">Transcript</span>
                <span className="truncate font-mono text-[9.5px] text-muted">{transcriptSessionId}</span>
              </div>
              <button
                type="button"
                onClick={() => setTranscriptSessionId(null)}
                className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.05] hover:text-text"
                aria-label="Close transcript"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto bg-surface/40 p-4 font-mono text-[10.5px] leading-relaxed text-muted-strong">
              {transcriptLoading ? (
                <div className="py-8 text-center text-muted">Reading transcript file…</div>
              ) : (
                transcriptLines.map((line, index) => (
                  <div key={index} className="whitespace-pre-wrap">{line}</div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {steerSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Steer worker session">
          <div className="w-full max-w-md overflow-hidden rounded-[10px] border border-border bg-bg shadow-2xl">
            <div className="flex h-11 items-center justify-between border-b border-border/80 px-4">
              <span className="text-[11.5px] font-medium text-text">Steer worker</span>
              <button
                type="button"
                onClick={() => setSteerSessionId(null)}
                className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.05] hover:text-text"
                aria-label="Close steering dialog"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-[11.5px] leading-relaxed text-muted">
                Send a correction or clarifying context to the running worker. It will see this on its
                next turn.
              </p>
              <textarea
                autoFocus
                value={steerPrompt}
                onChange={(event) => setSteerPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    handleSteerSession(steerSessionId);
                  }
                }}
                placeholder="What should the worker change course on?"
                rows={4}
                className="w-full resize-none rounded-md border border-border bg-surface/50 p-2.5 text-[12px] leading-relaxed text-text placeholder:text-muted/60 focus:border-accent focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSteerSessionId(null)}
                  className="h-7 rounded-md px-2.5 text-[11px] text-muted hover:bg-white/[0.04] hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSteerSession(steerSessionId)}
                  disabled={!steerPrompt.trim()}
                  className="h-7 rounded-md bg-accent px-3 text-[11px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Send guidance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="thread-composer-dock">
        {newOutput && <button className="jump-to-latest" onClick={() => { stickToBottom.current = true; setNewOutput(false); messagesEndRef.current?.scrollIntoView({ behavior: "auto" }); }}>Jump to latest</button>}
        <ThreadComposer value={input} onChange={setInput} mode={chatMode} onModeChange={setChatMode} agent={agent} onSubmit={handleSendMessage}
          busy={submitting || startingRun} active={chatBusy || Boolean(activeRun)} onStop={chatBusy ? handleStopChat : activeRun ? () => void handleStopRun(activeRun) : undefined} />
      </div>
    </section>
  );
}
