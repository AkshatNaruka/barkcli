import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata, howToJsonLd } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Getting Started — barkcli",
  description:
    "Install barkcli and create your first task in 10 seconds. No accounts, no cloud, no configuration.",
  path: "/docs/getting-started",
});

const steps = [
  {
    name: "Install barkcli",
    text: "Install barkcli with a single command. No dependencies required.",
    command: "curl -fsSL https://barkcli.vercel.app/install.sh | sh",
  },
  {
    name: "Initialize your project",
    text: "Run barkcli init in your project directory to create the .board directory.",
    command: "barkcli init",
  },
  {
    name: "Add your first task",
    text: "Create a task with a title and optional priority.",
    command: 'barkcli add "Build login page" -p high',
  },
  {
    name: "View your tasks",
    text: "List all tasks grouped by column.",
    command: "barkcli list",
  },
  {
    name: "Move tasks through workflow",
    text: "Move tasks across columns as you work.",
    command: "barkcli move build-login-page doing",
  },
];

export default function GettingStartedPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={howToJsonLd(steps)}
      />

      <Breadcrumbs
        items={[
          { label: "Docs", href: "/docs" },
          { label: "Getting Started", href: "/docs/getting-started" },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Getting Started</h1>
      <p className="mb-12 text-lg text-white/60">
        Get up and running with barkcli in 10 seconds.
      </p>

      <div className="space-y-8">
        {steps.map((step, i) => (
          <div key={step.name} className="flex gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
              {i + 1}
            </div>
            <div className="flex-1">
              <h2 className="mb-2 text-xl font-semibold">{step.name}</h2>
              <p className="mb-3 text-white/60">{step.text}</p>
              <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
                <code>{step.command}</code>
              </pre>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-xl font-semibold">What&apos;s Next?</h2>
        <ul className="space-y-2 text-white/60">
          <li>
            <Link href="/docs/commands" className="text-white hover:underline">
              Commands Reference
            </Link>{" "}
            — Full list of all commands
          </li>
          <li>
            <Link href="/docs/interfaces" className="text-white hover:underline">
              Interfaces
            </Link>{" "}
            — TUI, Web App, and CLI
          </li>
          <li>
            <Link href="/docs/code-context" className="text-white hover:underline">
              Code Context
            </Link>{" "}
            — Link code to tasks
          </li>
        </ul>
      </div>
    </>
  );
}
