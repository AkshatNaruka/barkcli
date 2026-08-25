import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Advanced Features — barkcli",
  description:
    "Sessions, checkpoints, sprints, hooks, and workflow automation for barkcli.",
  path: "/docs/advanced",
});

export default function AdvancedPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Docs", href: "/docs" },
          { label: "Advanced", href: "/docs/advanced" },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Advanced Features</h1>
      <p className="mb-12 text-lg text-white/60">
        Sessions, checkpoints, sprints, and hooks.
      </p>

      <div className="space-y-16">
        {/* Sessions */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">Sessions</h2>
          <p className="mb-4 text-white/60">
            barkcli captures agent sessions — when you or an AI agent works on a
            task, the session is recorded.
          </p>
          <div className="mb-4">
            <h3 className="mb-2 text-lg font-semibold">What&apos;s Captured</h3>
            <ul className="list-inside list-disc space-y-1 text-white/60">
              <li>Prompt — What you asked the agent</li>
              <li>Files touched — Which files were modified</li>
              <li>Commit — The git commit created</li>
              <li>Duration — How long the session took</li>
              <li>Matched cards — Which tasks were affected</li>
            </ul>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`barkcli session list              # show captured sessions
barkcli session show session-abc  # full session detail
barkcli session resume session-abc # print context for agent`}</code>
          </pre>
        </section>

        {/* Checkpoints */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">Checkpoints</h2>
          <p className="mb-4 text-white/60">
            Checkpoints save your board state at a point in time. You can restore
            to any checkpoint.
          </p>
          <div className="mb-4">
            <h3 className="mb-2 text-lg font-semibold">Types</h3>
            <ul className="list-inside list-disc space-y-1 text-white/60">
              <li>Manual — You save explicitly</li>
              <li>Auto — Created automatically when git commits touch .board files</li>
            </ul>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`barkcli checkpoint list           # list checkpoints
barkcli checkpoint save "before refactor" # save checkpoint
barkcli checkpoint restore checkpoint-abc # restore`}</code>
          </pre>
        </section>

        {/* Hooks */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">Hooks</h2>
          <p className="mb-4 text-white/60">
            Hooks let barkcli integrate with your coding agent (opencode,
            claude-code, etc.).
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`barkcli hooks install             # install for all agents
barkcli hooks install --agent opencode # specific agent
barkcli hooks status              # show installed hooks`}</code>
          </pre>
          <div className="mt-4">
            <h3 className="mb-2 text-lg font-semibold">What Hooks Do</h3>
            <ul className="list-inside list-disc space-y-1 text-white/60">
              <li>Post-session — Record the agent session automatically</li>
              <li>Post-commit — Save a checkpoint if .board files changed</li>
            </ul>
          </div>
        </section>

        {/* Sprints */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">Sprints</h2>
          <p className="mb-4 text-white/60">
            Sprints let you group tasks into time-boxed iterations.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`barkcli sprint start "Sprint 1" --ends 2024-12-31
barkcli sprint end "Sprint 1"
barkcli sprint list`}</code>
          </pre>
        </section>

        {/* MCP Server */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">MCP Server</h2>
          <p className="mb-4 text-white/60">
            barkcli includes an MCP server for coding agent integration via
            JSON-RPC 2.0 over stdio.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`barkcli mcp  # Start MCP server

# Exposes 25+ tools:
# - board_list, card_list, card_create, card_update
# - code_search, callgraph_get, metrics_get
# - task_create, task_assign, task_complete
# - agent_register, orchestrate_next`}</code>
          </pre>
        </section>

        {/* Pro Features */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">Pro Features</h2>
          <p className="mb-4 text-white/60">
            Advanced features requiring a license.
          </p>
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 font-semibold">AI Task Breakdown</h3>
              <pre className="text-sm text-white/80">
                <code>barkcli ai "Break down the authentication feature"</code>
              </pre>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 font-semibold">Reporting</h3>
              <pre className="text-sm text-white/80">
                <code>{`barkcli report                    # weekly report
barkcli report --sprint "Sprint 1"  # sprint burndown
barkcli changelog                 # auto-generate from git
barkcli stats                     # progress analytics`}</code>
              </pre>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 font-semibold">Templates</h3>
              <pre className="text-sm text-white/80">
                <code>{`barkcli template list
barkcli template install feature`}</code>
              </pre>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 font-semibold">GitHub Sync</h3>
              <pre className="text-sm text-white/80">
                <code>{`barkcli sync --push    # push to GitHub Issues
barkcli sync --pull    # pull from GitHub Issues`}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* File Structure */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">File Structure</h2>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <code>{`.board/
├── config.json          # Board configuration
├── main.board           # Your tasks (YAML)
├── history/
│   └── main.log         # Change history (JSONL)
├── sessions/
│   └── main.jsonl       # Agent sessions
├── snapshots/
│   ├── manual/          # Manual checkpoints
│   └── auto/            # Auto-checkpoints
├── context/
│   └── main.json        # Code context
├── sprints/
│   └── main.json        # Sprint metadata
└── .gitignore           # Ignores everything except *.board`}</code>
          </pre>
        </section>
      </div>
    </>
  );
}
