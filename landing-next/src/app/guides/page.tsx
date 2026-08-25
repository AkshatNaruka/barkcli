import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Guides — barkcli",
  description:
    "Step-by-step guides for common workflows. Migration, team setup, AI integration, and more.",
  path: "/guides",
});

const guides = [
  {
    slug: "migrate-from-linear",
    title: "Migrating from Linear",
    description: "Export tasks from Linear and import them into barkcli.",
    icon: "🔄",
  },
  {
    slug: "migrate-from-jira",
    title: "Migrating from Jira",
    description: "Move from Jira to barkcli for engineering tasks.",
    icon: "📋",
  },
  {
    slug: "team-setup",
    title: "Team Setup",
    description: "Set up barkcli for a team with git-based collaboration.",
    icon: "👥",
  },
  {
    slug: "ai-agent-setup",
    title: "AI Agent Setup",
    description: "Configure MCP server for coding agent integration.",
    icon: "🤖",
  },
  {
    slug: "multi-board",
    title: "Multi-Board Workflow",
    description: "Manage multiple boards for different projects or teams.",
    icon: "📊",
  },
  {
    slug: "ci-cd-integration",
    title: "CI/CD Integration",
    description: "Automate task workflows with GitHub Actions or GitLab CI.",
    icon: "⚡",
  },
];

export default function GuidesPage() {
  return (
    <>
      <Breadcrumbs
        items={[{ label: "Guides", href: "/guides" }]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Guides</h1>
      <p className="mb-12 text-lg text-white/60">
        Step-by-step guides for common workflows.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            href={`/guides/${guide.slug}`}
            className="group rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <div className="mb-3 text-3xl">{guide.icon}</div>
            <h2 className="mb-2 text-xl font-semibold text-white group-hover:text-white/90">
              {guide.title}
            </h2>
            <p className="text-sm text-white/50">{guide.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
