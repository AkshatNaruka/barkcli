import { useEffect, useState } from "react";
import { aliasSurface, type Surface } from "./surfaces";

/** A route is a surface. Old routes are aliases, not pages. */
export type Route = Surface;

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "").split("?")[0].split("/")[0];
  return aliasSurface(raw);
}

/** The raw hash before canonicalization (used to restore Operations tabs). */
export function rawHashRoute(): string {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0];
}

export function navigate(route: Route) {
  const target = `#/${route}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

function canonicalize(route: Route) {
  const target = `#/${route}`;
  if (window.location.hash !== target) {
    // Replace, not push: an alias should not create a back-button trap.
    window.history.replaceState(null, "", target);
  }
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    canonicalize(route);
    const onHash = () => {
      const next = parseRoute(window.location.hash);
      canonicalize(next);
      setRoute(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // Mount-only: later navigations are driven by hashchange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [route, navigate];
}
