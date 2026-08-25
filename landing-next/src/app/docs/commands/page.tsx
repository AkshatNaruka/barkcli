import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";
import { commands, commandCategories, getCommandsByCategory } from "@/lib/commands";

export const metadata: Metadata = generatePageMetadata({
  title: "Commands Reference — barkcli",
  description:
    "Complete reference for all barkcli commands. Core, task management, code context, interfaces, and more.",
  path: "/docs/commands",
});

export default function CommandsPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Docs", href: "/docs" },
          { label: "Commands", href: "/docs/commands" },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Commands Reference</h1>
      <p className="mb-12 text-lg text-white/60">
        Complete reference for all {commands.length} barkcli commands.
      </p>

      <div className="space-y-12">
        {commandCategories.map((category) => {
          const categoryCommands = getCommandsByCategory(category);
          if (categoryCommands.length === 0) return null;
          return (
            <div key={category}>
              <h2 className="mb-4 text-2xl font-bold">{category}</h2>
              <div className="space-y-2">
                {categoryCommands.map((cmd) => (
                  <Link
                    key={cmd.slug}
                    href={`/docs/commands/${cmd.slug}`}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4 transition-colors hover:border-white/20 hover:bg-white/10"
                  >
                    <div>
                      <code className="text-sm font-mono text-white">{cmd.name}</code>
                      <p className="mt-1 text-sm text-white/50">{cmd.description}</p>
                    </div>
                    <span className="text-white/30">→</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
