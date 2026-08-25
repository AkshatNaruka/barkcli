import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";
import { useCases, getUseCaseBySlug } from "@/lib/usecases";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return useCases.map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const uc = getUseCaseBySlug(slug);
  if (!uc) return {};

  return generatePageMetadata({
    title: `${uc.title} — barkcli`,
    description: uc.description,
    path: `/use-cases/${slug}`,
  });
}

export default async function UseCasePage({ params }: PageProps) {
  const { slug } = await params;
  const uc = getUseCaseBySlug(slug);
  if (!uc) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Use Cases", href: "/use-cases" },
          { label: uc.title, href: `/use-cases/${slug}` },
        ]}
      />

      <div className="mb-8 flex items-center gap-4">
        <span className="text-5xl">{uc.icon}</span>
        <h1 className="text-4xl font-bold tracking-tight">{uc.title}</h1>
      </div>

      <p className="mb-12 text-lg text-white/60">{uc.description}</p>

      <div className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Benefits</h2>
        <ul className="space-y-2">
          {uc.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-white/60">
              <span className="text-green-400">✓</span>
              {benefit}
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Typical Workflow</h2>
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          <code>{uc.workflow.join("\n")}</code>
        </pre>
      </div>

      <div className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Key Commands</h2>
        <div className="flex flex-wrap gap-2">
          {uc.commands.map((cmd) => (
            <Link
              key={cmd}
              href={`/docs/commands/${cmd}`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              {cmd}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <Link
          href="/use-cases"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
        >
          ← All Use Cases
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
