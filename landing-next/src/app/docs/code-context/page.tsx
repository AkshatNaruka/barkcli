import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Code Context — barkcli",
  description:
    "Link code to tasks with automatic analysis. Call graphs, test coverage, and complexity metrics.",
  path: "/docs/code-context",
});

export default function CodeContextPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Docs", href: "/docs" },
          { label: "Code Context", href: "/docs/code-context" },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Code Context</h1>
      <p className="mb-12 text-lg text-white/60">
        Link code to tasks with automatic analysis. All local, no LLM required.
      </p>

      <div className="mb-12">
        <h2 className="mb-3 text-xl font-semibold">Overview</h2>
        <p className="mb-4 text-white/60">
          Code context creates a bridge between your task management and actual
          code. It stores which files each task touches, tracks their status, and
          provides coverage metrics.
        </p>
        <p className="text-white/60">
          Derived data lives in <code className="text-white/80">.board/context/&lt;board&gt;.json</code> —
          gitignored and regenerable.
        </p>
      </div>

      <div className="mb-12">
        <h2 className="mb-3 text-xl font-semibold">Quick Start</h2>
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          <code>{`# Scan your codebase and link files to cards
barkcli context scan

# Check coverage
barkcli context status

# Search for code
barkcli code "authentication"`}</code>
        </pre>
      </div>

      <div className="mb-12 space-y-8">
        <div>
          <h2 className="mb-3 text-xl font-semibold">barkcli code &lt;query&gt;</h2>
          <p className="mb-3 text-white/60">
            Search symbols and files, then see which cards are linked.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`barkcli code "login"              # find login-related code
barkcli code "UserService"        # find a class
barkcli code "src/api"            # find files in a path`}</code>
          </pre>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">barkcli context scan</h2>
          <p className="mb-3 text-white/60">
            Automatically map cards to code files using fuzzy title matching.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`barkcli context scan

# How it works:
# 1. Reads all card titles
# 2. Scans your codebase for files and symbols
# 3. Matches titles to code using fuzzy scoring
# 4. Updates the context with matched files`}</code>
          </pre>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">barkcli context link</h2>
          <p className="mb-3 text-white/60">
            Manually pin a file or symbol to a card.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`barkcli context link jwt-login src/auth/login.ts
barkcli context link jwt-login UserService`}</code>
          </pre>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">barkcli context status</h2>
          <p className="mb-3 text-white/60">
            Show coverage and staleness of your code context.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`barkcli context status

# Output:
# Board: main
# Coverage: 67% (12/18 files linked)
# Stale files: 3 (not updated in >7 days)`}</code>
          </pre>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">barkcli context sync</h2>
          <p className="mb-3 text-white/60">
            Git-aware refresh of your context. Updates last commit info and
            dirty state.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`barkcli context sync

# This command:
# - Checks which files have been modified since last commit
# - Updates the last_commit field for each file
# - Marks files as dirty or clean`}</code>
          </pre>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">barkcli context autosync</h2>
          <p className="mb-3 text-white/60">
            Automatically run context sync after each git commit.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`barkcli context autosync on       # enable
barkcli context autosync off      # disable`}</code>
          </pre>
        </div>
      </div>

      <div className="mb-12">
        <h2 className="mb-3 text-xl font-semibold">Supported Languages</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="mb-2 font-semibold">Full Symbol Extraction</h3>
            <p className="text-sm text-white/50">
              JavaScript, TypeScript, Python, Rust, Go
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="mb-2 font-semibold">File-Level Matching</h3>
            <p className="text-sm text-white/50">
              All other languages (path-based matching)
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-xl font-semibold">Privacy</h2>
        <p className="text-white/60">
          All code context analysis runs locally. No code is sent to external
          services unless you explicitly configure an AI provider (Pro feature).
        </p>
      </div>
    </>
  );
}
