import React, { useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { navigate, type Route } from "../lib/hashnav";
import { PaneResizeHandle } from "../components/PaneResizeHandle";
import { readLocal, writeLocal } from "../lib/drafts";

interface ProjectTool {
  route: Route;
  label: string;
  icon: IconName;
  count?: number;
}

/**
 * The project's own sidebar. Project tools are per-project, so they get a
 * labelled list next to the activity rail — the top bar is reserved for the
 * project switcher and its repository controls.
 */
export function ProjectToolsSidebar({
  currentRoute,
  cardsCount = 0,
  agentsCount = 0,
}: {
  currentRoute: Route;
  cardsCount?: number;
  agentsCount?: number;
}) {
  const [width, setWidth] = useState(() => {
    const saved = Number(readLocal("bark:project-tools-width"));
    return Math.min(320, Math.max(160, saved || 186));
  });

  const handleWidthChange = (next: number) => {
    const clamped = Math.min(320, Math.max(160, next));
    setWidth(clamped);
    writeLocal("bark:project-tools-width", String(clamped));
  };

  const tools: ProjectTool[] = [
    { route: "hub", label: "Overview", icon: "grid" },
    { route: "board", label: "Board", icon: "board", count: cardsCount },
    { route: "agents", label: "Agents", icon: "users", count: agentsCount },
    { route: "brain", label: "Brain (3D)", icon: "spark" },
    { route: "skills", label: "Skills", icon: "star" },
    { route: "history", label: "History", icon: "history" },
    { route: "operations", label: "Operations", icon: "code" },
  ];

  return (
    <nav className="project-tools-nav relative" aria-label="Project tools" style={{ width }}>
      <p className="project-tools-nav-label">Project tools</p>
      {tools.map((tool) => {
        const active = currentRoute === tool.route;
        return (
          <button
            key={tool.route}
            type="button"
            aria-current={active ? "page" : undefined}
            className={`project-tools-item ${active ? "is-active" : ""}`}
            onClick={() => navigate(tool.route)}
          >
            <Icon name={tool.icon} size={14} />
            <span>{tool.label}</span>
            {tool.count ? <em>{tool.count}</em> : null}
          </button>
        );
      })}
      <PaneResizeHandle
        label="Project tools sidebar width"
        width={width}
        min={160}
        max={320}
        onChange={handleWidthChange}
        onReset={() => handleWidthChange(186)}
      />
    </nav>
  );
}
