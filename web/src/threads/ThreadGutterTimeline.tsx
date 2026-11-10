import React, { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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

const TIMELINE_MINIMAP_ITEM_SPACING = 8;
const TIMELINE_MINIMAP_MIN_ITEMS = 1;
const TIMELINE_MINIMAP_MAX_HEIGHT_CSS = "calc(100vh - 18rem)";

export function resolveTimelineMinimapHeightStyle(itemCount: number): string {
  const naturalHeight = Math.max(1, (itemCount - 1) * TIMELINE_MINIMAP_ITEM_SPACING);
  return `min(${naturalHeight}px, ${TIMELINE_MINIMAP_MAX_HEIGHT_CSS})`;
}

export function resolveTimelineMinimapTopPercent(index: number, itemCount: number): number {
  if (itemCount <= 1) return 0;
  return (Math.max(0, Math.min(index, itemCount - 1)) / (itemCount - 1)) * 100;
}

export function resolveTimelineMinimapIndexFromPointer(input: {
  readonly itemCount: number;
  readonly railTop: number;
  readonly railHeight: number;
  readonly pointerY: number;
}): number | null {
  if (input.itemCount <= 0) return null;
  if (input.itemCount === 1) return 0;
  if (input.railHeight <= 0) {
    return 0;
  }
  const progress = Math.max(0, Math.min(1, (input.pointerY - input.railTop) / input.railHeight));
  return Math.max(0, Math.min(input.itemCount - 1, Math.round(progress * (input.itemCount - 1))));
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeTurnIndex, setActiveTurnIndex] = useState<number>(0);
  const railRef = useRef<HTMLDivElement>(null);

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

  if (turns.length < TIMELINE_MINIMAP_MIN_ITEMS) return null;

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < turns.length ? activeIndex : null;
  const activeTurn = resolvedActiveIndex !== null ? turns[resolvedActiveIndex] : null;

  const previousTurn = activeTurnIndex > 0 ? turns[activeTurnIndex - 1] : null;
  const nextTurn = activeTurnIndex < turns.length - 1 ? turns[activeTurnIndex + 1] : null;

  const activeTopPercent =
    resolvedActiveIndex === null
      ? 0
      : resolveTimelineMinimapTopPercent(resolvedActiveIndex, turns.length);

  const activeTooltipTranslate =
    resolvedActiveIndex === null
      ? "-50%"
      : resolvedActiveIndex === 0
        ? "0%"
        : resolvedActiveIndex === turns.length - 1
          ? "-100%"
          : "-50%";

  const scrollToTurn = (turn: ThreadTurnInfo) => {
    const el = document.getElementById(turn.elementId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handlePointerUpdate = (e: MouseEvent<HTMLElement>) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextIdx = resolveTimelineMinimapIndexFromPointer({
      itemCount: turns.length,
      railTop: rect.top,
      railHeight: rect.height,
      pointerY: e.clientY,
    });
    setActiveIndex(nextIdx);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (containerRef.current) {
      containerRef.current.scrollTop += e.deltaY;
    }
  };

  const moveActiveIndex = (delta: number) => {
    setActiveIndex((current) => {
      const base = current ?? activeTurnIndex;
      return Math.max(0, Math.min(turns.length - 1, base + delta));
    });
  };

  return (
    <div
      className={`group/minimap pointer-events-auto absolute inset-y-0 left-0 z-40 hidden w-16 select-none md:block ${className}`}
      onWheel={handleWheel}
      onMouseMove={handlePointerUpdate}
      onMouseLeave={() => setActiveIndex(null)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-minimap-preview]")) return;
        if (activeTurn) scrollToTurn(activeTurn);
      }}
      title="Thread history timeline"
      aria-label="Thread history timeline"
    >
      <div className="relative h-full w-full">
        <div
          ref={railRef}
          className="pointer-events-auto absolute top-1/2 left-3 -translate-y-1/2 w-8 cursor-pointer focus-within:outline-none"
          style={{
            height: resolveTimelineMinimapHeightStyle(turns.length),
          }}
          tabIndex={0}
          role="region"
          aria-label="Minimap rail"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              moveActiveIndex(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              moveActiveIndex(-1);
            } else if (e.key === "Home") {
              e.preventDefault();
              setActiveIndex(0);
            } else if (e.key === "End") {
              e.preventDefault();
              setActiveIndex(turns.length - 1);
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (activeTurn) scrollToTurn(activeTurn);
            }
          }}
        >
          {/* Previous Turn Navigation Button */}
          <button
            type="button"
            disabled={previousTurn === null}
            aria-label="Previous turn"
            onClick={(e) => {
              e.stopPropagation();
              if (previousTurn) scrollToTurn(previousTurn);
            }}
            className="absolute left-3 -translate-x-1/2 bottom-[calc(100%+4px)] z-10 size-5 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-white hover:bg-white/10 opacity-0 group-hover/minimap:opacity-100 transition-opacity disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronUp className="size-3.5" />
          </button>

          {/* Central Track / Rail Line */}
          <div className="absolute top-0 left-3 h-full w-px bg-white/15 rounded-full" />

          {/* Fisheye Strips for each turn */}
          {turns.map((turn, index) => {
            const top = `${resolveTimelineMinimapTopPercent(index, turns.length)}%`;
            const activeDistance =
              resolvedActiveIndex === null ? null : Math.abs(index - resolvedActiveIndex);
            const isInView = activeTurnIndex === index;

            return (
              <span
                key={turn.id}
                aria-hidden="true"
                data-minimap-strip
                data-in-view={isInView ? "true" : "false"}
                className={`pointer-events-none absolute left-0 h-0.5 w-6 origin-left -translate-y-1/2 rounded-full transition-transform duration-150 ${
                  activeDistance === 0
                    ? "scale-x-100 bg-white shadow-[0_0_8px_rgba(255,255,255,0.85)]"
                    : activeDistance === 1
                      ? "scale-x-[0.667] bg-white/70"
                      : activeDistance === 2
                        ? "scale-x-[0.417] bg-white/45"
                        : isInView
                          ? "scale-x-[0.5] bg-accent/80 shadow-[0_0_6px_var(--accent)]"
                          : "scale-x-[0.333] bg-white/20 group-hover/minimap:bg-white/35"
                }`}
                style={{ top }}
              />
            );
          })}

          {/* Next Turn Navigation Button */}
          <button
            type="button"
            disabled={nextTurn === null}
            aria-label="Next turn"
            onClick={(e) => {
              e.stopPropagation();
              if (nextTurn) scrollToTurn(nextTurn);
            }}
            className="absolute left-3 -translate-x-1/2 top-[calc(100%+4px)] z-10 size-5 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-white hover:bg-white/10 opacity-0 group-hover/minimap:opacity-100 transition-opacity disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronDown className="size-3.5" />
          </button>

          {/* Floating Hover Card (Matching T3 Code & User Screenshot) */}
          {activeTurn && (
            <div
              data-minimap-preview
              className="pointer-events-auto absolute left-8 w-80 cursor-text select-text z-50 animate-in fade-in zoom-in-95"
              style={{
                top: `${activeTopPercent}%`,
                transform: `translateY(${activeTooltipTranslate})`,
              }}
              onMouseMove={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                scrollToTurn(activeTurn);
              }}
            >
              {/* Popover Card */}
              <div className="relative rounded-xl border border-border/80 bg-[#161618]/95 p-3.5 text-xs shadow-2xl backdrop-blur-md text-left text-popover-foreground">
                {/* Connector notch line pointing to active strip */}
                <div className="absolute -left-2 top-5 h-[2px] w-2 bg-white/90 rounded-full" />

                {/* User Prompt Title - single line truncated */}
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

                {/* Bottom Metadata: duration, diff stats, touched file */}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
