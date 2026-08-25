"use client";

import Link from "next/link";
import {
  GitBranch,
  Cloud,
  DollarSign,
  Wifi,
  Users,
  Settings,
  Check,
  X,
  ChevronRight,
} from "lucide-react";

const comparisons = [
  { slug: "linear", name: "Linear", tagline: "barkcli vs Linear — Git-native vs Cloud-first" },
  { slug: "jira", name: "Jira", tagline: "barkcli vs Jira — Simple vs Enterprise" },
  { slug: "height", name: "Height", tagline: "barkcli vs Height — Local-first vs AI-first" },
  { slug: "plane", name: "Plane", tagline: "barkcli vs Plane — Binary vs Self-hosted" },
  { slug: "trello", name: "Trello", tagline: "barkcli vs Trello — Code vs Cloud" },
  { slug: "notion", name: "Notion", tagline: "barkcli vs Notion — Tasks vs Everything" },
  { slug: "github-projects", name: "GitHub Projects", tagline: "barkcli vs GitHub Projects — Local vs Platform" },
  { slug: "height-alternatives", name: "All PM Tools", tagline: "barkcli vs Traditional PM — The Developer's Choice" },
];

const faqs = [
  {
    question: "Why use barkcli instead of Linear or Jira?",
    answer:
      "barkcli keeps tasks in your repo as YAML files. No cloud, no accounts, no subscriptions. Tasks travel with your code and are accessible to AI agents without API calls.",
  },
  {
    question: "Is barkcli free?",
    answer:
      "Yes. barkcli is MIT licensed and free forever. No per-seat pricing, no subscription tiers.",
  },
  {
    question: "Can barkcli replace Linear/Jira for teams?",
    answer:
      "For small to medium teams, yes. For enterprise with compliance requirements, you may need to keep a SaaS tool alongside barkcli.",
  },
];

export default function ComparePage() {
  return (
    <>
      <h1 className="mb-4 text-4xl font-bold tracking-tight">
        Compare barkcli
      </h1>
      <p className="mb-12 text-lg text-white/60">
        See how barkcli compares to popular project management tools.
      </p>

      <div className="space-y-4">
        {comparisons.map((comp) => (
          <Link
            key={comp.slug}
            href={`/compare/${comp.slug}`}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/20 hover:bg-white/10 group"
          >
            <div>
              <h2 className="text-xl font-semibold text-white group-hover:text-white/90">
                barkcli vs {comp.name}
              </h2>
              <p className="mt-1 text-sm text-white/50">{comp.tagline}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/50 transition-colors" />
          </Link>
        ))}
      </div>

      <div className="mt-16">
        <h2 className="mb-6 text-2xl font-bold">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <div
              key={faq.question}
              className="rounded-xl border border-white/10 bg-white/5 p-6"
            >
              <h3 className="mb-2 text-lg font-semibold">{faq.question}</h3>
              <p className="text-white/60">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
