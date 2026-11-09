import React, { Suspense, lazy } from "react";
import { navigate, useRouteState } from "../lib/hashnav";
import { MemoryView } from "../components/MemoryView";
import { ContextView } from "../components/ContextView";

// React Flow is heavy — keep it out of the first paint.
const BrainView = lazy(() =>
  import("../components/BrainView").then((m) => ({ default: m.BrainView }))
);

type BrainViewId = "graph" | "memory" | "context";

const VIEWS: { id: BrainViewId; label: string }[] = [
  { id: "graph", label: "Contribution Graph" },
  { id: "memory", label: "Context & Memory" },
  { id: "context", label: "Project Context" },
];

/**
 * Memory, the contribution graph, and the living context file are three views
 * of the same brain. One tab strip keeps them discoverable from the rail.
 */
export function BrainSurface({ boardName }: { boardName: string | null }) {
  const location = useRouteState();
  const active = VIEWS.some((view) => view.id === location.tool)
    ? (location.tool as BrainViewId)
    : "graph";

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="surface-tabs" role="tablist" aria-label="Brain views">
        <span className="surface-tabs-label">Brain</span>
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={active === view.id}
            onClick={() => navigate("brain", { tool: view.id })}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {active === "graph" && (
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center text-[12px] text-muted">
                Loading graph…
              </div>
            }
          >
            <BrainView boardName={boardName} initialMode="3d" />
          </Suspense>
        )}
        {active === "memory" && <MemoryView boardName={boardName} />}
        {active === "context" && <ContextView boardName={boardName} />}
      </div>
    </div>
  );
}
