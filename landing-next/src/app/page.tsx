"use client";

import { useState } from "react";

const INSTALL = "curl -fsSL https://barkcli.vercel.app/install.sh | sh";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_171521_25968ba2-b594-4b32-aab7-f6b69398a6fa.mp4";

export default function Home() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative min-h-screen w-full flex flex-col overflow-hidden bg-black">
      {/* Background video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src={VIDEO_URL} type="video/mp4" />
      </video>
      {/* Readability overlay */}
      <div className="absolute inset-0 bg-black/35 pointer-events-none" />

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 h-16 shrink-0">
        <a href="#" className="flex items-center gap-2 no-underline">
          <span className="text-lg">🐶</span>
          <span className="text-sm font-bold tracking-tight font-mono text-white">
            barkcli
          </span>
        </a>
        <a
          href="https://github.com/AkshatNaruka/barkcli"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-white/80 hover:text-white transition-colors"
        >
          GitHub
        </a>
      </header>

      {/* Center */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-white text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-5">
          Tasks in your repo.
        </h1>
        <p className="text-white/85 text-base md:text-lg font-light max-w-md mb-10 leading-relaxed">
          Git-native kanban board — CLI, terminal UI, web app and VS Code
          extension. No cloud required.
        </p>
        <div className="flex items-center gap-1 border border-white/40 rounded-full pl-5 pr-2 py-2.5 bg-black/25 backdrop-blur-sm">
          <code className="text-white text-sm font-mono">
            <span className="text-white/50 select-none">$ </span>
            {INSTALL}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(INSTALL);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="ml-3 text-xs font-mono rounded-full border border-white/40 px-3 py-1.5 text-white/90 hover:bg-white/10 transition-colors cursor-pointer"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-white/60 text-[11px] font-mono mt-4 tracking-wider">
          macOS · Linux · Windows · MIT
        </p>
      </main>

      {/* Footer */}
      <footer className="relative z-10 flex items-center justify-center gap-4 h-12 shrink-0 text-[11px] text-white/70 font-mono">
        <span>barkcli</span>
        <span className="opacity-40">·</span>
        <a
          href="https://github.com/AkshatNaruka/barkcli"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-white transition-colors"
        >
          GitHub
        </a>
        <span className="opacity-40">·</span>
        <span>MIT License</span>
      </footer>
    </div>
  );
}
