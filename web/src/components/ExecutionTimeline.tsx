import { useState } from "react";
import type { RunTrace, TraceSpan, SpanPhase } from "../lib/types";

interface ExecutionTimelineProps {
  trace?: RunTrace | null;
  className?: string;
  onSpanSelect?: (span: TraceSpan) => void;
}

const LANES: Array<{ phase: SpanPhase; label: string; tone: string }> = [
  { phase: "input", label: "Input", tone: "bg-white/10 border-white/15" },
  { phase: "model", label: "Model", tone: "bg-accent/20 border-accent/35" },
  { phase: "tool", label: "Tools", tone: "bg-white/12 border-white/20" },
  { phase: "gate", label: "Gate", tone: "bg-success/20 border-success/35" },
];

export function ExecutionTimeline({ trace, className = "", onSpanSelect }: ExecutionTimelineProps) {
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | null>(null);

  if (!trace || trace.spans.length === 0 || trace.total_duration_ms === 0) return null;

  const total = Math.max(1, trace.total_duration_ms);
  const durationSec = (total / 1000).toFixed(1);
  const toolCount = trace.spans.filter((s) => s.phase === "tool").length;

  const handleSpanClick = (span: TraceSpan) => {
    setSelectedSpan(span);
    onSpanSelect?.(span);
  };

  return (
    <details className={`group rounded-lg border border-border/70 bg-surface/20 text-text ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-[11px] text-muted [&::-webkit-details-marker]:hidden">
        <span className="text-[10px] text-muted/70 transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
        <span className="font-medium text-muted-strong">Execution trace</span>
        <span className="font-mono text-[10.5px]">{durationSec}s</span>
        <span className="text-muted/50">·</span>
        <span className="font-mono text-[10.5px]">{toolCount} {toolCount === 1 ? "call" : "calls"}</span>
      </summary>

      <div className="space-y-1.5 border-t border-border/50 px-2.5 py-2">
        {LANES.map((lane) => {
          const laneSpans = trace.spans.filter((s) => s.phase === lane.phase);
          if (laneSpans.length === 0) return null;
          return (
            <div key={lane.phase} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-right text-[10px] text-muted">{lane.label}</span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-white/[0.03]">
                {laneSpans.map((span) => {
                  const leftPct = (span.start_ms / total) * 100;
                  const widthPct = Math.max(1.5, (span.duration_ms / total) * 100);
                  const isSelected = selectedSpan?.id === span.id;
                  const isFailed = span.status === "failed";
                  const tone = isFailed ? "bg-danger/30 border-danger/50" : isSelected ? "bg-accent/35 border-accent/60" : lane.tone;
                  return (
                    <button
                      key={span.id}
                      type="button"
                      onClick={() => handleSpanClick(span)}
                      aria-label={`${span.label}, ${(span.duration_ms / 1000).toFixed(2)}s, ${span.status}`}
                      title={`${span.label} (${(span.duration_ms / 1000).toFixed(2)}s)`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      className={`absolute inset-y-0.5 rounded-[3px] border transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${tone}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        {selectedSpan && (
          <div className="mt-1 flex items-center justify-between gap-3 rounded border border-border/60 bg-bg/40 px-2 py-1 text-[10.5px] font-mono text-muted">
            <span className="truncate">
              <span className={selectedSpan.status === "failed" ? "text-danger" : "text-success"}>● </span>
              <span className="text-muted-strong">{selectedSpan.label}</span>
              {selectedSpan.detail ? <span className="text-muted"> · {selectedSpan.detail}</span> : null}
            </span>
            <span className="shrink-0">{(selectedSpan.duration_ms / 1000).toFixed(2)}s</span>
          </div>
        )}
      </div>
    </details>
  );
}
