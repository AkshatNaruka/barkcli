import React, { useState } from "react";
import { Icon } from "../components/Icon";

export interface QueuedMessage {
  id: string;
  text: string;
  createdAt: string;
  mode?: "build" | "plan" | "ask";
  attachmentLabel?: string;
}

interface QueuedMessagesPanelProps {
  messages: QueuedMessage[];
  onSendNow: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function QueuedMessagesPanel({
  messages,
  onSendNow,
  onEdit,
  onDelete,
}: QueuedMessagesPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (messages.length === 0) return null;

  return (
    <div
      className="mx-auto mb-2.5 w-full max-w-3xl rounded-2xl border border-border/80 bg-[#12110f]/95 px-4 py-2.5 shadow-lg backdrop-blur-md transition-all"
      data-testid="queued-messages-panel"
    >
      {/* Header */}
      <div
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        aria-expanded={expanded}
        className="flex items-center justify-between gap-2 cursor-pointer select-none py-0.5"
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-[12.5px] font-semibold text-muted-strong">
            Queued Messages
          </span>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/[0.08] px-1.5 font-mono text-[11px] font-semibold text-text">
            {messages.length}
          </span>
          <span className="text-[12px] text-muted/70 truncate">
            Sends after agent finishes working
          </span>
        </div>
        <button
          type="button"
          aria-label={expanded ? "Collapse queued messages" : "Expand queued messages"}
          className="text-muted hover:text-text p-1 rounded transition-colors"
        >
          <Icon
            name="chevDown"
            size={14}
            className={`transition-transform duration-150 ${expanded ? "" : "-rotate-90"}`}
          />
        </button>
      </div>

      {/* Queued Items */}
      {expanded && (
        <div className="mt-2 divide-y divide-border/40">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="flex items-center gap-3 py-2 first:pt-1 last:pb-0.5 group"
            >
              {/* Mini preview card icon matching screenshot */}
              <div
                className="flex h-7 w-9 shrink-0 flex-col justify-between rounded-md border border-white/10 bg-bg p-1 text-[6px] font-mono text-muted/50 shadow-inner select-none overflow-hidden"
                aria-hidden="true"
              >
                <div className="flex items-center gap-0.5">
                  <span className="h-1 w-1 rounded-full bg-accent/60" />
                  <span className="h-0.5 w-3 rounded bg-white/20" />
                </div>
                <div className="h-0.5 w-5 rounded bg-white/15" />
                <div className="h-0.5 w-4 rounded bg-white/10" />
              </div>

              {/* Message text */}
              <p className="flex-1 min-w-0 text-[13px] leading-snug text-text line-clamp-2 break-words">
                {msg.text}
              </p>

              {/* Actions: Send Now, Edit, Delete */}
              <div className="flex shrink-0 items-center gap-1 ml-2">
                <button
                  type="button"
                  onClick={() => onSendNow(msg.id)}
                  aria-label="Send queued message now"
                  title="Send now"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-white/[0.06] hover:text-text transition-colors"
                >
                  <Icon name="arrowFlat" size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(msg.id)}
                  aria-label="Edit queued message"
                  title="Edit message"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-white/[0.06] hover:text-text transition-colors"
                >
                  <Icon name="pencil" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(msg.id)}
                  aria-label="Remove queued message"
                  title="Remove from queue"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
