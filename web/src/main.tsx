import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ThemeProvider } from "./lib/theme.tsx";
import { isDemoMode, installDemoApi } from "./lib/demo";
import "./index.css";

// GitHub Pages / static hosting: no backend behind this page, so the demo
// API layer intercepts /api/* and serves local demo data (see lib/demo.ts).
if (isDemoMode()) installDemoApi();

// Installable web app (Notion/Linear-style): register the service worker for
// offline support. Production only — the dev server must not cache modules.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* unsupported context (e.g. file://) — the app still works online */
    });
  });
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
