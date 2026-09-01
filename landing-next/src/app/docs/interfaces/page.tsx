import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Interfaces — barkcli",
  description:
    "CLI, Terminal UI, and Web App. Choose the interface that fits your workflow.",
  path: "/docs/interfaces",
});

const interfaces = [
  {
    slug: "cli",
    title: "Command Line",
    description: "Full-featured CLI for scripts, automation, and power users.",
    icon: "⌨️",
    command: 'barkcli add "Fix bug" -p high',
  },
  {
    slug: "tui",
    title: "Terminal UI",
    description: "Interactive kanban board in your terminal with vim-style navigation.",
    icon: "🖥️",
    command: "barkcli tui",
  },
  {
    slug: "web",
    title: "Web App",
    description: "Browser-based kanban with drag-and-drop, calendar, and reports.",
    icon: "🌐",
    command: "barkcli serve --open",
  },
  {
    slug: "vscode",
    title: "VS Code",
    description: "Visual editor for .board files with drag-and-drop kanban.",
    icon: "📝",
    command: "barkcli vscode-install",
  },
];

export default function InterfacesPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Docs", href: "/docs" },
          { label: "Interfaces", href: "/docs/interfaces" },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Interfaces</h1>
      <p className="mb-12 text-lg text-white/60">
        Choose the interface that fits your workflow.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        {interfaces.map((iface) => (
          <Link
            key={iface.slug}
            href={`/docs/interfaces/${iface.slug}`}
            className="group rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <div className="mb-3 text-3xl">{iface.icon}</div>
            <h2 className="mb-2 text-xl font-semibold text-white group-hover:text-white/90">
              {iface.title}
            </h2>
            <p className="mb-4 text-sm text-white/50">{iface.description}</p>
            <pre className="overflow-x-auto rounded border border-white/10 bg-black/50 p-3 text-xs text-white/70">
              <code>{iface.command}</code>
            </pre>
          </Link>
        ))}
      </div>
    </>
  );
}
