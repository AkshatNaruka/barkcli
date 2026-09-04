"use client";

import Link from "next/link";
import {
  User,
  Users,
  Bot,
  BookOpen,
  RefreshCw,
  Building2,
  ChevronRight,
} from "lucide-react";

const useCases = [
  {
    slug: "solo-developer",
    title: "Solo Developers",
    description: "Manage your personal projects without SaaS subscriptions. Tasks live in your repo, version controlled with your code.",
    icon: User,
  },
  {
    slug: "small-team",
    title: "Small Teams (2-10)",
    description: "Collaborate on tasks via git. No server, no admin — just push and pull.",
    icon: Users,
  },
  {
    slug: "ai-workflow",
    title: "AI-Assisted Development",
    description: "Give coding agents context about what to build. MCP server exposes tasks to Claude, GPT, and local models.",
    icon: Bot,
  },
  {
    slug: "open-source",
    title: "Open Source Maintainers",
    description: "Track issues, features, and roadmap in the repo itself. Contributors see tasks alongside code.",
    icon: BookOpen,
  },
  {
    slug: "migration-from-linear",
    title: "Migrating from Linear",
    description: "Bring your workflow to the repo. Export from Linear, import to barkcli, keep your team's process.",
    icon: RefreshCw,
  },
  {
    slug: "enterprise-alternative",
    title: "Jira Alternative for Dev Teams",
    description: "Replace Jira for engineering tasks. Keep Jira for non-engineering if needed.",
    icon: Building2,
  },
];

export default function UseCasesPage() {
  return (
    <>
      <h1 className="mb-4 text-4xl font-bold tracking-tight">Use Cases</h1>
      <p className="mb-12 text-lg text-white/60">
        How different teams and developers use barkcli.
      </p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {useCases.map((uc) => {
          const Icon = uc.icon;
          return (
            <Link
              key={uc.slug}
              href={`/use-cases/${uc.slug}`}
              className="group rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/20 hover:bg-white/10"
            >
              <div className="w-10 h-10 rounded-lg bg-[#B8845C]/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-[#B8845C]" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-white group-hover:text-white/90 flex items-center gap-2">
                {uc.title}
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h2>
              <p className="text-sm text-white/50">{uc.description}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-16 rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <h2 className="mb-2 text-2xl font-bold">Start Your First Board</h2>
        <p className="mx-auto mb-6 max-w-md text-white/60">
          Whatever your workflow, barkcli adapts. Install the binary and init a
          board in any repo.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/docs/getting-started"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
          >
            Get Started →
          </Link>
          <Link
            href="/guides/migrate-from-jira"
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
          >
            Migrate from Jira
          </Link>
          <Link
            href="/compare"
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
          >
            Compare Alternatives
          </Link>
        </div>
      </div>
    </>
  );
}
