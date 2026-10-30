import type { IconName } from "../components/Icon";

/** Thread-scoped artifacts shown in the right-side surfaces panel. */
export type WorkbenchTab = "plan" | "diff" | "gate" | "receipt" | "eval" | "context";

export interface WorkbenchSurface {
  id: WorkbenchTab;
  label: string;
  icon: IconName;
  letter: string;
}

export const WORKBENCH_SURFACES: WorkbenchSurface[] = [
  { id: "plan", label: "Plan", icon: "doc", letter: "P" },
  { id: "diff", label: "Changes", icon: "code", letter: "C" },
  { id: "gate", label: "Checks", icon: "check", letter: "K" },
  { id: "receipt", label: "Evidence", icon: "layers", letter: "E" },
  { id: "eval", label: "Diagnostics", icon: "pulse", letter: "D" },
  { id: "context", label: "Context", icon: "db", letter: "X" },
];

/** Route panel names are longer than the internal tab ids. */
export const PANEL_TO_TAB: Record<string, WorkbenchTab> = {
  plan: "plan",
  changes: "diff",
  checks: "gate",
  evidence: "receipt",
  context: "context",
  diagnostics: "eval",
};

export const TAB_TO_PANEL: Record<
  WorkbenchTab,
  "plan" | "changes" | "checks" | "evidence" | "context" | "diagnostics"
> = {
  plan: "plan",
  diff: "changes",
  gate: "checks",
  receipt: "evidence",
  eval: "diagnostics",
  context: "context",
};

export function workbenchLabel(tab: WorkbenchTab): string {
  return WORKBENCH_SURFACES.find((surface) => surface.id === tab)?.label || "Workbench";
}
