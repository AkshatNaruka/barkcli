import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GitHubMark } from "./Brand";
import { CopyButton } from "./CopyButton";

const INSTALL =
  "curl -fsSL https://github.com/AkshatNaruka/barkcli/releases/latest/download/install.sh | sh";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-line bg-bg-deep/60">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_50%_120%,rgba(217,149,92,0.16),transparent_70%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[860px] px-5 py-20 text-center md:px-8 md:py-28">
        <h2 className="font-display text-[clamp(2rem,5vw,3.4rem)] font-medium leading-[1.02] tracking-[-0.03em] text-fg">
          Stop coordinating agents by hand.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-[1.65] text-muted">
          Install once, state intent, and review what actually passed. Your repository stays yours
          the whole time.
        </p>

        <div className="mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-lg border border-line bg-surface/90 p-1 pl-3 text-left">
          <span className="select-none font-mono text-[12px] text-copper" aria-hidden>
            $
          </span>
          <code className="min-w-0 flex-1 truncate py-1.5 font-mono text-[11.5px] text-fg/85">
            {INSTALL}
          </code>
          <CopyButton value={INSTALL} label="Copy" />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="#install"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-copper px-5 text-[14px] font-medium text-ink transition-colors hover:bg-copper-soft"
          >
            Install
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <a
            href="https://github.com/AkshatNaruka/barkcli"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-line px-4 text-[14px] text-fg/85 transition-colors hover:border-line-strong hover:text-fg"
          >
            <GitHubMark className="size-4" />
            View the source
          </a>
        </div>

        <p className="mt-8 text-[12px] text-muted-dim">
          MIT licensed. No account. Uninstall is one binary.
        </p>
      </div>
    </section>
  );
}
