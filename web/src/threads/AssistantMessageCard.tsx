import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import type { ThreadEvent } from "../lib/types";
import { relativeTime } from "../lib/threads";

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

interface AssistantMessageCardProps {
  event: ThreadEvent;
  isStreaming: boolean;
  isLatest: boolean;
  onCopy: () => void;
  copied: boolean;
  onRunCommand?: (cmd: string) => void;
  onScrollToBottom?: () => void;
  children: (text: string) => React.ReactNode;
}

export function formatBackendName(backend?: string): string {
  if (!backend || backend === "you") return "Bark Agent";
  const lower = backend.toLowerCase();
  if (lower === "claude-code" || lower === "claude") return "Claude Code";
  if (lower === "opencode") return "OpenCode";
  if (lower === "codex") return "OpenAI Codex";
  return backend.charAt(0).toUpperCase() + backend.slice(1);
}

export function splitThinkingContent(text: string): { thinking: string | null; body: string } {
  const match = /<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/i.exec(text);
  if (!match) return { thinking: null, body: text };
  const thinking = match[1].trim();
  const body = text.replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/i, "").trim();
  return { thinking: thinking || null, body };
}

export function useElapsedSeconds(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    startRef.current = Date.now();
    setSeconds(0);
    const interval = window.setInterval(() => {
      setSeconds(Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [active]);

  return seconds;
}

export function AssistantMessageCard({
  event,
  isStreaming,
  isLatest,
  onCopy,
  copied,
  onScrollToBottom,
  children,
}: AssistantMessageCardProps) {
  const { thinking, body } = splitThinkingContent(event.text);
  const targetText = body || (isStreaming ? "" : event.text);

  // Progressive streaming state:
  // If actively streaming, start empty and stream tokens progressively.
  // If static past message on mount, show immediately.
  const [displayedText, setDisplayedText] = useState(() => (isStreaming ? "" : targetText));
  const targetRef = useRef(targetText);
  targetRef.current = targetText;
  const isProgressing = displayedText.length < targetText.length;

  useEffect(() => {
    if (!isLatest && !isStreaming) {
      setDisplayedText(targetText);
      return;
    }

    if (displayedText.length >= targetText.length) {
      if (displayedText !== targetText) {
        setDisplayedText(targetText);
      }
      return;
    }

    const diff = targetText.length - displayedText.length;
    // Smooth dynamic typing cadence: 2-32 characters per frame (60fps)
    const step = diff > 600 ? 32 : diff > 200 ? 16 : diff > 60 ? 8 : diff > 20 ? 4 : 2;

    const timer = setTimeout(() => {
      setDisplayedText((prev) => {
        const nextLen = Math.min(prev.length + step, targetRef.current.length);
        return targetRef.current.slice(0, nextLen);
      });
      onScrollToBottom?.();
    }, 16);

    return () => clearTimeout(timer);
  }, [displayedText, targetText, isLatest, isStreaming, onScrollToBottom]);

  const activeStreaming = isStreaming || isProgressing;
  const authorName = formatBackendName(event.author);

  return (
    <article
      className="chat-message chat-message-assistant group"
      aria-label="Agent reply"
      aria-busy={activeStreaming}
    >
      <div className="chat-assistant-header">
        <div className="flex items-center gap-2">
          <span className={`chat-assistant-avatar ${activeStreaming ? "animate-pulse" : ""}`}>
            <Icon name="robot" size={13} />
          </span>
          <span className="chat-assistant-name">{authorName}</span>
          {activeStreaming && (
            <span className="chat-streaming-badge flex items-center gap-1.5 font-mono text-[11px] text-accent font-medium">
              <span className="agent-wave text-accent scale-75 origin-left">
                <span /><span /><span /><span /><span />
              </span>
              <span>Streaming…</span>
            </span>
          )}
        </div>
        <div className="chat-assistant-actions">
          {!activeStreaming && (
            <>
              <button
                type="button"
                onClick={onCopy}
                className="chat-action-btn"
                aria-label="Copy reply"
                title="Copy reply"
              >
                <Icon name={copied ? "check" : "copy"} size={11} />
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
              <span className="chat-message-time">
                <EventTime iso={event.created_at} />
              </span>
            </>
          )}
        </div>
      </div>

      {thinking && (
        <details className="chat-thought-block" open={activeStreaming || Boolean(thinking)}>
          <summary className="chat-thought-summary flex items-center gap-2">
            <Icon name="spark" size={12} className="text-accent shrink-0" />
            <span>Thought process</span>
            {activeStreaming && (
              <span className="ml-auto text-[10px] font-mono text-accent animate-pulse">
                thinking…
              </span>
            )}
          </summary>
          <div className="chat-thought-content">{thinking}</div>
        </details>
      )}

      <div className="chat-prose-container relative">
        {children(displayedText)}
        {activeStreaming && (
          <span
            className="inline-block w-1.5 h-4 ml-0.5 bg-accent align-middle animate-pulse rounded-xs"
            aria-hidden="true"
          />
        )}
      </div>
    </article>
  );
}

export function LiveAgentWorkingBubble({
  backend,
  statusText = "Working…",
  elapsedSeconds = 0,
  recentActivities = [],
  onStop,
}: {
  backend: string;
  statusText?: string;
  elapsedSeconds?: number;
  recentActivities?: Array<{ id: string; label: string; icon: any; color: string; time?: string }>;
  onStop?: () => void;
}) {
  const authorName = formatBackendName(backend);

  return (
    <article
      className="chat-message chat-message-assistant animate-fadeIn"
      aria-label="Agent is working"
      aria-busy="true"
    >
      <div className="chat-assistant-header">
        <div className="flex items-center gap-2">
          <span className="chat-assistant-avatar animate-pulse">
            <Icon name="robot" size={13} />
          </span>
          <span className="chat-assistant-name">{authorName}</span>
          <span className="chat-streaming-badge flex items-center gap-1.5 font-mono text-[11px] text-accent font-medium">
            <span className="agent-wave text-accent scale-75 origin-left">
              <span /><span /><span /><span /><span />
            </span>
            <span>{statusText}</span>
            {elapsedSeconds > 0 && (
              <span className="text-muted/60 text-[10.5px]">· {elapsedSeconds}s</span>
            )}
          </span>
        </div>
        {onStop && (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono text-muted hover:text-danger hover:bg-danger/10 border border-border/60 hover:border-danger/30 transition-colors cursor-pointer"
            title="Stop generation"
          >
            <Icon name="stop" size={11} />
            <span>Stop</span>
          </button>
        )}
      </div>

      <div className="mt-1 flex flex-col gap-2 rounded-xl border border-border/60 bg-surface/50 p-3.5 shadow-sm">
        {recentActivities.length > 0 && (
          <div className="flex flex-col gap-1.5 pb-2 mb-2 border-b border-border/40 font-mono text-[11px]">
            {recentActivities.slice(-3).map((act) => (
              <div key={act.id} className="flex items-center gap-2 text-muted-strong">
                <Icon name={act.icon} size={12} className={act.color} />
                <span className="truncate flex-1">{act.label}</span>
                {act.time && <span className="text-[10px] text-muted/50 ml-auto shrink-0">{act.time}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2.5 text-muted-strong font-mono text-[11.5px]">
          <span className="w-2 h-2 rounded-full bg-accent animate-ping shrink-0" />
          <span>{statusText}</span>
          <span className="text-muted/40 text-[10px] ml-auto">Live execution</span>
        </div>
      </div>
    </article>
  );
}
