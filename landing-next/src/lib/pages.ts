/**
 * GitHub Pages–only surfaces.
 *
 * The Pages deployment serves the interactive web-app preview under /app/
 * (see .github/workflows/pages.yml). The Vercel build of this same site has no
 * such preview, so anything pointing at it is hidden unless NEXT_PUBLIC_PAGES
 * is set at build time.
 */
export const ON_PAGES = process.env.NEXT_PUBLIC_PAGES === "1";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** Recorded run, opened directly in the Mind view of the hosted preview. */
export const DEMO_REPLAY_URL = `${BASE_PATH}/app/?run=replay#/mind`;
