import type { MetadataRoute } from "next";
import { commands } from "@/lib/commands";
import { comparisons } from "@/lib/comparisons";
import { useCases } from "@/lib/usecases";
import { integrations } from "@/lib/integrations";

const BASE_URL = "https://barkcli.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages = [
    { url: BASE_URL, lastModified: now, changeFrequency: "weekly" as const, priority: 1 },
    { url: `${BASE_URL}/docs`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.9 },
    { url: `${BASE_URL}/compare`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 },
    { url: `${BASE_URL}/use-cases`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 },
    { url: `${BASE_URL}/integrations`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 },
    { url: `${BASE_URL}/guides`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 },
  ];

  const docPages = [
    { url: `${BASE_URL}/docs/autopilot`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.9 },
    { url: `${BASE_URL}/docs/getting-started`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${BASE_URL}/docs/concepts`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${BASE_URL}/docs/concepts/tasks`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${BASE_URL}/docs/concepts/boards`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${BASE_URL}/docs/concepts/projects`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${BASE_URL}/docs/concepts/code-context`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${BASE_URL}/docs/commands`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${BASE_URL}/docs/interfaces`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${BASE_URL}/docs/web-app`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${BASE_URL}/docs/api-reference`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${BASE_URL}/docs/code-context`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${BASE_URL}/docs/advanced`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 },
  ];

  const commandPages = commands.map((cmd) => ({
    url: `${BASE_URL}/docs/commands/${cmd.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const interfacePages = ["cli", "tui", "web", "vscode"].map((slug) => ({
    url: `${BASE_URL}/docs/interfaces/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const comparisonPages = comparisons.map((comp) => ({
    url: `${BASE_URL}/compare/${comp.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const useCasePages = useCases.map((uc) => ({
    url: `${BASE_URL}/use-cases/${uc.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const integrationPages = integrations.map((int) => ({
    url: `${BASE_URL}/integrations/${int.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const guidePages = [
    "migrate-from-linear",
    "migrate-from-jira",
    "team-setup",
    "ai-agent-setup",
    "multi-board",
    "ci-cd-integration",
  ].map((slug) => ({
    url: `${BASE_URL}/guides/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // Machine-readable files for AI agents and GEO
  const agentFiles = [
    { url: `${BASE_URL}/llms.txt`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.5 },
    { url: `${BASE_URL}/llms-full.txt`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.5 },
    { url: `${BASE_URL}/ai.txt`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.5 },
    { url: `${BASE_URL}/pricing.md`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.4 },
  ];

  // Landing hub pages (folder lists) — useful for crawlers to discover all children
  const hubPages = [
    { url: `${BASE_URL}/docs/concepts/tasks`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 },
    { url: `${BASE_URL}/docs/concepts/boards`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 },
    { url: `${BASE_URL}/docs/concepts/projects`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 },
    { url: `${BASE_URL}/docs/concepts/code-context`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 },
    { url: `${BASE_URL}/guides`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${BASE_URL}/guides/migrate-from-linear`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 },
    { url: `${BASE_URL}/guides/migrate-from-jira`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 },
  ];

  return [
    ...staticPages,
    ...docPages,
    ...hubPages,
    ...commandPages,
    ...interfacePages,
    ...comparisonPages,
    ...useCasePages,
    ...integrationPages,
    ...guidePages,
    ...agentFiles,
  ];
}
