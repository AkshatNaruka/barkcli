"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CopyButton } from "./CopyButton";

const RELEASE = "https://github.com/AkshatNaruka/barkcli/releases/latest/download";

type Method = {
  id: string;
  label: string;
  command: string;
  note: string;
  recommended?: boolean;
  isLink?: boolean;
};

const METHODS: Method[] = [
  {
    id: "unix",
    label: "macOS / Linux",
    command: `curl -fsSL ${RELEASE}/install.sh | sh`,
    note: "Fetches the release binary for your architecture, checks it against the published SHA256SUMS, and puts barkcli on your PATH.",
    recommended: true,
  },
  {
    id: "windows",
    label: "Windows",
    command: `irm ${RELEASE}/install.ps1 | iex`,
    note: "PowerShell installer with the same checksum step, for the Windows release build.",
  },
  {
    id: "source",
    label: "From source",
    command:
      "git clone https://github.com/AkshatNaruka/barkcli && cd barkcli && cargo build --release",
    note: "Needs a Rust toolchain and a few minutes. The binary lands in target/release/.",
  },
  {
    id: "releases",
    label: "Direct download",
    command: "https://github.com/AkshatNaruka/barkcli/releases/latest",
    note: "Prebuilt archives per platform, plus SHA256SUMS. Useful when you manage your own binaries.",
    isLink: true,
  },
];

/**
 * One column, one panel: the last friction before someone can try the thing.
 * Every route here resolves on the latest release; nothing aspirational.
 */
export function InstallSection() {
  const [active, setActive] = useState(METHODS[0].id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = METHODS.find((method) => method.id === active) ?? METHODS[0];

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = METHODS.findIndex((method) => method.id === active);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % METHODS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + METHODS.length) % METHODS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = METHODS.length - 1;
    else return;
    event.preventDefault();
    setActive(METHODS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="install" className="relative border-t border-line bg-bg-deep/50 py-20 md:py-28">
      <div className="mx-auto w-full max-w-[820px] px-5 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-medium leading-[1.05] tracking-[-0.025em] text-fg">
            One binary, no runtime.
          </h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-[1.65] text-muted">
            No account, no cloud, no telemetry. The installer checks the archive against the
            SHA256SUMS published with the release.
          </p>
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-line bg-surface/70">
          <div
            role="tablist"
            aria-label="Install methods"
            onKeyDown={onKeyDown}
            className="flex flex-wrap gap-1 border-b border-line bg-white/[0.015] p-2"
          >
            {METHODS.map((method, index) => {
              const selected = method.id === active;
              return (
                <button
                  key={method.id}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  role="tab"
                  id={`install-tab-${method.id}`}
                  aria-selected={selected}
                  aria-controls="install-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(method.id)}
                  className={`inline-flex min-h-10 items-center rounded-md px-2.5 py-2 text-[12px] transition-colors ${
                    selected
                      ? "bg-raised text-fg"
                      : "text-muted hover:bg-white/[0.03] hover:text-fg"
                  }`}
                >
                  {method.label}
                  {method.recommended && (
                    <span className="ml-1.5 rounded border border-copper/30 bg-copper/10 px-1 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-copper-soft">
                      default
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div id="install-panel" role="tabpanel" aria-labelledby={`install-tab-${current.id}`}>
            <div className="flex items-start gap-3 border-b border-line px-4 py-5">
              {current.isLink ? (
                <>
                  <a
                    href={current.command}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 break-all font-mono text-[12px] leading-[1.75] text-copper-soft underline-offset-4 hover:underline"
                  >
                    github.com/AkshatNaruka/barkcli/releases
                  </a>
                  <CopyButton value={current.command} label="Copy link" />
                </>
              ) : (
                <>
                  <span className="select-none pt-1 font-mono text-[12px] text-copper" aria-hidden>
                    $
                  </span>
                  <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-[1.75] text-fg/85">
                    {current.command}
                  </code>
                  <CopyButton value={current.command} label="Copy command" />
                </>
              )}
            </div>
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] text-muted">{current.note}</p>
              <p className="font-mono text-[10px] text-muted-dim">builds for macOS, Linux, Windows</p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center">
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center gap-1 py-2 text-[12.5px] text-copper-soft underline-offset-4 hover:underline"
          >
            Getting started guide
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </p>
      </div>
    </section>
  );
}
