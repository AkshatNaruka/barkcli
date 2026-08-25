import Link from "next/link";
import type { Metadata } from "next";
import { generatePageMetadata, softwareApplicationJsonLd, faqJsonLd } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Documentation — barkcli",
  description:
    "Complete documentation for barkcli. Learn commands, interfaces, code context, and advanced features.",
  path: "/docs",
});

const sections = [
  {
    title: "Getting Started",
    description: "Install barkcli and create your first task in 10 seconds.",
    href: "/docs/getting-started",
    icon: "🚀",
  },
  {
    title: "Commands",
    description: "Complete reference for all barkcli commands with examples.",
    href: "/docs/commands",
    icon: "⌨️",
  },
  {
    title: "Interfaces",
    description: "CLI, Terminal UI, Web App, and VS Code extension guides.",
    href: "/docs/interfaces",
    icon: "🖥️",
  },
  {
    title: "Code Context",
    description: "Link code to tasks with automatic analysis and AI features.",
    href: "/docs/code-context",
    icon: "🔍",
  },
  {
    title: "Advanced",
    description: "Sessions, checkpoints, sprints, and Pro features.",
    href: "/docs/advanced",
    icon: "⚡",
  },
];

const faqs = [
  {
    question: "How long does it take to set up barkcli?",
    answer:
      "About 10 seconds. Run `barkcli init` in any project and you're ready to add tasks.",
  },
  {
    question: "Do I need to create an account?",
    answer:
      "No. barkcli is a local binary. No accounts, no cloud, no subscriptions.",
  },
  {
    question: "Can I use barkcli with my team?",
    answer:
      "Yes. Commit the .board directory to your repo. Team members pull changes via git.",
  },
  {
    question: "What about the AI features?",
    answer:
      "barkcli includes an MCP server for coding agent integration. AI features are optional — the core tool works without them.",
  },
];

export default function DocsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={softwareApplicationJsonLd()}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={faqJsonLd(faqs)}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Documentation</h1>
      <p className="mb-12 text-lg text-white/60">
        Everything you need to get started with barkcli.
      </p>

      <div className="mb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <div className="mb-3 text-2xl">{section.icon}</div>
            <h2 className="mb-2 text-lg font-semibold text-white group-hover:text-white/90">
              {section.title}
            </h2>
            <p className="text-sm text-white/50">{section.description}</p>
          </Link>
        ))}
      </div>

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
    </>
  );
}
