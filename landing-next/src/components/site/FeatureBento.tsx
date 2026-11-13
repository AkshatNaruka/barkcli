import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Reveal } from "./Reveal";
import { ClaudeCodeLogo, CodexLogo, OpenCodeLogo } from "@/components/AgentLogos";

const CELL =
  "group relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-line bg-surface/60 p-6 transition-colors duration-300 hover:border-line-strong";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper">{children}</p>
  );
}

function LearnMore({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-5 inline-flex items-center gap-1 text-[12px] text-muted transition-colors group-hover:text-copper-soft"
    >
      {label}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/**
 * Six capabilities, weighted by what a person actually gets — not one grid of
 * identical marketing cards.
 */
export function FeatureBento() {
  return (
    <section id="features" className="relative border-t border-line py-20 md:py-28">
      <div className="mx-auto w-full max-w-[1120px] px-5 md:px-8">
        <div className="max-w-2xl">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-copper">
            Built for agentic work
          </p>
          <h2 className="mt-4 font-display text-[clamp(1.9rem,4vw,3rem)] font-medium leading-[1.05] tracking-[-0.025em] text-fg">
            The parts that make delegation safe.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-[1.65] text-muted">
            Isolation, verification, and memory are not add-ons here. They are the reason an
            agent&rsquo;s work can be trusted with your repository.
          </p>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
          {/* Orchestration — the largest cell */}
          <Reveal className="lg:col-span-4">
            <div className={CELL}>
              <div>
                <Eyebrow>Multi-agent orchestration</Eyebrow>
                <h3 className="mt-3 font-display text-[21px] font-medium leading-tight text-fg">
                  Dispatch to the agents you already run
                </h3>
                <p className="mt-2 max-w-md text-[13.5px] leading-[1.65] text-muted">
                  BarkCLI routes each task to a compatible agent, streams its work, and keeps a
                  transcript per attempt. Swap agents per task instead of standardising on one.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  { name: "claude-code", Logo: ClaudeCodeLogo },
                  { name: "codex", Logo: CodexLogo },
                  { name: "opencode", Logo: OpenCodeLogo },
                  { name: "cursor", Logo: null },
                ].map((agent) => (
                  <span
                    key={agent.name}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bg/60 px-2 py-1 font-mono text-[10.5px] text-fg/75"
                  >
                    {agent.Logo ? (
                      <agent.Logo className="size-3.5" />
                    ) : (
                      <span className="size-3.5 rounded-[3px] bg-copper/25" aria-hidden />
                    )}
                    {agent.name}
                  </span>
                ))}
                <span className="inline-flex items-center rounded-md border border-dashed border-line px-2 py-1 font-mono text-[10.5px] text-muted-dim">
                  + any MCP agent
                </span>
              </div>
              <LearnMore href="/features/agent-queue" label="Agent queue and roles" />
            </div>
          </Reveal>

          {/* Worktrees */}
          <Reveal className="lg:col-span-2" delay={0.05}>
            <div className={CELL}>
              <div>
                <Eyebrow>Isolated worktrees</Eyebrow>
                <h3 className="mt-3 font-display text-[18px] font-medium leading-tight text-fg">
                  Parallel work, zero collisions
                </h3>
                <p className="mt-2 text-[13px] leading-[1.65] text-muted">
                  Each attempt gets its own checkout and branch. Your working tree is never
                  mutated mid-thought.
                </p>
              </div>
              <code className="mt-5 block truncate rounded-md border border-line bg-bg/60 px-2 py-1.5 font-mono text-[10.5px] text-copper-soft">
                .board/worktrees/&lt;task&gt;
              </code>
              <LearnMore href="/features/worktree-cleanup" label="And reclaim the disk" />
            </div>
          </Reveal>

          {/* Gate */}
          <Reveal className="lg:col-span-3" delay={0.05}>
            <div className={CELL}>
              <div>
                <Eyebrow>Verification before review</Eyebrow>
                <h3 className="mt-3 flex items-center gap-2 font-display text-[18px] font-medium leading-tight text-fg">
                  <ShieldCheck className="size-4 text-success" aria-hidden />
                  Your tests are the contract
                </h3>
                <p className="mt-2 text-[13px] leading-[1.65] text-muted">
                  &ldquo;Done&rdquo; is a passing gate in the worktree. A crash, an empty diff, or
                  a no-op test run is a failure — never a success story.
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-md border border-line bg-bg/60 px-2.5 py-2">
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-dim">
                    Agent says
                  </p>
                  <p className="mt-1 text-[12px] text-muted line-through decoration-danger/70">
                    all tests pass
                  </p>
                </div>
                <div className="rounded-md border border-success/25 bg-success/[0.06] px-2.5 py-2">
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-success/80">
                    Gate says
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-success">2 failed → retry</p>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Context */}
          <Reveal className="lg:col-span-3" delay={0.1}>
            <div className={CELL}>
              <div>
                <Eyebrow>Durable context</Eyebrow>
                <h3 className="mt-3 font-display text-[18px] font-medium leading-tight text-fg">
                  A project brief that survives sessions
                </h3>
                <p className="mt-2 text-[13px] leading-[1.65] text-muted">
                  <code className="font-mono text-[11.5px] text-fg/80">project_context.md</code>{" "}
                  is generated from the repository and refreshed as work lands, so agents stop
                  rediscovering your codebase.
                </p>
              </div>
              <div className="mt-5 flex items-end gap-4 border-t border-line pt-4">
                <div>
                  <p className="font-mono text-[22px] leading-none text-copper-soft">57×</p>
                  <p className="mt-1 text-[10.5px] text-muted-dim">less to gather</p>
                </div>
                <p className="text-[10.5px] leading-snug text-muted-dim">
                  measured on this repository with{" "}
                  <code className="font-mono">barkcli context benchmark</code>
                </p>
              </div>
              <LearnMore href="/features/codebase-brain" label="Codebase Brain" />
            </div>
          </Reveal>

          {/* Local first */}
          <Reveal className="lg:col-span-3" delay={0.05}>
            <div className={CELL}>
              <div>
                <Eyebrow>Local first, Git native</Eyebrow>
                <h3 className="mt-3 font-display text-[18px] font-medium leading-tight text-fg">
                  Your repository is the database
                </h3>
                <p className="mt-2 text-[13px] leading-[1.65] text-muted">
                  Boards, specs, memory, and run records are files you can diff, review, and roll
                  back. No account, no sync service, no cloud dependency.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {["offline", "MIT licensed", "git push to sync", "no telemetry"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-line bg-bg/60 px-2 py-0.5 font-mono text-[10px] text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <LearnMore href="/docs/concepts" label="How storage works" />
            </div>
          </Reveal>

          {/* MCP */}
          <Reveal className="lg:col-span-3" delay={0.1}>
            <div className={CELL}>
              <div>
                <Eyebrow>MCP &amp; skills</Eyebrow>
                <h3 className="mt-3 font-display text-[18px] font-medium leading-tight text-fg">
                  The same tools, from inside your agent
                </h3>
                <p className="mt-2 text-[13px] leading-[1.65] text-muted">
                  Agents read tasks, claim work, and report verdicts over MCP. Skills install from
                  a registry with a pinned lockfile, like any other dependency.
                </p>
              </div>
              <code className="mt-5 block truncate rounded-md border border-line bg-bg/60 px-2 py-1.5 font-mono text-[10.5px] text-copper-soft">
                barkcli mcp · barkcli skills install owner/repo
              </code>
              <LearnMore href="/features/skills" label="Skills and the lockfile" />
            </div>
          </Reveal>
        </div>

        <p className="mt-6 text-[12.5px] text-muted-dim">
          Want the full inventory?{" "}
          <Link href="/features" className="text-copper-soft underline-offset-4 hover:underline">
            Every feature, with the exact commands
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
