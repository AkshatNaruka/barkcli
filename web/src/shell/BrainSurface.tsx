import React, { Suspense, lazy, useState } from "react";
import { useRouteState, updateRouteState } from "../lib/hashnav";
import { Icon, type IconName } from "../components/Icon";
import { MemoryView } from "../components/MemoryView";
import { ContextView } from "../components/ContextView";

// React Flow is heavy — keep it out of the first paint.
const BrainView = lazy(() =>
  import("../components/BrainView").then((m) => ({ default: m.BrainView }))
);

type BrainTab = "graph" | "memory" | "context";

const TABS: Array<{ id: BrainTab; label: string; icon: IconName }> = [
  { id: "graph", label: "Graph", icon: "spark" },
  { id: "memory", label: "Memory", icon: "db" },
  { id: "context", label: "Context", icon: "doc" },
];

/**
 * Memory, context, and their relationships are one object. Three views, one
 * surface — no more "Mind", "Memory", "Context", and "Brain" as separate pages.
 */
export function BrainSurface({ boardName }: { boardName: string | null }) {
  const location = useRouteState();
  const tab: BrainTab = TABS.some((item) => item.id === location.tool) ? location.tool as BrainTab : "graph";
  const setTab = (next: BrainTab) => updateRouteState({ tool: next });

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 h-10 border-b border-border/70 shrink-0">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] transition-colors ${
                active ? "text-text bg-white/[0.05]" : "text-muted hover:text-text hover:bg-white/[0.03]"
              }`}
            >
              <Icon name={t.icon} size={13} className={active ? "text-accent-text" : ""} />
              {t.label}
              {active && <span className="absolute left-2 right-2 -bottom-[7px] h-[2px] rounded-full bg-accent" />}
            </button>
          );
        })}
        <span className="ml-auto text-[10px] font-mono text-muted/60 pr-1">
          {boardName || "default board"}
        </span>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {tab === "graph" && (
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center text-[12px] text-muted">
                Loading graph…
              </div>
            }
          >
            <BrainView boardName={boardName} />
          </Suspense>
        )}
        {tab === "memory" && <MemoryView boardName={boardName} />}
        {tab === "context" && <ContextView boardName={boardName} />}
      </div>
    </div>
  );
}
