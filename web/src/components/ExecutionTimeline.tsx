import React, { useState } from "react";
import type { RunTrace, TraceSpan, SpanPhase } from "../lib/types";
import { Icon } from "./Icon";

interface ExecutionTimelineProps {
  trace?: RunTrace | null;
  className?: string;
  onSpanSelect?: (span: TraceSpan) => void;
}

const LANES: Array<{ phase: SpanPhase; label: string; color: string; border: string }> = [
  { phase: "input", label: "Input", color: "bg-cyan-500/30", border: "border-cyan-400/60" },
  { phase: "model", label: "Model", color: "bg-amber-500/30", border: "border-amber-400/60" },
  { phase: "tool", label: "Tools", color: "bg-indigo-500/30", border: "border-indigo-400/60" },
  { phase: "gate", label: "Test Gate", color: "bg-emerald-500/30", border: "border-emerald-400/60" },
];

export function ExecutionTimeline({ trace, className = "", onSpanSelect }: ExecutionTimelineProps) {
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | null>(null);
  const [expanded, setExpanded] = useState(true);

  if (!trace || trace.spans.length === 0 || trace.total_duration_ms === 0) {
    return (
      <div className={`rounded-xl border border-border/40 bg-surface/40 p-3.5 text-center text-[12px] text-muted ${className}`}>
        <p>No execution telemetry recorded</p>
      </div>
    );
  }

  const total = Math.max(1, trace.total_duration_ms);
  const durationSec = (total / 1000).toFixed(1);
  const toolCount = trace.spans.filter((s) => s.phase === "tool").length;

  const handleSpanClick = (span: TraceSpan) => {
    setSelectedSpan(span);
    onSpanSelect?.(span);
  };

  return (
    <div className={`rounded-xl border border-white/10 bg-[#0A0C10] p-4 text-text shadow-sm ${className}`}>
      {/* Header Summary */}
      <div className="flex items-center justify-between pb-3 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#B8845C]/20 text-[#E5AA7A]">
            <Icon name="clock" size={12} />
          </span>
          <span className="text-[12.5px] font-semibold tracking-wide text-text">Execution Trace</span>
          <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[11px] text-muted-strong font-medium">
            {durationSec}s
          </span>
          <span className="rounded bg-indigo-500/10 px-2 py-0.5 font-mono text-[10.5px] text-indigo-300">
            {toolCount} {toolCount === 1 ? "call" : "calls"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-muted hover:text-text transition-colors flex items-center gap-1 font-mono"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3.5 space-y-2">
          {/* Timeline Lanes */}
          {LANES.map((lane) => {
            const laneSpans = trace.spans.filter((s) => s.phase === lane.phase);
            return (
              <div key={lane.phase} className="flex items-center gap-3">
                <span className="w-16 text-[10.5px] font-mono font-medium text-muted/80 text-right shrink-0">
                  {lane.label}
                </span>

                <div className="relative h-6 flex-1 rounded-md bg-white/[0.03] border border-white/[0.04] overflow-hidden">
                  {laneSpans.map((span) => {
                    const leftPct = (span.start_ms / total) * 100;
                    const widthPct = Math.max(1.5, (span.duration_ms / total) * 100);
                    const isSelected = selectedSpan?.id === span.id;
                    const isFailed = span.status === "failed";

                    const bgClass = isFailed
                      ? "bg-rose-500/40 border-rose-400"
                      : isSelected
                      ? "bg-[#B8845C]/60 border-[#E5AA7A]"
                      : `${lane.color} ${lane.border}`;

                    return (
                      <button
                        key={span.id}
                        type="button"
                        onClick={() => handleSpanClick(span)}
                        title={`${span.label} (${(span.duration_ms / 1000).toFixed(2)}s)`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                        }}
                        className={`absolute top-0.5 bottom-0.5 rounded border transition-all hover:brightness-125 focus:outline-none focus:ring-1 focus:ring-white/40 cursor-pointer ${bgClass}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Selected Span Detail Panel */}
          {selectedSpan && (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-[11.5px] flex items-center justify-between gap-4 font-mono">
              <div className="flex items-center gap-2 truncate">
                <span
                  className={`h-2 w-2 rounded-full ${
                    selectedSpan.status === "failed" ? "bg-rose-500" : "bg-emerald-400"
                  }`}
                />
                <span className="font-semibold text-text truncate">{selectedSpan.label}</span>
                {selectedSpan.detail && (
                  <span className="text-muted/80 truncate">({selectedSpan.detail})</span>
                )}
              </div>
              <div className="shrink-0 text-muted">
                {(selectedSpan.duration_ms / 1000).toFixed(2)}s
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
