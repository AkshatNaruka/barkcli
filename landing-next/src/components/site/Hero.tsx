import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { GitHubMark } from "./Brand";
import { MCP_TOOL_COUNT } from "@/lib/mcp";
import { CopyButton } from "./CopyButton";
import { HeroFlow } from "./HeroFlow";

const INSTALL =
  "curl -fsSL https://github.com/AkshatNaruka/barkcli/releases/latest/download/install.sh | sh";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Atmosphere: a fine grid and one warm light source, nothing more. */}
      <div className="pointer-events-none absolute inset-0 bark-grid opacity-70" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bark-aura" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent"
        aria-hidden
      />

      <div className="relative mx-auto grid w-full max-w-[1120px] items-center gap-14 px-5 pb-20 pt-14 md:px-8 md:pt-20 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:gap-12 lg:pb-24 lg:pt-24">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] py-1 pl-2 pr-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full rounded-full bg-success/70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            Open source · MIT · Local first
          </p>

          <h1 className="mt-6 font-display text-[clamp(2.5rem,6vw,4.15rem)] font-medium leading-[0.98] tracking-[-0.035em] text-fg">
            Your agents build.
            <br />
            <span className="text-copper">You stay in control.</span>
          </h1>

          <p className="mt-6 max-w-[34rem] text-[15.5px] leading-[1.65] text-muted sm:text-[16.5px]">
            BarkCLI plans your intent, runs each task in an isolated git worktree with the
            coding agents you already pay for, and gates every change on your project&rsquo;s
            own tests. You review finished work — not half-done branches.
          </p>

          <div className="mt-7 flex items-center gap-2 rounded-lg border border-line bg-surface/80 p-1 pl-3">
            <span className="select-none font-mono text-[12px] text-copper" aria-hidden>
              $
            </span>
            <code className="min-w-0 flex-1 truncate py-1.5 font-mono text-[11.5px] text-fg/85 sm:text-[12.5px]">
              {INSTALL}
            </code>
            <CopyButton
              value={INSTALL}
              label="Copy"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-line bg-raised px-3 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="#install"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-copper px-5 text-[14px] font-medium text-ink transition-colors hover:bg-copper-soft"
            >
              Install BarkCLI
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a
              href="#how"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-line px-4 text-[14px] text-fg/85 transition-colors hover:border-line-strong hover:text-fg"
            >
              <Play className="size-3.5 text-copper" aria-hidden />
              See how a run works
            </a>
            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted transition-colors hover:text-fg"
            >
              <GitHubMark className="size-3.5" />
              Star on GitHub
            </a>
          </div>

          <dl className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-[11.5px] text-muted-dim">
            <div className="flex items-baseline gap-1.5">
              <dt className="font-medium text-fg/80">No cloud</dt>
              <dd>your repo is the database</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="font-medium text-fg/80">No accounts</dt>
              <dd>one native binary</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="font-medium text-fg/80">{MCP_TOOL_COUNT} MCP tools</dt>
              <dd>for your agent</dd>
            </div>
          </dl>
        </div>

        <HeroFlow />
      </div>
    </section>
  );
}
