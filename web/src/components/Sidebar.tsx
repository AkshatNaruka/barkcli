import React, { useState } from "react";
import type { Route } from "../lib/hashnav";
import { Icon, type IconName } from "./Icon";

interface NavItem {
  route: Route;
  label: string;
  icon: IconName;
}

// Two first-class groups, exactly as the control-center mock:
// MANAGE — the places you steer; BUILD — who is doing the work.
const MANAGE: NavItem[] = [
  { route: "mind", label: "Mind", icon: "spark" },
  { route: "board", label: "Board", icon: "board" },
  { route: "specs", label: "Specs", icon: "layers" },
];

const BUILD: NavItem[] = [
  { route: "agents", label: "Agents", icon: "users" },
];

const MORE: NavItem[] = [
  { route: "sprints", label: "Sprints", icon: "cycle" },
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

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-4 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted/70 select-none">
      {children}
    </div>
  );
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
        className={`relative w-full flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] transition-colors rounded-md ${
          active ? "text-text bg-white/[0.05] font-medium" : "text-muted hover:text-text hover:bg-white/[0.03]"
        }`}
      >
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-accent" />
        )}
        <span className={`shrink-0 flex ${active ? "text-accent" : ""}`}>
          <Icon name={item.icon} size={15} />
        </span>
        {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
        {!collapsed && badge > 0 && (
          <span
            className={`min-w-[18px] text-center text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-white/[0.04] shrink-0 ${
              item.route === "mind" ? "text-danger" : "text-muted"
            }`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`flex flex-col border-r border-border bg-surface/60 shrink-0 transition-all ${
        collapsed ? "w-14" : "w-[232px]"
      }`}
    >
      {/* Brand + collapse */}
      <div className="flex items-center justify-between px-3 py-3 shrink-0">
        {!collapsed && (
          <span className="flex items-center gap-2 text-sm font-semibold text-text">
            <span className="w-5 h-5 rounded-md bg-accent text-white flex items-center justify-center text-[10px] font-mono">
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
        <div className="px-3.5 pb-1 text-[11px] font-mono text-muted truncate">{boardName}</div>
      )}

      <nav className="flex-1 overflow-y-auto pb-2 px-1.5">
        {!collapsed && <GroupLabel>Manage</GroupLabel>}
        <div className="space-y-px">
          {MANAGE.map((item) => (
            <NavRow key={item.route} item={item} />
          ))}
        </div>

        {!collapsed && <GroupLabel>Build</GroupLabel>}
        <div className="space-y-px">
          {BUILD.map((item) => (
            <NavRow key={item.route} item={item} />
          ))}
        </div>

        {/* More — secondary tools behind one disclosure */}
        <div className="mt-3 border-t border-border/60 pt-1.5">
          <button
            onClick={() => setMoreOpen((m) => !m)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] rounded-md transition-colors ${
              showMore ? "text-muted" : "text-muted hover:text-text hover:bg-white/[0.03]"
            }`}
            title="More tools"
          >
            <span className="shrink-0 flex transition-transform" style={{ transform: showMore ? "rotate(90deg)" : "none" }}>
              <Icon name="chevR" size={15} />
            </span>
            {!collapsed && <span className="flex-1 text-left">More</span>}
          </button>
          {showMore && (
            <div className="pl-4 space-y-px">
              {MORE.map((item) => (
                <NavRow key={item.route} item={item} />
              ))}
            </div>
          )}
        </div>
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
