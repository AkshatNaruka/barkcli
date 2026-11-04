import { useSyncExternalStore } from "react";
import { PROJECT_TOOLS } from "./commands";
import type { IconName } from "../components/Icon";
import type { Route } from "./hashnav";
import { readLocal, writeLocal } from "./drafts";
import { isDesktop, loadSidebarLayout, saveSidebarLayout } from "./desktop";

/**
 * The project tool rail is user-arrangeable. The layout stores only ids, so
 * labels, icons, and destinations always come from the live command registry.
 * New tools added to PROJECT_TOOLS appear in their default group on the next
 * load without a migration.
 */
export interface SidebarTool {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  route: Route;
  tool?: string;
  /** Default group id used when a layout has not placed the tool yet. */
  group: string;
}

export interface SidebarGroup {
  id: string;
  label: string;
  items: string[];
}

export interface SidebarLayout {
  version: 1;
  groups: SidebarGroup[];
  hidden: string[];
}

export const SIDEBAR_LAYOUT_KEY = "bark:sidebar-layout:v1";

export const DEFAULT_GROUP_IDS = ["build", "plan", "agents", "knowledge", "delivery"] as const;

const GROUP_LABELS: Record<(typeof DEFAULT_GROUP_IDS)[number], string> = {
  build: "Build",
  plan: "Plan",
  agents: "Agents",
  knowledge: "Knowledge",
  delivery: "Code & delivery",
};

/** Where a project tool belongs when the user has not moved it. */
const DEFAULT_TOOL_GROUP: Record<string, string> = {
  board: "plan",
  sprints: "plan",
  calendar: "plan",
  reports: "plan",
  agents: "agents",
  orchestra: "agents",
  skills: "agents",
  rules: "agents",
  automations: "agents",
  "agent-api": "agents",
  memory: "knowledge",
  graph: "knowledge",
  context: "knowledge",
  workspace: "delivery",
  timeline: "delivery",
  code: "delivery",
  history: "delivery",
  usage: "delivery",
};

const FALLBACK_GROUP_BY_CATEGORY: Record<string, string> = {
  Planning: "plan",
  "Agent setup": "agents",
  "History & maintenance": "delivery",
};

function toolItem(tool: (typeof PROJECT_TOOLS)[number]): SidebarTool {
  const query = tool.destination.tool ? `?tool=${encodeURIComponent(tool.destination.tool)}` : "";
  return {
    id: tool.id,
    label: tool.label,
    icon: tool.icon,
    href: `#/${tool.destination.route}${query}`,
    route: tool.destination.route,
    tool: tool.destination.tool,
    group:
      DEFAULT_TOOL_GROUP[tool.id] ||
      FALLBACK_GROUP_BY_CATEGORY[tool.group] ||
      "delivery",
  };
}

export const SIDEBAR_TOOLS: SidebarTool[] = [
  { id: "chat", label: "Build", icon: "comment", href: "#/chat", route: "chat", group: "build" },
  ...PROJECT_TOOLS.map(toolItem),
];

export const SIDEBAR_TOOL_MAP = new Map(SIDEBAR_TOOLS.map((tool) => [tool.id, tool]));

export function sidebarTool(id: string): SidebarTool | undefined {
  return SIDEBAR_TOOL_MAP.get(id);
}

export function defaultSidebarLayout(): SidebarLayout {
  const groups = DEFAULT_GROUP_IDS.map((id) => ({
    id,
    label: GROUP_LABELS[id],
    items: SIDEBAR_TOOLS.filter((tool) => tool.group === id).map((tool) => tool.id),
  }));
  return { version: 1, groups, hidden: [] };
}

function text(value: unknown, fallback: string, limit = 40): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, limit);
  return trimmed || fallback;
}

/**
 * Accepts anything from localStorage and returns a complete, valid layout:
 * unknown or duplicated tools are dropped, missing tools are appended to their
 * default group, and every default group exists even if the stored copy is
 * partial.
 */
