import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata, faqJsonLd } from "@/lib/seo";
import { comparisons, getComparisonBySlug } from "@/lib/comparisons";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const comp = getComparisonBySlug(slug);
  if (!comp) return {};

  return generatePageMetadata({
    title: `barkcli vs ${comp.name} — Comparison`,
    description: comp.description,
    path: `/compare/${slug}`,
  });
}

export default async function ComparisonPage({ params }: PageProps) {
  const { slug } = await params;
  const comp = getComparisonBySlug(slug);
  if (!comp) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Compare", href: "/compare" },
          { label: comp.name, href: `/compare/${slug}` },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">{comp.tagline}</h1>
      <p className="mb-12 text-lg text-white/60">{comp.description}</p>

      {/* Feature Comparison Table */}
      <div className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Feature Comparison</h2>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="p-4 font-semibold">Feature</th>
                <th className="p-4 font-semibold">barkcli</th>
                <th className="p-4 font-semibold">{comp.name}</th>
              </tr>
            </thead>
            <tbody>
              {comp.features.map((feature) => (
                <tr key={feature.feature} className="border-b border-white/10 last:border-0">
                  <td className="p-4 text-white/80">{feature.feature}</td>
                  <td className="p-4 text-white/60">{feature.barkcli}</td>
                  <td className="p-4 text-white/60">{feature.competitor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advantages */}
      <div className="mb-12 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-4 text-lg font-semibold text-green-400">
            Why Choose barkcli
          </h3>
          <ul className="space-y-2">
            {comp.barkcliAdvantages.map((adv) => (
              <li key={adv} className="flex items-start gap-2 text-white/60">
                <span className="text-green-400">✓</span>
                {adv}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-4 text-lg font-semibold text-blue-400">
            Why Choose {comp.name}
          </h3>
          <ul className="space-y-2">
            {comp.competitorAdvantages.map((adv) => (
              <li key={adv} className="flex items-start gap-2 text-white/60">
                <span className="text-blue-400">✓</span>
                {adv}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Verdict */}
      <div className="mb-12 rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-xl font-semibold">Verdict</h2>
        <p className="mb-4 text-white/60">{comp.verdict}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-green-400">
              Best for barkcli
            </h3>
            <p className="text-sm text-white/50">{comp.bestForBarkcli}</p>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-blue-400">
              Best for {comp.name}
            </h3>
            <p className="text-sm text-white/50">{comp.bestForCompetitor}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <Link
          href="/compare"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
        >
          ← All Comparisons
        </Link>
        <Link
          href="/docs/getting-started"
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
        >
          Try barkcli Free →
        </Link>
      </div>
    </>
  );
}
