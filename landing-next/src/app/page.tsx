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
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileCode,
  Workflow,
  Cpu,
  History,
  Activity,
  GitCommit,
  ShieldCheck,
} from "lucide-react";
import {
  OpenCodeLogo,
  ClaudeCodeLogo,
  CursorLogo,
  AnyAgentLogo,
} from "@/components/AgentLogos";

const INSTALL = "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh";

// Hosted GitHub Pages build: link to the interactive board preview served
// at /app/ (see .github/workflows/pages.yml). Hidden on the Vercel deploy.
const ON_PAGES = process.env.NEXT_PUBLIC_PAGES === "1";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

const NAV_LINKS = [
  { href: "#problem", label: "The Problem" },
  { href: "#solution", label: "The Harness" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#board", label: "Board & Agents" },
  { href: "#mind", label: "Mind View" },
  { href: "#memory", label: "Collective Memory" },
  { href: "#benchmark", label: "Benchmark" },
  { href: "/docs", label: "Docs" },
  ...(ON_PAGES ? [{ href: `${BASE}/app/`, label: "Live Preview" }] : []),
];

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_171521_25968ba2-b594-4b32-aab7-f6b69398a6fa.mp4";

/* -------------------------------------------------------------------------- */
/* Pipeline Steps & Data                                                      */
/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    number: "01",
    title: "Intent Intake",
    description: "Human writes intent in plain natural language. barkcli classifies it into a tracked card and spec file.",
    command: 'barkcli intake "Add OAuth 2.0 PKCE flow" --feature',
    icon: Sparkles,
  },
  {
    number: "02",
    title: "Atomic Plan",
    description: "The spec decomposes into agent-ready tasks with file context, acceptance criteria, and dependency links.",
    command: "barkcli plan oauth --tasks",
    icon: Boxes,
  },
  {
    number: "03",
    title: "Worktree Dispatch",
    description: "Each agent claims a task and gets an isolated git worktree with 30s lease beats. Zero git collision.",
    command: 'barkcli run "OAuth flow" --agents 3 --yes',
    icon: Wand2,
  },
  {
    number: "04",
    title: "Acceptance Gate",
    description: "Done means the project's tests pass inside the worktree. Crashed agents and self-reported passes fail instantly.",
    command: "cargo test && barkcli gate --verify",
    icon: ShieldCheck,
  },
  {
    number: "05",
    title: "Merge Train",
    description: "Passing branches merge in finish order. Conflicted branches automatically re-run solo once the pool drains.",
    command: "git merge --no-ff bark/task-14",
    icon: GitMerge,
  },
];

const INTERFACES = [
  {
    id: "desktop",
    title: "macOS App",
    icon: Laptop,
    description: "Native macOS desktop application (Bark.app) with embedded runtime, dock integration, ⌘K command palette, and window controls.",
    demo: `Applications/Bark.app
├── Embedded local server runtime
├── Menu bar status & system notifications
├── Instant ⌘K command palette
└── Real-time WebSocket sync across all workspaces`,
  },
  {
    id: "cli",
    title: "Command Line",
    icon: Terminal,
    description: "Full-featured CLI for scripts, automation, and power users. Every action available from your terminal.",
    demo: `$ barkcli add "Deploy to production" -p critical --due 2024-12-15
✓ Added card deploy-to-production

$ barkcli show deploy-to-production
ID:       deploy-to-production
Title:    Deploy to production
Priority: critical
Due:      2024-12-15
Column:   todo

$ barkcli move deploy-to-production done
✓ Moved to done`,
  },
  {
    id: "tui",
    title: "Terminal UI",
    icon: Monitor,
    description: "Interactive board right in your terminal. Navigate with vim keys, filter, sort, and manage tasks visually.",
    demo: `┌─────────────────────────────────────────────────────────┐
│ Todo              Doing               Done              │
├─────────────────────────────────────────────────────────┤
│ ● Fix login bug   ● Implement API    ✓ Setup CI/CD     │
│ ● Write docs      ● Add auth         ✓ Init project    │
│                   ● Refactor DB                        │
└─────────────────────────────────────────────────────────┘
↑↓/jk sel · ←→/hl col · a add · e edit · d delete`,
  },
  {
    id: "web",
    title: "Web App",
    icon: Globe,
    description: "The management layer UI: Mind homepage, board with spec traceability, agent queue, memory and skills — real-time via WebSocket.",
    demo: `Mind · Board · Agents · Memory · Skills

┌──────────┬──────────┬──────────┬──────────┐
│ Todo     │ Doing    │ Review   │ Done     │
│          │          │          │          │
│ ┌──────┐ │ ┌──────┐ │ ┌──────┐ │ ┌──────┐ │
│ │Auth  │ │ │API   │ │ │Tests │ │ │Setup │ │
│ │UI    │ │ │DB    │ │ │      │ │ │CI/CD │ │
│ └──────┘ │ └──────┘ │ └──────┘ │ └──────┘ │
└──────────┴──────────┴──────────┴──────────┘`,
  },
];

const CODE_FEATURES = [
  { icon: GitBranch, title: "Call Graphs", metric: "→", desc: "Map function calls across files via callgraph_get. Understand impact before you change." },
  { icon: TestTube, title: "Test Coverage", metric: "e.g. 87%", desc: "Heuristic test-file mapping via context_get — see which cards link to which tests." },
  { icon: Zap, title: "Complexity", metric: "e.g. C-12", desc: "Cyclomatic + cognitive scores via metrics_get. Find risky code early." },
  { icon: TrendingUp, title: "Risk Score", metric: "e.g. 0.3", desc: "Formula-based risk (complexity, nesting, size) via metrics_get." },
];