export function normalizeSidebarLayout(value: unknown): SidebarLayout {
  const defaults = defaultSidebarLayout();
  if (!value || typeof value !== "object") return defaults;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.groups)) return defaults;

  const seenTools = new Set<string>();
  const seenGroups = new Set<string>();
  const groups: SidebarGroup[] = [];

  for (const entry of record.groups) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const id = text(raw.id, "", 64);
    if (!id || seenGroups.has(id)) continue;
    seenGroups.add(id);
    const fallbackLabel = defaults.groups.find((group) => group.id === id)?.label || "Group";
    const items: string[] = [];
    if (Array.isArray(raw.items)) {
      for (const item of raw.items) {
        if (typeof item !== "string" || !SIDEBAR_TOOL_MAP.has(item) || seenTools.has(item)) continue;
        seenTools.add(item);
        items.push(item);
      }
    }
    groups.push({ id, label: text(raw.label, fallbackLabel), items });
  }

  for (const group of defaults.groups) {
    if (!seenGroups.has(group.id)) groups.push({ ...group, items: [] });
  }

  for (const tool of SIDEBAR_TOOLS) {
    if (seenTools.has(tool.id)) continue;
    const target =
      groups.find((group) => group.id === tool.group) ||
      groups.find((group) => group.id === "build") ||
      groups[0];
    target.items.push(tool.id);
    seenTools.add(tool.id);
  }

  const hidden: string[] = [];
  if (Array.isArray(record.hidden)) {
    for (const item of record.hidden) {
      if (typeof item === "string" && SIDEBAR_TOOL_MAP.has(item) && !hidden.includes(item)) hidden.push(item);
    }
  }

  return { version: 1, groups, hidden };
}

export function parseSidebarLayout(raw: string | null): SidebarLayout {
  if (!raw) return defaultSidebarLayout();
  try {
    return normalizeSidebarLayout(JSON.parse(raw));
  } catch {
    return defaultSidebarLayout();
  }
}

export function visibleSidebarGroups(layout: SidebarLayout): Array<SidebarGroup & { tools: SidebarTool[] }> {
  return layout.groups
    .map((group) => ({
      ...group,
      tools: group.items
        .filter((id) => !layout.hidden.includes(id))
        .map((id) => SIDEBAR_TOOL_MAP.get(id))
        .filter((tool): tool is SidebarTool => Boolean(tool)),
    }))
    .filter((group) => group.tools.length > 0);
}

/* ── Pure mutations ───────────────────────────────────────────────────── */

export function moveGroup(layout: SidebarLayout, groupId: string, delta: number): SidebarLayout {
  const index = layout.groups.findIndex((group) => group.id === groupId);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= layout.groups.length) return layout;
  const groups = [...layout.groups];
  const [group] = groups.splice(index, 1);
  groups.splice(next, 0, group);
  return { ...layout, groups };
}

export function moveItem(
  layout: SidebarLayout,
  groupId: string,
  itemId: string,
  delta: number
): SidebarLayout {
  const groupIndex = layout.groups.findIndex((group) => group.id === groupId);
  if (groupIndex < 0) return layout;
  const group = layout.groups[groupIndex];
  const index = group.items.indexOf(itemId);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= group.items.length) return layout;
  const items = [...group.items];
  const [item] = items.splice(index, 1);
  items.splice(next, 0, item);
  const groups = [...layout.groups];
  groups[groupIndex] = { ...group, items };
  return { ...layout, groups };
}

/** Moves a tool to another group (or another position in the same group). */
export function moveItemToGroup(
  layout: SidebarLayout,
  itemId: string,
  targetGroupId: string,
  targetIndex?: number
): SidebarLayout {
  if (!SIDEBAR_TOOL_MAP.has(itemId)) return layout;
  if (!layout.groups.some((group) => group.id === targetGroupId)) return layout;
  const source = layout.groups.find((group) => group.items.includes(itemId));
  const sourceIndex = source?.items.indexOf(itemId) ?? -1;
  // The drop index refers to the row before removal of the dragged tool.
  const insertionIndex = targetIndex !== undefined && source?.id === targetGroupId && sourceIndex < targetIndex
    ? targetIndex - 1
    : targetIndex;
  const groups = layout.groups.map((group) => ({
    ...group,
    items: group.items.filter((id) => id !== itemId),
  }));
  const target = groups.find((group) => group.id === targetGroupId);
  if (!target) return layout;
  const index = insertionIndex === undefined ? target.items.length : Math.max(0, Math.min(insertionIndex, target.items.length));
  target.items.splice(index, 0, itemId);
  return { ...layout, groups };
}

