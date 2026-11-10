import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RunRecord, ThreadEvent } from "../lib/types";
import { Icon } from "../components/Icon";

export interface ThreadTurnInfo {
  id: string;
  elementId: string;
  userText: string;
  fullUserText: string;
  assistantText?: string | null;
  runId?: string;
  provider?: string;
  model?: string;
  status?: string;
  duration?: string;
  filesChanged?: string[];
  diffStats?: { files: number; additions: number; deletions: number };
  summary?: string;
  timestamp?: string;
  index: number;
}

interface ThreadGutterTimelineProps {
  events: ThreadEvent[];
  runs?: RunRecord[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

function cleanPreviewText(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function ThreadGutterTimeline({
  events,
  runs = [],
  containerRef,
  className = "",
}: ThreadGutterTimelineProps) {
  const [hoveredTurnIndex, setHoveredTurnIndex] = useState<number | null>(null);
  const [hoveredY, setHoveredY] = useState<number | null>(null);
  const [activeTurnIndex, setActiveTurnIndex] = useState<number>(0);
  const [tickCount, setTickCount] = useState<number>(60);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Group events into turns starting at each user event
  const turns: ThreadTurnInfo[] = useMemo(() => {
    const list: ThreadTurnInfo[] = [];
    let currentTurn: Partial<ThreadTurnInfo> | null = null;

    for (const event of events) {
      if (event.kind === "user" || event.author === "user") {
        if (currentTurn && currentTurn.id) {
          list.push(currentTurn as ThreadTurnInfo);
        }
        const text = (event.text || "").trim();
        const cleaned = cleanPreviewText(text);
        const firstLine = cleaned.split("\n")[0] || cleaned;
        const truncated = firstLine.length > 70 ? firstLine.slice(0, 68) + "…" : firstLine;

        currentTurn = {
          id: event.id,
          elementId: `thread-event-${event.id}`,
          userText: truncated || "User prompt",
          fullUserText: text,
          timestamp: event.created_at,
          index: list.length,
          assistantText: null,
        };
      } else if (currentTurn) {
        if ((event.kind === "assistant" || event.author === "assistant") && event.text?.trim()) {
          // Captures final assistant message in the turn up to 1500 chars
          const cleaned = cleanPreviewText(event.text.slice(0, 1500));
          if (cleaned) {
            currentTurn.assistantText = cleaned;
          }
        }
      }
    }

    if (currentTurn && currentTurn.id) {
      list.push(currentTurn as ThreadTurnInfo);
    }

    // Correlate with run records
    list.forEach((t, idx) => {
      const run = runs[idx] || runs[runs.length - 1];
      if (run) {
        t.runId = run.id;
        t.provider = run.provider;
        t.model = run.model;
        t.status = run.status;
        t.diffStats = run.diff_stats;
        t.filesChanged = run.files_touched;
        if (run.started_at && run.ended_at) {
          const start = new Date(run.started_at).getTime();
          const end = new Date(run.ended_at).getTime();
          const diffMs = Math.max(0, end - start);
          const mins = Math.floor(diffMs / 60000);
          const secs = Math.floor((diffMs % 60000) / 1000);
          t.duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        }
        if (run.summary && !t.assistantText && !t.summary) {
          t.summary = run.summary;
        }
      }
    });

    return list;
  }, [events, runs]);

  // Adjust tick count based on timeline height
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;

    const updateHeight = () => {
      const h = el.clientHeight || 400;
      // ~5.5px per tick (1.5px tick + 4px gap)
      const count = Math.max(30, Math.min(220, Math.floor(h / 5.5)));
      setTickCount(count);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Track active turn based on scroll position in container
  useEffect(() => {
    const container = containerRef.current;
    if (!container || turns.length === 0) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      let closestIdx = 0;
      let minDistance = Infinity;

      turns.forEach((turn, idx) => {
        const el = document.getElementById(turn.elementId);
        if (el) {
          const distance = Math.abs(el.offsetTop - scrollTop - 100);
          if (distance < minDistance) {
            minDistance = distance;
            closestIdx = idx;
          }
        }
      });

      setActiveTurnIndex(closestIdx);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef, turns]);

  if (turns.length === 0) return null;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setHoveredY(y);

    const ratio = Math.max(0, Math.min(1, y / rect.height));
    const turnIndex = Math.min(turns.length - 1, Math.floor(ratio * turns.length));
    setHoveredTurnIndex(turnIndex);
  };

  const handleMouseLeave = () => {
    setHoveredTurnIndex(null);
    setHoveredY(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (containerRef.current) {
      containerRef.current.scrollTop += e.deltaY;
    }
  };

  const scrollToTurn = (turn: ThreadTurnInfo) => {
    const el = document.getElementById(turn.elementId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const activeTurn = hoveredTurnIndex !== null ? turns[hoveredTurnIndex] : null;

  return (
    <div
      ref={timelineRef}
      className={`absolute left-1.5 top-3 bottom-3 w-7 z-30 select-none group/timeline ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      onClick={() => {
        if (activeTurn) scrollToTurn(activeTurn);
      }}
      title="Thread history timeline (click to jump)"
      aria-label="Thread history timeline"
    >
      {/* Vertical Dashed Tick Marks & Pins */}
      <div className="flex flex-col items-start gap-[4px] h-full w-full py-1 cursor-pointer">
        {Array.from({ length: tickCount }).map((_, i) => {
          const ratio = i / (tickCount - 1);
          const mappedTurnIdx = Math.min(turns.length - 1, Math.floor(ratio * turns.length));
          const isTurnMarker =
            turns.length > 1 &&
            turns.some((_, tIdx) => Math.abs(ratio - tIdx / (turns.length - 1)) < 0.5 / tickCount);
          const isHovered = hoveredTurnIndex !== null && mappedTurnIdx === hoveredTurnIndex;
          const isActive = activeTurnIndex === mappedTurnIdx;

          // Distance in turn indices from hovered turn
          const turnDistance = hoveredTurnIndex !== null ? Math.abs(mappedTurnIdx - hoveredTurnIndex) : null;

          return (
            <div
              key={i}
              className={`h-[1.5px] transition-all duration-150 rounded-full ${
                isHovered
                  ? "w-6 bg-white shadow-[0_0_8px_rgba(255,255,255,0.85)] scale-x-100 origin-left"
                  : turnDistance === 1 && isTurnMarker
                    ? "w-4.5 bg-white/70"
                    : turnDistance === 2 && isTurnMarker
                      ? "w-3.5 bg-white/45"
                      : isTurnMarker
                        ? "w-3 bg-white/50"
                        : isActive
                          ? "w-3 bg-accent/80 shadow-[0_0_6px_var(--accent)]"
                          : "w-2 bg-white/15 group-hover/timeline:bg-white/25"
              }`}
            />
          );
        })}
      </div>

      {/* Floating Hover Card (Matching T3 Code & User Reference) */}
      {activeTurn && hoveredY !== null && (
        <div
          className="absolute left-8 z-50 w-80 rounded-xl border border-border/80 bg-[#161618]/95 p-3.5 text-xs shadow-2xl backdrop-blur-md pointer-events-auto animate-in fade-in zoom-in-95"
          style={{
            top: Math.max(8, Math.min(hoveredY - 45, (timelineRef.current?.clientHeight || 400) - 170)),
          }}
          onClick={(e) => {
            e.stopPropagation();
            scrollToTurn(activeTurn);
          }}
        >
          {/* Connector notch line pointing to hovered pin */}
          <div className="absolute -left-2 top-5 h-[2px] w-2 bg-white/90 rounded-full" />

          {/* User Prompt Title - clean single line truncated with ellipsis */}
          <div className="font-medium text-text text-sm leading-5 truncate">
            {activeTurn.userText}
          </div>

          {/* Assistant Response / Work Summary */}
          {(activeTurn.assistantText || activeTurn.summary) && (
            <p
              className="mt-1 text-muted text-[13px] leading-relaxed overflow-hidden"
              style={{
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
              }}
            >
              {activeTurn.assistantText || activeTurn.summary}
            </p>
          )}

          {/* Footer Metadata: duration, diff stats, touched files */}
          {(activeTurn.duration || activeTurn.diffStats || (activeTurn.filesChanged && activeTurn.filesChanged.length > 0)) && (
            <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted">
              <div className="flex items-center gap-2">
                {activeTurn.duration && <span>{activeTurn.duration}</span>}
                {activeTurn.diffStats && (activeTurn.diffStats.additions > 0 || activeTurn.diffStats.deletions > 0) && (
                  <span className="flex items-center gap-1">
                    <span className="text-emerald-400 font-semibold">+{activeTurn.diffStats.additions}</span>
                    <span className="text-red-400 font-semibold">-{activeTurn.diffStats.deletions}</span>
                  </span>
                )}
              </div>
              {activeTurn.filesChanged && activeTurn.filesChanged.length > 0 && (
                <div className="flex items-center gap-1 text-accent/90 max-w-[120px] truncate" title={activeTurn.filesChanged[0]}>
                  <Icon name="pencil" size={10} className="shrink-0" />
                  <span className="truncate">{activeTurn.filesChanged[0].split("/").pop()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
