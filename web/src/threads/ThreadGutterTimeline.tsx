import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RunRecord, ThreadEvent } from "../lib/types";
import { Icon } from "../components/Icon";

export interface ThreadTurnInfo {
  id: string;
  elementId: string;
  userText: string;
  fullUserText: string;
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
      if (event.kind === "user") {
        if (currentTurn && currentTurn.id) {
          list.push(currentTurn as ThreadTurnInfo);
        }
        const text = (event.text || "").trim();
        const firstLine = text.split("\n")[0] || text;
        const truncated = firstLine.length > 70 ? firstLine.slice(0, 68) + "…" : firstLine;

        currentTurn = {
          id: event.id,
          elementId: `thread-event-${event.id}`,
          userText: truncated || "User prompt",
          fullUserText: text,
          timestamp: event.created_at,
          index: list.length,
        };
      } else if (currentTurn) {
        if (event.kind === "assistant" && !currentTurn.summary) {
          const text = (event.text || "").trim();
          const firstLine = text.split("\n")[0] || text;
          currentTurn.summary = firstLine.length > 90 ? firstLine.slice(0, 88) + "…" : firstLine;
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
        if (run.summary && !t.summary) {
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
      // ~6px per tick (2px tick + 4px gap)
      const count = Math.max(30, Math.min(180, Math.floor(h / 6)));
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
      className={`absolute left-1 top-4 bottom-4 w-6 z-20 select-none group/timeline ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={() => {
        if (activeTurn) scrollToTurn(activeTurn);
      }}
      title="Thread history timeline (click to jump)"
      aria-label="Thread history timeline"
    >
      {/* Vertical Dashed Tick Marks */}
      <div className="flex flex-col items-start gap-[4px] h-full w-full py-1 cursor-pointer">
        {Array.from({ length: tickCount }).map((_, i) => {
          const ratio = i / (tickCount - 1);
          const mappedTurnIdx = Math.min(turns.length - 1, Math.floor(ratio * turns.length));
          const isTurnMarker =
            turns.length > 1 &&
            turns.some((_, tIdx) => Math.abs(ratio - tIdx / (turns.length - 1)) < 0.5 / tickCount);
          const isHovered = hoveredTurnIndex !== null && mappedTurnIdx === hoveredTurnIndex;
          const isActive = activeTurnIndex === mappedTurnIdx;

          return (
            <div
              key={i}
              className={`h-[1.5px] transition-all duration-100 rounded-full ${
                isHovered
                  ? "w-5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]"
                  : isTurnMarker
                    ? "w-3.5 bg-white/50"
                    : isActive
                      ? "w-3 bg-accent/70"
                      : "w-2 bg-white/15 group-hover/timeline:bg-white/25"
              }`}
            />
          );
        })}
      </div>

      {/* Floating Hover Card (Matching Screenshot) */}
      {activeTurn && hoveredY !== null && (
        <div
          className="absolute left-7 z-50 w-72 rounded-xl border border-border/90 bg-[#161618] p-3 text-xs shadow-2xl backdrop-blur-md pointer-events-auto animate-in fade-in zoom-in-95"
          style={{
            top: Math.max(10, Math.min(hoveredY - 50, (timelineRef.current?.clientHeight || 400) - 180)),
          }}
          onClick={(e) => {
            e.stopPropagation();
            scrollToTurn(activeTurn);
          }}
        >
          {/* Connector notch line pointing to hovered tick */}
          <div className="absolute -left-2 top-6 h-[2px] w-2 bg-white/80" />

          {/* User Prompt Title */}
          <h4 className="font-semibold text-text text-[12.5px] leading-snug line-clamp-2">
            {activeTurn.userText}
          </h4>

          {/* Eyebrow Label */}
          <span className="text-[10px] text-muted-dim font-medium block mt-1.5 uppercase tracking-wider">
            What happened in that thread
          </span>

          {/* Agent Run & Model & Summary */}
          <p className="text-[11px] text-muted font-mono leading-relaxed mt-0.5 line-clamp-2">
            {activeTurn.runId
              ? `(${activeTurn.runId.slice(0, 16)}…: ${
                  activeTurn.provider && activeTurn.model
                    ? `${activeTurn.provider}/${activeTurn.model}`
                    : activeTurn.model || activeTurn.provider || "agent"
                }) `
              : ""}
            {activeTurn.summary || "The plan/build succeeded with verified test gate checks."}
          </p>

          {/* Duration */}
          {activeTurn.duration && (
            <span className="text-[11px] text-muted-strong block mt-1 font-mono">
              Working for {activeTurn.duration}
            </span>
          )}

          {/* Files Changed & Diff Stats */}
          {activeTurn.diffStats && (activeTurn.diffStats.additions > 0 || activeTurn.diffStats.deletions > 0) && (
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted mt-1.5">
              <span>{activeTurn.diffStats.files || 1} files changed</span>
              <span className="text-emerald-400">+{activeTurn.diffStats.additions}</span>
              <span className="text-red-400">-{activeTurn.diffStats.deletions}</span>
            </div>
          )}

          {/* Key Modified File */}
          {activeTurn.filesChanged && activeTurn.filesChanged.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-accent mt-1.5 truncate">
              <Icon name="pencil" size={11} className="shrink-0" />
              <span className="truncate">{activeTurn.filesChanged[0]}</span>
            </div>
          )}

          {/* Footer jump hint */}
          <div className="mt-2 pt-1.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted">
            <span className="text-accent/90 hover:underline">Click to jump to turn</span>
            {activeTurn.timestamp && (
              <span className="font-mono">
                {new Date(activeTurn.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
