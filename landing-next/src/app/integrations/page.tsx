import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";
import { integrations } from "@/lib/integrations";

export const metadata: Metadata = generatePageMetadata({
  title: "Integrations — barkcli",
  description:
    "Connect barkcli with GitHub, VS Code, GitLab, Neovim, tmux, OpenCode, Claude Code, and Cursor.",
  path: "/integrations",
});

export default function IntegrationsPage() {
  return (
    <>
      <Breadcrumbs
        items={[{ label: "Integrations", href: "/integrations" }]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Integrations</h1>
      <p className="mb-12 text-lg text-white/60">
        Connect barkcli with your favorite tools.
      </p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((int) => (
          <Link
            key={int.slug}
            href={`/integrations/${int.slug}`}
            className="group rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <div className="mb-3 text-3xl">{int.icon}</div>
            <h2 className="mb-2 text-xl font-semibold text-white group-hover:text-white/90">
              {int.name}
            </h2>
            <p className="text-sm text-white/50">{int.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
