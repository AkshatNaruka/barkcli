import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Card, ThreadEvent, ThreadDetail, RunRecord, ProviderStatus, RoleDef } from "../lib/types";
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

interface ThreadPaneProps {
  threadId: string | null;
  boardName?: string;
  inspectorOpen?: boolean;
  onSelectCard?: (card: Card) => void;
  onOpenInspector?: () => void;
  onReview?: () => void;
  onRefreshInbox?: () => void;
  onNewIntent?: (suggestion?: string) => void;
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

function EmptyThread({ onNewIntent }: { onNewIntent?: (suggestion?: string) => void }) {
  const starters = [
    "Add a health check endpoint",
    "Fix the flaky retry test",
    "Review the open worktrees",
    "Draft the release notes",
  ];
  return (
    <div className="flex h-full flex-1 items-center justify-center overflow-y-auto bg-bg px-8 py-12">
      <div className="w-full max-w-[540px]">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted/70">
          Chat
        </div>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-text">
          What should we ship?
        </h1>
        <p className="mt-2 max-w-[440px] text-[13px] leading-relaxed text-muted">
          Describe an outcome. Bark will turn it into a plan, give each slice an isolated worktree,
          and only merge what passes its gate.
        </p>

        <div className="mt-7 border-y border-border/80">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => onNewIntent?.(starter)}
              className="group flex w-full items-center gap-3 border-b border-border/60 py-3 text-left text-[12.5px] text-muted-strong transition-colors last:border-b-0 hover:text-text"
            >
              <Icon
                name="plus"
                size={12}
                className="text-muted/50 transition-colors group-hover:text-accent-text"
              />
              <span className="flex-1">{starter}</span>
              <span className="font-mono text-[9px] text-muted/0 transition-colors group-hover:text-muted/70">
                start
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onNewIntent?.()}
          className="mt-5 inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-[12px] font-medium text-bg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          <Icon name="plus" size={13} />
          New intent
          <kbd className="rounded border border-bg/20 px-1 font-mono text-[9px] text-bg/70">⌘N</kbd>
        </button>
      </div>
    </div>
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

function RunSummaryCard({
  run,
  busy,
  onStop,
  onRetry,
  onMerge,
  onReview,
}: {
  run: RunRecord;
  busy: boolean;
  onStop: () => void;
  onRetry: () => void;
  onMerge: () => void;
  onReview?: () => void;
}) {
  const active = ["queued", "starting", "running", "waiting"].includes(run.status);
  const canMerge = run.status === "passed" && Boolean(run.gate?.passed);
  const canRetry = ["failed", "interrupted", "needs_review"].includes(run.status);
  const canReview = ["needs_review", "passed", "failed"].includes(run.status);
  return (
    <section
      className="rounded-[10px] border border-border/80 bg-surface/25 px-3.5 py-3"
      aria-label={`Run ${run.ordinal}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted/70">
          Run {run.ordinal}
        </span>
        <span className={`text-[11px] font-medium ${runStatusTone(run.status)}`}>
          {runStatusLabel(run.status)}
        </span>
        <span className="font-mono text-[9.5px] text-muted/65">{run.provider}</span>
        {run.model && (
          <span className="truncate font-mono text-[9px] text-muted/50">{run.model}</span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {active && (
            <button
              type="button"
              onClick={onStop}
              disabled={busy}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
            >
              <Icon name="stop" size={10} />
              Stop
            </button>
          )}
          {canReview && onReview && (
            <button
              type="button"
              onClick={onReview}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
            >
              <Icon name="doc" size={10} />
              Review
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] text-muted transition-colors hover:bg-white/[0.06] hover:text-text disabled:opacity-40"
            >
              <Icon name="refresh" size={10} />
              Retry
            </button>
          )}
          {canMerge && (
            <button
              type="button"
              onClick={onMerge}
              disabled={busy}
              className="flex h-6 items-center gap-1 rounded bg-accent px-2 text-[10px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Icon name="branch" size={10} />
              Merge
            </button>
          )}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] text-muted/60">
        {run.branch && (
          <span className="inline-flex items-center gap-1">
            <Icon name="branch" size={9} />
            {run.branch}
          </span>
        )}
        {run.worktree && (
          <span className="max-w-[300px] truncate" title={run.worktree}>
            {run.worktree.split("/").slice(-2).join("/")}
          </span>
        )}
        {run.diff_stats.files > 0 && (
          <span>
            {run.diff_stats.files} files ·{" "}
            <span className="text-success/80">+{run.diff_stats.additions}</span>{" "}
            <span className="text-danger/80">−{run.diff_stats.deletions}</span>
          </span>
        )}
        {(run.usage.input_tokens > 0 || run.usage.output_tokens > 0) && (
          <span>
            {run.usage.input_tokens.toLocaleString()} in /{" "}
            {run.usage.output_tokens.toLocaleString()} out
          </span>
        )}
      </div>

      {run.gate && (
        <div
          className={`mt-2 flex flex-wrap items-center gap-2 border-l-2 py-0.5 pl-2.5 text-[10.5px] ${
            run.gate.passed ? "border-success/70 text-success" : "border-danger/70 text-danger"
          }`}
        >
          <span className="font-medium">
            {run.gate.passed ? "Gate passed" : "Gate failed"}
          </span>
          {run.gate.command && (
            <code className="truncate font-mono text-[9px] text-muted/65">
              {run.gate.command}
            </code>
          )}
        </div>
      )}
      {run.error && (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-danger/90">{run.error}</p>
      )}
    </section>
  );
}

export function ThreadPane({
  threadId,
  boardName,
  inspectorOpen,
  onSelectCard,
  onOpenInspector,
  onReview,
  onRefreshInbox,
  onNewIntent,
}: ThreadPaneProps) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [input, setInput] = useState("");
  const [chatMode, setChatMode] = useState<"ask" | "build">("ask");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatTurnId, setChatTurnId] = useState<string | null>(null);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [backend, setBackend] = useState("opencode");
  const [role, setRole] = useState("builder");
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [model, setModel] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([]);
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

  useEffect(() => {
    let cancelled = false;
    fetchRoles().then((next) => setRoles(next));
    fetchProviders().then((next) => {
      if (cancelled) return;
      const visible = next.filter(
        (provider) => provider.id !== "fake" && provider.id !== "human"
      );
      setProviders(visible);
      setBackend((current) => {
        const ready = visible.filter(
          (provider) => provider.available && provider.authenticated !== false
        );
        if (ready.some((provider) => provider.id === current)) return current;
        return ready[0]?.id || visible.find((provider) => provider.available)?.id || current;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setModel("");
    setModelOptions([]);
    if (!backend || backend === "human") return;
    fetchProviderModels(backend).then((next) => {
      if (cancelled) return;
      setModelOptions(next);
      const saved = preferredModel(backend);
      if (saved && next.includes(saved)) setModel(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [backend]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
    try {
      eventSource = new EventSource(url);
      eventSource.onmessage = (event) => {
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
              if (next) setThread(next);
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
    return () => eventSource?.close();
  }, [threadId]);

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
    if (!text || !threadId || submitting || chatBusy) return;
    setSubmitting(true);
    setInput("");
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
        setChatBusy(true);
        setChatTurnId(started.turn_id);
        const next = await fetchThread(threadId, boardName);
        if (next) setThread(next);
        refreshInboxRef.current?.();
        return;
      }
      const event = await postThreadMessage(threadId, text, {
        author: "you",
        backend,
        board: boardName,
      });
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const runs = thread?.runs || [];
  const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;
  const displayEvents = useMemo(
    () => coalesceAssistantEvents(thread?.events || []),
    [thread?.events]
  );
  const activeRun =
    [...runs].reverse().find((run) =>
      ["queued", "starting", "running", "waiting"].includes(run.status)
    ) || null;
  const latestUserText = [...(thread?.events || [])]
    .reverse()
    .find((event) => event.kind === "user")?.text;
  const providerChoices: Array<
    Pick<ProviderStatus, "id" | "name" | "available" | "authenticated" | "auth_hint">
  > = providers;

  const handleStartRun = async (parentRunId?: string) => {
    if (!threadId || startingRun) return;
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
      setActionStatus(`Run ${run.ordinal} started in ${run.branch || "a worktree"}.`);
      refreshInboxRef.current?.();
    } finally {
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
    if (!run.gate?.passed) return;
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

  const handleApprovePlan = async () => {
    if (!threadId) return;
    setActionStatus("Approving plan and dispatching workers…");
    const approved = await approvePlan(threadId, boardName);
    const updated = await fetchThread(threadId, boardName);
    if (updated) setThread(updated);
    onRefreshInbox?.();
    setActionStatus(null);
    if (approved) await handleStartRun();
  };

  const handleRejectPlan = async () => {
    if (!threadId) return;
    setActionStatus("Sending the plan back for revision…");
    await rejectPlan(threadId, "User requested revision", boardName);
    const updated = await fetchThread(threadId, boardName);
    if (updated) setThread(updated);
    onRefreshInbox?.();
    setActionStatus(null);
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

  if (!threadId) return <EmptyThread onNewIntent={onNewIntent} />;

  const card = thread?.card;
  const approvedPlans = new Set(
    (thread?.events || [])
      .filter((event) => event.kind === "plan_approved")
      .map((event) => Date.parse(event.created_at))
  );

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-bg">
      {actionStatus && (
        <div className="flex shrink-0 items-center justify-between border-b border-border/70 bg-accent-soft px-4 py-1.5 text-[10.5px] text-accent-text">
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

      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/80 px-4">
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
          <span className="mr-1 hidden font-mono text-[9.5px] text-muted/60 xl:inline">
            {threadId}
          </span>
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
          <button
            type="button"
            onClick={() => handleStartRun()}
            disabled={startingRun || Boolean(activeRun)}
            title={
              activeRun
                ? "A run is already active"
                : "Run this card in an isolated worktree with the selected provider"
            }
            className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[10.5px] text-muted-strong transition-colors hover:border-border-strong hover:text-text disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <Icon
              name={activeRun ? "pulse" : "arrowUp"}
              size={12}
              className={activeRun ? "animate-pulse text-success" : undefined}
            />
            <span className="hidden sm:inline">{activeRun ? "running" : startingRun ? "starting" : "run"}</span>
          </button>
          {onOpenInspector && (
            <button
              type="button"
              onClick={onOpenInspector}
              aria-label={inspectorOpen ? "Hide workbench" : "Show workbench"}
              aria-pressed={inspectorOpen}
              title={inspectorOpen ? "Hide workbench (⌘J)" : "Show workbench (⌘J)"}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                inspectorOpen
                  ? "bg-surface text-text"
                  : "text-muted hover:bg-white/[0.05] hover:text-text"
              }`}
            >
              <Icon name="layers" size={14} />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
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
              />
            </div>
          )}

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
                  const isApproved = [...approvedPlans].some(
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
                              Plan · {children.length || 0} {children.length === 1 ? "task" : "tasks"}
                            </h3>
                            <span className="font-mono text-[9.5px] text-muted/65">
                              risk {proposal.risk_level || "low"}
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

                      {!isApproved && (
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={handleRejectPlan}
                            className="h-7 rounded-md px-2.5 text-[11px] text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
                          >
                            Discard
                          </button>
                          <button
                            type="button"
                            onClick={handleApprovePlan}
                            className="h-7 rounded-md bg-accent px-3 text-[11px] font-medium text-bg transition-opacity hover:opacity-90"
                          >
                            Approve & run
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
                  const passed = Boolean(event.data?.passed);
                  return (
                    <div
                      key={`${event.id}:${event.seq}`}
                      className={`flex flex-wrap items-center gap-2 border-l-2 py-1 pl-3 text-[11.5px] ${
                        passed ? "border-success/70" : "border-danger/70"
                      }`}
                    >
                      <span className={`font-medium ${passed ? "text-success" : "text-danger"}`}>
                        {passed ? "Gate passed" : "Gate failed"}
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

      <div className="shrink-0 border-t border-border/70 bg-bg px-4 pb-3 pt-3">
        <div className="mx-auto w-full max-w-[780px]">
          <div className="rounded-[9px] border border-border bg-card/70 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset,0_8px_24px_rgba(0,0,0,0.08)] transition-colors focus-within:border-border-strong">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                chatMode === "ask"
                  ? "Ask the local agent about the code, a failure, or the plan…"
                  : "Add a note for the next worktree run…"
              }
              aria-label="Thread message"
              data-testid="thread-composer"
              rows={2}
              className="block max-h-48 min-h-[52px] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[12.5px] leading-relaxed text-text placeholder:text-muted/65 focus:outline-none"
            />
            <div className="flex items-center gap-2 px-2.5 pb-2">
              <div className="flex shrink-0 rounded border border-border/60 p-0.5">
                {(["ask", "build"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChatMode(mode)}
                    aria-pressed={chatMode === mode}
                    title={
                      mode === "ask"
                        ? "Read-only conversation with the local agent"
                        : "Write a note for a worktree run"
                    }
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize transition-colors ${
                      chatMode === mode
                        ? "bg-white/[0.07] text-text"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    {mode === "ask" ? "Ask" : "Build"}
                  </button>
                ))}
              </div>
              <QuietSelect
                value={role}
                onChange={(event) => setRole(event.target.value)}
                aria-label="Run role"
                title="Role policy for this run"
                className="text-[10px] text-muted hover:text-text"
              >
                {(roles.length > 0
                  ? roles
                  : [{ id: "builder", name: "Builder" } as RoleDef]
                ).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </QuietSelect>
              <QuietSelect
                value={backend}
                onChange={(event) => setBackend(event.target.value)}
                aria-label="Agent backend"
                title={providers.find((provider) => provider.id === backend)?.detail || "Agent backend"}
                className="text-[10px] text-muted hover:text-text"
              >
                {providerChoices.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                    {!provider.available
                      ? " · not installed"
                      : provider.authenticated === false
                        ? " · sign in"
                        : ""}
                  </option>
                ))}
              </QuietSelect>
              {modelOptions.length > 0 && (
                <QuietSelect
                  value={model}
                  onChange={(event) => {
                    setModel(event.target.value);
                    rememberModel(backend, event.target.value);
                  }}
                  aria-label="Model"
                  title="Models reported by the local CLI"
                  className="max-w-[170px] text-[10px] text-muted hover:text-text"
                >
                  <option value="">CLI default model</option>
                  {modelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </QuietSelect>
              )}
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  providers.find((provider) => provider.id === backend)?.available &&
                  providers.find((provider) => provider.id === backend)?.authenticated !== false
                    ? "bg-success"
                    : providers.length > 0
                      ? "bg-danger"
                      : "bg-muted"
                }`}
                title={
                  providers.find((provider) => provider.id === backend)?.available
                    ? providers.find((provider) => provider.id === backend)?.authenticated === false
                      ? providers.find((provider) => provider.id === backend)?.auth_hint ||
                        "Provider installed but not signed in"
                      : "Provider ready"
                    : "Provider not found on PATH"
                }
              />
              <span className="hidden whitespace-nowrap font-mono text-[9px] text-muted/55 2xl:inline">
                {chatBusy
                  ? "reply in progress"
                  : submitting
                    ? "sending…"
                    : "enter to send"}
              </span>
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!input.trim() || submitting || chatBusy}
                aria-label="Send message"
                title="Send (Enter)"
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-md bg-accent text-bg transition-opacity hover:opacity-90 disabled:opacity-35"
              >
                <Icon name="arrowUp" size={14} />
              </button>
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-0.5 font-mono text-[9px] text-muted/45">
            <span>{threadId}</span>
            <span className="hidden whitespace-nowrap sm:inline">
              {chatMode === "ask" ? "read-only" : "note"} · shift+enter
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
