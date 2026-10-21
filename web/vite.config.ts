import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ }) => {
  // GitHub Pages serves project sites under /<reponame>/ — derive base from
  // the Actions env (GITHUB_REPOSITORY=owner/repo) and allow an override.
  const repoFromActions = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const base = process.env.PAGES_BASE || (repoFromActions ? `/${repoFromActions}/` : "/");
  return {
    plugins: [react()],
    base,
    server: {
      proxy: {
        "/api": "http://localhost:4321",
        "/ws": { target: "ws://localhost:4321", ws: true },
      },
    },
    build: {
      outDir: "dist",
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name].[ext]",
        },
      },
    },
  };
});
