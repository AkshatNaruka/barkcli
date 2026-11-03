"use client";

import React, { useState, useEffect, useRef } from "react";
import { MCP_TOOL_COUNT } from "@/lib/mcp";
import {
  FolderOpen,
  Monitor,
  Search,
  Bot,
  GitBranch,
  TestTube,
  Zap,
  TrendingUp,
  Terminal,
  Globe,
  Laptop,
  Code,
  Clock,
  ChevronDown,
  Check,
  Copy,
  Sparkles,
  ArrowRight,
  Shield,
  GitMerge,
  Boxes,
  Wand2,
  Download,
  Rocket,
  ClipboardList,
  Plug,
  Brain,
  Layers,
  Database,
  Play,
  Pause,
  RotateCcw,
  Cpu,
  Workflow,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ShieldCheck,
} from "lucide-react";
import {
  OpenCodeLogo,
  ClaudeCodeLogo,
  CursorLogo,
  AnyAgentLogo,
} from "@/components/AgentLogos";

const INSTALL_CURL = "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh";
const INSTALL_CARGO = "cargo install barkcli";
const INSTALL_SERVE = "barkcli serve --open";
const INSTALL_RUN = 'barkcli run "Fix login token race condition" --agents 2 --yes';

const ON_PAGES = process.env.NEXT_PUBLIC_PAGES === "1";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

const NAV_LINKS = [
  { href: "#pipeline", label: "Pipeline" },
  { href: "#architecture", label: "Architecture" },
  { href: "#surfaces", label: "Surfaces" },
  { href: "#benchmark", label: "Benchmark" },
  { href: "#ai-agent", label: "Agents & MCP" },
  { href: "/docs", label: "Docs" },
  ...(ON_PAGES ? [{ href: `${BASE}/app/`, label: "Live Preview" }] : []),
];

/* -------------------------------------------------------------------------- */
/* Living Autonomy Loop Stages (DeepSeek Harness Inspired)                    */
/* -------------------------------------------------------------------------- */

interface LoopStage {
  id: string;
  step: string;
  title: string;
  badge: string;
  command: string;
  description: string;
  files: Array<{ path: string; diff: string; status: "modified" | "created" | "passed" }>;
  terminalOutput: string[];
}

