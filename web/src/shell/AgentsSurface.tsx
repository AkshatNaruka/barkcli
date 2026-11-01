import React from "react";
import { useRouteState } from "../lib/hashnav";
import { OrchestraWorkView } from "../components/OrchestraWorkView";
import { SprintView } from "../components/SprintView";
import { TeamView } from "../components/TeamView";
import type { Board, Card, Sprint } from "../lib/types";

type AgentsView = "team" | "orchestra" | "sprints";

const VIEWS: AgentsView[] = ["team", "orchestra", "sprints"];

/**
 * The left project rail owns navigation between Team, Orchestration, and
 * Sprints. This surface renders the selected view without repeating that
 * navigation as a top tab strip.
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
  const view: AgentsView = VIEWS.includes(location.tool as AgentsView)
    ? (location.tool as AgentsView)
    : "team";

  return (
    <div className="h-full min-h-0 overflow-hidden">
      {view === "team" && <TeamView boardName={boardName} />}
      {view === "orchestra" && <OrchestraWorkView boardName={boardName} board={board} />}
      {view === "sprints" && (
        <SprintView
          board={board}
          sprints={sprints}
          onSprintChanged={onSprintChanged}
          onEditCard={onEditCard}
        />
      )}
    </div>
  );
}
