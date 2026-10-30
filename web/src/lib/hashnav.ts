import { useEffect, useState } from "react";
import { aliasSurface, operationsTabFromLegacy, type Surface } from "./surfaces";

export type Route = Surface;
export interface RouteState {
  route: Route;
  board?: string;
  thread?: string;
  run?: string;
  panel?: "plan" | "changes" | "checks" | "evidence" | "context" | "diagnostics";
  file?: string;
  tool?: string;
  draft?: string;
}
const KEYS = ["board", "thread", "run", "panel", "file", "tool", "draft"] as const;
const PANELS = ["plan", "changes", "checks", "evidence", "context", "diagnostics"];
const validValue = (value: string | null): value is string => Boolean(value && value.length <= 1000 && !/[\u0000-\u001f\u007f]/.test(value));

export function parseRouteState(hash: string): RouteState {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?", 2);
  const raw = path.split("/")[0];
  const state: RouteState = { route: aliasSurface(raw) };
  const params = new URLSearchParams(query);
  for (const key of KEYS) {
    const value = params.get(key);
    if (!validValue(value)) continue;
    if (key === "panel" && !PANELS.includes(value)) continue;
    if (key === "file" && (value.startsWith("/") || value.includes("\\") || value.split("/").includes("..") || /^[a-z]+:/i.test(value))) continue;
    Object.assign(state, { [key]: value });
  }
  state.tool ??= operationsTabFromLegacy(raw) ?? undefined;
  if (raw === "sprints") state.tool = "sprints";
  if (raw === "memory" || raw === "context") state.tool = raw;
  return state;
}

export function parseRoute(hash: string): Route { return parseRouteState(hash).route; }
export function rawHashRoute(): string { return window.location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0]; }

export function routeHash(state: RouteState): string {
  const params = new URLSearchParams();
  for (const key of KEYS) if (state[key]) params.set(key, state[key]!);
  return `#/${state.route}${params.size ? `?${params}` : ""}`;
}

export function navigate(route: Route, state: Partial<Omit<RouteState, "route">> = {}) {
  const current = parseRouteState(window.location.hash);
  const target = routeHash({ route, board: current.board, ...state });
  if (window.location.hash !== target) window.location.hash = target;
}

export function updateRouteState(patch: Partial<RouteState>, replace = false) {
  const target = routeHash({ ...parseRouteState(window.location.hash), ...patch });
  if (target === window.location.hash) return;
  if (replace) { window.history.replaceState(null, "", target); window.dispatchEvent(new HashChangeEvent("hashchange")); }
  else window.location.hash = target;
}

export function useRouteState(): RouteState {
  const [state, setState] = useState(() => parseRouteState(window.location.hash));
  useEffect(() => {
    const read = () => {
      const next = parseRouteState(window.location.hash);
      const canonical = routeHash(next);
      if (canonical !== window.location.hash) window.history.replaceState(null, "", canonical);
      setState(next);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return state;
}

export function useRoute(): [Route, typeof navigate] { return [useRouteState().route, navigate]; }
