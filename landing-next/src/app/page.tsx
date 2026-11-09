"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
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
  LayoutDashboard,
  BarChart3,
  Settings,
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
  RotateCcw,
  CheckCircle2,
  FileCode2,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import {
  OpenCodeLogo,
  ClaudeCodeLogo,
  CursorLogo,
  CodexLogo,
  AnyAgentLogo,
} from "@/components/AgentLogos";
import { Footer } from "@/components/Footer";

const INSTALL =
  "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh";

// Hosted GitHub Pages build: link to the interactive board preview served
// at /app/ (see .github/workflows/pages.yml). Hidden on the Vercel deploy.
const ON_PAGES = process.env.NEXT_PUBLIC_PAGES === "1";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#pipeline", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "/features", label: "All Features" },
  { href: "/benchmark", label: "Benchmark" },
  { href: "#ai-agent", label: "AI Agent" },
  { href: "/docs", label: "Docs" },
  ...(ON_PAGES ? [{ href: `${BASE}/app/`, label: "Web demo" }] : []),
];

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_171521_25968ba2-b594-4b32-aab7-f6b69398a6fa.mp4";

const FEATURES = [
  {
    icon: Brain,
    title: "Collective memory",
    description:
      "Every run is a node in a Git-backed contribution graph. Independent verification, evidence scores, neglected-branch nudging, and UCB recommendations. Agents build on verified work instead of starting from zero.",
    code: '$ barkcli analyze && barkcli contribute --title "insight" --kind hypothesis',
    gradient: "from-amber-500/20 to-orange-500/20",
    href: "/features/collective-memory",
  },
  {
    icon: Terminal,
    title: "Real local-agent chat",
    description:
      "Ask or build with the same opencode, claude, or codex CLIs you already pay for. Read-only Ask turns stream text and tool calls; Build turns get an isolated worktree and a test gate.",
    code: "$ barkcli serve --open # then chat in the app",
    gradient: "from-emerald-500/20 to-teal-500/20",
    href: "/features/real-local-agent-chat",
  },
  {
    icon: Bot,
    title: "Interactive Threads & Timeline",
    description:
      "Multi-turn agent threads with live tool-calling streams, a left-rail dashed timeline scrubber to inspect earlier execution checkpoints, and floating surface launcher.",
    code: "$ barkcli serve --open # then launch thread or surface",
    gradient: "from-indigo-500/20 to-purple-500/20",
    href: "/features/interactive-threads",
  },
  {
    icon: Globe,
    title: "Inbuilt Web Browser",
    description:
      "Full-fledged embedded browser surface: test and interact with local development servers (http://localhost:*), preview web apps, and inspect documentation directly inside Bark.",
    code: "$ barkcli serve --open # open Browser surface (B)",
    gradient: "from-blue-500/20 to-emerald-500/20",
    href: "/features/inbuilt-browser",
  },
  {
    icon: BarChart3,
    title: "Modern Delivery Analytics",
    description:
      "Interactive column throughput and effort metrics with SVG linear gradients, view filters (All, Cards, Effort), glassmorphic tooltips, and Donut priority charts with centered totals.",
    code: "$ barkcli report # or view Reports surface in app",
    gradient: "from-emerald-500/20 to-indigo-500/20",
    href: "/features/modern-analytics",
  },
  {
    icon: Search,
    title: "Quick open & command runner",
    description:
      "⌘P jumps to any file with a preview; ⌘⇧R runs real project tests, builds, and git commands without leaving Bark.",
    code: '$ barkcli code "auth" # or ⌘P / ⌘⇧R in the app',
    gradient: "from-blue-500/20 to-cyan-500/20",
    href: "/features/quick-open",
  },
  {
    icon: Clock,
    title: "Automations",
    description:
      "Schedule agent runs on an interval. Each due intent invokes the normal autonomy loop — worktree, gate, merge train — and reports back.",
    code: '$ barkcli schedule add "summarize the README" --every 1h',
    gradient: "from-rose-500/20 to-red-500/20",
    href: "/features/automations",
  },
  {
    icon: Sparkles,
    title: "Mind",
    description:
      "A compiled snapshot of your project — health, blockers, stale work, next actions. One command answers what's happening across agents and developers.",
    code: "$ barkcli mind sync && barkcli overview",
    gradient: "from-violet-500/20 to-purple-500/20",
    href: "/features/mind",
  },
  {
    icon: Layers,
    title: "Skills & Ecosystem Tools",
    description:
      "Install remote playbooks from skills.sh with sha-pinned skills.lock files. Automatically detect, inspect, and run external agent tools including fx, deepsec, and agent-browser.",
    code: "$ barkcli skills install owner/repo && barkcli tools list",
    gradient: "from-indigo-500/20 to-blue-500/20",
    href: "/features/skills",
  },
  {
    icon: FolderOpen,
    title: "Board + Traceability",
    description:
      "Kanban with spec_id on every card — spec ↔ card ↔ task ↔ code, O(1). Diff it, merge it, grep it.",
    code: "$ git diff main..feature -- *.board",
    gradient: "from-zinc-500/20 to-neutral-500/20",
    href: "/features/board-traceability",
  },
  {
    icon: Bot,
    title: "Agent Queue",
    description:
      "Tasks dispatch to OpenCode, Claude Code, Cursor, or a human. Claim, work, complete — with a test review gate before done.",
    code: "$ barkcli dispatch --role builder && barkcli review",
    gradient: "from-green-500/20 to-emerald-500/20",
    href: "/features/agent-queue",
  },
  {
    icon: Database,
    title: "Memory",
    description:
      "Four-tier local memory with hybrid BM25 + TF-IDF search. Decisions and patterns survive across sessions — offline.",
    code: '$ barkcli memory search "auth errors"',
    gradient: "from-teal-500/20 to-cyan-500/20",
    href: "/features/memory",
  },
  {
    icon: Brain,
    title: "Codebase Brain (3D)",
    description:
      "Structural repository architecture graph. Discovers subsystems, modules, services, APIs, domain models, and invariants. Rendered in glowing 2D & 3D with full source evidence.",
    code: "$ barkcli brain stats && barkcli serve --open",
    gradient: "from-cyan-500/20 to-blue-500/20",
    href: "/features/codebase-brain",
  },
  {
    icon: Rocket,
    title: "Continuous Releases",
    description:
      "Automated multi-platform release pipeline on every master merge. Semver auto-bumping, changelog compilation, native binaries, and signed macOS Bark.app bundles.",
    code: "git push origin master # auto-publishes release",
    gradient: "from-emerald-500/20 to-teal-500/20",
    href: "/features/continuous-releases",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Intent",
    description:
      "Human describes what they want in plain language. barkcli plans it into a verifiable spec with acceptance criteria.",
    command: 'barkcli run "Add Google OAuth" --yes',
    icon: Sparkles,
  },
  {
    number: "2",
    title: "Plan",
    description:
      "The spec decomposes into agent-ready child tasks with targeted file contexts and test criteria.",
    command: "barkcli plan oauth-login --tasks",
    icon: Boxes,
  },
  {
    number: "3",
    title: "Dispatch",
    description:
      "Tasks route to the right agent — OpenCode, Claude Code, Codex, or Cursor — in isolated git worktrees.",
    command: "barkcli dispatch --role builder --agents 3",
    icon: Wand2,
  },
  {
    number: "4",
    title: "Verify",
    description:
      "Tests and verifier agents check the work. Gate over self-report: done only when tests pass.",
    command: 'barkcli verify --gate "cargo test"',
    icon: Check,
  },
  {
    number: "5",
    title: "Review & Merge",
    description:
      "Finished passing work lands in your review queue. 1-click approve lands it via atomic merge train.",
    command: "barkcli review && barkcli merge-train",
    icon: Brain,
  },
];

