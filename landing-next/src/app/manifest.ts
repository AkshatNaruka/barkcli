import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "barkcli — Git-native task management",
    short_name: "barkcli",
    description:
      "Git-native kanban board that lives in your repo. CLI, terminal UI, and web app — one binary, no cloud.",
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
