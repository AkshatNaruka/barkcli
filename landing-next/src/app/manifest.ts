import type { MetadataRoute } from "next";

// Required for `output: "export"` (GitHub Pages) — the route is static either way.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "barkcli — The management layer for AI agents",
    short_name: "barkcli",
    description:
      "The management layer for AI agents — intent, plans, isolated worktrees, a test gate, and a merge train. CLI, terminal UI, and web app — one binary, no cloud.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0A",
    theme_color: "#8B5E3C",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