const FAQ = [
  {
    question: "Is barkcli an agentic harness?",
    answer: "Yes. An agentic harness is an automated execution environment that wraps an agent: it creates an isolated workspace, injects context and tools, streams the agent's work, and gates completion on real test passes rather than the agent's self-report. barkcli does this via git worktrees, project_context.md, 71 MCP tools, and a test acceptance gate. Beyond a pure harness, barkcli also provides the human management layer — specs, boards, memory, and multi-agent coordination.",
  },
  {
    question: "Is barkcli a CLI tool or a web app?",
    answer: `Both, plus a native macOS desktop app — but think of it as a management layer, not a single interface. The same repository data powers the macOS app, CLI, terminal UI, VS Code extension, and browser UI. Humans manage intent on the board; agents work through ${MCP_TOOL_COUNT} MCP tools; git syncs everything.`,
  },
  {
    question: "What makes barkcli different from Jira or Linear?",
    answer: "Jira and Linear manage humans through a cloud database. barkcli manages humans and AI agents through files in your repo. Tasks, specs, memory, skills, and agent runs are YAML/JSON you can diff, merge, and version control. No accounts, no subscriptions, no vendor lock-in — and agents can read and write the same board you see.",
  },
  {
    question: "Does it work offline?",
    answer: "Yes. barkcli is a single binary with no network dependencies. All data is stored locally in your repo. Sync via git push/pull — no special sync service needed.",
  },
  {
    question: "Can I use it with my team?",
    answer: "Absolutely. Commit the .board directory to your repo. Team members pull changes and see the same board. No server required — git handles the sync.",
  },
  {
    question: "How do AI agents fit in?",
    answer: `barkcli sits between you and your coding agents. You write intent (intake → plan), agents claim scoped tasks with file context and skills (dispatch), and completed work is validated before it lands (review). Memory persists decisions across sessions. Agents connect via ${MCP_TOOL_COUNT} MCP tools — OpenCode, Claude Code, and Cursor all work. The core stays fully usable offline without any AI.`,
  },
  {
    question: "Is it free?",
    answer: "Yes. barkcli is MIT licensed and completely free. All features are open source — no Pro tiers, no paywalls.",
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

function AnimatedSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, 0.1);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DEEPSEEK & XAI INSPIRED: Living Harness Capabilities (4-Card Grid)          */
/* -------------------------------------------------------------------------- */

function HarnessCapabilities() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-left">
      {/* ------------------------------------------------------------------ */}
      {/* Card 1: Everything is a plugin / skill                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-[#0B0D12] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col justify-between hover:border-[#B8845C]/40 transition-all overflow-hidden relative group">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Everything is a plugin</h3>
          <p className="text-white/50 text-xs sm:text-sm leading-relaxed mb-6">
            Install plugins, or create them through chat in &quot;Creator mode&quot;, to extend tools, skills, and the interface.
          </p>
        </div>

        {/* Visual UI inside card 1 */}
        <div className="space-y-4 pt-2">
          {/* User Request Bubble */}
          <div className="flex justify-end">
            <div className="bg-white/10 text-white text-xs sm:text-sm px-4 py-2.5 rounded-2xl max-w-sm backdrop-blur-md border border-white/10 shadow-sm">
              Write a Pomodoro timer plugin for me.
            </div>
          </div>

          {/* Time & Assistant Response */}
          <div className="space-y-1">
            <div className="text-[11px] font-mono text-white/40 flex items-center gap-1">
              <span>Took 5m 24s</span>
              <ChevronDown className="w-3 h-3 text-white/40" />
            </div>
            <p className="text-xs sm:text-sm text-white/80">
              The floating Pomodoro timer is built, installed, and verified.
            </p>
          </div>

          {/* Floating Widget: Pomodoro timer */}
          <div className="flex justify-end pt-2">
            <div className="w-64 bg-[#14171F] border border-white/15 rounded-2xl p-4 shadow-2xl shadow-black/80">
              <div className="flex items-center justify-between text-xs text-white/80 font-medium mb-3">
                <div className="flex items-center gap-1.5">
                  <span>🍅</span>
                  <span>Pomodoro timer</span>
                </div>
                <span className="text-white/40 text-xs">−</span>
              </div>
              <div className="flex gap-1.5 p-1 bg-black/40 rounded-lg text-[10px] font-medium mb-4">
                <span className="px-2.5 py-1 bg-white/15 text-white rounded-md flex-1 text-center font-semibold">Focus</span>
                <span className="px-2.5 py-1 text-white/40 flex-1 text-center">Short break</span>
              </div>
              <div className="text-center py-1">
                <span className="text-3xl font-bold font-mono tracking-wider text-white">24:48</span>
              </div>
              <button className="w-full mt-4 py-2 rounded-xl bg-white text-black font-semibold text-xs flex items-center justify-center gap-1.5 shadow hover:bg-white/90 transition-all cursor-pointer">
                <Play className="w-3 h-3 fill-black" />
                Start focus
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Card 2: Complete a range of tasks                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-[#0B0D12] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col justify-between hover:border-[#B8845C]/40 transition-all overflow-hidden relative group">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Complete a range of tasks</h3>
          <p className="text-white/50 text-xs sm:text-sm leading-relaxed mb-6">
            Organize documents, analyze spreadsheets, and write code. Preview the results directly and refine them through conversation.
          </p>
        </div>

        {/* Visual UI inside card 2: File stack on left + floating diff review on right */}
        <div className="relative min-h-[220px] flex items-center pt-2">
          {/* File stack */}
          <div className="space-y-2.5 w-48 shrink-0">
            <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 font-bold text-[10px] font-mono flex items-center justify-center">
                MD
              </div>
              <div>
                <div className="text-xs font-semibold text-white/90">README.md</div>
                <div className="text-[10px] text-white/40">Markdown document</div>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 font-bold text-[10px] font-mono flex items-center justify-center">
                W
              </div>
              <div>
                <div className="text-xs font-semibold text-white/90">Brief.docx</div>
                <div className="text-[10px] text-white/40">Word document</div>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-[10px] font-mono flex items-center justify-center">
                XLS
              </div>
              <div>
                <div className="text-xs font-semibold text-white/90">Data.xlsx</div>
                <div className="text-[10px] text-white/40">Excel spreadsheet</div>
              </div>
            </div>
          </div>

          {/* Floating Diff Modal */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-64 sm:w-72 bg-[#14171F] border border-white/15 rounded-2xl p-3.5 shadow-2xl shadow-black/90">
            <div className="flex items-center justify-between text-xs text-white/80 font-medium pb-2 border-b border-white/10 mb-2.5">
              <span>Review · turn 1</span>
              <span className="text-white/40 text-xs">✕</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono mb-2">
              <div className="flex items-center gap-1.5 text-blue-400">
                <span className="bg-blue-500/20 px-1 rounded text-[9px] font-bold">TS</span>
                <span>src/label.ts</span>
                <ChevronDown className="w-3 h-3 text-white/40" />
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-emerald-400 font-semibold">+2</span>
                <span className="text-red-400 font-semibold">-1</span>
              </div>
            </div>
            <div className="bg-[#0A0B0E] rounded-lg p-2 font-mono text-[10px] leading-relaxed border border-white/5">
              <div className="text-white/30 text-[9px]">@@ -8,3 +8,4 @@</div>
              <div className="text-white/50">8  8   function label(name: string) &#123;</div>
              <div className="bg-red-500/10 text-red-400 -mx-2 px-2">9    -   return name;</div>
              <div className="bg-emerald-500/10 text-emerald-400 -mx-2 px-2">   9 +   const text = name.trim();</div>
              <div className="bg-emerald-500/10 text-emerald-400 -mx-2 px-2">  10 +   return text || &apos;Untitled&apos;;</div>
              <div className="text-white/50">10 11  &#125;</div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Card 3: Adapt to your workflow                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-[#0B0D12] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col justify-between hover:border-[#B8845C]/40 transition-all overflow-hidden relative group">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Adapt to your workflow</h3>
          <p className="text-white/50 text-xs sm:text-sm leading-relaxed mb-6">
            Start tasks anytime and run recurring work on schedule. Stay on top of progress and inspect tool call details when needed.
          </p>
        </div>

        {/* Visual UI inside card 3 */}
        <div className="space-y-4 pt-2">
          {/* Scheduled prompt */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-xs sm:text-sm text-white/70 leading-relaxed font-mono">
            Every Friday at 17:00 Beijing time, summarize this week&apos;s project notes in a weekly report.
          </div>

          {/* Trigger row */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
            <span className="flex items-center gap-1.5 text-[#E5AA7A] bg-[#B8845C]/15 px-2.5 py-1 rounded-lg border border-[#B8845C]/30">
              <Clock className="w-3.5 h-3.5 text-[#B8845C]" />
              Cron: 0 17 * * 5
            </span>
            <span className="text-white/40">Next run in 14h</span>
          </div>

          {/* Execution Box */}
          <div className="bg-black/50 border border-white/10 rounded-xl p-3.5 text-[11px] font-mono space-y-1.5">
            <div className="text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Autonomy loop completed in isolated worktree</span>
            </div>
            <div className="text-white/40 text-[10px]">
              Output: Weekly summary logged to memory and Mind overview updated.
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Card 4: Developer tools                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-[#0B0D12] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col justify-between hover:border-[#B8845C]/40 transition-all overflow-hidden relative group">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Developer tools</h3>
          <p className="text-white/50 text-xs sm:text-sm leading-relaxed mb-6">
            Inspect execution traces and detailed runtime information to troubleshoot issues with tool calls and task execution.
          </p>
        </div>

        {/* Visual UI inside card 4: Telemetry Gantt chart */}
        <div className="bg-[#14171F] border border-white/15 rounded-2xl p-4 space-y-3 font-mono text-[11px]">
          {/* Timeline Header Tabs */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-3 text-white/70">
              <span className="flex items-center gap-1 text-[#E5AA7A] font-semibold">
                <Clock className="w-3 h-3" /> Duration
              </span>
              <span className="text-white/40">Turns ⊞</span>
              <span className="text-white/40">Calls ⊞</span>
            </div>
            <div className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded border border-white/10 text-white/40 text-[10px]">
              <Search className="w-3 h-3" />
              <span>Search</span>
            </div>
          </div>

          {/* Gantt Timeline Blocks */}
          <div className="space-y-1.5 py-1">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="w-12 text-white/40">Input</span>
              <div className="flex-1 flex gap-1 h-3">
                <div className="w-8 rounded bg-cyan-500/80" />
                <div className="w-4 rounded bg-cyan-500/80 ml-2" />
                <div className="w-6 rounded bg-cyan-500/80 ml-8" />
                <div className="w-3 rounded bg-cyan-500/80 ml-6" />
                <div className="w-5 rounded bg-cyan-500/80 ml-4" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="w-12 text-white/40">Model</span>
              <div className="flex-1 flex gap-1 h-3">
                <div className="w-5 rounded bg-purple-500/80 ml-3" />
                <div className="w-10 rounded bg-purple-500/80 ml-5" />
                <div className="w-4 rounded bg-purple-500/80 ml-4" />
                <div className="w-8 rounded bg-purple-500/80 ml-7" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="w-12 text-white/40">Tools</span>
              <div className="flex-1 flex gap-1 h-3">
                <div className="w-10 rounded bg-[#B8845C] ml-6" />
                <div className="w-7 rounded bg-[#B8845C] ml-3" />
                <div className="w-12 rounded bg-[#B8845C] ml-6" />
                <div className="w-6 rounded bg-[#B8845C] ml-2" />
              </div>
            </div>
          </div>

          {/* Trace Rows */}
          <div className="pt-2 border-t border-white/5 space-y-1 text-[10px]">
            <div className="flex items-center gap-2">
              <span className="bg-white/10 px-1.5 py-0.2 rounded text-white/70">SYSTEM</span>
              <span className="text-white/50 truncate">Initial System Prompt (71 MCP tools enabled)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/30">Turn 1</span>
              <span className="bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded">USER</span>
              <span className="text-white/70 truncate">First run bash to print exactly NAVIGATION_OK, then read nav...</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-[#B8845C]/20 text-[#E5AA7A] px-1.5 py-0.2 rounded">CONTEXT</span>
              <span className="text-white/50 truncate">Current runtime context: workspace policy, available skills, and...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DEDICATED SURFACE 1: Board & Agents Showcase                               */
/* -------------------------------------------------------------------------- */

interface ShowcaseCard {
  title: string;
  meta: string;
  metaCls: string;
  spec: string;
  blocked: boolean;
  worktree?: string;
  agent?: string;
  lease?: string;
  gateResult?: string;
}

interface ShowcaseColumn {
  name: string;
  tone: string;
  cards: ShowcaseCard[];
}

function BoardShowcase() {
  const AGENT_BRAND: Record<string, string> = {
    opencode: "#D99C57",
    claude: "#D97757",
    human: "#34D399",
  };

  const columns: ShowcaseColumn[] = [
    {
      name: "Todo",
      tone: "text-white/40",
      cards: [
        { title: "OAuth 2.0 PKCE Flow", meta: "HIGH", metaCls: "text-red-400 bg-red-500/10 border-red-500/30", spec: "spec: oauth-auth", blocked: false },
        { title: "Rate limit token bucket", meta: "MED", metaCls: "text-[#E5AA7A] bg-[#B8845C]/10 border-[#B8845C]/30", spec: "spec: ratelimit", blocked: false },
      ],
    },
    {
      name: "In Progress (Worktree)",
      tone: "text-[#E5AA7A]",
      cards: [
        {
          title: "Fix token storage race condition",
          meta: "IN PROGRESS",
          metaCls: "text-[#E5AA7A] bg-[#B8845C]/10 border-[#B8845C]/30",
          spec: "spec: token-store",
          worktree: "bark/task-14",
          agent: "opencode-1",
          lease: "18s lease left",
          blocked: false,
        },
      ],
    },
    {
      name: "Review & Acceptance Gate",
      tone: "text-emerald-400",
      cards: [
        {
          title: "Secure cookie partition encryption",
          meta: "GATE PASS",
          metaCls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
          spec: "spec: cookie-crypt",
          worktree: "bark/task-16",
          agent: "claude-2",
          gateResult: "✓ 14/14 tests pass (42ms)",
          blocked: false,
        },
      ],
    },
  ];

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#0A0B0E] shadow-2xl shadow-black/80">
      {/* Browser Chrome Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#FF5F56]/80 border border-[#E0443E]/40" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E]/80 border border-[#DEA123]/40" />
            <div className="w-3 h-3 rounded-full bg-[#27C93F]/80 border border-[#1AAB29]/40" />
          </div>
          <span className="text-[11px] font-mono text-white/50 bg-white/5 border border-white/10 rounded-md px-3 py-1 hidden sm:inline-block">
            localhost:4321/#/board — barkcli workspace
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live WebSocket
          </span>
        </div>
      </div>

      <div className="flex text-left">
        {/* Sidebar */}
        <div className="hidden sm:flex flex-col w-44 shrink-0 border-r border-white/10 py-3 bg-white/[0.01]">
          <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-widest text-white/30">Surfaces</div>
          {[
            { icon: LayoutDashboard, label: "Board", active: true, badge: "8" },
            { icon: Brain, label: "Mind", active: false, badge: "0" },
            { icon: Database, label: "Memory", active: false, badge: "42" },
            { icon: Layers, label: "Specs", active: false },
          ].map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-2 px-3 py-2 text-xs border-l-2 ${
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
          <div className="px-3 pt-4 pb-2 text-[10px] font-mono uppercase tracking-widest text-white/30">Agent Pool</div>
          {[{ icon: Bot, label: "Workers Active", badge: "3" }].map((item) => (
            <div key={item.label} className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/50 border-l-2 border-transparent">
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
              <span className="ml-auto text-[10px] font-mono px-1.5 py-px rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{item.badge}</span>
            </div>
          ))}
        </div>

        {/* Kanban Board Columns */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 min-w-0">
          {columns.map((col) => (
            <div key={col.name} className="bg-white/[0.02] border border-white/10 rounded-xl p-3 min-w-0 flex flex-col">
              <div className={`text-[11px] font-semibold uppercase tracking-wide mb-2.5 flex items-center justify-between ${col.tone}`}>
                <span>{col.name}</span>
                <span className="text-[10px] font-mono opacity-60 bg-white/5 px-2 py-0.5 rounded-full">{col.cards.length}</span>
              </div>
              <div className="space-y-2.5 flex-1">
                {col.cards.map((c) => (
                  <div
                    key={c.title}
                    className="bg-white/[0.03] rounded-xl p-3 border border-white/10 hover:border-white/20 transition-all"
                  >
                    <div className="text-[12px] text-white/95 font-medium leading-snug">{c.title}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className={`text-[9px] font-semibold px-1.5 py-px rounded border ${c.metaCls}`}>{c.meta}</span>
                      <span className="text-[9px] font-mono text-[#D4A574] bg-[#B8845C]/10 border border-[#B8845C]/20 px-1.5 py-px rounded">⎇ {c.spec}</span>
                    </div>
                    {c.worktree && (
                      <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-white/40">
                        <span className="text-[#E5AA7A]">branch: {c.worktree}</span>
                        <span>{c.lease}</span>
                      </div>
                    )}
                    {c.gateResult && (
                      <div className="mt-2.5 pt-2 border-t border-white/5 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{c.gateResult}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right Active Agent Pool */}
        <div className="hidden lg:flex flex-col w-56 shrink-0 border-l border-white/10 p-3 bg-white/[0.01]">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">
            <span>Agent Pool</span>
            <span className="text-emerald-400 font-semibold">● 3 active</span>
          </div>
          {[
            {
              name: "opencode-1",
              task: "Fix race condition",
              tool: "opencode",
              worktree: "bark/task-14",
              Logo: OpenCodeLogo,
            },
            {
              name: "claude-2",
              task: "Cookie encryption",
              tool: "claude",
              worktree: "bark/task-16",
              Logo: ClaudeCodeLogo,
            },
            {
              name: "human-you",
              task: "Acceptance gate review",
              tool: "human",
              worktree: "origin/master",
              Logo: AnyAgentLogo,
            },
          ].map((a) => (
            <div key={a.name} className="py-2.5 border-b border-white/5 last:border-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <a.Logo className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-mono text-white/80">{a.name}</span>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-[10px] mt-1 font-mono" style={{ color: AGENT_BRAND[a.tool] }}>
                ↳ {a.task}
              </div>
              <div className="text-[9px] font-mono text-white/30 mt-0.5">
                {a.worktree}
              </div>
            </div>
          ))}
          <div className="mt-auto pt-3 border-t border-white/5">
            <div className="text-[10px] font-mono text-white/40 flex items-center justify-between">
              <span>Gate Verdict:</span>
              <span className="text-emerald-400 font-bold">100% PASS</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Live Gate Banner */}
      <div className="px-4 py-2 bg-emerald-500/5 border-t border-emerald-500/20 flex flex-wrap items-center justify-between text-[11px] font-mono text-emerald-300">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Acceptance Gate: cargo test --test auth → 14 passed in worktree bark/task-16</span>
        </div>
        <span className="text-[#E5AA7A]">Queued for Merge Train →</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DEDICATED SURFACE 2: Mind View Showcase                                    */
/* -------------------------------------------------------------------------- */

function MindShowcase() {
  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#0A0B0E] shadow-2xl shadow-black/80">
      {/* Browser Chrome Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#FF5F56]/80 border border-[#E0443E]/40" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E]/80 border border-[#DEA123]/40" />
            <div className="w-3 h-3 rounded-full bg-[#27C93F]/80 border border-[#1AAB29]/40" />
          </div>
          <span className="text-[11px] font-mono text-white/50 bg-white/5 border border-white/10 rounded-md px-3 py-1 hidden sm:inline-block">
            localhost:4321/#/mind — project mental model snapshot
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[#B8845C]/10 text-[#E5AA7A] border border-[#B8845C]/30">
            <Activity className="w-3 h-3 text-[#B8845C]" />
            Compiled 2m ago
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5 text-left">
        {/* Top 4 Metric Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Project Health", val: "98%", status: "Optimal", color: "text-emerald-400" },
            { label: "Critical Blockers", val: "0", status: "All Clear", color: "text-white" },
            { label: "Active Worktrees", val: "3", status: "Isolated", color: "text-[#E5AA7A]" },
            { label: "Acceptance Gate", val: "100%", status: "Passing", color: "text-emerald-400" },
          ].map((m) => (
            <div key={m.label} className="bg-white/[0.02] border border-white/10 rounded-xl p-3.5">
              <div className="text-[10px] font-mono uppercase text-white/40">{m.label}</div>
              <div className={`text-2xl font-bold font-mono mt-1 ${m.color}`}>{m.val}</div>
              <div className="text-[10px] font-mono text-white/40 mt-0.5">{m.status}</div>
            </div>
          ))}
        </div>

        {/* 2-Column Content: Critical Path vs Compiled Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Dependency Critical Path Topology */}
          <div className="lg:col-span-7 bg-white/[0.02] border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4 text-[#B8845C]" />
                <span className="text-xs font-semibold text-white/80">Dependency Critical Path</span>
              </div>
              <span className="text-[10px] font-mono text-white/40">DAG Enforced</span>
            </div>
            <div className="space-y-2">
              {[
                { id: "NODE-12", title: "User Auth Schema Migration", status: "MERGED", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", author: "human-you" },
                { id: "NODE-14", title: "Token Storage & Refresh Service", status: "GATE PASSING", badge: "bg-[#B8845C]/15 text-[#E5AA7A] border-[#B8845C]/30", author: "claude-2 in bark/task-14" },
                { id: "NODE-15", title: "Client SDK Auth Middleware", status: "READY TO DISPATCH", badge: "bg-white/5 text-white/50 border-white/10", author: "Queued for opencode-1" },
              ].map((node, i) => (
                <div key={node.id} className="relative">
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-2.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-white/40">{node.id}</span>
                        <span className="text-xs text-white/90 font-medium">{node.title}</span>
                      </div>
                      <div className="text-[10px] font-mono text-white/40 mt-0.5">{node.author}</div>
                    </div>
                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${node.badge}`}>
                      {node.status}
                    </span>
                  </div>
                  {i < 2 && (
                    <div className="h-2 w-px bg-[#B8845C]/40 ml-6 my-0.5" />
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] font-mono text-white/30 mt-3">
              Dependents are strictly blocked until ancestors pass their worktree acceptance gate.
            </p>
          </div>

          {/* Right: Synthesis & Next Actions */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Stale Branch Watchdog</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                0 worktrees drifted. 1 branch cleanly rebased against master without merge conflicts.
              </p>
            </div>

            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80 mb-2">
                <FileCode className="w-3.5 h-3.5 text-[#B8845C]" />
                <span>Living Context Status</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed font-mono">
                project_context.md byte-stable (515 tokens, 0 drift). Auto-healed on board write.
              </p>
            </div>

            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-[#E5AA7A]" />
                <span>Next Recommended Actions</span>
              </div>
              <ul className="text-[11px] text-white/50 space-y-1 list-disc list-inside">
                <li>Approve merge train PR for task #14</li>
                <li>Dispatch NODE-15 to OpenCode (UCB: 0.94)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* CLI Command Bar */}
        <div className="bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-white/70">
            <span className="text-[#B8845C]">$</span>
            <span>barkcli mind sync && barkcli overview</span>
          </div>
          <span className="text-[10px] text-emerald-400">✓ Mind snapshot synchronized</span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DEDICATED SURFACE 3: Collective Memory Showcase                            */
/* -------------------------------------------------------------------------- */

function MemoryShowcase() {
  const [activeFilter, setActiveFilter] = useState("all");

  const MEMORIES = [
    {
      id: "HYPOTHESIS #84",
      title: "Atomic CAS prevents token refresh race condition under high load",
      type: "hypothesis",
      badge: "VERIFIED & MERGED",
      badgeCls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      evidence: "0.94",
      ucb: "0.88",
      author: "claude-2",
      context: "Under 500 concurrent requests, mutex locking deadlocked. Switched to atomic compare-and-swap with jitter backoff. 100% test gate passing.",
      ancestry: "Commit #8f2a1 · Validated in worktree bark/task-14",
    },
    {
      id: "FAILURE LESSON #81",
      title: "Cookie header overflow: WebKit rejects cookies larger than 4KB",
      type: "failure",
      badge: "AVOIDED REPEAT",
      badgeCls: "bg-[#B8845C]/15 text-[#E5AA7A] border-[#B8845C]/30",
      evidence: "1.00",
      ucb: "0.95",
      author: "opencode-1",
      context: "Storing full JWT in single cookie fails on Safari. Negative memory recorded: subsequent agents automatically partition tokens <= 2KB.",
      ancestry: "Recorded as negative memory fact · Prevents repetition",
    },
    {
      id: "CORE FACT #77",
      title: "Zero-allocation token delimiter parsing via memchr",
      type: "fact",
      badge: "REUSED 4X",
      badgeCls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
      evidence: "0.89",
      ucb: "0.84",
      author: "human-you",
      context: "Replacing regex delimiter parsing with memchr dropped hot-path execution from 120μs to 35μs.",
      ancestry: "Indexed in project_context.md · Read by all agents",
    },
  ];

  const filtered = activeFilter === "all" ? MEMORIES : MEMORIES.filter((m) => m.type === activeFilter);

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#0A0B0E] shadow-2xl shadow-black/80">
      {/* Browser Chrome Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#FF5F56]/80 border border-[#E0443E]/40" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E]/80 border border-[#DEA123]/40" />
            <div className="w-3 h-3 rounded-full bg-[#27C93F]/80 border border-[#1AAB29]/40" />
          </div>
          <span className="text-[11px] font-mono text-white/50 bg-white/5 border border-white/10 rounded-md px-3 py-1 hidden sm:inline-block">
            localhost:4321/#/memory — Git-backed contribution graph
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-white/40">
            BM25 + TF-IDF Hybrid Search
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 text-left">
        {/* Search Bar & Filter Tabs */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-white/30 absolute left-3 top-3" />
            <input
              type="text"
              readOnly
              value='search "token race condition" --evidence > 0.8'
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white/80 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: "all", label: "All (42)" },
              { id: "hypothesis", label: "Hypotheses (18)" },
              { id: "failure", label: "Failure Lessons (8)" },
              { id: "fact", label: "Core Facts (12)" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`text-[10px] font-mono px-3 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-all ${
                  activeFilter === tab.id
                    ? "bg-[#B8845C] text-white font-medium"
                    : "bg-white/5 text-white/40 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Memory Hypothesis Cards */}
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-white/[0.02] border border-white/10 rounded-xl p-4 hover:border-[#B8845C]/30 transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#E5AA7A] bg-[#B8845C]/15 border border-[#B8845C]/30 px-2 py-0.5 rounded">
                    {item.id}
                  </span>
                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${item.badgeCls}`}>
                    {item.badge}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-white/40">
                  <span>Evidence: <strong className="text-white/80">{item.evidence}</strong></span>
                  <span>UCB: <strong className="text-white/80">{item.ucb}</strong></span>
                  <span>By: <strong className="text-white/80">{item.author}</strong></span>
                </div>
              </div>

              <h4 className="text-sm font-semibold text-white/95 mb-1.5">{item.title}</h4>
              <p className="text-xs text-white/50 leading-relaxed mb-3">{item.context}</p>

              <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-white/40">
                <div className="flex items-center gap-1.5">
                  <GitCommit className="w-3.5 h-3.5 text-[#B8845C]" />
                  <span>{item.ancestry}</span>
                </div>
                <span className="text-emerald-400">Shared across sessions</span>
              </div>
            </div>
          ))}
        </div>

        {/* Key Advantage Callout */}
        <div className="bg-[#B8845C]/10 border border-[#B8845C]/25 rounded-xl p-3.5 flex items-start gap-3">
          <Brain className="w-4 h-4 text-[#E5AA7A] shrink-0 mt-0.5" />
          <p className="text-xs text-white/70 leading-relaxed">
            <strong>Zero AI Amnesia:</strong> When an agent crashes or fails a test gate, the verdict is recorded as a negative memory fact. Future agents read past facts so they never repeat known failure modes.
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MAIN PAGE                                                                  */
/* -------------------------------------------------------------------------- */

export default function Home() {
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState("desktop");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeAgentTab, setActiveAgentTab] = useState("claude");
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

      {/* -------------------------------------------------------------------- */}
      {/* 1. HERO SECTION                                                      */}
      {/* -------------------------------------------------------------------- */}
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
        <div className="absolute inset-0 bg-gradient-to-b from-[#060709]/85 via-[#060709]/60 to-[#060709] pointer-events-none" />
        <div className="absolute inset-0 bark-grid-pattern opacity-40 pointer-events-none" />

        {/* Gradient Glow Orbs */}
        <div className="absolute top-1/4 left-1/4 w-[450px] h-[450px] bg-[#B8845C]/15 rounded-full blur-[140px] pointer-events-none animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-[#B8845C]/10 rounded-full blur-[140px] pointer-events-none" />

        {/* Sticky Header Nav */}
        <header className={`relative z-10 flex items-center justify-between px-6 md:px-10 h-16 shrink-0 transition-all duration-300 ${scrolled ? "bg-[#060709]/90 backdrop-blur-xl border-b border-white/10" : ""}`}>
          <a href="#" className="flex items-center gap-2.5 no-underline group">
            <div className="w-8 h-8 rounded-lg bg-[#B8845C] flex items-center justify-center group-hover:scale-105 transition-transform shadow-md shadow-[#B8845C]/20">
              <svg viewBox="0 0 100 100" className="w-5 h-5" fill="none" stroke="white" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 30 25 C 42 18, 58 18, 70 25" />
                <path d="M 30 25 C 16 27, 11 39, 12 51 C 13 60, 21 61, 27 53 C 30 48, 30 41, 30 35" />
                <path d="M 70 25 C 84 27, 89 39, 88 51 C 87 60, 79 61, 73 53 C 70 48, 70 41, 70 35" />
                <path d="M 30 43 C 26 56, 28 67, 35 74 C 41 79.5, 59 79.5, 65 74 C 72 67, 74 56, 70 43" />
                <path d="M 43.5 55 C 47 52.5, 53 52.5, 56.5 55 C 55 59.5, 52 63, 50 64 C 48 63, 45 59.5, 43.5 55 Z" fill="white" stroke="none" />
                <path d="M 50 64 L 50 70 M 44.5 70 C 47.5 72.5, 52.5 72.5, 55.5 70" strokeWidth="5" />
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
                className="text-xs text-white/60 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5 hidden md:block"
              >
                {link.label}
              </a>
            ))}
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
            <span className="text-xs text-white/70 font-mono">Open source (MIT) · v0.4.0 · {MCP_TOOL_COUNT} MCP tools · Git-native harness</span>
          </div>
          <h1 className="text-white text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05] mb-6 max-w-5xl">
            The management layer
            <br />
            <span className="bg-gradient-to-r from-[#F0CBA8] via-[#E5AA7A] to-[#B8845C] bg-clip-text text-transparent">
              for AI agents.
            </span>
          </h1>
          <p className="text-white/60 text-sm sm:text-base md:text-lg font-light max-w-2xl mb-8 leading-relaxed px-2">
            Humans write intent. Agents propose plans. Each agent works in an isolated git worktree,
            tests are the acceptance gate, and only passing branches merge.
          </p>

          <div className="flex flex-col items-center gap-3 w-full max-w-xl">
            {/* Install Bar */}
            <div className="flex items-center gap-1 border border-white/20 rounded-xl pl-5 pr-2 py-2.5 bg-black/40 backdrop-blur-xl w-full">
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
                href="https://github.com/AkshatNaruka/barkcli/releases/latest/download/Bark-macOS-universal.dmg"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B8845C] text-white text-xs sm:text-sm font-medium hover:bg-[#a5764f] transition-all shadow-lg shadow-[#B8845C]/20"
              >
                <Download className="w-4 h-4" />
                Download macOS (.dmg)
              </a>
              <a
                href="#problem"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 text-xs sm:text-sm font-medium transition-all"
              >
                See Why Agents Break
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
              {ON_PAGES && (
                <a
                  href={`${BASE}/app/`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#B8845C]/30 bg-[#B8845C]/10 text-[#E5AA7A] hover:bg-[#B8845C]/20 text-xs sm:text-sm font-medium transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  Live Web Preview
                </a>
              )}
            </div>

            {/* Workflow steps */}
            <div className="flex items-center gap-2 sm:gap-3 text-[11px] font-mono text-white/50 mt-3">
              <span className="flex items-center gap-1.5 border border-white/10 rounded-full px-3 py-1.5 bg-white/[0.03]">
                <Sparkles className="w-3 h-3 text-[#B8845C]" /> 1. Type intent
              </span>
              <ArrowRight className="w-3 h-3 text-white/30" />
              <span className="flex items-center gap-1.5 border border-white/10 rounded-full px-3 py-1.5 bg-white/[0.03]">
                <Check className="w-3 h-3 text-[#B8845C]" /> 2. Approve plan
              </span>
              <ArrowRight className="w-3 h-3 text-white/30" />
              <span className="flex items-center gap-1.5 border border-white/10 rounded-full px-3 py-1.5 bg-white/[0.03]">
                <GitMerge className="w-3 h-3 text-[#B8845C]" /> 3. Gate passes & merges
              </span>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mt-8 text-[11px] font-mono text-white/40">
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

      {/* -------------------------------------------------------------------- */}
      {/* 2. THE PROBLEM SECTION                                               */}
      {/* -------------------------------------------------------------------- */}
      <section id="problem" className="py-24 px-6 relative bg-gradient-to-b from-[#060709] via-black/40 to-[#060709]">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              The Reality of Coding Agents
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Why AI coding agents
              <br />
              <span className="bg-gradient-to-r from-red-400 to-[#E5AA7A] bg-clip-text text-transparent">
                break in production.
              </span>
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              LLMs write code with incredible speed. But when left unsupervised without an isolated git harness, autonomous development disintegrates into three systemic failure modes:
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Flaw 1 */}
            <AnimatedSection delay={0.1}>
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 h-full flex flex-col hover:border-red-500/30 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30">
                    FATAL FLAW #1
                  </span>
                  <XCircle className="w-4 h-4 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">The Self-Reporting Trap</h3>
                <p className="text-white/50 text-xs sm:text-sm leading-relaxed mb-4 flex-1">
                  Agents hallucinate completion. The model outputs <em>&quot;I have resolved all edge cases and tests pass!&quot;</em>, while in reality the test was never executed or exited with code 101.
                </p>
                <div className="bg-black/60 border border-red-500/20 rounded-xl p-3 text-[11px] font-mono text-red-300">
                  <div className="text-white/40 mb-1"># Unsupervised agent output:</div>
                  <div>✓ &quot;Done! Everything fixed.&quot;</div>
                  <div className="text-red-400 mt-1">✗ cargo test: FAILED (exit 101)</div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-[#E5AA7A]">
                  <strong>barkcli gate:</strong> A card is done <em>only</em> when project tests pass in the worktree. Self-reporting is ignored.
                </div>
              </div>
            </AnimatedSection>

            {/* Flaw 2 */}
            <AnimatedSection delay={0.2}>
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 h-full flex flex-col hover:border-[#B8845C]/40 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#B8845C]/15 text-[#E5AA7A] border border-[#B8845C]/30">
                    FATAL FLAW #2
                  </span>
                  <AlertTriangle className="w-4 h-4 text-[#E5AA7A]" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Context Amnesia & Token Burn</h3>
                <p className="text-white/50 text-xs sm:text-sm leading-relaxed mb-4 flex-1">
                  Every cold session starts from scratch. The agent executes recursive directory listings and greps 20 files, burning 30,000 tokens before writing a single line of code.
                </p>
                <div className="bg-black/60 border border-white/10 rounded-xl p-3 text-[11px] font-mono text-white/60">
                  <div className="text-white/40 mb-1"># Cold session discovery:</div>
                  <div>$ find . &amp;&amp; grep -rn ...</div>
                  <div className="text-[#E5AA7A] mt-1">Token cost: ~29,400 tokens</div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-[#E5AA7A]">
                  <strong>barkcli context:</strong> Auto-maintained <code>project_context.md</code> costs <strong>515 tokens</strong> (57× less token waste).
                </div>
              </div>
            </AnimatedSection>

            {/* Flaw 3 */}
            <AnimatedSection delay={0.3}>
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 h-full flex flex-col hover:border-amber-500/30 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    FATAL FLAW #3
                  </span>
                  <GitBranch className="w-4 h-4 text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Worktree Collisions & Dirty Git</h3>
                <p className="text-white/50 text-xs sm:text-sm leading-relaxed mb-4 flex-1">
                  Running multiple agents in a single shared repository causes chaos. Agent A edits a file, Agent B overwrites it with unstaged changes, and git state becomes corrupted.
                </p>
                <div className="bg-black/60 border border-white/10 rounded-xl p-3 text-[11px] font-mono text-white/60">
                  <div className="text-white/40 mb-1"># Parallel collision:</div>
                  <div>Agent A: editing auth.rs</div>
                  <div className="text-amber-400 mt-1">Agent B: checkout overwrite!</div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-[#E5AA7A]">
                  <strong>barkcli worktrees:</strong> Every agent works in an isolated git worktree; passing branches merge cleanly via the merge train.
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 3. THE SOLUTION PIPELINE (THE HARNESS)                               */}
      {/* -------------------------------------------------------------------- */}
      <section id="solution" className="py-24 px-6 relative">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              The Architecture
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              The deterministic harness.
              <br />
              <span className="text-white/40">From raw intent to merged code.</span>
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              barkcli is the management layer that bridges human intent and agent execution. Every step is git-native, offline-capable, and gated by acceptance tests.
            </p>
          </AnimatedSection>

          {/* 5-Step Pipeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 relative">
            <div className="hidden lg:block absolute top-12 left-[8%] right-[8%] h-px bg-gradient-to-r from-transparent via-[#B8845C]/40 to-transparent" />
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <AnimatedSection key={i} delay={i * 0.1}>
                  <div className="text-center relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#B8845C]/20 to-[#B8845C]/5 border border-[#B8845C]/30 flex items-center justify-center mx-auto mb-6 relative z-10 shadow-lg shadow-[#B8845C]/10">
                      <Icon className="w-7 h-7 text-[#E5AA7A]" />
                    </div>
                    <span className="text-[10px] font-mono text-[#E5AA7A] bg-[#B8845C]/15 px-2 py-0.5 rounded border border-[#B8845C]/30">
                      Step {step.number}
                    </span>
                    <h3 className="text-lg font-semibold mt-2 mb-2">{step.title}</h3>
                    <p className="text-white/50 text-xs leading-relaxed mb-4 px-2">
                      {step.description}
                    </p>
                    <div className="bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 max-w-xs mx-auto">
                      <code className="text-[#E5AA7A] text-[11px] font-mono truncate block">{step.command}</code>
                    </div>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 3.5 HARNESS CAPABILITIES (DEEPSEEK & XAI 4-CARD BENTO GRID)          */}
      {/* -------------------------------------------------------------------- */}
      <section id="capabilities" className="py-24 px-6 border-t border-white/5 bg-gradient-to-b from-[#060709] via-black/30 to-[#060709]">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Interactive Capabilities
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Built for autonomy.
              <br />
              <span className="bg-gradient-to-r from-[#F0CBA8] via-[#E5AA7A] to-[#B8845C] bg-clip-text text-transparent">
                Crafted for engineering rigor.
              </span>
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              Everything in barkcli is designed around verifiable artifacts: skills lock down external tools, worktrees host code reviews, and telemetry captures every tool invocation.
            </p>
          </AnimatedSection>

          <AnimatedSection>
            <HarnessCapabilities />
          </AnimatedSection>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 4. DEDICATED SURFACE 1: BOARD & AGENTS                                */}
      {/* -------------------------------------------------------------------- */}
      <section id="board" className="py-24 px-6 border-t border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-[#B8845C]/10 border border-[#B8845C]/30 rounded-full px-3 py-1 mb-4">
              <LayoutDashboard className="w-3.5 h-3.5 text-[#B8845C]" />
              <span className="text-xs font-mono text-[#E5AA7A]">Dedicated Surface 1</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Board &amp; Agent Registry.
              <br />
              <span className="text-white/40">Spec-traceable work with lease heartbeats.</span>
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              Every card binds to a specification file (<code>spec_id</code>), an isolated git worktree branch, and an active agent lease. If an agent dies or hangs, its claim is automatically revoked.
            </p>
          </AnimatedSection>

          <AnimatedSection>
            <BoardShowcase />
          </AnimatedSection>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 5. DEDICATED SURFACE 2: MIND VIEW                                    */}
      {/* -------------------------------------------------------------------- */}
      <section id="mind" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-[#B8845C]/10 border border-[#B8845C]/30 rounded-full px-3 py-1 mb-4">
              <Brain className="w-3.5 h-3.5 text-[#B8845C]" />
              <span className="text-xs font-mono text-[#E5AA7A]">Dedicated Surface 2</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Mind View.
              <br />
              <span className="text-white/40">The compiled mental model of your project.</span>
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              Never re-explore a codebase in a loop. Mind synthesizes project health, blocker bottlenecks, stale branch drift, and prioritized next actions into one instant view.
            </p>
          </AnimatedSection>

          <AnimatedSection>
            <MindShowcase />
          </AnimatedSection>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 6. DEDICATED SURFACE 3: COLLECTIVE MEMORY                            */}
      {/* -------------------------------------------------------------------- */}
      <section id="memory" className="py-24 px-6 border-t border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-[#B8845C]/10 border border-[#B8845C]/30 rounded-full px-3 py-1 mb-4">
              <Database className="w-3.5 h-3.5 text-[#B8845C]" />
              <span className="text-xs font-mono text-[#E5AA7A]">Dedicated Surface 3</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Collective Memory.
              <br />
              <span className="text-white/40">Git-backed knowledge graph with UCB exploration.</span>
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              Every completed or failed agent run deposits facts into Git. Hybrid BM25 + TF-IDF search allows agents to build on verified evidence instead of repeating costly mistakes.
            </p>
          </AnimatedSection>

          <AnimatedSection>
            <MemoryShowcase />
          </AnimatedSection>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 7. AUTONOMY SECTION (LIVE RECORDED RUN)                              */}
      {/* -------------------------------------------------------------------- */}
      <section id="autonomy" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Live Autonomy Proof
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              One prompt.
              <br />
              <span className="bg-gradient-to-r from-[#F0CBA8] via-[#E5AA7A] to-[#B8845C] bg-clip-text text-transparent">
                Three agents. Merged.
              </span>
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              <code className="text-white/80">barkcli run &quot;…&quot; --agents 3 --yes</code> plans your
              intent, spawns agents into isolated worktrees, and runs project tests as the gate.
              Gate-passing branches ride the <span className="text-white/70">merge train</span> in finish order.
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${BASE}/run-agents-demo.gif`}
                alt="barkcli run --agents 3: three agents working in worktrees, live agent rows pulsing, tasks completing and merging in real time in the Mind view"
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
                title: "Workers Own Attempts",
                desc: "Each agent gets its own worktree, transcript and gate. Beats refresh the task lease every 30s — a dead agent forfeits its claim.",
                code: "bark/[task-id]",
              },
              {
                title: "Deterministic Merge Train",
                desc: "Done means merged. Conflicted branches queue for a solo rebase attempt against a frozen main — deterministic and converging.",
                code: "git merge --no-ff",
              },
              {
                title: "Honest by Construction",
                desc: "Crashed agent + no changes + no-op gate = failure, not done. Every failure verdict is stored, re-dispatched, and recorded as memory.",
                code: "gate > self-report",
              },
            ].map((item, i) => (
              <AnimatedSection key={i} delay={0.1 + i * 0.1}>
                <div className="border border-white/10 rounded-2xl p-5 h-full hover:border-[#B8845C]/30 transition-all duration-300 bg-white/[0.01]">
                  <h3 className="text-sm font-semibold mb-2">{item.title}</h3>
                  <p className="text-white/40 text-xs leading-relaxed">{item.desc}</p>
                  <code className="text-[#E5AA7A] text-[10px] font-mono mt-3 block">{item.code}</code>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 8. CONTEXT BENCHMARK (57X PROOF)                                     */}
      {/* -------------------------------------------------------------------- */}
      <section id="benchmark" className="py-24 px-6 border-t border-white/5 bg-gradient-to-b from-transparent to-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Context Efficiency
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              57× less token waste.{" "}
              <span className="text-[#E5AA7A]">First-party numbers.</span>
            </h2>
            <p className="text-white/50 max-w-xl mx-auto text-sm sm:text-base">
              Cold agents burn tokens listing and searching. barkcli eliminates cold-start exploration with auto-maintained project context.
            </p>
          </AnimatedSection>

          <AnimatedSection>
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="text-center md:text-left shrink-0">
                  <div className="text-6xl font-bold text-[#E5AA7A] font-mono">57×</div>
                  <div className="text-white/40 text-xs mt-1">less context to gather</div>
                </div>
                <div className="text-center md:text-left shrink-0 md:border-l md:border-white/10 md:pl-8">
                  <div className="text-3xl font-bold text-white/70 font-mono">44×</div>
                  <div className="text-white/40 text-xs mt-1">even reading fewer files</div>
                </div>
                <p className="text-white/50 text-xs sm:text-sm leading-relaxed flex-1">
                  A cold agent session starts by <em>listing</em> the repo, <em>searching</em> for
                  active work, and <em>reading</em> candidate files — ~29,400 tokens before the
                  first real edit. One read of the auto-maintained,{" "}
                  <code className="text-white/80">project_context.md</code> costs{" "}
                  <code className="text-[#E5AA7A]">515 tokens</code>. Verify it on your own repo in seconds:
                  <code className="text-white/80 block mt-1 bg-black/40 p-2 rounded border border-white/10 font-mono text-xs">barkcli context benchmark --json</code>
                </p>
              </div>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {CODE_FEATURES.map((item, i) => {
              const Icon = item.icon;
              return (
                <AnimatedSection key={i} delay={i * 0.1}>
                  <div className="group bg-white/[0.02] border border-white/10 rounded-2xl p-5 hover:border-[#B8845C]/30 transition-all duration-300 h-full">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-[#B8845C]/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Icon className="w-4 h-4 text-[#B8845C]" />
                      </div>
                      <h4 className="text-sm font-semibold">{item.title}</h4>
                    </div>
                    <div className="text-3xl font-bold text-[#E5AA7A] mb-2 font-mono">
                      {item.metric}
                    </div>
                    <p className="text-white/50 text-xs leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 9. AI AGENT INTEGRATION (1-PROMPT SETUP)                             */}
      {/* -------------------------------------------------------------------- */}
      <section id="ai-agent" className="py-24 px-6 border-t border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#B8845C]/10 border border-[#B8845C]/20 rounded-full px-4 py-1.5 mb-6">
              <Sparkles className="w-3.5 h-3.5 text-[#B8845C]" />
              <span className="text-xs text-[#E5AA7A] font-mono">Works with Claude, OpenCode, Cursor, Codex</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              One prompt.
              <br />
              <span className="bg-gradient-to-r from-[#F0CBA8] via-[#E5AA7A] to-[#B8845C] bg-clip-text text-transparent">
                Your agent is ready.
              </span>
            </h2>
            <p className="text-white/50 max-w-lg mx-auto text-sm sm:text-base">
              Copy this prompt into your agent. It installs barkcli, initializes your board, and connects via 71 MCP tools.
            </p>
          </AnimatedSection>

          <AnimatedSection>
            {/* Agent Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-2 px-2 sm:mx-0 sm:px-0 sm:justify-center sm:flex-wrap">
              {[
                { id: "claude", label: "Claude Code", Logo: ClaudeCodeLogo },
                { id: "opencode", label: "OpenCode", Logo: OpenCodeLogo },
                { id: "cursor", label: "Cursor", Logo: CursorLogo },
                { id: "generic", label: "Any Agent", Logo: AnyAgentLogo },
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

            {/* Prompt Box */}
            <div className="border border-[#B8845C]/20 rounded-2xl overflow-hidden bg-gradient-to-b from-[#B8845C]/5 to-transparent">
              <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-white/10 bg-[#B8845C]/10">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#B8845C] animate-pulse" />
                  <span className="text-xs font-mono text-white/70">
                    {activeAgentTab === "claude"
                      ? "Paste into Claude Code"
                      : activeAgentTab === "opencode"
                      ? "Paste into OpenCode"
                      : activeAgentTab === "cursor"
                      ? "Paste into Cursor Chat"
                      : "Paste into any agent terminal"}
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
              <div className="p-4 sm:p-5 overflow-x-auto max-h-[380px] overflow-y-auto">
                <pre className="text-xs font-mono text-white/70 leading-relaxed whitespace-pre-wrap">
                  <code>{AGENT_PROMPTS[activeAgentTab]}</code>
                </pre>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 10. SURFACES & DOWNLOADS                                             */}
      {/* -------------------------------------------------------------------- */}
      <section id="surfaces" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              All Surfaces
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              One data layer. Four interfaces.
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
                  <p className="text-white/50 max-w-lg mx-auto mb-6 leading-relaxed text-sm">
                    {iface.description}
                  </p>
                  {iface.id === "desktop" && (
                    <div className="mb-6">
                      <a
                        href="https://github.com/AkshatNaruka/barkcli/releases/latest/download/Bark-macOS-universal.dmg"
                        className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#E5AA7A] hover:text-white bg-white/5 border border-white/10 hover:border-[#B8845C]/40 px-5 py-2.5 rounded-xl transition-all shadow-md"
                      >
                        <Download className="w-4 h-4" />
                        Download Bark for macOS (.dmg)
                      </a>
                    </div>
                  )}
                  {iface.id === "web" && (
                    <div className="mb-6 flex items-center justify-center gap-4">
                      <a
                        href="/docs/web-app"
                        className="text-xs sm:text-sm text-[#E5AA7A] hover:text-white transition-colors"
                      >
                        Read Web App Guide →
                      </a>
                      {ON_PAGES && (
                        <a
                          href={`${BASE}/app/`}
                          className="text-xs sm:text-sm text-white/60 hover:text-white transition-colors border border-white/10 rounded-lg px-3 py-1.5"
                        >
                          Open Live App ↗
                        </a>
                      )}
                    </div>
                  )}
                  <div className="bg-[#0A0B0E] border border-white/10 rounded-xl p-4 sm:p-6 text-left max-w-2xl mx-auto overflow-x-auto relative">
                    <div className="absolute top-3 right-3 flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                    </div>
                    <pre className="text-white/60 text-xs sm:text-sm font-mono whitespace-pre mt-4">
                      {iface.demo}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 10.5 CHOOSE HOW TO GET STARTED (XAI INSPIRED)                        */}
      {/* -------------------------------------------------------------------- */}
      <section className="py-24 px-6 border-t border-white/5 bg-gradient-to-b from-[#060709] via-black/40 to-[#060709]">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Choose how to get started
            </h2>
            <p className="text-white/50 max-w-xl mx-auto text-sm sm:text-base">
              Start with the free open-source core, or explore multiplayer live sessions for engineering teams.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            {/* Build on your own */}
            <AnimatedSection delay={0.1}>
              <div className="bg-[#0B0D12] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col justify-between h-full hover:border-[#B8845C]/40 transition-all">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Build on your own</h3>
                  <p className="text-white/50 text-xs sm:text-sm leading-relaxed mb-6">
                    Launch your AI-powered development workflow with:
                  </p>
                  <ul className="space-y-3 text-xs sm:text-sm text-white/70 mb-8">
                    {[
                      "Access to all 71 MCP tools over standard stdio JSON-RPC",
                      "100% offline-capable single binary with no external server required",
                      "Isolated git worktree automation with project tests as acceptance gate",
                      "Compatible with Claude Code, OpenCode, Cursor, and custom CLIs",
                      "MIT licensed, free forever, zero cloud subscriptions",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <a
                  href="https://github.com/AkshatNaruka/barkcli/releases/latest/download/Bark-macOS-universal.dmg"
                  className="w-full py-3 rounded-full bg-white text-black font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-white/90 transition-all shadow cursor-pointer text-center"
                >
                  <Download className="w-4 h-4" />
                  Download macOS App (.dmg)
                </a>
              </div>
            </AnimatedSection>

            {/* For teams & multiplayer */}
            <AnimatedSection delay={0.2}>
              <div className="bg-[#0B0D12] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col justify-between h-full hover:border-[#B8845C]/40 transition-all">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Multiplayer &amp; Teams</h3>
                  <p className="text-white/50 text-xs sm:text-sm leading-relaxed mb-6">
                    Collaborative agent sessions and governance for engineering organizations:
                  </p>
                  <ul className="space-y-3 text-xs sm:text-sm text-white/70 mb-8">
                    {[
                      "Shared live agent sessions with realtime WebSocket collaboration",
                      "Distributed git board synchronization via git push/pull",
                      "Team-wide merge train and automated conflict resolution",
                      "Complete audit history, blame logs, and reproducible memory facts",
                      "Zero data leakage: all code and context stay inside your repository",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-[#E5AA7A] shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <a
                  href="/docs/team-setup"
                  className="w-full py-3 rounded-full border border-white/20 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-white/10 transition-all cursor-pointer text-center"
                >
                  Read Team Setup Guide
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 11. FAQ & OBJECTION HANDLING                                         */}
      {/* -------------------------------------------------------------------- */}
      <section className="py-24 px-6 border-t border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-3xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Answers &amp; Technical Details
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Frequently asked questions.
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
                      openFaq === i ? "max-h-44 pb-5 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <p className="text-white/50 text-xs sm:text-sm leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* 12. FINAL CTA SECTION                                                */}
      {/* -------------------------------------------------------------------- */}
      <section className="py-24 px-6 border-t border-white/5">
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
                <p className="text-white/50 text-sm sm:text-base md:text-lg mb-8 max-w-lg mx-auto">
                  Install barkcli. Write intent. Let your agents do the work — test-gated, isolated, and merged.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                  <a
                    href="https://github.com/AkshatNaruka/barkcli/releases/latest/download/Bark-macOS-universal.dmg"
                    className="px-6 py-3 bg-[#B8845C] text-white font-medium rounded-xl hover:bg-[#a5764f] transition-all duration-300 shadow-lg shadow-[#B8845C]/20 hover:shadow-[#B8845C]/30 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Download macOS App
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

      {/* -------------------------------------------------------------------- */}
      {/* 13. FOOTER                                                           */}
      {/* -------------------------------------------------------------------- */}
      <footer className="py-8 px-6 border-t border-white/10 bg-[#060709]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-[#B8845C] flex items-center justify-center shadow-sm">
              <svg viewBox="0 0 100 100" className="w-4 h-4" fill="none" stroke="white" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 30 25 C 42 18, 58 18, 70 25" />
                <path d="M 30 25 C 16 27, 11 39, 12 51 C 13 60, 21 61, 27 53 C 30 48, 30 41, 30 35" />
                <path d="M 70 25 C 84 27, 89 39, 88 51 C 87 60, 79 61, 73 53 C 70 48, 70 41, 70 35" />
                <path d="M 30 43 C 26 56, 28 67, 35 74 C 41 79.5, 59 79.5, 65 74 C 72 67, 74 56, 70 43" />
                <path d="M 43.5 55 C 47 52.5, 53 52.5, 56.5 55 C 55 59.5, 52 63, 50 64 C 48 63, 45 59.5, 43.5 55 Z" fill="white" stroke="none" />
                <path d="M 50 64 L 50 70 M 44.5 70 C 47.5 72.5, 52.5 72.5, 55.5 70" strokeWidth="5" />
              </svg>
            </div>
            <span className="text-sm text-white/40 font-mono">© 2026 barkcli · The management layer for AI agents · MIT License</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <a href="/docs" className="hover:text-white transition-colors">
              Docs
            </a>
            <a href="/docs/web-app" className="hover:text-white transition-colors">
              Web App
            </a>
            <a href="/docs/api-reference" className="hover:text-white transition-colors">
              API
            </a>
            <a href="https://github.com/AkshatNaruka/barkcli" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              GitHub
            </a>
            <a href="https://x.com/probiex007" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              X
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
