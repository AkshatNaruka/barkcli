import "../styles/global.css";

import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "barkcli Documentation",
    template: "%s · barkcli",
  },
  description:
    "The management layer for AI agents — intent, plans, isolated worktrees, a test gate, and a merge train. CLI, terminal UI, web app, VS Code extension, and AI/MCP integrations.",
  keywords: [
    "barkcli",
    "kanban",
    "cli",
    "git",
    "task-management",
    "project-management",
    "yaml",
    "mcp",
    "ai-agents",
  ],
  openGraph: {
    title: "barkcli Documentation",
    description:
      "The management layer for AI agents — intent, plans, isolated worktrees, a test gate, and a merge train.",
    url: "https://akshatnaruka.github.io/barkcli/docs",
    siteName: "barkcli",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "barkcli Documentation",
    description:
      "The management layer for AI agents — intent, plans, isolated worktrees, a test gate, and a merge train.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
