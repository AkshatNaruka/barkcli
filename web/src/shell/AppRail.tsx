import React from "react";
import { Icon } from "../components/Icon";
import { SURFACES, type Surface } from "../lib/surfaces";

export interface RailCounts {
  chat: number;
  board: number;
  agents: number;
}

/**
 * 64px icon rail. No sections, no disclosure, no labels until you hover.
 * The app has seven surfaces; the rail shows exactly those.
 */
export function AppRail({
  surface,
  onNavigate,
  counts,
}: {
  surface: Surface;
  onNavigate: (s: Surface) => void;
  counts: RailCounts;
}) {
  const badge = (id: Surface) => {
    if (id === "chat") return counts.chat;
    if (id === "board") return counts.board;
    if (id === "agents") return counts.agents;
    return 0;
  };

  return (
    <aside className="w-[64px] shrink-0 flex flex-col items-center bg-bg border-r border-border/80 py-3 gap-1 select-none">
      <button
        onClick={() => onNavigate("chat")}
        title="barkcli"
        className="group relative w-9 h-9 rounded-[10px] bg-accent text-white flex items-center justify-center font-mono text-[15px] font-semibold mb-2 shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset]"
      >
        b
        <span className="absolute inset-0 rounded-[10px] ring-1 ring-white/10" />
      </button>

      <div className="w-6 h-px bg-border/70 mb-2" />

      {SURFACES.map((s) => {
        const active = surface === s.id;
        const n = badge(s.id);
        return (
          <button
            key={s.id}
            onClick={() => onNavigate(s.id)}
            title={`${s.label} — ${s.hint} (${s.key})`}
            className={`group relative w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors ${
              active
                ? "bg-accent-soft text-accent-text"
                : "text-muted hover:text-text hover:bg-white/[0.04]"
            }`}
          >
            {active && (
              <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full bg-accent" />
            )}
            <Icon name={s.icon} size={18} />
            {n > 0 && (
              <span
                className={`absolute top-1.5 right-1.5 min-w-[14px] h-[14px] px-[3px] rounded-full text-[9px] font-mono leading-[14px] text-center ${
                  s.id === "agents"
                    ? "bg-success/20 text-success"
                    : s.id === "chat"
                      ? "bg-warning/20 text-warning"
                      : "bg-white/[0.07] text-muted-strong"
                }`}
              >
                {n > 99 ? "99" : n}
              </span>
            )}
            <span className="pointer-events-none absolute left-[52px] z-50 hidden group-hover:flex items-center gap-2 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-text shadow-xl">
              {s.label}
              <kbd className="text-[9px] font-mono text-muted border border-border rounded px-1">
                {s.key}
              </kbd>
            </span>
          </button>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1">
        <span className="w-6 h-px bg-border/70 mb-1" />
        <button
          onClick={() => onNavigate("operations")}
          title="Settings (Operations)"
          className="w-10 h-10 rounded-[10px] flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.04] transition-colors"
        >
          <Icon name="gear" size={17} />
        </button>
      </div>
    </aside>
  );
}
