import React, { Suspense, lazy } from "react";
import { useRouteState } from "../lib/hashnav";
import { MemoryView } from "../components/MemoryView";
import { ContextView } from "../components/ContextView";

// React Flow is heavy — keep it out of the first paint.
const BrainView = lazy(() =>
  import("../components/BrainView").then((m) => ({ default: m.BrainView }))
);

type BrainViewId = "graph" | "memory" | "context";

const VIEWS: BrainViewId[] = ["graph", "memory", "context"];

/**
 * The left project rail owns Context & memory, Contribution graph, and
 * Project context. This surface renders the selected view directly.
 */
export function BrainSurface({ boardName }: { boardName: string | null }) {
  const location = useRouteState();
  const view: BrainViewId = VIEWS.includes(location.tool as BrainViewId)
    ? (location.tool as BrainViewId)
    : "graph";

  return (
    <div className="h-full min-h-0 overflow-hidden">
      {view === "graph" && (
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center text-[12px] text-muted">
              Loading graph…
            </div>
          }
        >
          <BrainView boardName={boardName} initialMode="contributions" />
        </Suspense>
      )}
      {view === "memory" && <MemoryView boardName={boardName} />}
      {view === "context" && <ContextView boardName={boardName} />}
    </div>
  );
}
