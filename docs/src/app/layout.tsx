import "../styles/global.css";

import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider";
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
    "Git-native project management — tasks as YAML in your repo. CLI, terminal UI, web app, VS Code extension, and AI/MCP integrations.",
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
      "Git-native project management — tasks as YAML in your repo.",
    url: "https://barkcli.vercel.app/docs",
    siteName: "barkcli",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "barkcli Documentation",
    description:
      "Git-native project management — tasks as YAML in your repo.",
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
