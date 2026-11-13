import Link from "next/link";
import { ArrowRight } from "lucide-react";
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

      <div className="relative mx-auto grid w-full max-w-[1120px] items-center gap-14 px-5 pb-20 pt-14 md:px-8 md:pt-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-12 lg:pb-24 lg:pt-24">
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-dim">
            MIT licensed. Local first.
          </p>

          <h1 className="mt-6 font-display text-[clamp(2.05rem,7vw,3.7rem)] font-medium leading-[0.98] tracking-[-0.035em] text-fg lg:text-[clamp(2.5rem,4.1vw,3.7rem)]">
            Your agents build.
            <br />
            <span className="text-copper">You stay in control.</span>
          </h1>

          <p className="mt-6 max-w-[32rem] text-[15.5px] leading-[1.65] text-muted sm:text-[16.5px]">
            Plan intent, dispatch each task into an isolated worktree, and merge only what
            passes your own tests.
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

          <div className="mt-5">
            <Link
              href="#how"
              className="inline-flex h-11 items-center gap-2 rounded-md text-[13.5px] text-muted transition-colors hover:text-fg"
            >
              See how a run works
              <ArrowRight className="size-3.5 text-copper" aria-hidden />
            </Link>
          </div>
        </div>

        <HeroFlow />
      </div>
    </section>
  );
}
