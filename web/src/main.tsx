import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ThemeProvider } from "./lib/theme.tsx";
import { isDemoMode, installDemoApi } from "./lib/demo";
import "./index.css";

// GitHub Pages / static hosting: no backend behind this page, so the demo
// API layer intercepts /api/* and serves local demo data (see lib/demo.ts).
if (isDemoMode()) installDemoApi();

const root = createRoot(document.getElementById("root")!);
root.render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
