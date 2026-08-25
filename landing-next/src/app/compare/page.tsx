import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata, faqJsonLd } from "@/lib/seo";
import { comparisons } from "@/lib/comparisons";

export const metadata: Metadata = generatePageMetadata({
  title: "Compare barkcli — vs Linear, Jira, Height, Plane, Trello, Notion, GitHub Projects",
  description:
    "Compare barkcli with popular project management tools. See how git-native task management compares to cloud SaaS.",
  path: "/compare",
});

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={faqJsonLd(faqs)}
      />

      <Breadcrumbs
        items={[{ label: "Compare", href: "/compare" }]}
      />

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
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <div>
              <h2 className="text-xl font-semibold text-white">
                barkcli vs {comp.name}
              </h2>
              <p className="mt-1 text-sm text-white/50">{comp.tagline}</p>
            </div>
            <span className="text-white/30">→</span>
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
