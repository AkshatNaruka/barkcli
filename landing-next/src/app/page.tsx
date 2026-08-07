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
          <svg
            viewBox="0 0 100 100"
            className="w-5 h-5"
            fill="none"
            stroke="#B8845C"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M29 24 Q14 27 11 42 Q10 54 19 59 Q27 56 30 47" />
            <path d="M71 24 Q86 27 89 42 Q90 54 81 59 Q73 56 70 47" />
            <path d="M29 24 Q50 15 71 24" />
            <path d="M30 47 Q26 61 30 71 Q34 83 50 83 Q66 83 70 71 Q74 61 70 47" />
            <path d="M50 59 Q45 54 41.5 60 Q41.5 67 50 72 Q58.5 67 58.5 60 Q55 54 50 59" />
            <path d="M50 74 L50 78 M45 78.5 Q50 81.5 55 78.5" />
          </svg>
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
