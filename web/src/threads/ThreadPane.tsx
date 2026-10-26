import React, { useState, useEffect, useRef } from "react";
import type { Card, ThreadEvent, ThreadDetail } from "../lib/types";
import {
  fetchThread,
  postThreadMessage,
  approvePlan,
  rejectPlan,
  streamThreadUrl,
  fetchSessionTranscript,
  stopSession,
  steerSession,
  forkSession,
  raceTask,
} from "../lib/api";
import { Icon } from "../components/Icon";

interface ThreadPaneProps {
  threadId: string | null;
  boardName?: string;
  onSelectCard?: (card: Card) => void;
  onOpenInspector?: () => void;
  onRefreshInbox?: () => void;
  onNewIntent?: (suggestion?: string) => void;
}

export function ThreadPane({
  threadId,
  boardName,
  onSelectCard,
  onOpenInspector,
  onRefreshInbox,
  onNewIntent,
}: ThreadPaneProps) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [backend, setBackend] = useState("opencode");
  const [submitting, setSubmitting] = useState(false);
  const [transcriptSessionId, setTranscriptSessionId] = useState<string | null>(null);
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [steerSessionId, setSteerSessionId] = useState<string | null>(null);
  const [steerPrompt, setSteerPrompt] = useState("");
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when events update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.events]);

  // Load thread detail
  useEffect(() => {
    if (!threadId) {
      setThread(null);
      return;
    }
    setLoading(true);
    fetchThread(threadId, boardName)
      .then((data) => {
        setThread(data);
        if (data?.card && onSelectCard) {
          onSelectCard(data.card);
        }
      })
      .finally(() => setLoading(false));
  }, [threadId, boardName]);

  // Connect SSE stream for live updates
  useEffect(() => {
    if (!threadId) return;
    const url = streamThreadUrl(threadId);
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(url);
      eventSource.onmessage = (event) => {
        try {
          const parsed: ThreadEvent = JSON.parse(event.data);
          if (parsed && parsed.id) {
            setThread((prev) => {
              if (!prev) return prev;
              const exists = prev.events.some((e) => e.id === parsed.id);
              if (exists) return prev;
              return {
                ...prev,
                events: [...prev.events, parsed],
              };
            });
            if (onRefreshInbox) {
              onRefreshInbox();
            }
          }
        } catch {
          // ignore heartbeats or non json frames
        }
      };
    } catch {
      // EventSource fallback
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [threadId]);

  const handleSendMessage = async () => {
    const text = input.trim();
    if (!text || !threadId || submitting) return;

    setSubmitting(true);
    setInput("");
    try {
      const ev = await postThreadMessage(threadId, text, {
        author: "you",
        backend,
        board: boardName,
      });
      if (ev) {
        setThread((prev) => {
          if (!prev) return prev;
          const exists = prev.events.some((e) => e.id === ev.id);
          if (exists) return prev;
          return {
            ...prev,
            events: [...prev.events, ev],
          };
        });
      }
      if (onRefreshInbox) {
        onRefreshInbox();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleApprovePlan = async () => {
    if (!threadId) return;
    await approvePlan(threadId, boardName);
    const updated = await fetchThread(threadId, boardName);
    if (updated) setThread(updated);
    if (onRefreshInbox) onRefreshInbox();
  };

  const handleRejectPlan = async () => {
    if (!threadId) return;
    await rejectPlan(threadId, "User requested revision", boardName);
    const updated = await fetchThread(threadId, boardName);
    if (updated) setThread(updated);
    if (onRefreshInbox) onRefreshInbox();
  };

  const handleViewTranscript = async (sessionId: string) => {
    setTranscriptSessionId(sessionId);
    setTranscriptLoading(true);
    const res = await fetchSessionTranscript(sessionId, 60);
    if (res?.lines) {
      setTranscriptLines(res.lines);
    } else {
      setTranscriptLines(["No transcript records available yet for this worker session."]);
    }
    setTranscriptLoading(false);
  };

  const handleStopSession = async (sessionId: string) => {
    setActionStatus("Stopping worker session...");
    await stopSession(sessionId);
    setActionStatus("Worker session stopped.");
    setTimeout(() => setActionStatus(null), 3000);
  };

  const handleSteerSession = async (sessionId: string) => {
    if (!steerPrompt.trim()) return;
    setActionStatus("Steering worker session...");
    await steerSession(sessionId, steerPrompt.trim());
    setSteerPrompt("");
    setSteerSessionId(null);
    setActionStatus("Steering direction sent to worker.");
    setTimeout(() => setActionStatus(null), 3000);
  };

  const handleForkSession = async (sessionId: string) => {
    setActionStatus("Forking worker session...");
    await forkSession(sessionId);
    setActionStatus("New branch worker session forked.");
    setTimeout(() => setActionStatus(null), 3000);
  };

  const handleRaceTask = async (taskId: string) => {
    setActionStatus("Starting agent race tournament...");
    await raceTask(taskId, "opencode", "claude");
    setActionStatus("Race dispatched between opencode and claude.");
    setTimeout(() => setActionStatus(null), 3000);
  };

  if (!threadId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-bg overflow-y-auto">
        <div className="max-w-xl w-full text-left space-y-6">
          <div className="space-y-2 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.06] border border-border text-text mb-2">
              <Icon name="spark" size={22} />
            </div>
            <h2 className="text-xl font-bold text-text tracking-tight">
              The management layer for AI agents
            </h2>
            <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
              barkcli coordinates coding agents with intent in, plans out, isolated worktrees, tests as the gate, and a merge train for whatever passes.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-surface border border-border space-y-1">
              <div className="font-semibold text-text flex items-center gap-1.5">
                <span className="text-accent">1.</span> Intent In
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                Describe a feature or paste a specification to kick off planning.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-surface border border-border space-y-1">
              <div className="font-semibold text-text flex items-center gap-1.5">
                <span className="text-accent">2.</span> Plans Out
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                AI breaks down the requirement into atomic, parallel child tasks.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-surface border border-border space-y-1">
              <div className="font-semibold text-text flex items-center gap-1.5">
                <span className="text-accent">3.</span> Isolated Worktrees
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                Agents execute in isolated git worktrees so your working tree is undisturbed.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-surface border border-border space-y-1">
              <div className="font-semibold text-text flex items-center gap-1.5">
                <span className="text-accent">4.</span> Tests as the Gate
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                Your actual test suite gates every change before landing via merge train.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] uppercase font-bold text-muted tracking-wider">
              Quick start examples
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                "Add health check endpoint",
                "Add structured logging middleware",
                "Fix flaky test retry policy",
                "Implement user API token auth",
              ].map((starter) => (
                <button
                  key={starter}
                  onClick={() => onNewIntent && onNewIntent(starter)}
                  className="p-2.5 text-left rounded-lg bg-white/[0.02] border border-border hover:bg-white/[0.06] hover:border-accent/40 text-text transition-all text-xs font-medium"
                >
                  {starter} &rarr;
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 text-center">
            <button
              onClick={() => onNewIntent && onNewIntent()}
              className="px-5 py-2 rounded-lg bg-accent text-bg font-semibold text-xs hover:opacity-90 transition-opacity"
            >
              Start New Intent (Cmd+N)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-bg overflow-hidden">
      {actionStatus && (
        <div className="bg-surface border-b border-border px-4 py-2 text-[11px] text-accent flex items-center justify-between shrink-0">
          <span>{actionStatus}</span>
          <button
            onClick={() => setActionStatus(null)}
            className="text-muted hover:text-text p-0.5"
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono text-xs text-muted">
            {thread?.card?.id || threadId}
          </span>
          <span className="text-sm font-semibold text-text truncate">
            {thread?.card?.title || "Thread"}
          </span>
          {thread?.card?.column && (
            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-surface border border-border text-muted">
              {thread.card.column}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onOpenInspector && (
            <button
              onClick={onOpenInspector}
              className="px-2.5 py-1 text-xs rounded-md bg-surface border border-border text-text hover:bg-white/[0.05] transition-colors flex items-center gap-1.5"
            >
              <Icon name="layers" size={13} />
              <span>Inspector</span>
            </button>
          )}
        </div>
      </div>

      {/* Timeline message stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="p-4 text-center text-xs text-muted">
            Loading timeline events...
          </div>
        )}

        {!loading && thread?.events && thread.events.length === 0 && (
          <div className="p-8 text-center text-xs text-muted">
            No messages in this thread yet. Send a prompt below to begin.
          </div>
        )}

        {!loading &&
          thread?.events.map((ev) => {
            if (ev.kind === "user") {
              return (
                <div key={ev.id} className="flex gap-3 max-w-2xl">
                  <div className="w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center text-[10px] font-bold text-text shrink-0">
                    U
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      <span className="font-semibold text-text">{ev.author}</span>
                      <span>{new Date(ev.created_at).toLocaleTimeString()}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-surface border border-border text-xs text-text leading-relaxed whitespace-pre-wrap">
                      {ev.text}
                    </div>
                  </div>
                </div>
              );
            }

            if (ev.kind === "assistant") {
              return (
                <div key={ev.id} className="flex gap-3 max-w-2xl ml-auto flex-row-reverse">
                  <div className="w-6 h-6 rounded-full bg-accent text-bg flex items-center justify-center text-[10px] font-bold shrink-0">
                    B
                  </div>
                  <div className="flex-1 space-y-1 text-right">
                    <div className="flex items-center justify-end gap-2 text-[10px] text-muted">
                      <span className="font-semibold text-text">{ev.author}</span>
                      <span>{new Date(ev.created_at).toLocaleTimeString()}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-white/[0.05] border border-border text-xs text-text text-left leading-relaxed whitespace-pre-wrap">
                      {ev.text}
                    </div>
                  </div>
                </div>
              );
            }

            if (ev.kind === "plan_proposed") {
              const proposal = ev.data;
              return (
                <div key={ev.id} className="p-4 rounded-xl bg-surface border border-border space-y-3 max-w-2xl mx-auto my-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-bold">●</span>
                      <span className="font-semibold text-xs text-text">
                        Plan Proposal: {proposal?.children?.length || 0} tasks
                      </span>
                    </div>
                    <span className="text-[10px] text-muted font-mono">
                      Risk: {proposal?.risk_level || "low"}
                    </span>
                  </div>

                  {proposal?.rationale && (
                    <div className="text-xs text-muted leading-relaxed">
                      {proposal.rationale}
                    </div>
                  )}

                  {proposal?.children && Array.isArray(proposal.children) && (
                    <div className="space-y-1.5 pt-2 border-t border-border">
                      {proposal.children.map((child: any, cIdx: number) => (
                        <div
                          key={cIdx}
                          className="p-2 rounded bg-bg border border-border text-xs flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-muted">○</span>
                            <span className="font-medium text-text truncate">
                              {child.title}
                            </span>
                          </div>
                          {child.complexity && (
                            <span className="text-[10px] text-muted shrink-0 ml-2">
                              {child.complexity}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={handleRejectPlan}
                      className="px-3 py-1.5 text-xs rounded-md bg-surface border border-border text-muted hover:text-text hover:bg-white/[0.03] transition-colors"
                    >
                      Discard
                    </button>
                    <button
                      onClick={handleApprovePlan}
                      className="px-3 py-1.5 text-xs rounded-md bg-accent text-bg font-medium hover:opacity-90 transition-opacity"
                    >
                      Approve & Run
                    </button>
                  </div>
                </div>
              );
            }

            if (ev.kind === "plan_approved") {
              return (
                <div key={ev.id} className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2 max-w-2xl mx-auto">
                  <span className="font-bold">✓</span>
                  <span>{ev.text}</span>
                </div>
              );
            }

            if (ev.kind === "task_spawned") {
              const taskId = ev.data?.task_id || "task";
              const sessionId = ev.data?.session_id;
              return (
                <div key={ev.id} className="p-3 rounded-lg bg-surface border border-border text-xs max-w-2xl mx-auto space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-accent animate-pulse font-bold">◐</span>
                      <span className="font-medium text-text">
                        Worker spawned: {taskId}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {sessionId && (
                        <>
                          <button
                            onClick={() => handleViewTranscript(sessionId)}
                            className="text-[10px] px-2 py-0.5 rounded bg-bg border border-border text-muted hover:text-text"
                          >
                            Live Transcript
                          </button>
                          <button
                            onClick={() => {
                              setSteerSessionId(sessionId);
                              setSteerPrompt("");
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-bg border border-border text-muted hover:text-text"
                          >
                            Steer
                          </button>
                          <button
                            onClick={() => handleForkSession(sessionId)}
                            className="text-[10px] px-2 py-0.5 rounded bg-bg border border-border text-muted hover:text-text"
                          >
                            Fork
                          </button>
                          <button
                            onClick={() => handleStopSession(sessionId)}
                            className="text-[10px] px-2 py-0.5 rounded bg-bg border border-border text-rose-400 hover:text-rose-300"
                          >
                            Stop
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleRaceTask(taskId)}
                        className="text-[10px] px-2 py-0.5 rounded bg-bg border border-border text-amber-400 hover:text-amber-300"
                      >
                        Race
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted">{ev.text}</div>
                </div>
              );
            }

            if (ev.kind === "agent_output") {
              return (
                <div key={ev.id} className="max-w-2xl mx-auto">
                  <pre className="p-2.5 rounded bg-surface border border-border font-mono text-[10px] text-muted overflow-x-auto max-h-36">
                    {ev.text}
                  </pre>
                </div>
              );
            }

            if (ev.kind === "gate") {
              const passed = ev.data?.passed;
              return (
                <div
                  key={ev.id}
                  className={`p-3 rounded-lg border text-xs max-w-2xl mx-auto flex items-center justify-between ${
                    passed
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{passed ? "✓" : "✕"}</span>
                    <span>{ev.text}</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase font-bold">
                    {passed ? "Gate Passed" : "Gate Failed"}
                  </span>
                </div>
              );
            }

            if (ev.kind === "merge") {
              return (
                <div key={ev.id} className="p-3 rounded-lg bg-accent/10 border border-accent/30 text-xs text-text flex items-center gap-2 max-w-2xl mx-auto">
                  <span className="text-accent font-bold">✓</span>
                  <span>{ev.text}</span>
                </div>
              );
            }

            // Fallback event card
            return (
              <div key={ev.id} className="p-2.5 rounded bg-surface border border-border text-xs max-w-2xl mx-auto text-muted">
                <span className="font-semibold text-text mr-2">{ev.author}:</span>
                {ev.text}
              </div>
            );
          })}

        <div ref={messagesEndRef} />
      </div>

      {/* Live transcript viewer modal if open */}
      {transcriptSessionId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-bg border border-border rounded-xl w-full max-w-2xl flex flex-col max-h-[80vh] shadow-2xl">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-text">
                Session Transcript: {transcriptSessionId}
              </span>
              <button
                onClick={() => setTranscriptSessionId(null)}
                className="p-1 text-muted hover:text-text rounded"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto font-mono text-[11px] text-text bg-surface space-y-1">
              {transcriptLoading ? (
                <div className="text-muted text-center py-4">Reading transcript file...</div>
              ) : (
                transcriptLines.map((line, idx) => (
                  <div key={idx} className="whitespace-pre-wrap">{line}</div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Steer Session Modal */}
      {steerSessionId && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-bg border border-border rounded-xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden">
            <div className="p-3.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="spark" size={16} />
                <span className="text-xs font-semibold text-text uppercase tracking-wider">
                  Steer Worker Session
                </span>
              </div>
              <button
                onClick={() => setSteerSessionId(null)}
                className="p-1 text-muted hover:text-text rounded"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted leading-relaxed">
                Direct worker execution with clarifying context or corrective steering instructions.
              </p>
              <textarea
                autoFocus
                value={steerPrompt}
                onChange={(e) => setSteerPrompt(e.target.value)}
                placeholder="Enter steering direction for the running agent..."
                rows={4}
                className="w-full bg-surface border border-border rounded-lg p-3 text-xs text-text placeholder-muted focus:outline-none focus:border-accent resize-none"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSteerSessionId(null)}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted hover:text-text"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSteerSession(steerSessionId)}
                  disabled={!steerPrompt.trim()}
                  className="px-4 py-1.5 rounded-lg bg-accent text-bg text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  Send Guidance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom inline composer */}
      <div className="p-3 border-t border-border bg-surface shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <select
            value={backend}
            onChange={(e) => setBackend(e.target.value)}
            className="bg-bg border border-border rounded px-2 py-1 text-xs text-text"
          >
            <option value="opencode">opencode (deepseek free)</option>
            <option value="claude">claude</option>
            <option value="codex">codex</option>
            <option value="gemini">gemini</option>
          </select>
          <span className="text-[11px] text-muted">
            Press Enter to submit, Shift plus Enter for new line.
          </span>
        </div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type an intent, instruction, or steering direction..."
            rows={2}
            className="flex-1 bg-bg border border-border rounded-lg p-2.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent resize-none"
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || submitting}
            className="px-4 py-2 bg-accent text-bg font-medium rounded-lg text-xs hover:opacity-90 disabled:opacity-40 transition-opacity self-end"
          >
            {submitting ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
