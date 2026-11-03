import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PROJECT_TOOLS } from "../lib/commands";
import { parseRouteState, routeHash } from "../lib/hashnav";
import { AgentsSurface } from "./AgentsSurface";
import { BrainSurface } from "./BrainSurface";
import { OperationsView } from "./OperationsView";

vi.mock("../components/TeamView", () => ({ TeamView: () => <h1>Agents renderer</h1> }));
vi.mock("../components/OrchestraWorkView", () => ({ OrchestraWorkView: () => <h1>Orchestration renderer</h1> }));
vi.mock("../components/SprintView", () => ({ SprintView: () => <h1>Sprints renderer</h1> }));
vi.mock("../components/MemoryView", () => ({ MemoryView: () => <h1>Memory renderer</h1> }));
vi.mock("../components/ContextView", () => ({ ContextView: () => <h1>Context renderer</h1> }));
vi.mock("../components/BrainView", () => ({ BrainView: ({ initialMode }: { initialMode: string }) => <h1>{initialMode} renderer</h1> }));
vi.mock("../components/RulesView", () => ({ RulesView: () => <h1>rules renderer</h1> }));
vi.mock("../components/AutomationsView", () => ({ AutomationsView: () => <h1>automations renderer</h1> }));
vi.mock("../components/WorkspaceView", () => ({ WorkspaceView: () => <h1>workspace renderer</h1> }));
vi.mock("../components/ShipView", () => ({ ShipView: () => <h1>ship renderer</h1> }));
vi.mock("../components/CodeView", () => ({ CodeView: () => <h1>code renderer</h1> }));
vi.mock("../components/TimelineView", () => ({ TimelineView: () => <h1>timeline renderer</h1> }));
vi.mock("../components/SpecsView", () => ({ SpecsView: () => <h1>specs renderer</h1> }));
vi.mock("../components/CalendarView", () => ({ CalendarView: () => <h1>calendar renderer</h1> }));
vi.mock("../components/ReportsView", () => ({ ReportsView: () => <h1>reports renderer</h1> }));
vi.mock("../components/AgentPromptView", () => ({ AgentPromptView: () => <h1>agent renderer</h1> }));
vi.mock("../components/UsageView", () => ({ UsageView: () => <h1>usage renderer</h1> }));

describe("sidebar destinations", () => {
  it.each(PROJECT_TOOLS)("round-trips $label without losing its selected tool", ({ destination }) => {
    expect(parseRouteState(routeHash(destination))).toEqual(destination);
  });

  it.each([["team", "Agents"], ["orchestra", "Orchestration"], ["sprints", "Sprints"]])(
    "renders the distinct agents/%s surface", (tool, expected) => {
      window.location.hash = `#/agents?tool=${tool}`;
      render(<AgentsSurface boardName="dev" board={null} sprints={[]} onSprintChanged={() => {}} onEditCard={() => {}} />);
      expect(screen.getByRole("heading", { name: `${expected} renderer` })).toBeInTheDocument();
    }
  );

  it.each([["memory", "Memory"], ["context", "Context"], ["graph", "contributions"]])(
    "renders the distinct brain/%s surface", async (tool, expected) => {
      window.location.hash = `#/brain?tool=${tool}`;
      render(<BrainSurface boardName="dev" />);
      expect(await screen.findByRole("heading", { name: `${expected} renderer` })).toBeInTheDocument();
    }
  );

  it.each(PROJECT_TOOLS.filter((tool) => tool.destination.route === "operations"))(
    "renders $label without falling back to Workspace", ({ destination }) => {
      window.location.hash = routeHash(destination);
      render(<OperationsView board={{ cards: [] } as any} boardName="dev" sprints={[]}
        onOpenFile={() => {}} onEditCard={() => {}} onAddCard={() => {}} onSaveBoard={() => {}}
        onNewIntent={() => {}} onOpenBoard={() => {}} onOpenBrain={() => {}} />);
      expect(screen.getByRole("heading", { name: `${destination.tool} renderer` })).toBeInTheDocument();
    }
  );
});
