import React from "react";
import { navigate, useRouteState } from "../lib/hashnav";
import { OrchestraWorkView } from "../components/OrchestraWorkView";
import { SprintView } from "../components/SprintView";
import { TeamView } from "../components/TeamView";
import { RulesView } from "../components/RulesView";
import { AgentPromptView } from "../components/AgentPromptView";
import type { Board, Card, Sprint } from "../lib/types";

type AgentsView = "team" | "orchestra" | "rules" | "agent" | "sprints";

const VIEWS: { id: AgentsView; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "orchestra", label: "Orchestration" },
  { id: "rules", label: "Rules" },
  { id: "agent", label: "Agent API" },
  { id: "sprints", label: "Sprints" },
];

/**
 * One thin tab strip owns the surface's sub-views, so the rail stays global
 * and every Agents view keeps the same header rhythm.
 */
export function AgentsSurface({
  boardName,
  projectName,
  projectRoot,
  board,
  sprints,
  onSprintChanged,
  onEditCard,
}: {
  boardName: string | null;
  projectName?: string | null;
  projectRoot?: string | null;
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
        {active === "rules" && <RulesView boardName={boardName} projectName={projectName} />}
        {active === "agent" && (
          <AgentPromptView
            projectName={projectName}
            boardName={boardName}
            projectRoot={projectRoot}
          />
        )}
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