const INTERFACES = [
  {
    id: "desktop",
    title: "macOS App",
    icon: Laptop,
    description:
      "Native macOS desktop application (Bark.app) with embedded runtime, dock integration, ⌘K command palette, in-app auto updates, and window controls.",
    demo: `Applications/Bark.app
├── Embedded local server runtime
├── Native menu bar & in-app auto-update from releases
├── Instant ⌘K command palette & surface launcher
├── Threads with execution timeline scrubber & inbuilt browser
└── Real-time WebSocket sync across all workspaces`,
  },
  {
    id: "cli",
    title: "Command Line",
    icon: Terminal,
    description:
      "Full-featured CLI for scripts, automation, and power users. Run intent, plan tasks, verify gates, and review diffs from your terminal.",
    demo: `$ barkcli run "Add webhook signature verification" --yes
✓ Decomposed into 3 tasks with acceptance criteria
✓ Spawning 3 agent worktrees (opencode, claude-code)
✓ Acceptance gate passed: cargo test --all (14 passed)

$ barkcli review --task-id auth-01
Spec:       SPEC-042 Webhook Verification
Worktree:   bark/auth-01 (clean)
Gate:       PASS (14 tests passed, 0 failures)
Diff:       +48 / -12 lines in src/auth/webhook.rs

$ barkcli review --approve auth-01
✓ Merged into main via merge train`,
  },
  {
    id: "tui",
    title: "Terminal UI",
    icon: Monitor,
    description:
      "Interactive board right in your terminal. Navigate with vim keys, filter, sort, and manage tasks and agent sessions visually.",
    demo: `┌─────────────────────────────────────────────────────────┐
│ Todo              Doing               Review            │
├─────────────────────────────────────────────────────────┤
│ ● Fix login bug   ● Implement API    ✓ Tests Passing   │
│ ● Write docs      ● Add auth         ✓ Review Ready    │
│                   ● Refactor DB                        │
└─────────────────────────────────────────────────────────┘
↑↓/jk sel · ←→/hl col · a add · e edit · Enter review · d delete`,
  },
  {
    id: "web",
    title: "Web App",
    icon: Globe,
    description:
      "The management layer UI: Mind homepage, interactive Threads with execution timeline scrubber, Inbuilt Browser, floating surface launcher, 3D Brain graph, and modern analytics.",
    demo: `Threads · Browser · Board · Mind · Brain (3D) · Reports
┌───────────────────────────────┬──────────────────────────┐
│ Left Rail: Execution Timeline │ Active Surface: Browser  │
│ ├─ #1: git status [clean]     │ http://localhost:5173    │
│ ├─ #2: read_file (models.rs)  │ Live Preview & DevTools  │
│ └─ #3: cargo test [14 passed] │ Floating Launcher (B,T,F)│
└───────────────────────────────┴──────────────────────────┘`,
  },
];

const CODE_FEATURES = [
  {
    icon: GitBranch,
    title: "Call Graphs",
    metric: "→",
    desc: "Map function calls across files via callgraph_get. Understand impact before you change.",
  },
  {
    icon: TestTube,
    title: "Test Coverage",
    metric: "e.g. 87%",
    desc: "Heuristic test-file mapping via context_get — see which cards link to which tests.",
  },
  {
    icon: Zap,
    title: "Complexity",
    metric: "e.g. C-12",
    desc: "Cyclomatic + cognitive scores via metrics_get. Find risky code early.",
  },
  {
    icon: TrendingUp,
    title: "Risk Score",
    metric: "e.g. 0.3",
    desc: "Formula-based risk (complexity, nesting, size) via metrics_get.",
  },
];

