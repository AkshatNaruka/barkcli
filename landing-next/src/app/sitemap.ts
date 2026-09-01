import type { MetadataRoute } from "next";
import { commands } from "@/lib/commands";
import { comparisons } from "@/lib/comparisons";
import { useCases } from "@/lib/usecases";
import { integrations } from "@/lib/integrations";

const BASE_URL = "https://barkcli.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 1 },
    { url: `${BASE_URL}/docs`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.9 },
    { url: `${BASE_URL}/compare`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.8 },
    { url: `${BASE_URL}/use-cases`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.8 },
    { url: `${BASE_URL}/integrations`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.8 },
    { url: `${BASE_URL}/guides`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.8 },
  ];

  const docPages = [
    { url: `${BASE_URL}/docs/getting-started`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${BASE_URL}/docs/commands`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${BASE_URL}/docs/interfaces`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${BASE_URL}/docs/web-app`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${BASE_URL}/docs/api-reference`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${BASE_URL}/docs/code-context`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${BASE_URL}/docs/advanced`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.7 },
  ];

  const commandPages = commands.map((cmd) => ({
    url: `${BASE_URL}/docs/commands/${cmd.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const interfacePages = ["cli", "tui", "web", "vscode"].map((slug) => ({
    url: `${BASE_URL}/docs/interfaces/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const comparisonPages = comparisons.map((comp) => ({
    url: `${BASE_URL}/compare/${comp.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const useCasePages = useCases.map((uc) => ({
    url: `${BASE_URL}/use-cases/${uc.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const integrationPages = integrations.map((int) => ({
    url: `${BASE_URL}/integrations/${int.slug}`,
    lastModified: new Date(),
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
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [
    ...staticPages,
    ...docPages,
    ...commandPages,
    ...interfacePages,
    ...comparisonPages,
    ...useCasePages,
    ...integrationPages,
    ...guidePages,
  ];
}
