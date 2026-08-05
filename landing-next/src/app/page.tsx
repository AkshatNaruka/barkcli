"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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

/* ── Priority badge ── */

function Priority({ level }: { level: "high" | "medium" | "low" }) {
  const colors = {
    high: "bg-red-50 text-red-700 border-red-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <span
      className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border ${colors[level]}`}
    >
      {level.toUpperCase()}
    </span>
  );
}

/* ── Card box for kanban cards ── */

function CardBox({
  title,
  priority,
  label,
}: {
  title: string;
  priority: "high" | "medium" | "low";
  label: string;
}) {
  const borderColor = {
    high: "border-l-red-400",
    medium: "border-l-amber-400",
    low: "border-l-emerald-400",
  };
  return (
    <div
      className={`rounded-md border border-border border-l-2 ${borderColor[priority]} bg-white px-2.5 py-2 text-left shadow-sm`}
    >
      <div className="text-[11px] font-medium text-foreground leading-tight mb-1">
        {title}
      </div>
      <div className="flex items-center gap-1.5">
        <Priority level={priority} />
        <span className="text-[9px] text-muted-foreground font-mono">
          {label}
        </span>
      </div>
    </div>
  );
}

/* ── Kanban board (shown in editor when .board file selected) ── */

function KanbanBoard() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 h-full">
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-0.5">
          Todo
        </div>
        <CardBox title="JWT auth" priority="high" label="backend" />
        <CardBox title="OAuth login" priority="high" label="frontend" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-0.5">
          Doing
        </div>
        <CardBox title="Unit tests" priority="medium" label="testing" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-0.5">
          Review
        </div>
        <CardBox title="API docs" priority="low" label="docs" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-0.5">
          Done
        </div>
        <CardBox title="Setup CI" priority="medium" label="devops" />
        <CardBox title="README" priority="low" label="docs" />
      </div>
    </div>
  );
}

/* ── Interactive IDE depiction ── */

function IDEDepiction() {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [terminalLine, setTerminalLine] = useState("$ ");
  const [showBoard, setShowBoard] = useState(false);

  const openBoard = () => {
    setActiveFile("tasks.board");
    setShowBoard(true);
    setTerminalLine("$ barkcli tui");
  };

  const openFile = (name: string) => {
    setActiveFile(name);
    setShowBoard(false);
    setTerminalLine("$ ");
  };

  return (
    <div className="w-full max-w-2xl mx-auto select-none">
      <div className="rounded-xl border border-border shadow-sm overflow-hidden bg-white">
        {/* Titlebar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#F0F0F0] border-b border-border">
          <span className="w-3 h-3 rounded-full bg-red-400/70" />
          <span className="w-3 h-3 rounded-full bg-amber-400/70" />
          <span className="w-3 h-3 rounded-full bg-emerald-400/70" />
          <span className="ml-2 text-[11px] font-mono text-muted-foreground">
            {activeFile ? `${activeFile} — my-project` : "my-project — VS Code"}
          </span>
        </div>

        {/* IDE body: sidebar + editor */}
        <div className="flex min-h-[300px]">
          {/* Sidebar */}
          <div className="w-[130px] sm:w-[160px] shrink-0 bg-[#F8F8F8] border-r border-border flex flex-col">
            <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2.5 border-b border-border/50">
              Explorer
            </div>
            <div className="flex flex-col py-1.5 text-[11px] font-mono">
              {/* Folder: src */}
              <div
                onClick={() => openFile("src/auth.ts")}
                className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer transition-colors ${
                  activeFile === "src/auth.ts"
                    ? "bg-blue-50 text-blue-700"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <span>src/</span>
              </div>
              {/* File: auth.ts */}
              <div
                onClick={() => openFile("src/auth.ts")}
                className={`flex items-center gap-1.5 pl-7 pr-3 py-1 cursor-pointer transition-colors ${
                  activeFile === "src/auth.ts"
                    ? "bg-blue-50 text-blue-700"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                auth.ts
              </div>
              {/* File: server.ts */}
              <div
                onClick={() => openFile("src/server.ts")}
                className={`flex items-center gap-1.5 pl-7 pr-3 py-1 cursor-pointer transition-colors ${
                  activeFile === "src/server.ts"
                    ? "bg-blue-50 text-blue-700"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                server.ts
              </div>

              {/* Board file — clickable to show kanban */}
              <div
                onClick={openBoard}
                className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer transition-all rounded-sm mx-1 ${
                  activeFile === "tasks.board"
                    ? "bg-blue-50 text-blue-700"
                    : "text-muted-foreground hover:bg-secondary board-file-hint"
                }`}
              >
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                tasks.board
              </div>

              <div
                onClick={() => openFile("README.md")}
                className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer transition-colors ${
                  activeFile === "README.md"
                    ? "bg-blue-50 text-blue-700"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                README.md
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1 text-muted-foreground">
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                package.json
              </div>
            </div>
          </div>

          {/* Editor pane */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tabs row */}
            <div className="flex items-center bg-[#F0F0F0] border-b border-border px-1 pt-1 gap-0">
              {activeFile && (
                <div className="flex items-center gap-1.5 bg-white border border-b-0 border-border rounded-t-md px-3 py-1.5 text-[10px] font-mono text-foreground">
                  {activeFile}
                  <span className="text-muted-foreground cursor-pointer hover:text-foreground">&times;</span>
                </div>
              )}
            </div>
            {/* Editor content */}
            <div className="flex-1 overflow-y-auto p-3 relative">
              <div
                className="transition-opacity duration-300"
                style={{ opacity: showBoard ? 1 : 0, position: showBoard ? 'relative' : 'absolute', pointerEvents: showBoard ? 'auto' : 'none' }}
              >
                <div className="text-[10px] text-muted-foreground font-mono mb-2 border-b border-border/50 pb-1.5">
                  tasks.board — YAML
                </div>
                <KanbanBoard />
              </div>
              {!showBoard && (
                <div className="transition-opacity duration-300 opacity-100">
                  {activeFile ? (
                    <div className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                      <span className="text-blue-600">import</span>{" "}
                      <span className="text-emerald-700">{"{ barkcli }"}</span>{" "}
                      <span className="text-blue-600">from</span>{" "}
                      <span className="text-amber-700">&apos;barkcli&apos;</span>
                      <br />
                      <br />
                      <span className="text-blue-600">const</span>{" "}
                      <span className="text-foreground">app</span> ={" "}
                      <span className="text-amber-700">barkcli</span>.
                      <span className="text-emerald-700">init</span>()
                      <br />
                      <br />
                      <span className="text-muted-foreground/60">
                        // Select tasks.board ← in the sidebar to see the
                        board
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-[11px] text-muted-foreground font-mono">
                        Select a file to open
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Terminal */}
        <div className="border-t border-border bg-[#1E1E1E] px-3 py-2 font-mono text-[11px] flex items-center gap-1.5 min-h-[32px]">
          <span className="text-emerald-400 shrink-0">~</span>
          <span className="text-gray-400">{terminalLine}</span>
          {showBoard && <span className="animate-pulse text-white/70 ml-0.5">█</span>}
        </div>
      </div>
    </div>
  );
}

/* ── Features ── */

const features = [
  {
    step: "1",
    title: "barkcli init",
    desc: "Set up tracking in any project. 10 seconds.",
  },
  {
    step: "2",
    title: "barkcli add \"task\"",
    desc: "Create tasks from the terminal. Auto-slug IDs.",
  },
  {
    step: "3",
    title: "Open in VS Code",
    desc: "Visual kanban with drag-and-drop. Same YAML file.",
  },
];

/* ── Pricing ── */

const tiers = [
  {
    name: "Free",
    price: "$0",
    features: [
      "Unlimited boards & tasks",
      "Terminal TUI · Web Kanban",
      "VS Code extension",
      "Git history · undo · diff",
    ],
    cta: "Install free",
    href: "#install",
  },
  {
    name: "Pro",
    price: "$49",
    sub: "one-time · lifetime",
    features: [
      "Everything in Free",
      "AI task breakdown",
      "Weekly reports & changelogs",
      "Sprint planning · GitHub sync",
    ],
    cta: "Buy Pro",
    href: "#",
  },
];

/* ── Page ── */

export default function Home() {
  return (
    <>
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2 no-underline">
            <span className="text-lg">🐶</span>
            <span className="text-sm font-bold tracking-tight font-mono text-foreground">
              barkcli
            </span>
          </a>
          <a
            href="https://github.com/AkshatNaruka/barkcli"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            GitHub →
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-4 animate-fade-in">
          Tasks in your repo.
          <br />
          No cloud. No subscription.
        </h1>
        <p className="text-base text-muted-foreground max-w-lg mx-auto mb-10 animate-fade-in [animation-delay:0.15s]">
          A single binary. Your tasks are YAML files — commit them, diff them,
          own them. Like git, but for your todo list.
        </p>

        {/* Product depiction */}
        <div className="mb-10 animate-fade-in [animation-delay:0.3s]">
          <IDEDepiction />
        </div>

        {/* Install command */}
        <div
          id="install"
          className="max-w-md mx-auto animate-fade-in [animation-delay:0.45s]"
        >
          <div className="flex items-center justify-center border border-border rounded-lg px-4 py-3 bg-secondary">
            <span className="text-muted-foreground font-mono text-sm mr-1">$</span>
            <code className="text-sm font-mono text-foreground overflow-x-auto">
              curl -fsSL https://getbarkcli.dev | sh
            </code>
            <CopyButton text="curl -fsSL https://getbarkcli.dev | sh" />
          </div>
          <p className="text-xs text-muted-foreground mt-3 font-mono">
            macOS · Linux · Windows
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-border">
        <div className="grid sm:grid-cols-3 gap-8">
          {features.map((f) => (
            <div key={f.step} className="text-center sm:text-left">
              <div className="text-xs font-mono text-muted-foreground mb-2">
                {f.step}
              </div>
              <code className="text-sm font-mono text-foreground font-medium">
                {f.title}
              </code>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features summary */}
      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-border">
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold mb-1.5">Plain YAML</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Human-readable. Diff-friendly. Git-tracked.{" "}
              <code className="text-xs bg-secondary px-1 rounded">git diff</code>{" "}
              shows what tasks changed.{" "}
              <code className="text-xs bg-secondary px-1 rounded">git merge</code>{" "}
              syncs them.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1.5">Any interface</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Same data, same commands. Terminal (CLI + TUI with vim keys),
              browser (drag-and-drop kanban), and VS Code (custom editor).
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1.5">Single binary</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Written in Rust. No runtime dependencies. No database. No server
              required. Works offline.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1.5">No lock-in</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Tasks are YAML files in your repo. Even if you stop using barkcli,
              your data is still there — readable, portable, yours.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-border">
        <h2 className="text-2xl font-bold text-center mb-10">Pricing</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className="border border-border rounded-xl p-6"
            >
              <h3 className="font-semibold text-lg mb-1">{tier.name}</h3>
              <div className="text-3xl font-bold font-mono mb-1">
                {tier.price}
              </div>
              {tier.sub && (
                <p className="text-xs text-muted-foreground mb-5 font-mono">
                  {tier.sub}
                </p>
              )}
              {!tier.sub && <div className="mb-5" />}
              <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-[#059669] mt-0.5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a href={tier.href}>
                <Button
                  variant={tier.name === "Pro" ? "default" : "outline"}
                  className="w-full font-medium"
                >
                  {tier.cta}
                </Button>
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonial */}
      <section className="max-w-xl mx-auto px-6 py-16 border-t border-border text-center">
        <blockquote className="text-lg text-muted-foreground leading-relaxed mb-4">
          &ldquo;Switched from Linear. Saved $120/yr. My tasks are YAML files I
          can grep and script. Git integration is the killer feature.&rdquo;
        </blockquote>
        <cite className="text-sm font-medium not-italic">
          Raj Patel, Engineering Lead
        </cite>
      </section>

      {/* CTA */}
      <section className="max-w-xl mx-auto px-6 py-16 border-t border-border text-center">
        <p className="text-muted-foreground mb-5 text-sm">
          Free forever for individuals. Pro $49 one-time.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a href="#install">
            <Button className="font-medium">Install free</Button>
          </a>
          <a href="#">
            <Button variant="outline" className="font-medium">
              Buy Pro — $49
            </Button>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground font-mono">
        <p>
          barkcli ·{" "}
          <a
            href="https://github.com/AkshatNaruka/barkcli"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>{" "}
          ·{" "}
          <a
            href="https://x.com/probiex007"
            className="hover:text-foreground transition-colors"
          >
            X
          </a>{" "}
          · MIT License
        </p>
      </footer>
    </>
  );
}
