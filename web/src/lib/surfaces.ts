import type { IconName } from "../components/Icon";

/**
 * Route availability is independent of default navigation prominence.
 */
export type Surface =
  | "chat"
  | "review"
  | "board"
  | "agents"
  | "brain"
  | "skills"
  | "operations"
  | "history"
  | "hub"
  | "projects";

export interface SurfaceDef {
  id: Surface;
  label: string;
  icon: IconName;
  /** One line, used by the rail tooltip and the inspector. */
  hint: string;
  key: string;
}

export const SURFACES: SurfaceDef[] = [
  { id: "chat", label: "Build", icon: "comment", hint: "Describe, plan, and build", key: "1" },
  { id: "review", label: "Review", icon: "eye", hint: "Changes and verification", key: "2" },
  { id: "projects", label: "Projects", icon: "folder", hint: "Every project on this machine", key: "3" },
  { id: "hub", label: "Project tools", icon: "grid", hint: "All project tools", key: "4" },
  { id: "board", label: "Board", icon: "board", hint: "Cards and gates", key: "5" },
  { id: "agents", label: "Agents", icon: "users", hint: "Orchestra and subagents", key: "6" },
  { id: "brain", label: "Brain", icon: "spark", hint: "Memory, context, graph", key: "7" },
  { id: "skills", label: "Skills", icon: "star", hint: "Enabled capabilities", key: "8" },
  { id: "operations", label: "Operations", icon: "code", hint: "Files, code, timeline", key: "9" },
  { id: "history", label: "History", icon: "history", hint: "Runs, gates, diffs", key: "" },
];

/**
 * App-wide destinations: they describe the whole machine, not one project, so
 * they sit above the divider and never show the project tools sidebar.
 */
export const HOUSE_SURFACES: Surface[] = ["chat", "review", "projects"];

export function isHouseSurface(value: Surface): boolean {
  return HOUSE_SURFACES.includes(value);
}

/**
 * The rail's destinations in the order the user arranged them, minus the ones
 * they hid. Every navigational surface lives here — the rail is the only
 * navigation the app has, so this order is also what ⌘1…9 follows.
 */
export function railSequence(order: Surface[], hidden: Surface[]): Surface[] {
  return order.filter((id) => !hidden.includes(id));
}

export function isSurface(value: string): value is Surface {
  return SURFACES.some((s) => s.id === value);
}

/**
 * Surfaces that belong to the whole app rather than one project. Threads and
 * Review span every project Bark knows about, so they never carry a project
 * scope; the rest are project tools.
 */
export const GLOBAL_SURFACES: Surface[] = ["chat", "review"];

export function isGlobalSurface(value: Surface): boolean {
  return GLOBAL_SURFACES.includes(value);
}

/**
 * Old hashes keep working. Each maps to the surface that now owns it, so a
 * bookmark or an agent-written link never lands on a blank page.
 */
const LEGACY: Record<string, Surface> = {
  threads: "chat",
  inbox: "chat",
  dashboard: "chat",

  project: "operations",
  insights: "operations",
  code: "operations",
  timeline: "operations",
  specs: "operations",
  calendar: "operations",
  reports: "operations",
  usage: "operations",
  settings: "operations",
  docs: "operations",
  "agent-prompt": "operations",

  orchestrate: "agents",
  agents: "agents",
  sprints: "agents",

  brain: "brain",
  memory: "brain",
  context: "brain",
  mind: "brain",

  skills: "skills",
  history: "history",
  activity: "history",
};

/** Legacy route → surface. Unknown hashes land on Chat. */
export function aliasSurface(raw: string): Surface {
  const key = raw.trim().toLowerCase();
  if (isSurface(key)) return key;
  return LEGACY[key] ?? "chat";
}

/** Sub-tab for Operations, preserved from old hashes where it makes sense. */
export function operationsTabFromLegacy(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (["project", "code", "timeline", "specs", "calendar", "reports", "settings", "docs", "agent-prompt", "insights", "usage"].includes(key)) {
    return key === "project" || key === "insights" ? "workspace" : key === "agent-prompt" ? "agent" : key;
  }
  return null;
}
