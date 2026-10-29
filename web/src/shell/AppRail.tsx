import React from "react";
import { Icon } from "../components/Icon";
import { SURFACES, type Surface } from "../lib/surfaces";
import { useTheme } from "../lib/theme";

export interface RailCounts {
  chat: number;
  board: number;
  agents: number;
}

/**
 * The rail is the app's spine. It can be icons-only (default) or labelled,
 * and users can reorder/hide surfaces from Appearance. Digit shortcuts follow
 * the visible order, so the rail and keyboard never disagree.
 */
export function AppRail({
  surface,
  onNavigate,
  onCustomize,
  counts,
  projectName,
}: {
  surface: Surface;
  onNavigate: (s: Surface) => void;
  onCustomize: () => void;
  counts: RailCounts;
  projectName?: string | null;
}) {
  const { railStyle, railOrder, hidden } = useTheme();
  const labels = railStyle === "labels";

  const items = railOrder
    .map((id) => SURFACES.find((s) => s.id === id))
    .filter((s): s is (typeof SURFACES)[number] => Boolean(s) && !hidden.includes(s!.id));

  const badge = (id: Surface) => {
    if (id === "chat") return counts.chat;
    if (id === "board") return counts.board;
    if (id === "agents") return counts.agents;
    return 0;
  };

  const badgeTone = (id: Surface) =>
    id === "agents"
      ? "bg-success/20 text-success"
      : id === "chat"
        ? "bg-warning/20 text-warning"
        : "bg-white/[0.07] text-muted-strong";

  return (
    <aside
      className={`shrink-0 flex flex-col bg-bg border-r border-border/80 py-3 gap-1 select-none transition-[width] duration-150 ${
        labels ? "w-[188px] px-2 items-stretch" : "w-[56px] items-center"
      }`}
    >
      <button
        onClick={() => onNavigate("chat")}
        title={projectName ? `${projectName} — barkcli` : "barkcli"}
        className={`group relative rounded-[10px] bg-accent text-white flex items-center font-mono text-[15px] font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset] ${
          labels ? "h-9 px-2.5 gap-2.5 justify-start" : "w-9 h-9 justify-center mb-2"
        }`}
      >
        <span className="w-[22px] text-center">b</span>
        {labels && (
          <span className="text-[12.5px] font-sans font-medium tracking-tight">barkcli</span>
        )}
        <span className="absolute inset-0 rounded-[10px] ring-1 ring-white/10" />
      </button>

      <div className={`h-px bg-border/70 ${labels ? "my-2 mx-1" : "w-6 mb-2"}`} />

      {items.map((s, index) => {
        const active = surface === s.id;
        const n = badge(s.id);
        return (
          <button
            key={s.id}
            onClick={() => onNavigate(s.id)}
            title={`${s.label} — ${s.hint} (${index + 1})`}
            aria-current={active ? "page" : undefined}
            aria-label={s.label}
            className={`group relative rounded-[10px] flex items-center transition-colors ${
              labels
                ? `h-9 px-2.5 gap-2.5 justify-start ${active ? "bg-accent-soft text-accent-text" : "text-muted hover:text-text hover:bg-white/[0.04]"}`
                : `w-10 h-10 justify-center ${active ? "bg-accent-soft text-accent-text" : "text-muted hover:text-text hover:bg-white/[0.04]"}`
            }`}
          >
            {active && (
              <span
                className={`absolute top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full bg-accent ${
                  labels ? "left-0" : "-left-2"
                }`}
              />
            )}
            <Icon name={s.icon} size={18} />
            {labels && <span className="text-[12px] flex-1 text-left">{s.label}</span>}
            {n > 0 &&
              (labels ? (
                <span className={`min-w-[17px] h-[16px] px-1 rounded-full text-[9px] font-mono leading-[16px] text-center ${badgeTone(s.id)}`}>
                  {n > 99 ? "99" : n}
                </span>
              ) : (
                <span
                  className={`absolute top-1.5 right-1.5 min-w-[14px] h-[14px] px-[3px] rounded-full text-[9px] font-mono leading-[14px] text-center ${badgeTone(s.id)}`}
                >
                  {n > 99 ? "99" : n}
                </span>
              ))}
            {!labels && (
              <span className="pointer-events-none absolute left-[48px] z-50 hidden group-hover:flex items-center gap-2 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-text shadow-xl">
                {s.label}
                <kbd className="text-[9px] font-mono text-muted border border-border rounded px-1">
                  {index + 1}
                </kbd>
              </span>
            )}
          </button>
        );
      })}

      <div className={`mt-auto flex flex-col gap-1 ${labels ? "" : "items-center"}`}>
        <span className={`h-px bg-border/70 mb-1 ${labels ? "mx-1" : "w-6"}`} />
        <button
          onClick={onCustomize}
          title="Appearance (⌘,)"
          className={`rounded-[10px] flex items-center text-muted hover:text-text hover:bg-white/[0.04] transition-colors ${
            labels ? "h-9 px-2.5 gap-2.5 justify-start" : "w-10 h-10 justify-center"
          }`}
        >
          <Icon name="palette" size={17} />
          {labels && <span className="text-[12px] flex-1 text-left">Appearance</span>}
          {labels && <kbd className="text-[9px] font-mono text-muted/60">⌘,</kbd>}
        </button>
        <button
          onClick={() => onNavigate("operations")}
          title="Settings (Operations)"
          className={`rounded-[10px] flex items-center text-muted hover:text-text hover:bg-white/[0.04] transition-colors ${
            labels ? "h-9 px-2.5 gap-2.5 justify-start" : "w-10 h-10 justify-center"
          }`}
        >
          <Icon name="gear" size={17} />
          {labels && <span className="text-[12px] flex-1 text-left">Settings</span>}
        </button>
      </div>
    </aside>
  );
}
