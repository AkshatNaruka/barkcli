import type { Metadata } from "next";
import { DocsNav } from "@/components/docs-nav";

export const metadata: Metadata = {
  title: {
    default: "Documentation",
    template: "%s · barkcli Docs",
  },
  description:
    "Complete documentation for barkcli — git-native task management. Commands, guides, API reference, and AI agent integration.",
  keywords: [
    "barkcli documentation",
    "git task management docs",
    "kanban CLI reference",
    "barkcli commands",
    "barkcli API",
    "MCP server setup",
  ],
  openGraph: {
    title: "barkcli Documentation",
    description: "Complete documentation for barkcli — git-native task management.",
    url: "https://barkcli.vercel.app/docs",
    siteName: "barkcli",
    type: "website",
  },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      <DocsNav />
      <main className="mx-auto max-w-4xl px-6 py-12">{children}</main>
    </div>
  );
}
