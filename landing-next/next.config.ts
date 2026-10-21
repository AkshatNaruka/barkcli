import type { NextConfig } from "next";

// ── GitHub Pages static export ──
// Enabled only when PAGES_BUILD=1 (set by .github/workflows/pages.yml) so the
// Vercel deployment of this same site stays untouched. The export is served
// under /<repo>/ (base path derived from GITHUB_REPOSITORY or PAGES_BASE_PATH).
// NOTE: plain <a href="/..."> links are not auto-prefixed by basePath — the
// workflow rewrites them in the exported HTML after `next build`.
const isPagesBuild = process.env.PAGES_BUILD === "1";
const repoFromActions = process.env.GITHUB_REPOSITORY?.split("/")[1];
const basePath = process.env.PAGES_BASE_PATH || (repoFromActions ? `/${repoFromActions}` : "");

const nextConfig: NextConfig = {
  ...(isPagesBuild
    ? {
        output: "export" as const,
        trailingSlash: true,
        basePath: basePath || undefined,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
