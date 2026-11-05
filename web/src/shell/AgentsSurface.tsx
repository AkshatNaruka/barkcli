import React from "react";
import { navigate, useRouteState } from "../lib/hashnav";
import { OrchestraWorkView } from "../components/OrchestraWorkView";
import { SprintView } from "../components/SprintView";
import { TeamView } from "../components/TeamView";
import type { Board, Card, Sprint } from "../lib/types";

type AgentsView = "team" | "orchestra" | "sprints";

const VIEWS: { id: AgentsView; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "orchestra", label: "Orchestration" },
  { id: "sprints", label: "Sprints" },
];

/**
 * One thin tab strip owns the surface's sub-views, so the rail stays global
 * and every Agents view keeps the same header rhythm.
 */
export function AgentsSurface({
  boardName,
  board,
  sprints,
  onSprintChanged,
  onEditCard,
}: {
  boardName: string | null;
  board: Board | null;
  sprints: Sprint[];
  onSprintChanged: () => void;
  onEditCard: (card: Card) => void;
}) {
  const location = useRouteState();
  const active = VIEWS.some((view) => view.id === location.tool)
    ? (location.tool as AgentsView)
    : "team";

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="surface-tabs" role="tablist" aria-label="Agent views">
        <span className="surface-tabs-label">Agents</span>
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={active === view.id}
            onClick={() => navigate("agents", { tool: view.id })}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {active === "team" && <TeamView boardName={boardName} />}
        {active === "orchestra" && <OrchestraWorkView boardName={boardName} board={board} />}
        {active === "sprints" && (
          <SprintView
            board={board}
            sprints={sprints}
            onSprintChanged={onSprintChanged}
            onEditCard={onEditCard}
          />
        )}
      </div>
    </div>
  );
}