const FAQ = [
  {
    question: "What is barkcli?",
    answer:
      "barkcli is the management layer between humans and AI coding agents. The human states intent. barkcli creates the plan, assigns tasks to the right agents, gets the work done in isolated git worktrees, has agents test and verify it, and hands only finished, passing work to the human for review. You manage intent and review. Agents do everything in between.",
  },
  {
    question: "Is barkcli an agentic harness?",
    answer:
      `Yes. An agentic harness wraps an agent: it creates an isolated workspace, injects context and tools, streams the agent's work, and gates completion on real test passes rather than the agent's self-report. barkcli does this via git worktrees, project_context.md, ${MCP_TOOL_COUNT} MCP tools, and a test acceptance gate. Beyond a pure harness, barkcli also provides the human management layer — specs, boards, review queues, memory, and multi-agent coordination.`,
  },
  {
    question: "Is barkcli a CLI tool or a web app?",
    answer:
      `Both, plus a native macOS desktop app — but think of it as a management layer, not a single interface. The same repository data powers the macOS app, CLI, terminal UI, VS Code extension, and browser UI. Humans manage intent and review; agents work through ${MCP_TOOL_COUNT} MCP tools; git syncs everything.`,
  },
  {
    question: "What makes barkcli different from Jira or Linear?",
    answer:
      "Jira and Linear manage humans through a cloud database. barkcli manages humans and AI agents through files in your repo. Tasks, specs, memory, skills, and agent runs are YAML/JSON you can diff, merge, and version control. No accounts, no subscriptions, no vendor lock-in — and agents can read and write the same board you see.",
  },
  {
    question: "Does it work offline?",
    answer:
      "Yes. barkcli is a single native binary with zero network dependencies. All data is stored locally in your repo. Sync via git push/pull — no special sync service or remote accounts needed.",
  },
  {
    question: "How do multiple agents work simultaneously without conflicting?",
    answer:
      "Every dispatched agent receives its own isolated git worktree with dedicated working directories and branches. There are no git lock collisions and no accidental concurrent overwrites. When tasks pass verification, an atomic merge train merges them in finish sequence. If a conflict occurs, barkcli re-dispatches only the conflicting task.",
  },
  {
    question: "What happens when an agent's code fails tests?",
    answer:
      "Gate over self-report: a task cannot land in your review queue until project test commands exit 0. When a test gate fails, barkcli captures the compiler errors and test failure logs, injects them into the agent's worktree session, and triggers an automated retry cycle before any human time is wasted.",
  },
  {
    question: "What is the Codebase Brain and how does it prevent agent hallucination?",
    answer:
      "The Codebase Brain is a durable architectural knowledge graph of your repository. It automatically discovers subsystems, modules, services, APIs, domain models, and governing invariants (such as isolated worktree execution and local-first data ownership). Unlike noisy session activity logs, the Brain records permanent architectural rules and evidence links, injecting verified structural constraints directly into agent context packs so LLMs respect project boundaries.",
  },
  {
    question: "How do automated releases work on master?",
    answer:
      "barkcli includes an automated release pipeline powered by GitHub Actions. Every merge into the master branch automatically calculates semantic version bumps across all Cargo workspace crates and Tauri desktop configurations, compiles native binaries for macOS (Apple Silicon + Intel), Linux (x86_64, aarch64), and Windows, creates codesigned macOS Bark.app bundles, and publishes GitHub Releases with auto-compiled changelogs.",
  },
];

const AGENT_PROMPTS: Record<string, string> = {
  claude: `Please run the following commands to install and set up barkcli (the management layer for AI agents) in this project:

1. First, install barkcli:
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh

2. Initialize barkcli in this project:
barkcli init

3. Create a default board:
barkcli create main

4. Add the MCP server configuration to .claude/settings.json:
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}

5. Verify the installation:
barkcli status
barkcli list
`,
  opencode: `Please run the following commands to install and set up barkcli (the management layer for AI agents) in this project:

1. Install barkcli:
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh

2. Initialize and create board:
barkcli init && barkcli create main

3. Register MCP tool in your config:
{
  "mcp": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}
`,
  cursor: `Please run the following commands to install and configure barkcli for Cursor:

1. Install barkcli:
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh

2. Initialize board:
barkcli init && barkcli create main

3. Configure Cursor MCP in Features > MCP Servers:
Name: barkcli
Type: command
Command: barkcli mcp
`,
  generic: `Setup barkcli (the management layer for AI agents):

1. Install:
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh

2. Initialize:
barkcli init && barkcli create main

3. Connect via MCP:
Run 'barkcli mcp' as standard JSON-RPC 2.0 stdio server.
`,
};

function useInView(ref: React.RefObject<HTMLDivElement | null>, threshold = 0.1) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}

