"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck, Heart } from "lucide-react";

export function Footer() {
  const [cookieModalOpen, setCookieModalOpen] = useState(false);

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#060709] text-white">
      {/* Giant Watermark Title Banner */}
      <div className="w-full flex justify-center pt-12 sm:pt-20 select-none pointer-events-none overflow-hidden">
        <span className="text-[17vw] font-black leading-[0.8] tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white/[0.08] via-white/[0.02] to-transparent uppercase select-none">
          BARKCLI
        </span>
      </div>

      <div className="relative z-10 mx-auto max-w-[1200px] px-6 pt-8 pb-12">
        {/* Main 4-Column Grid */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 mb-5 transition-opacity hover:opacity-85"
            >
              <div className="w-8 h-8 rounded-lg bg-[#B8845C] flex items-center justify-center shadow-md shadow-[#B8845C]/20">
                <svg
                  viewBox="0 0 100 100"
                  className="w-5 h-5"
                  fill="none"
                  stroke="white"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M 30 25 C 42 18, 58 18, 70 25" />
                  <path d="M 30 25 C 16 27, 11 39, 12 51 C 13 60, 21 61, 27 53 C 30 48, 30 41, 30 35" />
                  <path d="M 70 25 C 84 27, 89 39, 88 51 C 87 60, 79 61, 73 53 C 70 48, 70 41, 70 35" />
                  <path d="M 30 43 C 26 56, 28 67, 35 74 C 41 79.5, 59 79.5, 65 74 C 72 67, 74 56, 70 43" />
                  <path
                    d="M 43.5 55 C 47 52.5, 53 52.5, 56.5 55 C 55 59.5, 52 63, 50 64 C 48 63, 45 59.5, 43.5 55 Z"
                    fill="white"
                    stroke="none"
                  />
                  <path
                    d="M 50 64 L 50 70 M 44.5 70 C 47.5 72.5, 52.5 72.5, 55.5 70"
                    strokeWidth="5"
                  />
                </svg>
              </div>
              <span className="font-bold tracking-tight text-xl text-white">barkcli</span>
            </Link>

            <p className="max-w-[280px] text-[13px] leading-[1.6] text-white/60 mb-6">
              The management layer for AI agents. Humans write intent, agents build and test in isolated worktrees, and only passing work merges.
            </p>

            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#E5AA7A] hover:text-white transition-colors border border-[#B8845C]/30 bg-[#B8845C]/10 px-3 py-1.5 rounded-lg"
            >
              <span>View Source on GitHub</span>
              <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>

          {/* Column 2: Product */}
          <div>
            <h3 className="mb-3 text-[12px] font-semibold text-white uppercase tracking-wider font-mono">
              Product
            </h3>
            <ul className="flex flex-col gap-2.5">
              <li>
                <Link
                  href="/#pipeline"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  How it Works
                </Link>
              </li>
              <li>
                <Link
                  href="/features"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Features Hub
                </Link>
              </li>
              <li>
                <Link
                  href="/benchmark"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Context Benchmark
                </Link>
              </li>
              <li>
                <Link
                  href="/compare"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Compare Tools
                </Link>
              </li>
              <li>
                <Link
                  href="/docs/web-app"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Web App
                </Link>
              </li>
              <li>
                <Link
                  href="/features/quick-open"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  macOS Native App
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Resources */}
          <div>
            <h3 className="mb-3 text-[12px] font-semibold text-white uppercase tracking-wider font-mono">
              Resources
            </h3>
            <ul className="flex flex-col gap-2.5">
              <li>
                <Link
                  href="/docs"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Documentation
                </Link>
              </li>
              <li>
                <Link
                  href="/docs/getting-started"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Getting Started
                </Link>
              </li>
              <li>
                <Link
                  href="/docs/commands"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Command Reference
                </Link>
              </li>
              <li>
                <Link
                  href="/docs/concepts"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Core Concepts
                </Link>
              </li>
              <li>
                <Link
                  href="/docs/api-reference"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  REST & MCP API
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/AkshatNaruka/barkcli/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-white/60 transition-colors hover:text-white flex items-center gap-1"
                >
                  <span>Report an issue</span>
                  <ArrowUpRight className="w-3 h-3 text-white/30" />
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4: Ecosystem */}
          <div>
            <h3 className="mb-3 text-[12px] font-semibold text-white uppercase tracking-wider font-mono">
              Ecosystem
            </h3>
            <ul className="flex flex-col gap-2.5">
              <li>
                <Link
                  href="/features/collective-memory"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Collective Memory
                </Link>
              </li>
              <li>
                <Link
                  href="/features/real-local-agent-chat"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Claude Code & Codex
                </Link>
              </li>
              <li>
                <Link
                  href="/features/skills"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Skills & Ecosystem Tools
                </Link>
              </li>
              <li>
                <Link
                  href="/features/board-traceability"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Board & Traceability
                </Link>
              </li>
              <li>
                <Link
                  href="/features/agent-queue"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Agent Queue & Dispatch
                </Link>
              </li>
              <li>
                <Link
                  href="/features/automations"
                  className="text-[13px] text-white/60 transition-colors hover:text-white"
                >
                  Scheduled Automations
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Community Social Links Strip */}
        <div className="mt-12 border-t border-white/10 pt-8">
          <h3 className="mb-3 text-[12px] font-semibold text-white uppercase tracking-wider font-mono">
            Community
          </h3>
          <ul className="flex flex-wrap gap-2.5">
            <li>
              <a
                aria-label="GitHub"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-white/60 transition-all hover:border-[#B8845C]/60 hover:text-white hover:bg-white/5"
                href="https://github.com/AkshatNaruka/barkcli"
                rel="noopener noreferrer"
                target="_blank"
                title="GitHub"
              >
                <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              </a>
            </li>
            <li>
              <a
                aria-label="X / Twitter"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-white/60 transition-all hover:border-[#B8845C]/60 hover:text-white hover:bg-white/5"
                href="https://x.com/probiex007"
                rel="noopener noreferrer"
                target="_blank"
                title="X / Twitter"
              >
                <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
                </svg>
              </a>
            </li>
            <li>
              <a
                aria-label="Discord"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-white/60 transition-all hover:border-[#B8845C]/60 hover:text-white hover:bg-white/5"
                href="https://discord.gg/barkcli"
                rel="noopener noreferrer"
                target="_blank"
                title="Discord"
              >
                <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                </svg>
              </a>
            </li>
            <li>
              <a
                aria-label="Reddit"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-white/60 transition-all hover:border-[#B8845C]/60 hover:text-white hover:bg-white/5"
                href="https://www.reddit.com/r/barkcli/"
                rel="noopener noreferrer"
                target="_blank"
                title="Reddit"
              >
                <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0zm4.5 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-9 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm4.5 9.5c-2.33 0-4.3-1.46-4.9-3.5h9.8c-.6 2.04-2.57 3.5-4.9 3.5z" />
                </svg>
              </a>
            </li>
            <li>
              <a
                aria-label="LinkedIn"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-white/60 transition-all hover:border-[#B8845C]/60 hover:text-white hover:bg-white/5"
                href="https://www.linkedin.com/in/akshatnaruka/"
                rel="noopener noreferrer"
                target="_blank"
                title="LinkedIn"
              >
                <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
                </svg>
              </a>
            </li>
          </ul>
        </div>

        {/* Bottom Sub-Footer */}
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-mono text-[11px] text-white/50">
            © {new Date().getFullYear()} barkcli · The management layer for AI agents · Free & Open Source (MIT)
          </span>

          <ul className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <li>
              <a
                href="https://github.com/AkshatNaruka/barkcli/blob/master/LICENSE"
                target="_blank"
                rel="noreferrer"
                className="text-white/50 hover:text-white transition-colors"
              >
                License (MIT)
              </a>
            </li>
            <li>
              <a
                href="/docs/advanced"
                className="text-white/50 hover:text-white transition-colors"
              >
                Security & Privacy
              </a>
            </li>
            <li>
              <a
                href="/benchmark"
                className="text-white/50 hover:text-white transition-colors"
              >
                Audit Data
              </a>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setCookieModalOpen(true)}
                className="text-white/50 hover:text-white transition-colors cursor-pointer"
              >
                Cookie settings
              </button>
            </li>
          </ul>
        </div>
      </div>

      {/* Cookie Settings Modal Dialog */}
      {cookieModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0B0D13] border border-white/15 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#B8845C]" />
                <h4 className="font-semibold text-white text-base">Privacy & Local Storage</h4>
              </div>
              <button
                onClick={() => setCookieModalOpen(false)}
                className="text-white/40 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-white/70 leading-relaxed mb-4">
              barkcli is strictly local-first and does not use third-party tracking cookies or behavioral ad networks. We only use local repository storage and browser localStorage for theme preferences and workspace state.
            </p>
            <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-emerald-400 mb-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Zero tracking cookies active. 100% private.</span>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCookieModalOpen(false)}
                className="px-4 py-2 bg-[#B8845C] hover:bg-[#a5764f] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
