import React, { useState } from "react";
import type { Route } from "../lib/hashnav";
import { Icon, type IconName } from "./Icon";

interface NavItem {
  route: Route;
  label: string;
  icon: IconName;
}

// Notion's sidebar skeleton: ≤7 first-class places; everything else lives in
// one quiet "More" disclosure so the nav recedes and content leads (Linear 2026).
const PRIMARY: NavItem[] = [
  { route: "board", label: "Board", icon: "board" },
  { route: "mind", label: "Mind", icon: "spark" },
  { route: "specs", label: "Specs", icon: "layers" },
  { route: "sprints", label: "Sprints", icon: "cycle" },
  { route: "agents", label: "Agents", icon: "users" },
];

const MORE: NavItem[] = [
  { route: "code", label: "Code", icon: "code" },
  { route: "context", label: "Context", icon: "doc" },
  { route: "memory", label: "Memory", icon: "db" },
  { route: "brain", label: "Brain", icon: "spark" },
  { route: "skills", label: "Skills", icon: "star" },
  { route: "docs", label: "Docs", icon: "doc" },
  { route: "calendar", label: "Calendar", icon: "calendar" },
  { route: "reports", label: "Reports", icon: "chart" },
  { route: "timeline", label: "Timeline", icon: "clock" },
  { route: "history", label: "History", icon: "layers" },
  { route: "activity", label: "Activity", icon: "pulse" },
];

const UTILITY: NavItem[] = [
  { route: "settings", label: "Settings", icon: "gear" },
  { route: "agent-prompt", label: "AI Agent", icon: "robot" },
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((m) => m.route === route) || route === "orchestrate" || route === "dashboard";
  const showMore = moreOpen || moreActive;

  const badgeFor = (r: Route): number => {
    if (r === "board") return counts.boardOpen;
    if (r === "mind") return counts.blockers;
    if (r === "agents") return counts.agentsActive;
    return 0;
  };

  const isActive = (r: Route) =>
    route === r || (r === "agents" && route === "orchestrate") || (r === "mind" && route === "dashboard");

  const NavRow = ({ item }: { item: NavItem }) => {
    const badge = badgeFor(item.route);
    const active = isActive(item.route);
    return (
      <button
        key={item.route}
        onClick={() => onNavigate(item.route)}
        title={item.label}
        className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] transition-colors rounded-md ${
          active ? "text-text bg-card font-medium" : "text-muted hover:text-text hover:bg-surface"
        }`}
      >
        <span className="shrink-0 flex">
          <Icon name={item.icon} size={15} />
        </span>
        {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
        {!collapsed && badge > 0 && (
          <span
            className={`text-[10px] shrink-0 ${item.route === "mind" ? "text-danger" : "text-muted"}`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`flex flex-col border-r border-border bg-surface/40 shrink-0 transition-all ${
        collapsed ? "w-14" : "w-[224px]"
      }`}
    >
      {/* Brand + collapse */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
        {!collapsed && (
          <span className="flex items-center gap-1.5 text-sm font-bold text-text">
            <span className="w-5 h-5 rounded bg-accent text-white flex items-center justify-center text-[10px] font-mono">
              b
            </span>
            barkcli
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-muted hover:text-text p-1.5 rounded hover:bg-surface flex"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon name={collapsed ? "chevR" : "chevL"} size={14} />
        </button>
      </div>

      {/* Active board context — one quiet line */}
      {!collapsed && boardName && (
        <div className="px-3.5 pb-2 text-xs font-mono text-muted truncate">{boardName}</div>
      )}

      {/* Primary places */}
      <nav className="flex-1 overflow-y-auto py-1 px-1.5">
        {PRIMARY.map((item) => (
          <NavRow key={item.route} item={item} />
        ))}

        {/* More — secondary tools behind one disclosure */}
        <button
          onClick={() => setMoreOpen((m) => !m)}
          className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] rounded-md transition-colors ${
            showMore ? "text-muted" : "text-muted hover:text-text hover:bg-surface"
          }`}
          title="More tools"
        >
          <span className="shrink-0 flex transition-transform" style={{ transform: showMore ? "rotate(90deg)" : "none" }}>
            <Icon name="chevR" size={15} />
          </span>
          {!collapsed && <span className="flex-1 text-left">More</span>}
        </button>
        {showMore &&
          MORE.map((item) => (
            <div key={item.route} className="pl-5">
              <NavRow item={item} />
            </div>
          ))}
      </nav>

      {/* Utility pinned bottom */}
      <div className="border-t border-border py-2 px-1.5 shrink-0">
        {UTILITY.map((item) => (
          <NavRow key={item.route} item={item} />
        ))}
      </div>
    </aside>
  );
}
