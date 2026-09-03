import React, { useState } from "react";
import type { Route } from "../lib/hashnav";

interface Section {
  label: string;
  items: { route: Route; label: string; icon: string }[];
}

const SECTIONS: Section[] = [
  {
    label: "Manage",
    items: [
      { route: "mind", label: "Mind", icon: "◉" },
      { route: "board", label: "Board", icon: "▦" },
      { route: "specs", label: "Specs", icon: "◈" },
      { route: "sprints", label: "Sprints", icon: "◑" },
    ],
  },
  {
    label: "Build",
    items: [
      { route: "code", label: "Code", icon: "⌨" },
      { route: "agents", label: "Agents", icon: "⚙" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { route: "memory", label: "Memory", icon: "🧠" },
      { route: "skills", label: "Skills", icon: "✦" },
      { route: "docs", label: "Docs", icon: "📄" },
    ],
  },
  {
    label: "Insights",
    items: [
      { route: "calendar", label: "Calendar", icon: "📅" },
      { route: "reports", label: "Reports", icon: "📊" },
      { route: "timeline", label: "Timeline", icon: "🕒" },
      { route: "activity", label: "Activity", icon: "🧾" },
    ],
  },
];

const UTILITY: { route: Route; label: string; icon: string }[] = [
  { route: "settings", label: "Settings", icon: "⚙️" },
  { route: "agent-prompt", label: "AI Agent", icon: "🤖" },
];

export interface SidebarCounts {
  boardOpen: number;
  blockers: number;
  agentsActive: number;
}

export function Sidebar({
  route,
  onNavigate,
  counts,
  boardName,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  counts: SidebarCounts;
  boardName: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const badgeFor = (r: Route): number => {
    if (r === "board") return counts.boardOpen;
    if (r === "mind") return counts.blockers;
    if (r === "agents") return counts.agentsActive;
    return 0;
  };

  const isActive = (r: Route) =>
    route === r || (r === "agents" && route === "orchestrate") || (r === "mind" && route === "dashboard");

  return (
    <aside
      className={`flex flex-col border-r border-border bg-surface/40 shrink-0 transition-all ${
        collapsed ? "w-14" : "w-[232px]"
      }`}
    >
      {/* Brand + collapse */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        {!collapsed && (
          <span className="flex items-center gap-1.5 text-sm font-bold text-text">
            <span className="w-5 h-5 rounded bg-accent text-white flex items-center justify-center text-[10px] font-mono">b</span>
            barkcli
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-muted hover:text-text text-xs px-1.5 py-1 rounded hover:bg-surface"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      {/* Board context */}
      {!collapsed && boardName && (
        <div className="px-3 py-2 border-b border-border shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted">Board</div>
          <div className="text-xs font-medium text-text truncate font-mono">{boardName}.board</div>
        </div>
      )}

      {/* Sections — independent scroll */}
      <nav className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map((sec) => (
          <div key={sec.label} className="mb-1">
            {!collapsed && (
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted">{sec.label}</div>
            )}
            {sec.items.map((item) => {
              const badge = badgeFor(item.route);
              const active = isActive(item.route);
              return (
                <button
                  key={item.route}
                  onClick={() => onNavigate(item.route)}
                  title={item.label}
                  className={`w-full flex items-center gap-2.5 px-3 py-[7px] text-[13px] transition-colors ${
                    active
                      ? "text-text bg-card border-l-2 border-accent font-medium"
                      : "text-muted hover:text-text hover:bg-surface border-l-2 border-transparent"
                  }`}
                >
                  <span className="w-4 text-center shrink-0 text-xs">{item.icon}</span>
                  {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
                  {!collapsed && badge > 0 && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0 ${
                        item.route === "mind"
                          ? "text-danger bg-danger-soft"
                          : "text-muted bg-card border border-border"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Utility pinned bottom */}
      <div className="border-t border-border py-2 shrink-0">
        {UTILITY.map((item) => (
          <button
            key={item.route}
            onClick={() => onNavigate(item.route)}
            title={item.label}
            className={`w-full flex items-center gap-2.5 px-3 py-[7px] text-[13px] transition-colors ${
              isActive(item.route)
                ? "text-text bg-card border-l-2 border-accent font-medium"
                : "text-muted hover:text-text hover:bg-surface border-l-2 border-transparent"
            }`}
          >
            <span className="w-4 text-center shrink-0 text-xs">{item.icon}</span>
            {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
          </button>
        ))}
      </div>
    </aside>
  );
}