export function setItemHidden(layout: SidebarLayout, itemId: string, hidden: boolean): SidebarLayout {
  if (!SIDEBAR_TOOL_MAP.has(itemId)) return layout;
  const next = layout.hidden.filter((id) => id !== itemId);
  if (hidden) next.push(itemId);
  return { ...layout, hidden: next };
}

export function renameGroup(layout: SidebarLayout, groupId: string, label: string): SidebarLayout {
  const clean = label.trim().slice(0, 40);
  const group = layout.groups.find((entry) => entry.id === groupId);
  if (!group) return layout;
  const fallback = defaultSidebarLayout().groups.find((entry) => entry.id === groupId)?.label || "Group";
  const nextLabel = clean || fallback;
  if (nextLabel === group.label) return layout;
  return {
    ...layout,
    groups: layout.groups.map((entry) => (entry.id === groupId ? { ...entry, label: nextLabel } : entry)),
  };
}

function nextCustomGroupId(layout: SidebarLayout): string {
  let index = 1;
  while (layout.groups.some((group) => group.id === `custom-${index}`)) index += 1;
  return `custom-${index}`;
}

export function addGroup(layout: SidebarLayout, label = "New group"): SidebarLayout {
  const id = nextCustomGroupId(layout);
  return {
    ...layout,
    groups: [...layout.groups, { id, label: text(label, "New group"), items: [] }],
  };
}

/** Removes a custom group and returns its tools to their default groups. */
export function removeGroup(layout: SidebarLayout, groupId: string): SidebarLayout {
  if ((DEFAULT_GROUP_IDS as readonly string[]).includes(groupId)) return layout;
  const group = layout.groups.find((entry) => entry.id === groupId);
  if (!group) return layout;
  let next: SidebarLayout = { ...layout, groups: layout.groups.filter((entry) => entry.id !== groupId) };
  for (const itemId of group.items) {
    const tool = SIDEBAR_TOOL_MAP.get(itemId);
    if (!tool) continue;
    next = moveItemToGroup(next, itemId, tool.group);
  }
  return next;
}

/* ── Persisted store ──────────────────────────────────────────────────── */

let current: SidebarLayout | null = null;
const listeners = new Set<() => void>();
let nativeLoad: Promise<void> | null = null;
let nativeWrites = Promise.resolve();
let revision = 0;

function loadNativeLayout() {
  if (!isDesktop() || nativeLoad) return;
  const startedAtRevision = revision;
  nativeLoad = loadSidebarLayout().then((stored) => {
    // A late read must not overwrite an arrangement the user just edited.
    if (revision !== startedAtRevision || stored == null) return;
    current = normalizeSidebarLayout(stored);
    writeLocal(SIDEBAR_LAYOUT_KEY, JSON.stringify(current));
    listeners.forEach((listener) => listener());
  });
}

function read(): SidebarLayout {
  return parseSidebarLayout(readLocal(SIDEBAR_LAYOUT_KEY));
}

function snapshot(): SidebarLayout {
  if (!current) current = read();
  return current;
}

function commit(next: SidebarLayout) {
  const normalized = normalizeSidebarLayout(next);
  current = normalized;
  revision += 1;
  writeLocal(SIDEBAR_LAYOUT_KEY, JSON.stringify(normalized));
  if (isDesktop()) {
    // Serialize writes so rapid reorder actions cannot persist out of order.
    nativeWrites = nativeWrites.then(() => saveSidebarLayout(normalized));
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    // A window may have changed storage while there were no subscribers.
    current = read();
    loadNativeLayout();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

function onStorage(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== window.localStorage) return;
  if (event.key === SIDEBAR_LAYOUT_KEY || event.key === null) reloadSidebarLayout();
}

export function updateSidebarLayout(mutate: (layout: SidebarLayout) => SidebarLayout) {
  commit(mutate(snapshot()));
}

export function resetSidebarLayout() {
  commit(defaultSidebarLayout());
}

/** Re-reads storage. Useful after another window changed the layout. */
export function reloadSidebarLayout() {
  current = read();
  listeners.forEach((listener) => listener());
}

export function useSidebarLayout(): SidebarLayout {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
