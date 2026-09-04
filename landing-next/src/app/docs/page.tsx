"use client";

import Link from "next/link";
import {
  Rocket,
  Terminal,
  Monitor,
  Search,
  Zap,
  ChevronRight,
  HelpCircle,
  Globe,
  Code2,
  Bot,
} from "lucide-react";

const sections = [
  {
    title: "Autopilot",
    description: "Type intent, approve plans, merge. Agents do the rest — start here.",
    href: "/docs/autopilot",
    icon: Bot,
  },
  {
    title: "Getting Started",
    description: "Install barkcli and create your first task in 10 seconds.",
    href: "/docs/getting-started",
    icon: Rocket,
  },
  {
    title: "Core Concepts",
    description: "Tasks, boards, projects, and code context — the mental model.",
    href: "/docs/concepts",
    icon: Search,
  },
  {
    title: "Commands",
    description: "Complete reference for all barkcli commands with examples.",
    href: "/docs/commands",
    icon: Terminal,
  },
  {
    title: "Interfaces",
    description: "CLI, Terminal UI, Web App, and VS Code extension guides.",
    href: "/docs/interfaces",
    icon: Monitor,
  },
  {
    title: "Web App Guide",
    description: "Complete guide to the browser interface — no CLI knowledge required.",
    href: "/docs/web-app",
    icon: Globe,
  },
  {
    title: "API Reference",
    description: "REST API documentation for all web server endpoints.",
    href: "/docs/api-reference",
    icon: Code2,
  },
  {
    title: "Code Context",
    description: "Link code to tasks with automatic analysis and AI features.",
    href: "/docs/code-context",
    icon: Search,
  },
  {
    title: "Advanced",
    description: "Sessions, checkpoints, sprints, hooks, and MCP.",
    href: "/docs/advanced",
    icon: Zap,
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
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          }),
        }}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Documentation</h1>
      <p className="mb-12 text-lg text-white/60">
        Everything you need to get started with barkcli.
      </p>

      <div className="mb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/20 hover:bg-white/10"
            >
              <div className="w-10 h-10 rounded-lg bg-[#B8845C]/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-[#B8845C]" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-white group-hover:text-white/90 flex items-center gap-2">
                {section.title}
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h2>
              <p className="text-sm text-white/50">{section.description}</p>
            </Link>
          );
        })}
      </div>

      <h2 className="mb-6 text-2xl font-bold">Frequently Asked Questions</h2>
      <div className="space-y-4">
        {faqs.map((faq) => (
          <div
            key={faq.question}
            className="rounded-xl border border-white/10 bg-white/5 p-6"
          >
            <h3 className="mb-2 text-lg font-semibold flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[#B8845C]" />
              {faq.question}
            </h3>
            <p className="text-white/60">{faq.answer}</p>
          </div>
        ))}
      </div>
    </>
  );
}