function ProductMock() {
  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#0A0B0E] shadow-2xl shadow-black/80 transition-all duration-300">
      {/* Browser chrome */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F56]/80 border border-[#E0443E]/40" />
          <div className="w-3 h-3 rounded-full bg-[#FFBD2E]/80 border border-[#DEA123]/40" />
          <div className="w-3 h-3 rounded-full bg-[#27C93F]/80 border border-[#1AAB29]/40" />
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-white/40">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>3 agents in worktrees · 100% test acceptance gate · Review ready</span>
        </div>
      </div>

      {/* Board & Agents View */}
      <div className="flex text-left">
        {/* Sidebar */}
        <div className="hidden sm:flex flex-col w-40 shrink-0 border-r border-white/10 py-3 bg-white/[0.01]">
          <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-widest text-white/30">Manage</div>
          {[
            { icon: LayoutDashboard, label: "Board", active: true, badge: "8" },
            { icon: Layers, label: "Specs", active: false },
          ].map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs border-l-2 ${
                item.active
                  ? "text-white bg-white/5 border-[#B8845C]"
                  : "text-white/40 border-transparent"
              }`}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
              {item.badge && (
                <span className={`ml-auto text-[10px] font-mono px-1.5 py-px rounded-full ${item.active ? "bg-[#B8845C]/20 text-[#E5AA7A]" : "bg-white/5 text-white/40"}`}>
                  {item.badge}
                </span>
              )}
            </div>
          ))}
          <div className="px-3 pt-3 pb-2 text-[10px] font-mono uppercase tracking-widest text-white/30">Build</div>
          {[{ icon: Bot, label: "Agents", badge: "3" }].map((item) => (
            <div key={item.label} className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/40 border-l-2 border-transparent">
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
              <span className="ml-auto text-[10px] font-mono px-1.5 py-px rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{item.badge}</span>
            </div>
          ))}
        </div>

        {/* Kanban Columns */}
        <div className="flex-1 grid grid-cols-3 gap-2 p-3 min-w-0">
          {[
            {
              name: "Todo",
              tone: "text-white/40",
              cards: [
                { title: "Add OAuth login", meta: "HIGH", metaCls: "text-red-400 bg-red-500/10 border-red-500/30", spec: true, blocked: false },
                { title: "Fix checkout crash", meta: "BUG", metaCls: "text-red-400 bg-red-500/10 border-red-500/30", spec: true, blocked: true },
              ],
            },
            {
              name: "Doing",
              tone: "text-[#E5AA7A]",
              cards: [
                { title: "Implement OAuth flow", meta: "WORKTREE", metaCls: "text-[#E5AA7A] bg-[#B8845C]/10 border-[#B8845C]/30", spec: true, blocked: false },
              ],
            },
            {
              name: "Review",
              tone: "text-emerald-400",
              cards: [
                { title: "Store tokens securely", meta: "GATE PASSED", metaCls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", spec: false, blocked: false },
              ],
            },
          ].map((col) => (
            <div key={col.name} className="bg-white/[0.02] border border-white/10 rounded-xl p-2.5 min-w-0">
              <div className={`text-[10px] font-semibold uppercase tracking-wide mb-2 flex items-center justify-between ${col.tone}`}>
                <span>{col.name}</span>
                <span className="text-[9px] font-mono opacity-60">{col.cards.length}</span>
              </div>
              <div className="space-y-2">
                {col.cards.map((c) => (
                  <div
                    key={c.title}
                    className={`bg-white/[0.03] rounded-lg p-2.5 border transition-all hover:border-white/20 ${c.blocked ? "border-red-500/40 bg-red-500/[0.02]" : "border-white/10"}`}
                  >
                    <div className="text-[11px] text-white/90 font-medium leading-snug">{c.title}</div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`text-[9px] font-semibold px-1.5 py-px rounded border ${c.metaCls}`}>{c.meta}</span>
                      {c.spec && <span className="text-[9px] font-mono text-[#D4A574]">⎇ spec</span>}
                      {c.blocked && <span className="text-[9px] font-semibold text-red-400">BLOCKED</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Agent queue */}
        <div className="hidden md:flex flex-col w-52 shrink-0 border-l border-white/10 p-3 bg-white/[0.01]">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">
            <span>Active Pool</span>
            <span className="text-emerald-400 font-semibold">● 3 running</span>
          </div>
          {[
            {
              name: "opencode-1",
              task: "OAuth flow",
              status: "worktree #4a",
              role: "builder",
              Logo: OpenCodeLogo,
            },
            {
              name: "claude-2",
              task: "Token storage",
              status: "worktree #7b",
              role: "tester",
              Logo: ClaudeCodeLogo,
            },
            {
              name: "codex-3",
              task: "Diff audit",
              status: "worktree #8c",
              role: "reviewer",
              Logo: CodexLogo,
            },
          ].map((a) => (
            <div key={a.name} className="py-2 border-b border-white/5 last:border-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <a.Logo className="w-3.5 h-3.5 text-white/80" />
                  <span className="text-[11px] font-mono text-white/80 font-medium">{a.name}</span>
                </div>
                <span className="text-[9px] font-mono text-[#E5AA7A] uppercase">{a.role}</span>
              </div>
              <div className="text-[10px] text-white/40 truncate mt-0.5">{a.task}</div>
              <div className="flex items-center gap-1 mt-1 text-[9px] font-mono text-emerald-400">
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                <span>{a.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnimatedSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

export default function Home() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("desktop");
  const [activeAgentTab, setActiveAgentTab] = useState("claude");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#060709] text-white selection:bg-[#B8845C]/30">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: { "@type": "Answer", text: item.answer },
            })),
          }),
        }}
      />
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col overflow-hidden">
        {/* Video Background */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src={VIDEO_URL} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-[#060709]/80 via-[#060709]/55 to-[#060709] pointer-events-none" />
        <div className="absolute inset-0 bark-grid-pattern opacity-40 pointer-events-none" />

        {/* Gradient Glow Orbs */}
        <div className="absolute top-1/4 left-1/4 w-[450px] h-[450px] bg-[#B8845C]/15 rounded-full blur-[140px] pointer-events-none animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-[#B8845C]/10 rounded-full blur-[140px] pointer-events-none" />

        {/* Nav */}
        <header
          className={`relative z-10 flex items-center justify-between px-6 md:px-10 h-16 shrink-0 transition-all duration-300 ${
            scrolled
              ? "bg-[#060709]/85 backdrop-blur-xl border-b border-white/10"
              : ""
          }`}
        >
          <a href="#" className="flex items-center gap-2.5 no-underline group">
            <div className="w-8 h-8 rounded-lg bg-[#B8845C] flex items-center justify-center group-hover:scale-105 transition-transform shadow-md shadow-[#B8845C]/20">
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
            <span className="text-sm font-bold tracking-tight font-mono text-white">
              barkcli
            </span>
          </a>
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-xs text-white/60 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5 hidden sm:block"
              >
                {link.label}
              </a>
            ))}
            <details className="relative sm:hidden">
              <summary className="text-xs text-white/60 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer list-none">
                Menu
              </summary>
              <div className="absolute right-0 top-full mt-1 min-w-40 rounded-xl border border-white/10 bg-[#0A0B0E]/95 p-1 backdrop-blur-xl">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="block text-xs text-white/60 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </details>
            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-white/60 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5"
            >
              GitHub
            </a>
          </nav>
        </header>

        {/* Center Hero */}
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-[#B8845C]" />
            <span className="text-xs text-white/80 font-mono">Open source (MIT) · {MCP_TOOL_COUNT} MCP tools · BYO Agents</span>
          </div>

          <h1 className="text-white text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05] mb-6 max-w-5xl uppercase">
            THE MANAGEMENT LAYER
            <br />
            <span className="bg-gradient-to-r from-[#F0CBA8] via-[#E5AA7A] to-[#B8845C] bg-clip-text text-transparent">
              FOR AI AGENTS
            </span>
          </h1>

          <p className="text-white text-base sm:text-lg md:text-xl font-medium max-w-2xl mb-8 leading-relaxed px-2">
            <span className="font-semibold text-white/95">
              barkcli plans the work, assigns it to your coding agents, has them build and test in isolated worktrees, and sends you only passing work to review.
            </span>{" "}
            <span className="text-[#E5AA7A] font-bold">No cloud, no accounts.</span>
          </p>

          <div className="flex flex-col items-center gap-3 w-full max-w-xl">
            <div className="flex items-center gap-1 border border-white/20 rounded-xl pl-5 pr-2 py-2.5 bg-black/50 backdrop-blur-xl w-full">
              <code className="text-white text-xs sm:text-sm font-mono truncate flex-1 min-w-0">
                <span className="text-[#B8845C] select-none">$ </span>
                {INSTALL}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(INSTALL);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="ml-3 text-xs font-mono rounded-lg bg-white/10 px-3 py-1.5 text-white/80 hover:bg-white/20 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
              <a
                href="/docs"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B8845C] text-white text-xs sm:text-sm font-medium hover:bg-[#a5764f] transition-all shadow-lg shadow-[#B8845C]/20"
              >
                Explore Documentation
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://github.com/AkshatNaruka/barkcli"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 text-xs sm:text-sm font-medium transition-all"
              >
                <span>View on GitHub</span>
                <ExternalLink className="w-3.5 h-3.5 text-white/40" />
              </a>
            </div>

            {/* Workflow steps */}
            <div className="flex items-center gap-2 sm:gap-3 text-[11px] font-mono text-white/50 mt-3">
              <span className="flex items-center gap-1.5 border border-white/10 rounded-full px-3 py-1.5 bg-white/[0.03]">
                <Sparkles className="w-3 h-3 text-[#B8845C]" /> 1. State intent
              </span>
              <ArrowRight className="w-3 h-3 text-white/30" />
              <span className="flex items-center gap-1.5 border border-white/10 rounded-full px-3 py-1.5 bg-white/[0.03]">
                <Check className="w-3 h-3 text-[#B8845C]" /> 2. Agents test in worktrees
              </span>
              <ArrowRight className="w-3 h-3 text-white/30" />
              <span className="flex items-center gap-1.5 border border-white/10 rounded-full px-3 py-1.5 bg-white/[0.03]">
                <GitMerge className="w-3 h-3 text-[#B8845C]" /> 3. Human reviews &amp; merges
              </span>
            </div>

            <p className="text-[11px] font-mono text-white/40">
              You manage intent and review. Agents do everything in between.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mt-6 text-[11px] font-mono text-white/40">
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> No cloud database
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Zero accounts
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> 100% test-gated
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> MIT licensed
            </span>
          </div>
        </main>
      </section>

      {/* Agent Strip */}
      <section className="py-8 border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-4">
            Bring your own subscription. barkcli never resells tokens.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14 opacity-85">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-white/80">
              <ClaudeCodeLogo className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Claude Code</span>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-white/80">
              <CodexLogo className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              <span>OpenAI Codex</span>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-white/80">
              <OpenCodeLogo className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>OpenCode</span>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-white/80">
              <CursorLogo className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Cursor</span>
            </div>
          </div>
        </div>
      </section>

      {/* Product Section — Workspace Surface */}
      <section id="product" className="py-24 px-6 relative">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-12">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              The Workspace Surface
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              One screen.
              <br />
              <span className="text-white/40">You manage intent &amp; review. Agents build.</span>
            </h2>
            <p className="text-white/50 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
              The board holds the work with spec traceability. Agents claim tasks, work isolated in git worktrees, tests gate completion, and finished work waits for your review.
            </p>
          </AnimatedSection>

          <AnimatedSection>
            <ProductMock />
          </AnimatedSection>

          {/* Trust stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 max-w-3xl mx-auto">
            {[
              { metric: `${MCP_TOOL_COUNT}`, desc: "MCP tools for agents" },
              { metric: "skills.sh", desc: "skill registry + lockfile" },
              { metric: "100%", desc: "offline-capable core" },
              { metric: "MIT", desc: "open source forever" },
            ].map((s) => (
              <div
                key={s.desc}
                className="text-center border border-white/10 rounded-xl py-4 bg-white/[0.02]"
              >
                <div className="text-2xl font-bold text-[#E5AA7A] font-mono">
                  {s.metric}
                </div>
                <div className="text-[11px] text-white/40 mt-1">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        className="py-24 px-6 bg-gradient-to-b from-white/[0.01] to-transparent"
      >
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Why barkcli
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Your tasks should live
              <br />
              <span className="text-white/40">where your code lives.</span>
            </h2>
            <p className="text-white/50 text-sm max-w-lg mx-auto">
              Everything is stored as git-versioned YAML files in your repository. No vendor databases, no cloud subscriptions.
            </p>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <AnimatedSection key={i} delay={i * 0.06}>
                  <Link
                    href={feature.href}
                    className="group relative block border border-white/10 rounded-2xl p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-white/25 bg-white/[0.015] hover:bg-white/[0.03] cursor-pointer h-full"
                  >
                    <div className="relative z-10 flex flex-col justify-between h-full">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-[#B8845C]/20 group-hover:border-[#B8845C]/70 group-hover:shadow-[0_0_20px_rgba(184,132,92,0.4)]">
                            <Icon className="w-5 h-5 text-[#B8845C] group-hover:text-[#F0CBA8] transition-all duration-300 drop-shadow-[0_0_8px_rgba(240,203,168,0.5)]" />
                          </div>
                          <span className="text-[11px] font-mono text-white/40 group-hover:text-[#E5AA7A] flex items-center gap-1 transition-colors">
                            <span>Details</span>
                            <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold mb-2 text-white transition-colors">
                          {feature.title}
                        </h3>
                        <p className="text-white/60 text-sm leading-relaxed mb-4">
                          {feature.description}
                        </p>
                      </div>
                      <div className="bg-black/60 border border-white/10 rounded-lg px-3 py-2.5 group-hover:border-white/20 transition-colors mt-auto">
                        <code className="text-[#E5AA7A] text-xs font-mono break-all">
                          {feature.code}
                        </code>
                      </div>
                    </div>
                  </Link>
                </AnimatedSection>
              );
            })}
          </div>
          <div className="text-center mt-10">
            <a
              href="/features"
              className="inline-flex items-center gap-2 text-xs font-mono text-[#E5AA7A] hover:underline"
            >
              <span>Explore detailed architectural capabilities in /features</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* How It Works Section — Pipeline */}
      <section
        id="pipeline"
        className="py-24 px-6 bg-gradient-to-b from-white/[0.02] to-transparent relative"
      >
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              The pipeline
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Intent in.
              <br />
              <span className="text-white/40">Verified code out.</span>
            </h2>
          </AnimatedSection>

          <div className="relative">
            {/* Step lines connecting cards on desktop */}
            <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-y-1/2" />
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 relative">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <AnimatedSection key={i} delay={i * 0.1}>
                    <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.01] hover:border-[#B8845C]/30 transition-all duration-300 h-full flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="w-7 h-7 rounded-lg bg-[#B8845C]/10 border border-[#B8845C]/20 flex items-center justify-center text-xs font-mono text-[#B8845C] font-bold">
                            {step.number}
                          </span>
                          <Icon className="w-4 h-4 text-white/30" />
                        </div>
                        <h3 className="text-base font-semibold mb-2">
                          {step.title}
                        </h3>
                        <p className="text-white/40 text-xs leading-relaxed mb-4">
                          {step.description}
                        </p>
                      </div>
                      <div className="bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-[#E5AA7A] truncate">
                        $ {step.command}
                      </div>
                    </div>
                  </AnimatedSection>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Autonomy Engine — The Loop */}
      <section id="autonomy" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Autonomy Gate
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              One prompt.
              <br />
              <span className="bg-gradient-to-r from-[#F0CBA8] via-[#E5AA7A] to-[#B8845C] bg-clip-text text-transparent">
                Three agents. Merged.
              </span>
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              <code className="text-white/80">barkcli run &quot;…&quot; --agents 3 --yes</code>{" "}
              plans your intent into tasks, spawns agents into isolated worktrees, and runs the project&apos;s
              own tests as the acceptance gate. A task is done{" "}
              <em>when the gate passes in the worktree</em> — never when the agent says so. Gate-passing branches ride the{" "}
              <span className="text-white/70">merge train</span> in finish order.
            </p>
          </AnimatedSection>

          <AnimatedSection delay={0.15}>
            <div className="relative max-w-5xl mx-auto rounded-2xl border border-white/10 overflow-hidden bg-black/60 shadow-2xl shadow-[#B8845C]/5">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]/80" />
                  </div>
                  <span className="text-[11px] font-mono text-white/50 ml-2">
                    barkcli run &quot;Fix login token race condition&quot; --agents 3 --yes
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    3 worktrees active · Merge train ready
                  </span>
                </div>
              </div>
              <img
                src={`${BASE}/run-agents-demo.gif`}
                alt="barkcli run: three agents in isolated worktrees, test gates, and merge train"
                className="w-full h-auto"
                loading="lazy"
              />
              <div className="absolute bottom-3 right-4 text-[10px] font-mono text-white/40 bg-black/70 px-2.5 py-1 rounded-md backdrop-blur border border-white/10">
                recorded run — Mind view, replay
              </div>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto mt-6">
            {[
              {
                title: "Workers own attempts",
                desc: "Each agent gets its own worktree, transcript, and test gate. Zero file locking collisions and zero accidental branch stomping.",
                code: "bark/[task-id]",
              },
              {
                title: "Merge train",
                desc: "Done means merged. Conflicted branches queue for a solo rebase attempt against a frozen main — deterministic and converging.",
                code: "git merge --no-ff",
              },
              {
                title: "Honest by construction",
                desc: "Crashed agent + no changes + no-op gate = failure, not done. Every failure verdict is stored, re-dispatched, and recorded as memory.",
                code: "gate > self-report",
              },
            ].map((item, i) => (
              <AnimatedSection key={i} delay={0.1 + i * 0.1}>
                <div className="border border-white/10 rounded-2xl p-5 h-full hover:border-[#B8845C]/30 transition-all duration-300 bg-white/[0.01]">
                  <h3 className="text-sm font-semibold mb-2">{item.title}</h3>
                  <p className="text-white/40 text-xs leading-relaxed">{item.desc}</p>
                  <code className="text-[#E5AA7A] text-[10px] font-mono mt-3 block">
                    {item.code}
                  </code>
                </div>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection delay={0.35}>
            <div className="max-w-4xl mx-auto mt-6 rounded-2xl border border-[#B8845C]/25 bg-gradient-to-r from-[#B8845C]/10 via-[#B8845C]/5 to-transparent p-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-[10px] font-mono font-semibold uppercase tracking-widest text-[#B8845C] mb-1">
                  Multiplayer AI (Roadmap)
                </p>
                <h3 className="text-lg font-semibold mb-1">
                  Your team, in the same agent session.
                </h3>
                <p className="text-white/45 text-xs leading-relaxed">
                  Watch a recorded 3-agent run in the real Mind view — live agent rows,
                  gate verdicts, and the merge train. Planned: optional peer-to-peer session relay without proprietary cloud databases. The CLI and desktop stay free and MIT forever.
                </p>
              </div>
              {ON_PAGES && (
                <a
                  href={`${BASE}/app/?run=replay#/mind`}
                  className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#B8845C] text-white text-sm font-medium hover:bg-[#a5764f] transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Watch Demo Replay
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Interfaces Section */}
      <section
        id="interfaces"
        className="py-24 px-6 bg-gradient-to-b from-white/[0.01] to-transparent"
      >
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Surfaces
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Your workflow. Your way.
            </h2>
          </AnimatedSection>
          <AnimatedSection>
            <div className="flex gap-2 mb-8 overflow-x-auto pb-2 -mx-2 px-2 sm:mx-0 sm:px-0 sm:justify-center sm:flex-wrap">
              {INTERFACES.map((iface) => {
                const Icon = iface.icon;
                return (
                  <button
                    key={iface.id}
                    onClick={() => setActiveTab(iface.id)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer flex items-center gap-2 ${
                      activeTab === iface.id
                        ? "bg-[#B8845C] text-white shadow-lg shadow-[#B8845C]/20"
                        : "border border-white/10 text-white/50 hover:text-white hover:border-white/20 hover:bg-white/5"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {iface.title}
                  </button>
                );
              })}
            </div>
            <div className="border border-white/10 rounded-2xl p-6 sm:p-8 md:p-12 bg-gradient-to-b from-white/[0.02] to-transparent backdrop-blur-sm">
              {INTERFACES.map((iface) => (
                <div
                  key={iface.id}
                  className={`text-center ${activeTab === iface.id ? "block" : "hidden"}`}
                >
                  <h3 className="text-2xl font-semibold mb-3">{iface.title}</h3>
                  <p className="text-white/50 max-w-lg mx-auto mb-6 leading-relaxed">
                    {iface.description}
                  </p>

                  <div className="bg-black/60 border border-white/10 rounded-xl p-4 sm:p-6 text-left max-w-2xl mx-auto font-mono text-xs text-white/80 overflow-x-auto">
                    <pre>
                      <code>{iface.demo}</code>
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Code Intelligence Section */}
      <section
        id="code-intelligence"
        className="py-24 px-6 bg-gradient-to-b from-transparent to-white/[0.02]"
      >
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Code Intelligence
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Your codebase.{" "}
              <span className="text-[#E5AA7A]">Understood.</span>
            </h2>
            <p className="text-white/50 max-w-lg mx-auto text-sm sm:text-base">
              barkcli analyzes your code to provide rich context for every task. See how changes impact your codebase before agents make edits.
            </p>
          </AnimatedSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CODE_FEATURES.map((item, i) => {
              const Icon = item.icon;
              return (
                <AnimatedSection key={i} delay={i * 0.1}>
                  <div className="group bg-white/[0.02] border border-white/10 rounded-2xl p-6 hover:border-[#B8845C]/30 transition-all duration-300 h-full">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-[#B8845C]/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Icon className="w-4 h-4 text-[#B8845C]" />
                      </div>
                      <h4 className="text-base font-semibold">{item.title}</h4>
                    </div>
                    <div className="text-4xl font-bold text-[#E5AA7A] mb-3 font-mono">
                      {item.metric}
                    </div>
                    <p className="text-white/50 text-sm leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
          {/* Context-file proof strip */}
          <AnimatedSection className="mt-6" delay={0.2}>
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="text-center sm:text-left shrink-0">
                  <div className="text-5xl font-bold text-[#E5AA7A] font-mono">57×</div>
                  <div className="text-white/40 text-xs mt-1">less context to gather</div>
                </div>
                <div className="text-center sm:text-left shrink-0 sm:border-l sm:border-white/10 sm:pl-6">
                  <div className="text-2xl font-bold text-white/70 font-mono">44×</div>
                  <div className="text-white/40 text-xs mt-1">even reading fewer files</div>
                </div>
                <p className="text-white/50 text-sm leading-relaxed flex-1">
                  A cold agent session starts by <em>listing</em> the repo, <em>searching</em> for
                  active work, and <em>reading</em> candidate files — ~29,400 tokens before the
                  first real edit on this repo. One read of the auto-maintained{" "}
                  <code className="text-white/80">project_context.md</code> costs{" "}
                  <code className="text-white/80">515</code>. Verify it on your own repo in
                  seconds:
                  <code className="text-white/80"> barkcli context benchmark --json</code> — a
                  deterministic proxy, no LLM in the loop, lockfiles and build output excluded.{" "}
                  <a href="/benchmark" className="text-[#E5AA7A] hover:underline transition-colors">
                    Run it on your repo →
                  </a>
                </p>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Management Layer Section */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Management Layer
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Your AI agent&apos;s
              <br />
              <span className="bg-gradient-to-r from-[#F0CBA8] via-[#E5AA7A] to-[#B8845C] bg-clip-text text-transparent">
                project manager.
              </span>
            </h2>
            <p className="text-white/50 max-w-lg mx-auto text-sm sm:text-base leading-relaxed">
              Claude Code, Codex, and OpenCode can now read tasks, claim work in worktrees, and pass acceptance gates before review. barkcli is the missing management layer in the AI-native dev stack.
            </p>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Bot,
                title: "MCP Integration",
                desc: `Connect coding agents via the Model Context Protocol. ${MCP_TOOL_COUNT} native JSON-RPC 2.0 tools over stdio.`,
                tags: ["opencode", "claude-code", "cursor", "codex"],
              },
              {
                icon: Settings,
                title: "Agent Roles",
                desc: "Assign specialized roles (builder, tester, reviewer) so agents verify their own work before human review.",
                tags: ["builder", "tester", "reviewer", "architect"],
              },
              {
                icon: BarChart3,
                title: "Task Lifecycle",
                desc: "Full task lifecycle from intent to passing test gate and final human review handoff.",
                tags: ["planned", "assigned", "worktree", "verifying", "review", "merged"],
              },
            ].map((item, i) => (
              <AnimatedSection key={i} delay={i * 0.1}>
                <div className="group border border-white/10 rounded-2xl p-6 hover:border-[#B8845C]/30 transition-all duration-300 h-full bg-white/[0.01]">
                  <div className="w-10 h-10 rounded-xl bg-[#B8845C]/10 border border-[#B8845C]/20 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <item.icon className="w-5 h-5 text-[#B8845C]" />
                  </div>
                  <h3 className="text-lg font-semibold mb-3">{item.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed mb-4">
                    {item.desc}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-mono bg-white/5 border border-white/10 rounded-full px-2 py-1 text-white/40"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* AI Agent Integration Section */}
      <section
        id="ai-agent"
        className="py-24 px-6 bg-gradient-to-b from-white/[0.02] to-transparent"
      >
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#B8845C]/10 border border-[#B8845C]/20 rounded-full px-4 py-1.5 mb-6">
              <Sparkles className="w-3.5 h-3.5 text-[#B8845C]" />
              <span className="text-xs text-[#E5AA7A] font-mono">
                Works with Claude, OpenCode, Cursor, Codex
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              One prompt.
              <br />
              <span className="bg-gradient-to-r from-[#F0CBA8] via-[#E5AA7A] to-[#B8845C] bg-clip-text text-transparent">
                Your agent is ready.
              </span>
            </h2>
            <p className="text-white/50 max-w-lg mx-auto text-sm sm:text-base leading-relaxed">
              Copy this into your AI agent. It installs barkcli, sets up your board, and connects via MCP. Your agent can now execute tasks in isolated worktrees.
            </p>
          </AnimatedSection>

          <AnimatedSection>
            {/* Agent Config Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-2 px-2 sm:mx-0 sm:px-0 sm:justify-center sm:flex-wrap">
              {[
                {
                  id: "claude",
                  label: "Claude Code",
                  Logo: ClaudeCodeLogo,
                },
                { id: "opencode", label: "OpenCode", Logo: OpenCodeLogo },
                { id: "cursor", label: "Cursor", Logo: CursorLogo },
                {
                  id: "generic",
                  label: "Any Agent",
                  Logo: AnyAgentLogo,
                },
              ].map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setActiveAgentTab(agent.id)}
                  className={`text-xs font-mono px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all duration-300 cursor-pointer ${
                    activeAgentTab === agent.id
                      ? "bg-[#B8845C] text-white shadow-lg shadow-[#B8845C]/20"
                      : "border border-white/10 text-white/50 hover:text-white hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <agent.Logo className="w-3.5 h-3.5" />
                  {agent.label}
                </button>
              ))}
            </div>

            {/* Main Setup Prompt Card */}
            <div className="border border-white/10 rounded-2xl bg-black/50 backdrop-blur-md overflow-hidden max-w-3xl mx-auto">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]/80" />
                  </div>
                  <span className="text-xs font-mono text-white/40 ml-2">
                    {activeAgentTab === "claude"
                      ? "Paste in Claude Code"
                      : activeAgentTab === "opencode"
                      ? "Paste in OpenCode"
                      : activeAgentTab === "cursor"
                      ? "Paste in Cursor Chat"
                      : "Paste in any AI agent terminal"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(AGENT_PROMPTS[activeAgentTab]);
                    setCopiedPrompt(true);
                    setTimeout(() => setCopiedPrompt(false), 2000);
                  }}
                  className={`text-xs font-mono px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all duration-300 cursor-pointer ${
                    copiedPrompt
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white border border-white/10"
                  }`}
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-3 h-3" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy Prompt
                    </>
                  )}
                </button>
              </div>
              <div className="p-4 sm:p-5 overflow-x-auto max-h-[400px] overflow-y-auto">
                <pre className="text-xs font-mono text-white/70 leading-relaxed whitespace-pre-wrap">
                  <code>{AGENT_PROMPTS[activeAgentTab]}</code>
                </pre>
              </div>
            </div>

            {/* What This Does */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 max-w-3xl mx-auto">
              {[
                { icon: Download, title: "Install", desc: "Downloads barkcli" },
                { icon: Rocket, title: "Init", desc: "Sets up repo" },
                { icon: ClipboardList, title: "Create", desc: "Makes a board" },
                { icon: Plug, title: "Connect", desc: `Connects ${MCP_TOOL_COUNT} MCP tools` },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-white/[0.02] border border-white/10 rounded-xl p-3 text-center group hover:border-[#B8845C]/30 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#B8845C]/10 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
                    <item.icon className="w-4 h-4 text-[#B8845C]" />
                  </div>
                  <h4 className="text-xs font-semibold">{item.title}</h4>
                  <p className="text-[10px] text-white/40">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* Quick Commands */}
            <div className="border border-white/10 rounded-2xl p-5 mt-6 bg-white/[0.01] max-w-3xl mx-auto">
              <h3 className="text-xs font-semibold mb-3 text-white/50 uppercase tracking-wider">
                Loop Commands After Setup
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[
                  { cmd: 'barkcli run "Fix login"', desc: "Run intent loop" },
                  { cmd: "barkcli plan auth --tasks", desc: "Decompose spec" },
                  { cmd: "barkcli dispatch", desc: "Assign worktrees" },
                  { cmd: "barkcli review", desc: "Review passing code" },
                  { cmd: "barkcli brain stats", desc: "Architecture brain" },
                  { cmd: "barkcli tui", desc: "Terminal board" },
                  { cmd: "barkcli serve", desc: "Web & 3D interface" },
                  { cmd: 'barkcli memory search "auth"', desc: "Offline memory search" },
                  { cmd: "barkcli mind sync", desc: "Project overview" },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5"
                  >
                    <code className="text-[11px] font-mono text-[#E5AA7A] flex-1 truncate">
                      {item.cmd}
                    </code>
                    <span className="text-[10px] text-white/30 shrink-0">
                      {item.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center mt-6">
              <a
                href="/docs/getting-started"
                className="inline-flex items-center gap-2 text-[#E5AA7A] text-sm font-medium hover:underline group"
              >
                Read the full quickstart guide
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Installation Section */}
      <section id="install" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Install
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Get started in 10 seconds.
            </h2>
            <p className="text-white/40 text-xs sm:text-sm font-mono mt-3">
              One native binary. No cloud dependencies. No telemetry tracking.
            </p>
          </AnimatedSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                title: "macOS app (Bark)",
                cmd: "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install-app.sh | sh",
                icon: Download,
              },
              {
                title: "macOS / Linux CLI",
                cmd: "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh",
                icon: Terminal,
              },
              {
                title: "Homebrew",
                cmd: "brew tap AkshatNaruka/barkcli && brew install barkcli",
                icon: Shield,
              },
              {
                title: "Cargo (from source)",
                cmd: "cargo install barkcli",
                icon: Code,
              },
              {
                title: "GitHub Releases",
                cmd: "github.com/AkshatNaruka/barkcli/releases",
                icon: GitMerge,
              },
              {
                title: "Windows",
                cmd: "irm https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.ps1 | iex",
                icon: Monitor,
              },
            ].map((method, i) => (
              <AnimatedSection key={i} delay={i * 0.08}>
                <div className="group border border-white/10 rounded-xl p-4 hover:border-[#B8845C]/30 transition-all duration-300 h-full bg-white/[0.01]">
                  <div className="flex items-center gap-2 mb-3">
                    <method.icon className="w-4 h-4 text-[#B8845C]" />
                    <h4 className="text-sm font-semibold">{method.title}</h4>
                  </div>
                  <code className="text-[#E5AA7A] text-xs font-mono block bg-white/5 rounded-lg px-3 py-2 break-all group-hover:bg-white/10 transition-colors">
                    {method.cmd}
                  </code>
                </div>
              </AnimatedSection>
            ))}
          </div>
          <AnimatedSection>
            <p className="text-center text-white/30 text-xs font-mono mt-6">
              All 5 targets + SHA256SUMS published on every <code className="text-white/50">v*</code> tag
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-6 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-3xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              FAQ
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Common questions.
            </h2>
          </AnimatedSection>
          <AnimatedSection>
            <div className="space-y-0">
              {FAQ.map((item, i) => (
                <div key={i} className="border-b border-white/10">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full text-left py-5 flex justify-between items-center cursor-pointer group"
                  >
                    <span className="text-white font-medium group-hover:text-[#E5AA7A] transition-colors pr-4 text-sm sm:text-base">
                      {item.question}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-white/40 shrink-0 transition-transform duration-300 ${
                        openFaq === i ? "rotate-180 text-[#B8845C]" : ""
                      }`}
                    />
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      openFaq === i ? "max-h-48 pb-5 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <p className="text-white/50 text-sm leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <div className="relative">
              <div className="absolute inset-0 bg-[#B8845C]/10 blur-[120px] rounded-full pointer-events-none" />
              <div className="relative border border-white/10 rounded-3xl p-8 sm:p-12 bg-gradient-to-b from-white/[0.03] to-transparent backdrop-blur-md">
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
                  Stop managing tasks
                  <br />
                  <span className="bg-gradient-to-r from-[#F0CBA8] via-[#E5AA7A] to-[#B8845C] bg-clip-text text-transparent">
                    in someone else&apos;s cloud.
                  </span>
                </h2>
                <p className="text-white/60 text-base sm:text-lg mb-8 max-w-lg mx-auto">
                  You manage intent and review. Agents do everything in between.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                  <a
                    href="#install"
                    className="px-6 py-3 bg-[#B8845C] text-white font-medium rounded-xl hover:bg-[#a5764f] transition-all duration-300 shadow-lg shadow-[#B8845C]/20 hover:shadow-[#B8845C]/30 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    Install Now
                    <ArrowRight className="w-4 h-4" />
                  </a>
                  <a
                    href="https://github.com/AkshatNaruka/barkcli"
                    target="_blank"
                    rel="noreferrer"
                    className="px-6 py-3 border border-white/20 text-white font-medium rounded-xl hover:bg-white/5 transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    View on GitHub
                  </a>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Final Footer */}
      <Footer />
    </div>
  );
}
