import { useEffect, useState } from "react";

export type Route =
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
  | "specs"
  | "orchestrate"
  | "timeline"
  | "settings"
  | "agent-prompt"
  | "docs";

const ROUTES: Route[] = [
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
  "specs",
  "orchestrate",
  "timeline",
  "settings",
  "agent-prompt",
  "docs",
];

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, "").split("?")[0].trim().toLowerCase();
  return (ROUTES as string[]).includes(h) ? (h as Route) : "dashboard";
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