const LOOP_STAGES: LoopStage[] = [
  {
    id: "intent",
    step: "01",
    title: "Human Intent",
    badge: "Intent Intake",
    command: 'barkcli intake "Fix auth token expiry race condition" --bug',
    description: "You provide intent in plain language. Barkcli maps it to a tracked specification and requirement node without editing code.",
    files: [
      { path: "specs/auth-race.yaml", diff: "created", status: "created" },
    ],
    terminalOutput: [
      "$ barkcli intake \"Fix auth token expiry race condition\" --bug",
      "✓ Classified as bug (priority: high, area: auth)",
      "✓ Created spec_id: spec_auth_expiry_race",
      "✓ Mapped to card: fix-auth-token-expiry-race",
      "Status: Ready for agent decomposition",
    ],
  },
  {
    id: "plan",
    step: "02",
    title: "Agent Proposal",
    badge: "Spec Decomposition",
    command: "barkcli plan fix-auth-token-expiry-race --tasks",
    description: "Planner agent inspects repository symbols and proposes a concrete 3-step atomic plan with exact file scopes and acceptance criteria.",
    files: [
      { path: "src/auth/token.rs", diff: "+18 / -4", status: "modified" },
      { path: "tests/auth_test.rs", diff: "+34", status: "created" },
    ],
    terminalOutput: [
      "$ barkcli plan fix-auth-token-expiry-race --tasks",
      "Analyzing project_context.md and symbol graph...",
      "Proposed plan with 2 child tasks:",
      "  1. Add atomic mutex lock around token refresh (src/auth/token.rs)",
      "  2. Add concurrent expiration regression test (tests/auth_test.rs)",
      "Awaiting gate approval or auto-run...",
    ],
  },
  {
    id: "worktree",
    step: "03",
    title: "Worktree Sandbox",
    badge: "Git Isolation",
    command: "barkcli run --agent opencode --worktree .board/worktrees/wt-auth-a1",
    description: "An isolated git worktree is checked out under .board/worktrees/. The agent cannot touch your dirty working tree or uncommitted files.",
    files: [
      { path: ".board/worktrees/wt-auth-a1/src/auth/token.rs", diff: "+18 / -4", status: "modified" },
      { path: ".board/worktrees/wt-auth-a1/.cargo/config.toml", diff: "shared cache", status: "created" },
    ],
    terminalOutput: [
      "[worktree] Acquired sandbox: .board/worktrees/wt-auth-a1",
      "[worktree] Target cache symlinked to host /target (zero duplicate build time)",
      "[opencode] Claimed packet task-auth-token",
      "[opencode] Editing src/auth/token.rs...",
      "[opencode] Adding concurrent test in tests/auth_test.rs...",
      "Status: Edits completed. Handing over to acceptance gate.",
    ],
  },
  {
    id: "gate",
    step: "04",
    title: "Acceptance Gate",
    badge: "Test Verdict",
    command: "cargo test -p auth --test auth_test",
    description: "The agent's self-report is strictly ignored. Completion requires your real project test suite to exit 0 inside the worktree.",
    files: [
      { path: "tests/auth_test.rs::test_concurrent_refresh", diff: "PASS", status: "passed" },
      { path: "tests/auth_test.rs::test_token_mutex_boundary", diff: "PASS", status: "passed" },
    ],
    terminalOutput: [
      "[gate] Executing project test gate in worktree: cargo test -p auth",
      "   Compiling auth v0.4.0 (.board/worktrees/wt-auth-a1)",
      "   Running unittests src/auth/token.rs (target/debug/deps/...)",
      "test tests::test_concurrent_refresh ... ok",
      "test tests::test_token_mutex_boundary ... ok",
      "Gate verdict: PASSED (2 passed; 0 failed). Branch qualified for merge train.",
    ],
  },
  {
    id: "merge",
    step: "05",
    title: "Merge Train",
    badge: "Deterministic Rebase",
    command: "git merge --no-ff bark/wt-auth-a1 -m 'fix(auth): resolve token expiry race'",
    description: "Gate-passing branches merge sequentially onto master. A cryptographically recorded receipt is appended, and the worktree is cleanly pruned.",
    files: [
      { path: "master", diff: "+52 / -4", status: "modified" },
      { path: ".board/threads/fix-auth-token.jsonl", diff: "receipt locked", status: "passed" },
    ],
    terminalOutput: [
      "[merge-train] Order: #1 in queue. Fast-forwarding main...",
      "[merge] Merged branch bark/wt-auth-a1 into master (commit 9e4f210)",
      "[receipt] Signed receipt recorded: .board/threads/fix-auth-token.jsonl",
      "[prune] Pruned .board/worktrees/wt-auth-a1. Working tree is clean.",
      "✓ Mission complete. Zero human intervention needed.",
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Bento Architecture Cards                                                   */
/* -------------------------------------------------------------------------- */

const BENTO_CARDS = [
  {
    icon: GitBranch,
    badge: "Git-Native Sandboxing",
    title: "Isolated Git Worktrees",
    desc: "Every agent runs inside its own isolated worktree under .board/worktrees/. No agent touches your dirty tree. Automated shared cargo/target caches prevent gigabytes of rebuild bloat, while quotas prevent disk exhaustion.",
    code: "$ git worktree list\n/repo                   master\n/repo/.board/worktrees/wt-1  bark/agent-a\n/repo/.board/worktrees/wt-2  bark/agent-b",
    span: "col-span-1 md:col-span-2",
  },
  {
    icon: ShieldCheck,
    badge: "Honest By Construction",
    title: "Tests Are The Acceptance Gate",
    desc: "An agent is done when your tests pass in its worktree — never because the LLM says 'I'm done'. If tests fail, stdout diagnostics inject into the retry prompt.",
    code: "Completion Rule:\nexit_code == 0 && diff.len() > 0\n// Hallucinations cannot land",
    span: "col-span-1",
  },
  {
    icon: Brain,
    badge: "Living Project Context",
    title: "project_context.md",
    desc: "A single central context file generated and maintained by barkcli. Manual sections are pinned (manual='true'), provenance is tracked, and cold-start token consumption drops by 57×.",
    code: "$ barkcli context prime\n$ barkcli context digest --polish\n// 515 tokens vs 29,400 cold start",
    span: "col-span-1",
  },
  {
    icon: Workflow,
    badge: "Multiplayer Autonomy",
    title: "Parallel Agent Merge Train",
    desc: "Run barkcli run '<intent>' --agents 3. Workers claim attempts in parallel worktrees, emit heartbeats to the supervisor, and merge in finish order. Conflicted branches re-run solo once the pool drains.",
    code: "$ barkcli run \"Migrate auth to v2\" --agents 3 --yes\n✓ agent-1: passed gate -> merged #1\n✓ agent-2: passed gate -> merged #2",
    span: "col-span-1 md:col-span-2",
  },
];

/* -------------------------------------------------------------------------- */
/* Runtime Surfaces                                                           */
/* -------------------------------------------------------------------------- */

const SURFACES = [
  {
    id: "threads",
    title: "Threads (Web & Desktop)",
    badge: "Interactive UI",
    icon: Globe,
    description: "Real-time SSE event bus streaming agent thoughts, tool executions, live diffs, and test output directly in your browser or native macOS window.",
    preview: `Thread: Add JWT verification (/api/threads/jwt-auth)
────────────────────────────────────────────────────────
[you]       Ask: Where is token validation currently handled?
[bark]      Checked src/auth/mod.rs:24. Token decoding is
            centralized in verify_signature().
[you]       Build: Add expiration check with 5s clock skew
[opencode]  Spawning worktree: .board/worktrees/wt-jwt-a1
[gate]      cargo test -p auth -- PASSED (14/14)
[merge]     Merged to master (receipt recorded)`,
  },
  {
    id: "pool",
    title: "Autonomy Loop (CLI)",
    badge: "Headless Daemon",
    icon: Terminal,
    description: "Autonomous end-to-end execution loop for CI/CD or power-user terminal workflows. Runs multiple agents in parallel with zero manual gates.",
    preview: `$ barkcli run "Refactor database connection pooling" --agents 2 --yes

[intake]    Parsed intent -> 2 atomic task cards
[pool]      Worker 1 -> wt-db-pool-1 (OpenCode)
[pool]      Worker 2 -> wt-db-pool-2 (Claude Code)
[gate]      Worker 1: cargo test -> PASS (rebased onto master)
[gate]      Worker 2: cargo test -> PASS (merged via train)
[summary]   2 tasks complete, 0 failures, 4.2s runtime`,
  },
  {
    id: "tui",
    title: "Terminal UI (Ratatui)",
    badge: "Keyboard Driven",
    icon: Monitor,
    description: "Zero-latency terminal kanban board and live agent monitor. Full vim keys, real-time agent row pulses, task inspection, and quick actions.",
    preview: `┌── Todo (2) ─────────── Doing (2) ──────────── Done (12) ───┐
│ ● Refactor DB pool    ▶ [opencode] OAuth flow  ✓ Init board│
│ ● Add audit logs      ▶ [claude] Webhook retry ✓ MCP Server│
└────────────────────────────────────────────────────────────┘
[7] Agents  [8] Orchestrate  [Space] Move  [a] Add  [q] Quit`,
  },
  {
    id: "mcp",
    title: "MCP Stdio Server",
    badge: "71 Tools",
    icon: Cpu,
    description: "Standard JSON-RPC 2.0 interface exposing 71 tools to Claude Code, OpenCode, and Cursor. Lets agents read boards, query memory, and trigger gates natively.",
    preview: `MCP Server: barkcli mcp (stdio)
Tools Registered: 71
  • context_file_get        • spec_create        • run_start
  • board_card_move         • memory_search      • gate_check
  • worktree_acquire        • merge_receipt      • thread_append

Status: Listening on stdio. Compatible with Claude Code & Cursor.`,
  },
];

/* -------------------------------------------------------------------------- */
/* Agent Setup Prompts                                                        */
/* -------------------------------------------------------------------------- */

const AGENT_PROMPTS: Record<string, string> = {
  claude: `Please run the following commands to install and set up barkcli (the management layer for AI agents) in this project:

1. Install barkcli:
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh

2. Initialize barkcli:
barkcli init

3. Create the primary board:
barkcli create main

4. Connect MCP server in ~/.claude/config.json or .claude/config.json:
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}

5. Verify:
barkcli status
barkcli --version`,
  opencode: `Please run the following commands to install and set up barkcli (the management layer for AI agents) in this project:

1. Install barkcli:
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh

2. Initialize barkcli:
barkcli init

3. Connect MCP server in .opencode/config.json:
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}

4. Verify setup:
barkcli status`,
  cursor: `Please add barkcli to your Cursor project settings (.cursor/mcp.json):

{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}

Run in terminal:
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh
barkcli init
barkcli create main`,
  generic: `Setup barkcli (management layer for AI agents) with any agent CLI:

1. Install:
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh

2. Initialize:
barkcli init
barkcli create main

3. Start Web Management Layer:
barkcli serve --open`,
};

/* -------------------------------------------------------------------------- */
/* FAQ Items (Factual, Zero Slop)                                             */
/* -------------------------------------------------------------------------- */

const FAQ = [
  {
    question: "How does barkcli compare to DeepSeek Harness (dsh)?",
    answer: "Both tools believe that intelligence requires a robust runtime harness. While DeepSeek Harness focuses on plugin extensibility and Cordis runtime sandboxing, barkcli specializes as the Git-native management layer: isolating agents in dedicated worktrees, using your project's existing test suite as the acceptance gate, and managing parallel branches with a sequential merge train. Both can be used together seamlessly.",
  },
  {
    question: "Is barkcli an agentic harness?",
    answer: "Yes. An agentic harness wraps an autonomous agent: it manages isolated filesystem sandboxes, injects context, intercepts tool actions, and gates task completion on automated test verdicts rather than the agent's self-report. barkcli provides this via git worktrees, project_context.md, 71 MCP tools, and a test acceptance gate.",
  },
  {
    question: "Why use git worktrees instead of containers?",
    answer: "Git worktrees provide instant, zero-overhead branch checkouts on your local filesystem without Docker startup latency or virtualization overhead. barkcli automatically configures shared build caches (e.g. target/ in Rust or node_modules/ in Node) across worktrees, saving gigabytes of disk space and enabling multi-agent concurrency.",
  },
  {
    question: "Does barkcli work offline?",
    answer: "Yes. barkcli is a standalone compiled Rust binary with zero cloud dependencies. Your tasks, specs, memory records, and history are committed directly as YAML and JSON files in your git repository.",
  },
  {
    question: "Which coding agents are supported?",
    answer: "barkcli provides first-class support for OpenCode, Claude Code, Cursor, Codex, and any custom agent script via BARKCLI_AGENT_CMD. It also registers 71 stdio MCP tools for direct integration into any Model Context Protocol host.",
  },
  {
    question: "Is it completely free and open source?",
    answer: "Yes. barkcli is published under the MIT license. Everything—the CLI, terminal UI, browser server, and MCP suite—is 100% open source.",
  },
];

/* -------------------------------------------------------------------------- */
/* Main Component                                                             */
/* -------------------------------------------------------------------------- */

export default function Home() {
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [activeSurface, setActiveSurface] = useState("threads");
  const [activeAgentTab, setActiveAgentTab] = useState("claude");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  // Auto-play loop for the living harness simulator
  useEffect(() => {
    if (!autoPlay) return;
    const interval = setInterval(() => {
      setActiveStageIndex((prev) => (prev + 1) % LOOP_STAGES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoPlay]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const activeStage = LOOP_STAGES[activeStageIndex];

  return (
    <div className="min-h-screen w-full bg-[#0A0B0E] text-white selection:bg-[#B8845C]/30 relative font-sans">
      {/* Background Ambience */}
      <div className="fixed inset-0 bark-grid-pattern pointer-events-none opacity-40 z-0" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bark-radial-glow pointer-events-none z-0" />

      {/* -------------------------------------------------------------------- */}
      {/* Sticky Header Navigation                                             */}
      {/* -------------------------------------------------------------------- */}
      <header
        className={`sticky top-0 z-50 flex items-center justify-between px-6 lg:px-12 h-16 transition-all duration-200 ${
          scrolled ? "bg-[#0A0B0E]/90 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/50" : "bg-transparent"
        }`}
      >
        <div className="flex items-center gap-3">
          <a href="#" className="flex items-center gap-2.5 no-underline group">
            <div className="w-8 h-8 rounded-lg bg-[#B8845C] flex items-center justify-center shadow-md shadow-[#B8845C]/20 group-hover:scale-105 transition-transform">
              <svg viewBox="0 0 100 100" className="w-5 h-5" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 30 25 C 42 18, 58 18, 70 25" />
                <path d="M 30 25 C 16 27, 11 39, 12 51 C 13 60, 21 61, 27 53 C 30 48, 30 41, 30 35" />
                <path d="M 70 25 C 84 27, 89 39, 88 51 C 87 60, 79 61, 73 53 C 70 48, 70 41, 70 35" />
                <path d="M 30 43 C 26 56, 28 67, 35 74 C 41 79.5, 59 79.5, 65 74 C 72 67, 74 56, 70 43" />
                <path d="M 43.5 55 C 47 52.5, 53 52.5, 56.5 55 C 55 59.5, 52 63, 50 64 C 48 63, 45 59.5, 43.5 55 Z" fill="white" stroke="none" />
                <path d="M 50 64 L 50 70 M 44.5 70 C 47.5 72.5, 52.5 72.5, 55.5 70" strokeWidth="5.5" />
              </svg>
            </div>
            <span className="text-base font-bold tracking-tight font-mono text-white">barkcli</span>
          </a>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#B8845C]/15 text-[#E5AA7A] border border-[#B8845C]/30">
            v0.4.0 · MIT
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-1 bg-[#12141A]/60 border border-white/5 rounded-full px-4 py-1.5 backdrop-blur-md">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs text-white/60 hover:text-white px-3 py-1 rounded-full hover:bg-white/5 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <a
            href="https://github.com/AkshatNaruka/barkcli"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-white/70 hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 bg-white/[0.02] transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5 text-[#B8845C]" />
            <span>GitHub</span>
          </a>
          <a
            href="#install"
            className="flex items-center gap-1.5 text-xs font-medium bg-[#B8845C] hover:bg-[#a6744e] text-white px-3.5 py-1.5 rounded-lg transition-colors shadow-sm shadow-[#B8845C]/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Get Barkcli</span>
          </a>
        </div>
      </header>

      {/* -------------------------------------------------------------------- */}
      {/* Hero Section: Asymmetric Split Layout                                */}
      {/* -------------------------------------------------------------------- */}
      <section className="relative z-10 pt-12 pb-24 px-6 lg:px-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Thesis, Headline & CTAs */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 bg-[#B8845C]/10 border border-[#B8845C]/25 rounded-full px-3.5 py-1 mb-6">
              <span className="w-2 h-2 rounded-full bg-[#B8845C] animate-pulse" />
              <span className="text-xs font-mono text-[#E5AA7A] font-medium tracking-wide">
                The Management Layer for AI Agents
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] text-white mb-6">
              Humans write intent.<br />
              Agents propose plans.<br />
              <span className="bg-gradient-to-r from-[#E5AA7A] via-[#B8845C] to-[#E5AA7A] bg-clip-text text-transparent">
                Tests decide what merges.
              </span>
            </h1>

            <p className="text-white/65 text-base sm:text-lg font-normal max-w-2xl mb-8 leading-relaxed">
              barkcli isolates every AI coding agent in its own dedicated git worktree, uses your real project test suite as the acceptance gate, and coordinates passing branches into a clean merge train.
            </p>

            {/* 1-Click Install Command Box */}
            <div className="w-full max-w-xl mb-6">
              <div className="flex items-center justify-between border border-white/15 hover:border-[#B8845C]/40 rounded-xl px-4 py-2.5 bg-[#12141A]/90 backdrop-blur-xl transition-colors group">
                <div className="flex items-center gap-2.5 font-mono text-xs sm:text-sm text-white/90 overflow-hidden">
                  <span className="text-[#B8845C] select-none font-bold">$</span>
                  <span className="truncate">{INSTALL_CURL}</span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(INSTALL_CURL);
                    setCopiedInstall(true);
                    setTimeout(() => setCopiedInstall(false), 2000);
                  }}
                  className="ml-3 shrink-0 text-xs font-mono rounded-lg bg-white/10 hover:bg-[#B8845C] hover:text-white px-3 py-1.5 text-white/80 transition-colors flex items-center gap-1.5"
                  title="Copy install command"
                >
                  {copiedInstall ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Action Buttons & Secondary CTAs */}
            <div className="flex flex-wrap items-center gap-3 mb-10">
              <a
                href="#install"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B8845C] hover:bg-[#a6744e] text-white text-sm font-medium transition-colors shadow-lg shadow-[#B8845C]/20"
              >
                <Download className="w-4 h-4" />
                <span>Download for macOS</span>
              </a>
              <a
                href="/docs"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/15 hover:border-white/30 bg-white/[0.02] text-white text-sm font-medium transition-colors"
              >
                <span>Explore Documentation</span>
                <ArrowRight className="w-4 h-4 text-white/50" />
              </a>
              {ON_PAGES && (
                <a
                  href={`${BASE}/app/`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#B8845C]/30 text-[#E5AA7A] hover:bg-[#B8845C]/10 text-sm font-medium transition-colors"
                >
                  <Globe className="w-4 h-4" />
                  <span>Open Web App</span>
                </a>
              )}
            </div>

            {/* Trust Signals */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-white/50 pt-2 border-t border-white/5">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#B8845C]" /> No Cloud Database
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#B8845C]" /> 100% Test-Gated Merges
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#B8845C]" /> 71 MCP Stdio Tools
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#B8845C]" /> MIT Licensed
              </span>
            </div>
          </div>

          {/* Right Column: Living Autonomy Loop Simulator */}
          <div className="lg:col-span-5">
            <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#101218]/90 backdrop-blur-2xl shadow-2xl shadow-black/80">
              
              {/* Header Bar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                  <span className="ml-2 font-mono text-xs text-white/40">autonomy-loop.sh</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAutoPlay(!autoPlay)}
                    className="text-[11px] font-mono text-white/50 hover:text-white px-2 py-0.5 rounded bg-white/5 border border-white/10 flex items-center gap-1"
                  >
                    {autoPlay ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    <span>{autoPlay ? "Live" : "Paused"}</span>
                  </button>
                  <button
                    onClick={() => setActiveStageIndex((prev) => (prev + 1) % LOOP_STAGES.length)}
                    className="text-[11px] font-mono text-white/50 hover:text-white p-1 rounded bg-white/5 border border-white/10"
                    title="Next Step"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Stage Progress Tabs */}
              <div className="grid grid-cols-5 border-b border-white/10 bg-[#0E1015]">
                {LOOP_STAGES.map((stage, idx) => {
                  const isActive = idx === activeStageIndex;
                  return (
                    <button
                      key={stage.id}
                      onClick={() => {
                        setActiveStageIndex(idx);
                        setAutoPlay(false);
                      }}
                      className={`py-2 px-1 text-center transition-all cursor-pointer border-r border-white/5 last:border-0 ${
                        isActive
                          ? "bg-[#B8845C]/15 border-b-2 border-b-[#B8845C] text-[#E5AA7A]"
                          : "text-white/40 hover:text-white/70 hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="text-[10px] font-mono font-bold">{stage.step}</div>
                      <div className="text-[11px] font-medium truncate">{stage.title}</div>
                    </button>
                  );
                })}
              </div>

              {/* Active Stage Body */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[#B8845C]/15 text-[#E5AA7A] border border-[#B8845C]/30">
                    Stage {activeStage.step}: {activeStage.badge}
                  </span>
                  <span className="text-[11px] font-mono text-white/40">Autonomous Verification</span>
                </div>

                <p className="text-xs text-white/70 leading-relaxed mb-4">
                  {activeStage.description}
                </p>

                {/* Simulated Terminal Window */}
                <div className="bg-[#07080B] border border-white/10 rounded-xl p-3.5 font-mono text-xs mb-4 overflow-x-auto">
                  <div className="text-white/30 text-[10px] pb-1.5 border-b border-white/5 mb-2 flex items-center justify-between">
                    <span>EXECUTION LOG</span>
                    <span className="text-emerald-400">STATUS: ACTIVE</span>
                  </div>
                  <div className="space-y-1">
                    {activeStage.terminalOutput.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.startsWith("$")
                            ? "text-[#E5AA7A] font-semibold"
                            : line.includes("PASSED") || line.includes("Merged") || line.includes("✓")
                            ? "text-emerald-400"
                            : "text-white/60"
                        }
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Impacted File Badges */}
                <div className="border border-white/5 bg-white/[0.02] rounded-xl p-2.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1.5">
                    Sandboxed File Changes
                  </div>
                  <div className="space-y-1">
                    {activeStage.files.map((file, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-white/80 flex items-center gap-1.5 truncate">
                          <FileCode className="w-3 h-3 text-[#B8845C]" />
                          {file.path}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            file.status === "passed"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : file.status === "created"
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-[#B8845C]/15 text-[#E5AA7A]"
                          }`}
                        >
                          {file.diff}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Footer */}
              <div className="px-5 py-3 border-t border-white/10 bg-white/[0.01] flex items-center justify-between text-[11px] font-mono text-white/40">
                <span>Verification: 487 passed (0 failed)</span>
                <span className="text-[#B8845C]">Auto-reconciled</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* Bento Architecture: The Management Layer (Cordis-inspired)           */}
      {/* -------------------------------------------------------------------- */}
      <section id="architecture" className="py-24 px-6 lg:px-12 max-w-7xl mx-auto border-t border-white/5">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-[#B8845C] mb-3">
            Core Architecture
          </p>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            The Management Layer.<br />
            <span className="text-white/50">Engineered for Autonomous Reliability.</span>
          </h2>
          <p className="text-white/60 text-sm sm:text-base leading-relaxed">
            AI models write code; barkcli manages the lifecycle. From isolated worktrees to deterministic test gates, every mechanism is built directly on your local git repository.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {BENTO_CARDS.map((card, i) => {
            const Icon = card.icon;
            return (
              <div
                key={i}
                className={`${card.span} border border-white/10 hover:border-[#B8845C]/40 rounded-2xl p-7 bg-[#101218]/80 backdrop-blur-md transition-all duration-300 group flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#B8845C]/15 text-[#E5AA7A] border border-[#B8845C]/30">
                      {card.badge}
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Icon className="w-4 h-4 text-[#B8845C]" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-white">{card.title}</h3>
                  <p className="text-white/60 text-xs sm:text-sm leading-relaxed mb-6">
                    {card.desc}
                  </p>
                </div>

                <div className="bg-[#07080B] border border-white/10 rounded-xl p-3.5 font-mono text-[11px] text-white/70 overflow-x-auto">
                  <pre className="whitespace-pre">{card.code}</pre>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* Surfaces Switcher (Threads, CLI Pool, TUI, MCP)                     */}
      {/* -------------------------------------------------------------------- */}
      <section id="surfaces" className="py-24 px-6 lg:px-12 max-w-7xl mx-auto border-t border-white/5">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-[#B8845C] mb-3">
            Execution Surfaces
          </p>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            One Core Runtime.<br />
            <span className="text-white/50">Four Purpose-Built Surfaces.</span>
          </h2>
          <p className="text-white/60 text-sm sm:text-base leading-relaxed">
            Whether you operate via terminal keystrokes, interactive browser threads, autonomous daemon scripts, or MCP client protocols, the same verified board state powers every interface.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex justify-center gap-2 mb-8 overflow-x-auto pb-2">
          {SURFACES.map((surf) => {
            const Icon = surf.icon;
            const isSelected = activeSurface === surf.id;
            return (
              <button
                key={surf.id}
                onClick={() => setActiveSurface(surf.id)}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2 transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#B8845C] text-white shadow-lg shadow-[#B8845C]/25"
                    : "border border-white/10 text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{surf.title}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Display */}
        {SURFACES.map((surf) => {
          if (surf.id !== activeSurface) return null;
          return (
            <div
              key={surf.id}
              className="border border-white/10 rounded-2xl p-6 sm:p-10 bg-[#101218]/90 backdrop-blur-xl max-w-5xl mx-auto shadow-2xl"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/10">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[#B8845C]/15 text-[#E5AA7A] border border-[#B8845C]/30 mb-2">
                    {surf.badge}
                  </span>
                  <h3 className="text-2xl font-bold text-white">{surf.title}</h3>
                </div>
                <p className="text-white/60 text-xs sm:text-sm max-w-md">
                  {surf.description}
                </p>
              </div>

              <div className="bg-[#07080B] border border-white/10 rounded-xl p-5 font-mono text-xs text-white/80 overflow-x-auto leading-relaxed shadow-inner">
                <pre className="whitespace-pre">{surf.preview}</pre>
              </div>
            </div>
          );
        })}
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* Multi-CLI Agent & MCP Setup                                          */}
      {/* -------------------------------------------------------------------- */}
      <section id="ai-agent" className="py-24 px-6 lg:px-12 max-w-7xl mx-auto border-t border-white/5">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-[#B8845C] mb-3">
            Ecosystem Integrations
          </p>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Connect Any Local Agent.<br />
            <span className="text-white/50">Claude Code, OpenCode, Cursor.</span>
          </h2>
          <p className="text-white/60 text-sm sm:text-base leading-relaxed">
            Wire your existing AI coding CLI directly into barkcli. Agents gain access to 71 MCP tools, structured project memory, and sandboxed worktree environments.
          </p>
        </div>

        {/* Agent Tabs */}
        <div className="flex justify-center gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { id: "claude", label: "Claude Code", Logo: ClaudeCodeLogo },
            { id: "opencode", label: "OpenCode", Logo: OpenCodeLogo },
            { id: "cursor", label: "Cursor", Logo: CursorLogo },
            { id: "generic", label: "Custom CLI", Logo: AnyAgentLogo },
          ].map((agent) => (
            <button
              key={agent.id}
              onClick={() => setActiveAgentTab(agent.id)}
              className={`px-4 py-2 rounded-xl text-xs font-mono flex items-center gap-2 transition-all cursor-pointer ${
                activeAgentTab === agent.id
                  ? "bg-[#B8845C] text-white shadow-md shadow-[#B8845C]/20"
                  : "border border-white/10 text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              <agent.Logo className="w-3.5 h-3.5" />
              <span>{agent.label}</span>
            </button>
          ))}
        </div>

        {/* Setup Prompt Display */}
        <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#101218]/90 max-w-4xl mx-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#B8845C]" />
              <span className="text-xs font-mono text-white/60">
                {activeAgentTab === "claude" ? "Claude Code Configuration" : activeAgentTab === "opencode" ? "OpenCode MCP Config" : activeAgentTab === "cursor" ? "Cursor MCP Config" : "Generic CLI Instructions"}
              </span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(AGENT_PROMPTS[activeAgentTab]);
                setCopiedPrompt(true);
                setTimeout(() => setCopiedPrompt(false), 2000);
              }}
              className="text-xs font-mono px-3 py-1.5 rounded-lg bg-white/10 hover:bg-[#B8845C] hover:text-white text-white/80 transition-colors flex items-center gap-1.5"
            >
              {copiedPrompt ? (
                <>
                  <Check className="w-3 h-3 text-green-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Configuration</span>
                </>
              )}
            </button>
          </div>
          <div className="p-5 overflow-x-auto max-h-[360px] overflow-y-auto bg-[#07080B]">
            <pre className="text-xs font-mono text-white/70 leading-relaxed whitespace-pre">
              <code>{AGENT_PROMPTS[activeAgentTab]}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* Benchmark Proof Strip                                                */}
      {/* -------------------------------------------------------------------- */}
      <section id="benchmark" className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-t border-white/5">
        <div className="border border-white/10 rounded-2xl p-8 bg-[#101218]/80 backdrop-blur-md">
          <div className="flex flex-col lg:flex-row items-center gap-8">
            <div className="text-center lg:text-left shrink-0">
              <div className="text-6xl font-black text-[#B8845C] font-mono tracking-tight">57×</div>
              <div className="text-white/50 text-xs mt-1 font-mono uppercase tracking-wider">Context Savings</div>
            </div>
            <div className="hidden lg:block w-px h-24 bg-white/10" />
            <div className="flex-1 text-center lg:text-left">
              <h3 className="text-xl font-bold text-white mb-2">
                Cold-Start Token Benchmark (Deterministic, First-Party)
              </h3>
              <p className="text-white/60 text-xs sm:text-sm leading-relaxed mb-4">
                A cold agent session typically begins by listing directory trees, grepping candidate files, and reading modules—consuming ~29,400 tokens before writing a single line of code. One read of Barkcli&apos;s auto-maintained <code className="text-[#E5AA7A]">project_context.md</code> costs only <code className="text-[#E5AA7A]">515 tokens</code>.
              </p>
              <div className="inline-flex items-center gap-2 text-xs font-mono bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/70">
                <span>$ barkcli context benchmark --json</span>
                <span className="text-[#B8845C]">· Zero LLM in loop</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* Installation Methods                                                 */}
      {/* -------------------------------------------------------------------- */}
      <section id="install" className="py-24 px-6 lg:px-12 max-w-7xl mx-auto border-t border-white/5">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-[#B8845C] mb-3">
            Installation
          </p>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Install in Seconds.
          </h2>
          <p className="text-white/60 text-sm leading-relaxed">
            Compiled binaries distributed for macOS (Apple Silicon / Intel), Linux, and Windows.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {[
            { title: "macOS Native App (Bark.app)", cmd: "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install-app.sh | sh", icon: Download },
            { title: "macOS / Linux CLI", cmd: "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh", icon: Terminal },
            { title: "Cargo (from source)", cmd: "cargo install barkcli", icon: Code },
            { title: "Homebrew Tap", cmd: "brew tap AkshatNaruka/barkcli && brew install barkcli", icon: Shield },
            { title: "Windows PowerShell", cmd: "irm https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.ps1 | iex", icon: Monitor },
            { title: "GitHub Releases", cmd: "https://github.com/AkshatNaruka/barkcli/releases", icon: GitMerge },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="border border-white/10 rounded-xl p-4 bg-[#101218]/60 hover:border-[#B8845C]/40 transition-colors">
                <div className="flex items-center gap-2 mb-2.5">
                  <Icon className="w-4 h-4 text-[#B8845C]" />
                  <span className="text-sm font-semibold text-white">{item.title}</span>
                </div>
                <div className="bg-[#07080B] border border-white/5 rounded-lg p-2 font-mono text-[11px] text-emerald-400 break-all select-all">
                  {item.cmd}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* FAQ Section                                                          */}
      {/* -------------------------------------------------------------------- */}
      <section className="py-24 px-6 lg:px-12 max-w-4xl mx-auto border-t border-white/5">
        <div className="text-center mb-16">
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-[#B8845C] mb-3">
            Questions & Answers
          </p>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="divide-y divide-white/10">
          {FAQ.map((item, i) => (
            <div key={i} className="py-5">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left flex justify-between items-center cursor-pointer group"
              >
                <span className="text-base font-semibold text-white group-hover:text-[#E5AA7A] transition-colors pr-4">
                  {item.question}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-white/40 shrink-0 transition-transform duration-200 ${
                    openFaq === i ? "rotate-180 text-[#B8845C]" : ""
                  }`}
                />
              </button>
              {openFaq === i && (
                <p className="text-white/60 text-xs sm:text-sm leading-relaxed mt-3 pt-1">
                  {item.answer}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* Footer                                                               */}
      {/* -------------------------------------------------------------------- */}
      <footer className="py-12 px-6 lg:px-12 border-t border-white/10 bg-[#07080B]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#B8845C] flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-4 h-4" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 30 25 C 42 18, 58 18, 70 25" />
                <path d="M 30 25 C 16 27, 11 39, 12 51 C 13 60, 21 61, 27 53 C 30 48, 30 41, 30 35" />
                <path d="M 70 25 C 84 27, 89 39, 88 51 C 87 60, 79 61, 73 53 C 70 48, 70 41, 70 35" />
                <path d="M 30 43 C 26 56, 28 67, 35 74 C 41 79.5, 59 79.5, 65 74 C 72 67, 74 56, 70 43" />
                <path d="M 43.5 55 C 47 52.5, 53 52.5, 56.5 55 C 55 59.5, 52 63, 50 64 C 48 63, 45 59.5, 43.5 55 Z" fill="white" stroke="none" />
                <path d="M 50 64 L 50 70 M 44.5 70 C 47.5 72.5, 52.5 72.5, 55.5 70" strokeWidth="5.5" />
              </svg>
            </div>
            <span className="font-mono text-xs text-white/50">
              barkcli · The management layer for AI agents · MIT License
            </span>
          </div>

          <div className="flex items-center gap-6 font-mono text-xs text-white/50">
            <a href="/docs" className="hover:text-white transition-colors">Documentation</a>
            <a href="/benchmark" className="hover:text-white transition-colors">Benchmark</a>
            <a href="https://github.com/AkshatNaruka/barkcli" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <a href="https://x.com/probiex007" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">X / Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
