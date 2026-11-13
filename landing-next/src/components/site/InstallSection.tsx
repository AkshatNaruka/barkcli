"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CopyButton } from "./CopyButton";

const METHODS = [
  {
    id: "unix",
    label: "macOS / Linux",
    command:
      "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh",
    note: "Downloads the release binary and puts barkcli on your PATH.",
    recommended: true,
  },
  {
    id: "app",
    label: "macOS app",
    command:
      "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install-app.sh | sh",
    note: "Installs Bark.app with the local runtime embedded.",
  },
  {
    id: "brew",
    label: "Homebrew",
    command: "brew tap AkshatNaruka/barkcli && brew install barkcli",
    note: "For Homebrew users who prefer to manage updates themselves.",
  },
  {
    id: "cargo",
    label: "Cargo",
    command: "cargo install barkcli",
    note: "Build from source with a Rust toolchain.",
  },
  {
    id: "windows",
    label: "Windows",
    command:
      "irm https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.ps1 | iex",
    note: "PowerShell installer, published next to the other release targets.",
  },
];

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
      <div className="mx-auto w-full max-w-[1120px] px-5 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-16">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-copper">
              Install
            </p>
            <h2 className="mt-4 font-display text-[clamp(1.9rem,4vw,3rem)] font-medium leading-[1.05] tracking-[-0.025em] text-fg">
              One binary. About ten seconds.
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-[1.65] text-muted">
              No account, no cloud dependency, no telemetry. The installer verifies the release
              checksum before it writes anything to your machine.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-[12.5px]">
              <Link
                href="/docs/getting-started"
                className="inline-flex items-center gap-1 text-copper-soft underline-offset-4 hover:underline"
              >
                Getting started guide
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
              <a
                href="https://github.com/AkshatNaruka/barkcli/releases"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                All release targets
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-line bg-surface/70">
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
                <span className="select-none pt-1 font-mono text-[12px] text-copper" aria-hidden>
                  $
                </span>
                <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-[1.75] text-fg/85">
                  {current.command}
                </code>
                <CopyButton value={current.command} label="Copy command" />
              </div>
              <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[12px] text-muted">{current.note}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-dim">
                  macOS · Linux · Windows
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
