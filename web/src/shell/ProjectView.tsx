import React, { useState, Suspense, lazy } from "react";
import type { Board, Card } from "../lib/types";
import { SpecsView } from "../components/SpecsView";
import { ContextView } from "../components/ContextView";
import { MemoryView } from "../components/MemoryView";
const BrainView = lazy(() =>
  import("../components/BrainView").then((m) => ({ default: m.BrainView }))
);
import { SkillsView } from "../components/SkillsView";
import { CodeView } from "../components/CodeView";
import { DocsView } from "../components/DocsView";

interface ProjectViewProps {
  boardName: string | null;
  board: Board | null;
  initialTab?: "specs" | "context" | "memory" | "brain" | "skills" | "code" | "docs";
  onOpenFile?: (path: string, line?: number) => void;
  onEditCard?: (card: Card) => void;
}

export function ProjectView({
  boardName,
  board,
  initialTab = "specs",
  onOpenFile,
  onEditCard,
}: ProjectViewProps) {
  const [tab, setTab] = useState<
    "specs" | "context" | "memory" | "brain" | "skills" | "code" | "docs"
  >(initialTab);

  const tabs: Array<{
    id: "specs" | "context" | "memory" | "brain" | "skills" | "code" | "docs";
    label: string;
  }> = [
    { id: "specs", label: "Specs" },
    { id: "context", label: "Context" },
    { id: "memory", label: "Memory" },
    { id: "brain", label: "Brain" },
    { id: "skills", label: "Skills" },
    { id: "code", label: "Code" },
    { id: "docs", label: "Docs" },
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
        {tab === "specs" && <SpecsView boardName={boardName} />}
        {tab === "context" && <ContextView boardName={boardName} />}
        {tab === "memory" && <MemoryView boardName={boardName} />}
        {tab === "brain" && (
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center text-sm text-muted">
                Loading graph...
              </div>
            }
          >
            <BrainView boardName={boardName} />
          </Suspense>
        )}
        {tab === "skills" && <SkillsView />}
        {tab === "code" && board && (
          <CodeView
            board={board}
            onOpenFile={onOpenFile || (() => {})}
            onEditCard={onEditCard || (() => {})}
          />
        )}
        {tab === "docs" && <DocsView />}
      </div>
    </div>
  );
}
