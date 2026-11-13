import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandLockup } from "./site/Brand";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#features", label: "Features" },
      { href: "/features", label: "Feature index" },
      { href: "/benchmark", label: "Context benchmark" },
      { href: "/compare", label: "Compare tools" },
    ],
  },
  {
    title: "Documentation",
    links: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/getting-started", label: "Getting started" },
      { href: "/docs/commands", label: "Command reference" },
      { href: "/docs/concepts", label: "Core concepts" },
      { href: "/docs/api-reference", label: "REST & MCP API" },
      { href: "/docs/web-app", label: "Web app guide" },
    ],
  },
  {
    title: "Project",
    links: [
      { href: "https://github.com/AkshatNaruka/barkcli", label: "Source", external: true },
      { href: "https://github.com/AkshatNaruka/barkcli/issues", label: "Issues", external: true },
      {
        href: "https://github.com/AkshatNaruka/barkcli/releases",
        label: "Releases",
        external: true,
      },
      { href: "https://github.com/AkshatNaruka/barkcli/blob/main/LICENSE", label: "MIT license", external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto w-full max-w-[1120px] px-5 py-14 md:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-90"
              aria-label="barkcli home"
            >
              <BrandLockup />
            </Link>
            <p className="mt-4 max-w-[280px] text-[12.5px] leading-[1.7] text-muted">
              The management layer for AI agents. Humans write intent, agents build and test in
              isolated worktrees, and only passing work merges.
            </p>
            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              Source on GitHub
              <ArrowUpRight className="size-3" aria-hidden />
            </a>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-dim">
                {column.title}
              </h2>
              <ul className="mt-3.5 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-6 items-center text-[12.5px] text-muted transition-colors hover:text-fg"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="inline-flex min-h-6 items-center text-[12.5px] text-muted transition-colors hover:text-fg"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-dim">
            MIT licensed. No tracking cookies. Local first.
          </p>
          <p className="text-[11.5px] text-muted-dim">
            BarkCLI is built by{" "}
            <a
              href="https://github.com/AkshatNaruka"
              target="_blank"
              rel="noreferrer"
              className="text-muted transition-colors hover:text-fg"
            >
              Akshat Naruka
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
