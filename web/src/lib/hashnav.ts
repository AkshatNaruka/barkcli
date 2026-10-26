import { useEffect, useState } from "react";

export type Route =
  | "threads"
  | "dashboard"
  | "board"
  | "mind"
  | "skills"
  | "calendar"
  | "reports"
  | "code"
  | "activity"
  | "sprints"
  | "memory"
  | "context"
  | "brain"
  | "specs"
  | "orchestrate"
  | "agents"
  | "timeline"
  | "history"
  | "settings"
  | "agent-prompt"
  | "docs"
  | "project"
  | "insights";

const ROUTES: Route[] = [
  "threads",
  "dashboard",
  "board",
  "mind",
  "skills",
  "calendar",
  "reports",
  "code",
  "activity",
  "sprints",
  "memory",
  "context",
  "brain",
  "specs",
  "orchestrate",
  "agents",
  "timeline",
  "history",
  "settings",
  "agent-prompt",
  "docs",
  "project",
  "insights",
];

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, "").split("?")[0].trim().toLowerCase();
  if (h === "inbox") return "threads";
  return (ROUTES as string[]).includes(h) ? (h as Route) : "threads";
}

export function navigate(route: Route) {
  const target = `#/${route}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [route, navigate];
}
