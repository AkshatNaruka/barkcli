import React from "react";
import { Icon } from "./Icon";

export interface RailAgent {
  id: string;
  name: string;
  work: string | null;
  status: string;
  human?: boolean;
}

function workTone(a: RailAgent): string {
  if (a.human) return "text-success";
  if (a.status === "merged") return "text-success";
  if (a.status === "gate passed") return "text-warning";
  if (a.status === "running" || a.status === "Working") return "text-accent-text";
  return "text-muted";
}

export function AgentRail({
  agents,
  next,
  onNext,
  replay,
  onRestart,
}: {
  agents: RailAgent[];
  next: string | null;
  onNext: () => void;
  replay?: boolean;
  onRestart?: () => void;
}) {
  return (
    <aside className="hidden lg:flex w-[264px] shrink-0 border-l border-border bg-surface/40 flex-col min-h-0">
      {replay && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border/60 shrink-0">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Recorded run
          </span>
          {onRestart && (
            <button
              onClick={onRestart}
              className="text-muted hover:text-text p-1 rounded hover:bg-white/[0.04]"
              title="Restart the replay from the beginning"
            >
              <Icon name="refresh" size={12} />
            </button>
          )}
        </div>
      )}

      <div className="px-4 pt-4 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted/70 select-none shrink-0">
        Agents
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {agents.map((a) => (
          <div key={a.id} className="px-4 py-3 border-b border-border/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`w-5 h-5 rounded-[5px] border border-border bg-white/[0.03] flex items-center justify-center shrink-0 ${
                  a.human ? "text-success" : "text-muted-strong"
                }`}
              >
                <Icon name={a.human ? "users" : "robot"} size={11} />
              </span>
              <span className="text-[12px] font-mono text-text truncate">{a.name}</span>
            </div>
            <div className={`mt-1 pl-[30px] text-[11px] truncate ${workTone(a)}`} title={a.work || a.status}>
              {a.work || a.status}
            </div>
          </div>
        ))}
        {agents.length === 0 && (
          <p className="px-4 py-3 text-[11px] text-muted">No agents yet — queue an intent.</p>
        )}
      </div>

      <button
        onClick={onNext}
        className="mt-auto shrink-0 border-t border-border px-4 py-3 text-left text-[11px] text-muted hover:text-text transition-colors truncate"
        title={next || "Nothing queued"}
      >
        Next: {next || "nothing queued"}
      </button>
    </aside>
  );
}
