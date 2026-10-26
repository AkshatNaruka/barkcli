import React, { useState } from "react";
import type { Board, Sprint } from "../lib/types";
import { ReportsView } from "../components/ReportsView";
import { TimelineView } from "../components/TimelineView";
import { HistoryView } from "../components/HistoryView";

interface InsightsViewProps {
  boardName: string | null;
  board: Board | null;
  sprints: Sprint[];
  initialTab?: "reports" | "timeline" | "history";
}

export function InsightsView({
  boardName,
  board,
  sprints,
  initialTab = "reports",
}: InsightsViewProps) {
  const [tab, setTab] = useState<"reports" | "timeline" | "history">(initialTab);

  const tabs: Array<{
    id: "reports" | "timeline" | "history";
    label: string;
  }> = [
    { id: "reports", label: "Reports" },
    { id: "timeline", label: "Timeline" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-bg overflow-hidden">
      {/* Subnavigation Bar */}
      <div className="px-4 py-2 border-b border-border bg-surface flex items-center gap-1 shrink-0 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-white/[0.08] text-text"
                : "text-muted hover:text-text hover:bg-white/[0.02]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "reports" && board && (
          <ReportsView board={board} sprints={sprints} />
        )}
        {tab === "timeline" && <TimelineView boardName={boardName} />}
        {tab === "history" && <HistoryView boardName={boardName} />}
      </div>
    </div>
  );
}
