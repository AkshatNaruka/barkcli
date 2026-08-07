"use client";

import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TerminalDemo } from "@/components/TerminalDemo";

/* ── Copy button for install command ── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`ml-3 text-xs font-mono rounded-md border px-3 py-1.5 transition-colors shrink-0 cursor-pointer ${
        copied
          ? "text-[#059669] border-[#059669]/30 bg-[#059669]/5"
          : "text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
      }`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const INSTALL = "curl -fsSL https://barkcli.vercel.app/install.sh | sh";

/* Floating YAML chips drifting in the background */
const CHIPS = [
  { text: "id: fix-auth-bug", cls: "left-[5%] top-[16%]", dur: "18s", delay: "0s" },
  { text: "- high\n  - sprint:s1", cls: "right-[7%] top-[13%]", dur: "22s", delay: "-6s" },
  { text: "done: true", cls: "left-[13%] bottom-[18%]", dur: "20s", delay: "-11s" },
  { text: "# dev.board", cls: "right-[15%] bottom-[22%]", dur: "24s", delay: "-3s" },
  { text: "column: doing", cls: "left-[44%] top-[7%]", dur: "19s", delay: "-15s" },
];

const FEATURES = ["CLI", "Terminal UI", "Web app", "VS Code", "Git-native", "YAML", "MIT"];

/* ── Page ── */

export default function Home() {
  return (
    <div className="h-dvh flex flex-col overflow-hidden bark-grid relative">
      {/* Ambient glow + floating chips */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="bark-glow absolute -top-1/4 left-1/2 -translate-x-1/2 w-[80vw] h-[70vh]" />
        {CHIPS.map((c, i) => (
          <div
            key={i}
            className={`bark-chip hidden md:block ${c.cls}`}
            style={{ animationDuration: c.dur, animationDelay: c.delay }}
          >
            {c.text.split("\n").map((l, j) => (
              <div key={j}>{l}</div>
            ))}
          </div>
        ))}
      </div>

      {/* Nav */}
      <header className="relative z-10 border-b border-border shrink-0">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2 no-underline">
            <span className="text-lg">🐶</span>
            <span className="text-sm font-bold tracking-tight font-mono text-foreground">
              barkcli
            </span>
          </a>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Hero + demo — single viewport, no scrolling */}
      <main className="relative z-10 flex-1 min-h-0 grid lg:grid-cols-[1fr_1.05fr] items-center gap-10 lg:gap-14 w-full max-w-6xl mx-auto px-6 py-8 lg:py-0">
        {/* Left: copy */}
        <div className="animate-fade-in text-center lg:text-left">
          <span className="inline-flex items-center gap-2 text-[10.5px] font-mono text-muted-foreground border border-border rounded-full px-3 py-1 mb-5 bg-secondary/50">
            <span className="w-1.5 h-1.5 rounded-full bg-[#28c840]" />
            Open source · MIT · single binary
          </span>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.08] mb-4">
            Tasks in your repo.
            <br />
            <span className="bg-gradient-to-r from-[#60a5fa] to-[#a78bfa] bg-clip-text text-transparent">
              No cloud required.
            </span>
          </h1>

          <p className="text-[15px] text-muted-foreground max-w-md mx-auto lg:mx-0 mb-7 leading-relaxed">
            A git-native kanban board that lives in your codebase. Diff it,
            merge it, grep it — CLI, terminal UI, web app and VS Code
            extension from one binary.
          </p>

          <div id="install" className="lg:mx-0 mx-auto max-w-md">
            <div className="flex items-center justify-between border border-border rounded-lg pl-4 pr-1.5 py-2 bg-secondary/60 backdrop-blur-sm">
              <code className="text-[13px] font-mono text-foreground truncate">
                <span className="text-muted-foreground select-none">$ </span>
                {INSTALL}
              </code>
              <CopyButton text={INSTALL} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2.5 font-mono">
              macOS · Linux · Windows
            </p>
          </div>

          <div className="flex flex-wrap justify-center lg:justify-start gap-1.5 mt-5">
            {FEATURES.map((f) => (
              <span
                key={f}
                className="text-[10.5px] font-mono text-muted-foreground border border-border rounded-md px-2 py-1 bg-card/60"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Right: terminal + kanban demo */}
        <div className="hidden lg:block animate-fade-in [animation-delay:0.15s] space-y-3 min-h-0">
          <TerminalDemo />
          <BoardDemo />
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border py-2.5 text-center text-[10px] font-mono text-muted-foreground shrink-0">
        barkcli ·{" "}
        <a
          href="https://github.com/AkshatNaruka/barkcli"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground transition-colors"
        >
          GitHub
        </a>{" "}
        · MIT License
      </footer>
    </div>
  );
}

/* ── Animated kanban demo: a card flows todo → doing → done ── */

function BoardDemo() {
  const cols = [
    { name: "To Do", count: 1 },
    { name: "Doing", count: 0 },
    { name: "Done", count: 0 },
  ];
  return (
    <div className="rounded-xl border border-border bg-card/70 backdrop-blur-sm shadow-[0_24px_60px_rgba(0,0,0,0.35)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/60">
        <span className="text-[10px] font-mono text-foreground">dev.board</span>
        <span className="text-[10px] font-mono text-muted-foreground">4 columns · git tracked</span>
      </div>
      <div className="relative grid grid-cols-3 gap-3 p-4">
        {cols.map((col) => (
          <div key={col.name}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-muted-foreground">{col.name}</span>
              <span className="text-[9px] font-mono text-muted-foreground/60">{col.count}/1</span>
            </div>
            <div className="h-[52px] rounded-lg border border-dashed border-border/70 bg-secondary/30" />
          </div>
        ))}

        {/* The travelling card */}
        <div className="bark-card-path absolute left-[2.5%] top-[26px] w-[30%] rounded-lg border border-border bg-card p-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
          <div className="text-[10.5px] font-mono text-foreground truncate">Fix auth bug</div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[8.5px] font-mono text-muted-foreground">-p high</span>
            <span className="bark-check text-[11px] font-bold text-[#28c840]">✓</span>
          </div>
        </div>
      </div>
    </div>
  );
}
