import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";
import { commands, getCommandBySlug } from "@/lib/commands";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return commands.map((cmd) => ({ slug: cmd.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cmd = getCommandBySlug(slug);
  if (!cmd) return {};

  return generatePageMetadata({
    title: `${cmd.name} — barkcli Command Reference`,
    description: cmd.description,
    path: `/docs/commands/${slug}`,
  });
}

export default async function CommandPage({ params }: Props) {
  const { slug } = await params;
  const cmd = getCommandBySlug(slug);
  if (!cmd) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Docs", href: "/docs" },
          { label: "Commands", href: "/docs/commands" },
          { label: cmd.name, href: `/docs/commands/${slug}` },
        ]}
      />

      <div className="mb-8">
        <span className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">
          {cmd.category}
        </span>
        <h1 className="text-4xl font-bold tracking-tight">{cmd.name}</h1>
      </div>

      <p className="mb-8 text-lg text-white/60">{cmd.description}</p>

      <div className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Usage</h2>
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          <code>{cmd.usage}</code>
        </pre>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Examples</h2>
        <div className="space-y-2">
          {cmd.examples.map((example) => (
            <pre
              key={example}
              className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80"
            >
              <code>{example}</code>
            </pre>
          ))}
        </div>
      </div>

      {cmd.flags && cmd.flags.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xl font-semibold">Flags</h2>
          <div className="rounded-lg border border-white/10 bg-white/5">
            {cmd.flags.map((flag) => (
              <div
                key={flag.name}
                className="flex items-start gap-4 border-b border-white/10 p-4 last:border-0"
              >
                <code className="shrink-0 text-sm font-mono text-white">
                  {flag.name}
                </code>
                <span className="text-sm text-white/60">{flag.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-12 flex gap-4">
        <Link
          href="/docs/commands"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
        >
          ← All Commands
        </Link>
      </div>
    </>
  );
}
