import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";
import { integrations, getIntegrationBySlug } from "@/lib/integrations";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return integrations.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const integration = getIntegrationBySlug(slug);
  if (!integration) return {};

  return generatePageMetadata({
    title: `barkcli + ${integration.name} — Integration`,
    description: integration.description,
    path: `/integrations/${slug}`,
  });
}

export default async function IntegrationPage({ params }: PageProps) {
  const { slug } = await params;
  const integration = getIntegrationBySlug(slug);
  if (!integration) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Integrations", href: "/integrations" },
          { label: integration.name, href: `/integrations/${slug}` },
        ]}
      />

      <div className="mb-8 flex items-center gap-4">
        <span className="text-5xl">{integration.icon}</span>
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            barkcli + {integration.name}
          </h1>
          <p className="mt-1 text-white/60">{integration.description}</p>
        </div>
      </div>

      <div className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Setup</h2>
        <div className="space-y-4">
          {integration.setupSteps.map((step, i) => (
            <div key={step} className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
                {i + 1}
              </div>
              <p className="text-white/60">{step}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Features</h2>
        <ul className="space-y-2">
          {integration.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-white/60">
              <span className="text-green-400">✓</span>
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Configuration</h2>
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          <code>{integration.configExample}</code>
        </pre>
      </div>

      <div className="flex gap-4">
        <Link
          href="/integrations"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
        >
          ← All Integrations
        </Link>
        <Link
          href="/docs/getting-started"
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
        >
          Get Started Free →
        </Link>
      </div>
    </>
  );
}
