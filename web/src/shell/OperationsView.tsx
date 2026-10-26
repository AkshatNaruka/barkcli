import React, { useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { ContextView } from "../components/ContextView";
import { CodeView } from "../components/CodeView";
import { TimelineView } from "../components/TimelineView";
import { SpecsView } from "../components/SpecsView";
import { CalendarView } from "../components/CalendarView";
import { ReportsView } from "../components/ReportsView";
import { AgentPromptView } from "../components/AgentPromptView";
import { DocsView } from "../components/DocsView";
import { SettingsView } from "../components/SettingsView";
import { rawHashRoute } from "../lib/hashnav";
import { operationsTabFromLegacy } from "../lib/surfaces";
import type { Board, Card, Sprint } from "../lib/types";

type OpTab =
  | "workspace"
  | "code"
  | "timeline"
  | "specs"
  | "calendar"
  | "reports"
  | "agent"
  | "docs"
  | "settings";

const TABS: Array<{ id: OpTab; label: string; icon: IconName }> = [
  { id: "workspace", label: "Workspace", icon: "layers" },
  { id: "code", label: "Code", icon: "code" },
  { id: "timeline", label: "Timeline", icon: "clock" },
  { id: "specs", label: "Specs", icon: "doc" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "reports", label: "Reports", icon: "chart" },
  { id: "agent", label: "Agent API", icon: "robot" },
  { id: "docs", label: "Docs", icon: "doc" },
  { id: "settings", label: "Settings", icon: "gear" },
];

function initialTab(): OpTab {
  const legacy = operationsTabFromLegacy(rawHashRoute());
  if (legacy && TABS.some((t) => t.id === legacy)) return legacy as OpTab;
  return "workspace";
}

/**
 * One surface for everything hands-on: files/IDE, code map, timeline, specs,
 * calendar, reports, the agent contract, docs, and settings. Old routes land
 * on the matching tab instead of a page.
 */
export function OperationsView({
  board,
  boardName,
  sprints,
  onOpenFile,
  onEditCard,
  onAddCard,
  onSaveBoard,
}: {
  board: Board | null;
  boardName: string | null;
  sprints: Sprint[];
  onOpenFile: (path: string, line?: number) => void;
  onEditCard: (card: Card) => void;
  onAddCard: (date: string) => void;
  onSaveBoard: (b: Board) => void;
}) {
  const [tab, setTab] = useState<OpTab>(initialTab);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 h-10 border-b border-border/70 shrink-0 overflow-x-auto">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] transition-colors ${
                active
                  ? "text-text bg-white/[0.05]"
                  : "text-muted hover:text-text hover:bg-white/[0.03]"
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
        {tab === "workspace" && <ContextView boardName={boardName} />}
        {tab === "code" && board && (
          <CodeView board={board} onOpenFile={onOpenFile} onEditCard={onEditCard} />
        )}
        {tab === "timeline" && <TimelineView boardName={boardName} />}
        {tab === "specs" && <SpecsView boardName={boardName} />}
        {tab === "calendar" && board && (
          <CalendarView board={board} sprints={sprints} onEditCard={onEditCard} onAddCard={onAddCard} />
        )}
        {tab === "reports" && board && <ReportsView board={board} sprints={sprints} />}
        {tab === "agent" && <AgentPromptView />}
        {tab === "docs" && <DocsView />}
        {tab === "settings" && board && <SettingsView board={board} onSaveBoard={onSaveBoard} />}
        {tab === "code" && !board && <Empty label="Board not loaded" />}
        {tab === "reports" && !board && <Empty label="Board not loaded" />}
        {tab === "calendar" && !board && <Empty label="Board not loaded" />}
        {tab === "settings" && !board && <Empty label="Board not loaded" />}
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="h-full flex items-center justify-center text-[12px] text-muted">{label}</div>;
}
