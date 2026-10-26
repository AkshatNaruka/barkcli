import React, { useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { OrchestrateView } from "../components/OrchestrateView";
import { SprintView } from "../components/SprintView";
import type { Board, Card, Sprint } from "../lib/types";

type AgentsTab = "orchestra" | "sprints";

const TABS: Array<{ id: AgentsTab; label: string; icon: IconName }> = [
  { id: "orchestra", label: "Orchestra", icon: "users" },
  { id: "sprints", label: "Sprints", icon: "cycle" },
];

/**
 * Agents and their work are one surface: the live orchestra, and the sprint
 * tree the work rolls up into.
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
  const [tab, setTab] = useState<AgentsTab>("orchestra");

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
      </div>
      <div className="flex-1 overflow-hidden min-h-0">
        {tab === "orchestra" && <OrchestrateView boardName={boardName} />}
        {tab === "sprints" && (
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
