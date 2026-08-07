"use client";

import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

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

/* ── Page ── */

export default function Home() {
  return (
    <>
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2 no-underline">
            <span className="text-lg">🐶</span>
            <span className="text-sm font-bold tracking-tight font-mono text-foreground">
              barkcli
            </span>
          </a>
          <ThemeToggle />
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="animate-fade-in">
          <span className="text-6xl block mb-6">🐶</span>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
            barkcli
          </h1>
          <p className="text-base text-muted-foreground max-w-md mx-auto mb-10">
            Tasks in your repo. No cloud. No subscription.
          </p>
        </div>

        {/* Install command */}
        <div
          id="install"
          className="max-w-md mx-auto w-full animate-fade-in [animation-delay:0.15s]"
        >
          <div className="flex items-center justify-center border border-border rounded-lg px-4 py-3 bg-secondary">
            <span className="text-muted-foreground font-mono text-sm mr-1">$</span>
            <code className="text-sm font-mono text-foreground overflow-x-auto">
              curl -fsSL https://barkcli.vercel.app/install.sh | sh
            </code>
            <CopyButton text="curl -fsSL https://barkcli.vercel.app/install.sh | sh" />
          </div>
          <p className="text-xs text-muted-foreground mt-3 font-mono">
            macOS · Linux · Windows
          </p>
        </div>

        {/* Pro */}
        <p className="text-sm text-muted-foreground mt-14 animate-fade-in [animation-delay:0.3s]">
          Free forever.{" "}
          <a href="#" className="text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors">
            Pro $49 one-time
          </a>
        </p>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground font-mono">
        <p>barkcli</p>
      </footer>
    </>
  );
}
