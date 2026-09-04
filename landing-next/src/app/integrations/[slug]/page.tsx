import Link from "next/link";
import Image from "next/image";
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

  const others = integrations.filter((i) => i.slug !== slug).slice(0, 3);

  const faqs = [
    {
      question: `How does barkcli integrate with ${integration.name}?`,
      answer: `barkcli runs a local MCP server (\`barkcli mcp\`) that exposes 56 tools for task and board management. You register it once in ${integration.name}'s config, and ${integration.name} can then read tasks, claim work, link code context, and update progress.`,
    },
    {
      question: `Is ${integration.name} integration free?`,
      answer: "Yes. barkcli is MIT licensed and the MCP server is included in the binary — no subscription, no per-seat fee, no cloud.",
    },
    {
      question: "Does barkcli upload my tasks to the cloud?",
      answer:
        "No. Tasks are YAML files committed to your git repository. The MCP server runs locally and never sends your board data anywhere.",
    },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Integrations", href: "/integrations" },
          { label: integration.name, href: `/integrations/${slug}` },
        ]}
      />

      <div className="mb-8 flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
          {integration.logo ? (
            <Image
              src={integration.logo}
              alt={`${integration.name} logo`}
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
          ) : (
            <span className="text-3xl">{integration.icon}</span>
          )}
        </span>
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

      <div className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <div key={faq.question} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h3 className="mb-2 font-semibold text-white">{faq.question}</h3>
              <p className="text-sm text-white/60">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Other Integrations</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {others.map((other) => (
            <Link
              key={other.slug}
              href={`/integrations/${other.slug}`}
              className="group rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-white/20 hover:bg-white/10"
            >
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/40">
                {other.logo ? (
                  <Image
                    src={other.logo}
                    alt={`${other.name} logo`}
                    width={20}
                    height={20}
                    className="h-5 w-5 object-contain"
                  />
                ) : (
                  <span className="text-xl">{other.icon}</span>
                )}
              </div>
              <span className="text-sm font-semibold text-white group-hover:text-white/90">
                {other.name}
              </span>
            </Link>
          ))}
        </div>
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
