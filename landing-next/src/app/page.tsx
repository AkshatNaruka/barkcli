"use client";

import { useState, useEffect, useRef } from "react";
import { MCP_TOOL_COUNT } from "@/lib/mcp";
import {
  FolderOpen,
  CloudOff,
  Monitor,
  Search,
  Bot,
  GitBranch,
  TestTube,
  Zap,
  TrendingUp,
  Terminal,
  Globe,
  Code,
  ChevronDown,
  Check,
  Copy,
  FileCode,
  LayoutDashboard,
  BarChart3,
  Settings,
  Sparkles,
  ArrowRight,
  Cpu,
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
} from "lucide-react";

const INSTALL = "curl -fsSL https://barkcli.vercel.app/install.sh | sh";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_171521_25968ba2-b594-4b32-aab7-f6b69398a6fa.mp4";

const FEATURES = [
  {
    icon: Brain,
    title: "Mind",
    description: "A compiled snapshot of your project — health, blockers, stale work, next actions. One command answers what's happening.",
    code: "$ barkcli mind sync && barkcli overview",
    gradient: "from-amber-500/20 to-orange-500/20",
  },
  {
    icon: Layers,
    title: "Skills",
    description: "Reusable BMAD-style conventions (mvp, planning, scrum-master, test) versioned in your repo and injected into every agent prompt.",
    code: "$ barkcli skills list",
    gradient: "from-blue-500/20 to-cyan-500/20",
  },
  {
    icon: FolderOpen,
    title: "Board + Traceability",
    description: "Kanban with spec_id on every card — spec ↔ card ↔ task ↔ code, O(1). Diff it, merge it, grep it.",
    code: "$ git diff main..feature -- *.board",
    gradient: "from-purple-500/20 to-pink-500/20",
  },
  {
    icon: Bot,
    title: "Agent Queue",
    description: "Tasks dispatch to OpenCode, Claude Code, Cursor, or a human. Claim, work, complete — with a review gate before done.",
    code: "$ barkcli dispatch && barkcli review --auto",
    gradient: "from-green-500/20 to-emerald-500/20",
  },
  {
    icon: Search,
    title: "Memory",
    description: "Four-tier local memory with hybrid BM25 + TF-IDF search. Decisions and patterns survive across sessions — offline.",
    code: '$ barkcli memory search "auth errors"',
    gradient: "from-rose-500/20 to-red-500/20",
  },
  {
    icon: CloudOff,
    title: "Offline Git-Native",
    description: "No cloud, no accounts, no per-seat pricing. MIT licensed, built in Rust. Your data stays in your repo.",
    code: "$ barkcli list  # Works without internet",
    gradient: "from-teal-500/20 to-cyan-500/20",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Intake",
    description: "Human writes intent in plain language. barkcli classifies it into a card + spec — offline if needed.",
    command: 'barkcli intake "Add Google OAuth" --feature',
    icon: Sparkles,
  },
  {
    number: "2",
    title: "Plan",
    description: "The spec decomposes into agent-ready child cards with file context and acceptance criteria.",
    command: "barkcli plan oauth-login --tasks",
    icon: Boxes,
  },
  {
    number: "3",
    title: "Dispatch",
    description: "Tasks route to the right agent — OpenCode, Claude Code, or a human — with full context + skills.",
    command: "barkcli dispatch",
    icon: Wand2,
  },
  {
    number: "4",
    title: "Review",
    description: "Completed work is validated against acceptance criteria, tests, and commits before it lands.",
    command: "barkcli review --all --auto",
    icon: Check,
  },
  {
    number: "5",
    title: "Remember",
    description: "Decisions, patterns, and sessions persist in local memory. The mind snapshot tells you what's next.",
    command: "barkcli mind sync && barkcli overview",
    icon: Brain,
  },
];

const INTERFACES = [
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
    description: "Interactive kanban board right in your terminal. Navigate with vim keys, filter, sort, and manage tasks visually.",
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
  { icon: GitBranch, title: "Call Graphs", metric: "→", desc: "Map function calls across files via `callgraph_get`. Understand impact before you change." },
  { icon: TestTube, title: "Test Coverage", metric: "e.g. 87%", desc: "Heuristic test-file mapping via `context_get` — see which cards link to which tests." },
  { icon: Zap, title: "Complexity", metric: "e.g. C-12", desc: "Cyclomatic + cognitive scores via `metrics_get`. Find risky code early." },
  { icon: TrendingUp, title: "Risk Score", metric: "e.g. 0.3", desc: "Formula-based risk (complexity, nesting, size) via `metrics_get`." },
];

const FAQ = [
  {
    question: "Is barkcli a CLI tool or a web app?",
    answer: "Both — but think of it as a management layer, not a tool. The same data powers the CLI, terminal UI, VS Code extension, and web app. Humans manage in the web app (Mind, Board, Agents), agents work through 56 MCP tools, and everything syncs through files in your repo.",
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
    answer: "barkcli sits between you and your coding agents. You write intent (intake → plan), agents claim scoped tasks with file context and skills (dispatch), and completed work is validated before it lands (review). Memory persists decisions across sessions. Agents connect via 56 MCP tools — OpenCode, Claude Code, and Cursor all work. The core stays fully usable offline without any AI.",
  },
  {
    question: "Is it free?",
    answer: "Yes. barkcli is MIT licensed and completely free. All features are open source — no Pro tiers, no paywalls.",
  },
];

const AGENT_PROMPTS: Record<string, string> = {
  claude: `Please run the following commands to install and set up barkcli (git-native project management) in this project:

1. First, install barkcli:
curl -fsSL https://barkcli.vercel.app/install.sh | sh

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

6. Add a sample task to confirm everything works:
barkcli add "Welcome to barkcli" -p low -d "barkcli is now set up and ready to use"

After running these commands, barkcli will be fully configured. The autonomous loop works like this:
• Type intent in the web app (Mind tab) or run "barkcli intake <text>"
• Approve the proposed plan (web gate or "barkcli autopilot approve <id>")
• Agents claim packets, work, and complete them via MCP
• Merge when review passes — checkpoints + undo cover recovery

You rarely need CLI commands — open "barkcli serve --open" and decide what gets built.

For the full AI agent prompt with all commands, run: barkcli --help`,
  opencode: `Please run the following commands to install and set up barkcli (git-native project management) in this project:

1. First, install barkcli:
curl -fsSL https://barkcli.vercel.app/install.sh | sh

2. Initialize barkcli in this project:
barkcli init

3. Create a default board:
barkcli create main

4. Add the MCP server configuration to .opencode/config.json:
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

6. Add a sample task to confirm everything works:
barkcli add "Welcome to barkcli" -p low -d "barkcli is now set up and ready to use"

After running these commands, barkcli will be fully configured. The autonomous loop works like this:
• Type intent in the web app (Mind tab) or run "barkcli intake <text>"
• Approve the proposed plan (web gate or "barkcli autopilot approve <id>")
• Agents claim packets, work, and complete them via MCP
• Merge when review passes — checkpoints + undo cover recovery

You rarely need CLI commands — open "barkcli serve --open" and decide what gets built.

For the full AI agent prompt with all commands, run: barkcli --help`,
  cursor: `Please run the following commands to install and set up barkcli (git-native project management) in this project:

1. First, install barkcli:
curl -fsSL https://barkcli.vercel.app/install.sh | sh

2. Initialize barkcli in this project:
barkcli init

3. Create a default board:
barkcli create main

4. Add the MCP server configuration to .cursor/mcp.json:
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

6. Add a sample task to confirm everything works:
barkcli add "Welcome to barkcli" -p low -d "barkcli is now set up and ready to use"

After running these commands, barkcli will be fully configured. The autonomous loop works like this:
• Type intent in the web app (Mind tab) or run "barkcli intake <text>"
• Approve the proposed plan (web gate or "barkcli autopilot approve <id>")
• Agents claim packets, work, and complete them via MCP
• Merge when review passes — checkpoints + undo cover recovery

You rarely need CLI commands — open "barkcli serve --open" and decide what gets built.

For the full AI agent prompt with all commands, run: barkcli --help`,
  generic: `Please run the following commands to install and set up barkcli (git-native project management) in this project:

1. First, install barkcli:
curl -fsSL https://barkcli.vercel.app/install.sh | sh

2. Initialize barkcli in this project:
barkcli init

3. Create a default board:
barkcli create main

4. Verify the installation:
barkcli status
barkcli list

5. Add a sample task to confirm everything works:
barkcli add "Welcome to barkcli" -p low -d "barkcli is now set up and ready to use"

After running these commands, barkcli will be fully configured. The autonomous loop works like this:
• Type intent in the web app (Mind tab) or run "barkcli intake <text>"
• Approve the proposed plan (web gate or "barkcli autopilot approve <id>")
• Agents claim packets, work, and complete them via MCP
• Merge when review passes — checkpoints + undo cover recovery

You rarely need CLI commands — open "barkcli serve --open" and decide what gets built.

For the full AI agent prompt with all commands, run: barkcli --help`,
};

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.1) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
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
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#0A0A0A] shadow-2xl shadow-black/60">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/15" />
        </div>
        <div className="flex-1 text-center">
          <span className="text-[11px] font-mono text-white/30 bg-white/5 border border-white/10 rounded-md px-3 py-1">
            localhost:4321 — barkcli mind
          </span>
        </div>
        <div className="w-10" />
      </div>
      <div className="flex text-left">
        {/* Sidebar */}
        <div className="hidden sm:flex flex-col w-40 shrink-0 border-r border-white/10 py-3">
          <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-widest text-white/30">Manage</div>
          {[
            { icon: Brain, label: "Mind", active: true, badge: "2" },
            { icon: LayoutDashboard, label: "Board", active: false, badge: "8" },
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
                <span className={`ml-auto text-[10px] font-mono px-1.5 py-px rounded-full ${item.active ? "bg-red-500/20 text-red-400" : "bg-white/5 text-white/40"}`}>
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
              <span className="ml-auto text-[10px] font-mono px-1.5 py-px rounded-full bg-white/5 text-white/40">{item.badge}</span>
            </div>
          ))}
        </div>
        {/* Kanban */}
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
              tone: "text-sky-400",
              cards: [
                { title: "Implement OAuth flow", meta: "IN PROGRESS", metaCls: "text-sky-400 bg-sky-500/10 border-sky-500/30", spec: true, blocked: false },
              ],
            },
            {
              name: "Review",
              tone: "text-amber-400",
              cards: [
                { title: "Store tokens securely", meta: "REVIEW", metaCls: "text-amber-400 bg-amber-500/10 border-amber-500/30", spec: false, blocked: false },
              ],
            },
          ].map((col) => (
            <div key={col.name} className="bg-white/[0.02] border border-white/10 rounded-xl p-2 min-w-0">
              <div className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${col.tone}`}>{col.name}</div>
              <div className="space-y-2">
                {col.cards.map((c) => (
                  <div
                    key={c.title}
                    className={`bg-white/[0.03] rounded-lg p-2 border ${c.blocked ? "border-red-500/50" : "border-white/10"}`}
                  >
                    <div className="text-[11px] text-white/90 font-medium leading-snug">{c.title}</div>
                    <div className="flex items-center gap-1.5 mt-1.5">
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
        <div className="hidden md:flex flex-col w-48 shrink-0 border-l border-white/10 p-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">Agents</div>
          {[
            { name: "opencode-1", task: "OAuth flow", tone: "text-amber-400", dot: "bg-amber-400" },
            { name: "claude-2", task: "Token storage", tone: "text-sky-400", dot: "bg-sky-400" },
            { name: "human-you", task: "Review queue", tone: "text-green-400", dot: "bg-green-400" },
          ].map((a) => (
            <div key={a.name} className="py-1.5 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${a.dot} animate-pulse`} />
                <span className="text-[11px] font-mono text-white/70">{a.name}</span>
              </div>
              <div className={`text-[10px] mt-0.5 ${a.tone}`}>{a.task}</div>
            </div>
          ))}
          <div className="mt-auto pt-2">
            <div className="text-[10px] font-mono text-white/30">Next: dispatch 2 pending</div>
          </div>
        </div>
      </div>
    </div>
  );
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
        transform: inView ? "translateY(0)" : "translateY(30px)",
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

export default function Home() {
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState("cli");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeAgentTab, setActiveAgentTab] = useState("claude");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen w-full bg-black text-white selection:bg-[#B8845C]/30">
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
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black pointer-events-none" />

        {/* Gradient Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#B8845C]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#B8845C]/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Nav */}
        <header className={`relative z-10 flex items-center justify-between px-6 md:px-10 h-16 shrink-0 transition-all duration-300 ${scrolled ? "bg-black/80 backdrop-blur-xl border-b border-white/10" : ""}`}>
          <a href="#" className="flex items-center gap-2 no-underline group">
            <div className="w-8 h-8 rounded-lg bg-[#B8845C] flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg viewBox="0 0 100 100" className="w-5 h-5" fill="none" stroke="white" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M29 24 Q14 27 11 42 Q10 54 19 59 Q27 56 30 47" />
                <path d="M71 24 Q86 27 89 42 Q90 54 81 59 Q73 56 70 47" />
                <path d="M29 24 Q50 15 71 24" />
                <path d="M30 47 Q26 61 30 71 Q34 83 50 83 Q66 83 70 71 Q74 61 70 47" />
                <path d="M50 59 Q45 54 41.5 60 Q41.5 67 50 72 Q58.5 67 58.5 60 Q55 54 50 59" />
                <path d="M50 74 L50 78 M45 78.5 Q50 81.5 55 78.5" />
              </svg>
            </div>
            <span className="text-sm font-bold tracking-tight font-mono text-white">
              barkcli
            </span>
          </a>
          <nav className="flex items-center gap-1">
            {[
              { href: "#product", label: "Product" },
              { href: "#pipeline", label: "How it works" },
              { href: "#features", label: "Features" },
              { href: "#ai-agent", label: "AI Agent" },
              { href: "/docs", label: "Docs" },
            ].map((link) => (
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
              <div className="absolute right-0 top-full mt-1 min-w-40 rounded-xl border border-white/10 bg-black/95 p-1 backdrop-blur-xl">
                {[
                  { href: "#product", label: "Product" },
                  { href: "#pipeline", label: "How it works" },
                  { href: "#features", label: "Features" },
                  { href: "#ai-agent", label: "AI Agent" },
                  { href: "/docs", label: "Docs" },
                ].map((link) => (
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

        {/* Center */}
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
            <Sparkles className="w-3 h-3 text-[#B8845C]" />
            <span className="text-xs text-white/60 font-mono">Open source (MIT) · v0.3.0 · {MCP_TOOL_COUNT} MCP tools</span>
          </div>
          <h1 className="text-white text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05] mb-6">
            The management layer
            <br />
            <span className="bg-gradient-to-r from-[#B8845C] via-[#D4A574] to-[#B8845C] bg-clip-text text-transparent">
              for AI agents.
            </span>
          </h1>
          <p className="text-white/60 text-sm sm:text-base md:text-lg font-light max-w-xl mb-10 leading-relaxed px-2">
            barkcli is Git for your work — tasks, specs, memory and agent runs live
            in your repo, not someone else&apos;s cloud. Humans write intent, agents do work.
          </p>
          <div className="flex flex-col items-center gap-3 w-full max-w-lg">
            <div className="flex items-center gap-1 border border-white/20 rounded-xl pl-5 pr-2 py-2.5 bg-white/5 backdrop-blur-xl w-full">
              <code className="text-white text-xs sm:text-sm font-mono truncate flex-1 min-w-0">
                <span className="text-white/40 select-none">$ </span>
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
                    <Check className="w-3 h-3 text-green-400" />
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
            <a
              href="#product"
              className="flex items-center gap-2 text-sm font-medium text-white/60 hover:text-white transition-colors px-4 py-2.5"
            >
              <Bot className="w-4 h-4" />
              See the management layer
              <ArrowRight className="w-3 h-3" />
            </a>
            <div className="flex items-center gap-2 sm:gap-3 text-[11px] font-mono text-white/50">
              <span className="flex items-center gap-1.5 border border-white/10 rounded-full px-3 py-1.5 bg-white/[0.03]">
                <Sparkles className="w-3 h-3 text-[#B8845C]" /> 1. Type intent
              </span>
              <ArrowRight className="w-3 h-3 text-white/30" />
              <span className="flex items-center gap-1.5 border border-white/10 rounded-full px-3 py-1.5 bg-white/[0.03]">
                <Check className="w-3 h-3 text-[#B8845C]" /> 2. Approve plan
              </span>
              <ArrowRight className="w-3 h-3 text-white/30" />
              <span className="flex items-center gap-1.5 border border-white/10 rounded-full px-3 py-1.5 bg-white/[0.03]">
                <GitMerge className="w-3 h-3 text-[#B8845C]" /> 3. Merge
              </span>
            </div>
            <p className="text-[11px] font-mono text-white/30">
              Agents do everything between — no CLI commands to memorize.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mt-6 text-[11px] font-mono text-white/40">
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3 text-green-500" /> No cloud
            </span>
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3 text-green-500" /> No accounts
            </span>
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3 text-green-500" /> MIT licensed
            </span>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 flex items-center justify-center gap-4 h-12 shrink-0 text-[11px] text-white/50 font-mono">
          <span>barkcli</span>
          <span className="opacity-40">·</span>
          <a
            href="/docs"
            className="hover:text-white transition-colors"
          >
            Docs
          </a>
          <span className="opacity-40">·</span>
          <a
            href="https://github.com/AkshatNaruka/barkcli"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
          <span className="opacity-40">·</span>
          <span>MIT License</span>
        </footer>
      </section>

      {/* Product Section — the management layer UI */}
      <section id="product" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-12">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              The web app
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              One screen.
              <br />
              <span className="text-white/40">Humans and agents, side by side.</span>
            </h2>
            <p className="text-white/50 max-w-xl mx-auto">
              Mind tells you what&apos;s blocked and what&apos;s next. The board holds the work
              with spec traceability. Agents claim tasks like deployments.
            </p>
          </AnimatedSection>
          <AnimatedSection>
            <ProductMock />
          </AnimatedSection>
          {/* Trust stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 max-w-3xl mx-auto">
            {[
              { metric: `${MCP_TOOL_COUNT}`, desc: "MCP tools for agents" },
              { metric: "4", desc: "BMAD skills in repo" },
              { metric: "100%", desc: "offline-capable core" },
              { metric: "MIT", desc: "open source forever" },
            ].map((s) => (
              <div key={s.desc} className="text-center border border-white/10 rounded-xl py-4 bg-white/[0.02]">
                <div className="text-2xl font-bold text-[#D4A574] font-mono">{s.metric}</div>
                <div className="text-[11px] text-white/40 mt-1">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
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
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <AnimatedSection key={i} delay={i * 0.1}>
                  <div className="group relative border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all duration-300 hover:bg-white/[0.02] h-full">
                    <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                    <div className="relative">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Icon className="w-5 h-5 text-[#B8845C]" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                      <p className="text-white/50 text-sm leading-relaxed mb-4">
                        {feature.description}
                      </p>
                      <div className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 group-hover:border-white/20 transition-colors">
                        <code className="text-[#059669] text-xs font-mono">{feature.code}</code>
                      </div>
                    </div>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="pipeline" className="py-24 px-6 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              The pipeline
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Intent in.
              <br />
              <span className="text-white/40">Reviewed code out.</span>
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 relative">
            {/* Connecting Line */}
            <div className="hidden lg:block absolute top-12 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-[#B8845C]/30 to-transparent" />
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <AnimatedSection key={i} delay={i * 0.15}>
                  <div className="text-center relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#B8845C]/20 to-[#B8845C]/5 border border-[#B8845C]/20 flex items-center justify-center mx-auto mb-6 relative z-10">
                      <Icon className="w-7 h-7 text-[#B8845C]" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                    <p className="text-white/50 text-sm leading-relaxed mb-4 px-4">
                      {step.description}
                    </p>
                    <div className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 max-w-xs mx-auto">
                      <code className="text-[#059669] text-xs font-mono">{step.command}</code>
                    </div>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* Interfaces Section */}
      <section id="interfaces" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Interfaces
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
                  {iface.id === "web" && (
                    <a
                      href="/docs/web-app"
                      className="inline-block text-sm text-[#B8845C] hover:text-[#D4A574] mb-6 transition-colors"
                    >
                      Read the full Web App Guide →
                    </a>
                  )}
                  <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-4 sm:p-6 text-left max-w-2xl mx-auto overflow-x-auto relative">
                    <div className="absolute top-3 right-3 flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                    </div>
                    <pre className="text-white/60 text-sm font-mono whitespace-pre mt-4">
                      {iface.demo}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Code Context Section */}
      <section className="py-24 px-6 bg-gradient-to-b from-transparent to-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Code Intelligence
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Your codebase.{" "}
              <span className="text-[#B8845C]">Understood.</span>
            </h2>
            <p className="text-white/50 max-w-lg mx-auto">
              barkcli analyzes your code to provide rich context for every task. See how changes impact your codebase.
            </p>
          </AnimatedSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CODE_FEATURES.map((item, i) => {
              const Icon = item.icon;
              return (
                <AnimatedSection key={i} delay={i * 0.1}>
                  <div className="group bg-white/[0.02] border border-white/10 rounded-2xl p-6 hover:border-[#B8845C]/30 transition-all duration-300 h-full">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-[#B8845C]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Icon className="w-4 h-4 text-[#B8845C]" />
                      </div>
                      <h4 className="text-base font-semibold">{item.title}</h4>
                    </div>
                    <div className="text-4xl font-bold text-[#B8845C] mb-3 font-mono">
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
              <span className="bg-gradient-to-r from-[#B8845C] to-[#D4A574] bg-clip-text text-transparent">project manager.</span>
            </h2>
            <p className="text-white/50 max-w-lg mx-auto">
              Claude, GPT, and OpenCode can now read tasks, claim work, and update progress. barkcli is the missing piece in the AI-native dev stack.
            </p>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Bot,
                title: "MCP Integration",
                desc: "Connect coding agents via the Model Context Protocol. Standard JSON-RPC 2.0 over stdio.",
                tags: ["opencode", "claude-code", "cursor"],
              },
              {
                icon: Settings,
                title: "Agent Roles",
                desc: "Assign specialized roles for better task decomposition and execution.",
                tags: ["tech-lead", "scrum-master", "product-owner", "project-manager"],
              },
              {
                icon: BarChart3,
                title: "Task Lifecycle",
                desc: "Full task lifecycle management with automatic assignment and progress tracking.",
                tags: ["pending", "assigned", "in_progress", "completed"],
              },
            ].map((item, i) => (
              <AnimatedSection key={i} delay={i * 0.1}>
                <div className="group border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all duration-300 h-full">
                  <div className="w-10 h-10 rounded-xl bg-[#B8845C]/10 border border-[#B8845C]/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <item.icon className="w-5 h-5 text-[#B8845C]" />
                  </div>
                  <h3 className="text-lg font-semibold mb-3">{item.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed mb-4">
                    {item.desc}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span key={tag} className="text-[10px] font-mono bg-white/5 border border-white/10 rounded-full px-2 py-1 text-white/40">
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
      <section id="ai-agent" className="py-24 px-6 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#B8845C]/10 border border-[#B8845C]/20 rounded-full px-4 py-1.5 mb-6">
              <Sparkles className="w-3 h-3 text-[#B8845C]" />
              <span className="text-xs text-[#B8845C] font-mono">Works with Claude, OpenCode, Cursor</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              One prompt.
              <br />
              <span className="bg-gradient-to-r from-[#B8845C] to-[#D4A574] bg-clip-text text-transparent">
                Your agent is ready.
              </span>
            </h2>
            <p className="text-white/50 max-w-lg mx-auto">
              Copy this into your AI agent. It installs barkcli, sets up your board, and connects via MCP. Your agent can now manage tasks autonomously.
            </p>
          </AnimatedSection>

          <AnimatedSection>
            {/* Agent Config Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-2 px-2 sm:mx-0 sm:px-0 sm:justify-center sm:flex-wrap">
              {[
                { id: "claude", label: "Claude Code", icon: Cpu },
                { id: "opencode", label: "OpenCode", icon: Code },
                { id: "cursor", label: "Cursor", icon: FileCode },
                { id: "generic", label: "Any Agent", icon: Terminal },
              ].map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setActiveAgentTab(agent.id)}
                  className={`text-xs font-mono px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all duration-300 ${
                    activeAgentTab === agent.id
                      ? "bg-[#B8845C] text-white shadow-lg shadow-[#B8845C]/20"
                      : "border border-white/10 text-white/50 hover:text-white hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <agent.icon className="w-3.5 h-3.5" />
                  {agent.label}
                </button>
              ))}
            </div>

            {/* Main Setup Prompt Card */}
            <div className="border border-[#B8845C]/20 rounded-2xl overflow-hidden bg-gradient-to-b from-[#B8845C]/5 to-transparent">
              <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-white/10 bg-[#B8845C]/10">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#B8845C] animate-pulse" />
                  <span className="text-xs font-mono text-white/60">
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
                  className={`text-xs font-mono px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all duration-300 ${
                    copiedPrompt
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
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
            <div className="grid grid-cols-2 gap-3 mt-6">
              {[
                { icon: Download, title: "Install", desc: "Downloads barkcli" },
                { icon: Rocket, title: "Init", desc: "Sets up project" },
                { icon: ClipboardList, title: "Create", desc: "Makes a board" },
                { icon: Plug, title: "Connect", desc: "Configures MCP" },
              ].map((item, i) => (
                <div key={i} className="bg-white/[0.02] border border-white/10 rounded-xl p-3 text-center group hover:border-[#B8845C]/30 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-[#B8845C]/10 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                    <item.icon className="w-4 h-4 text-[#B8845C]" />
                  </div>
                  <h4 className="text-xs font-semibold">{item.title}</h4>
                  <p className="text-[10px] text-white/40">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* Quick Commands */}
            <div className="border border-white/10 rounded-2xl p-5 mt-6">
              <h3 className="text-xs font-semibold mb-3 text-white/50 uppercase tracking-wider">Quick Commands After Setup</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[
                  { cmd: 'barkcli add "Fix bug" -p high', desc: "Create task" },
                  { cmd: "barkcli list", desc: "View tasks" },
                  { cmd: "barkcli move <id> doing", desc: "Start working" },
                  { cmd: "barkcli done <id>", desc: "Mark complete" },
                  { cmd: "barkcli tui", desc: "Terminal board" },
                  { cmd: "barkcli serve", desc: "Web interface" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
                    <code className="text-[11px] font-mono text-[#059669] flex-1 truncate">{item.cmd}</code>
                    <span className="text-[10px] text-white/30 shrink-0">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center mt-6">
              <a
                href="/docs/getting-started"
                className="inline-flex items-center gap-2 text-[#B8845C] text-sm font-medium hover:underline group"
              >
                Read the full integration guide
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
          </AnimatedSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { title: "macOS / Linux", cmd: "curl -fsSL https://barkcli.vercel.app/install.sh | sh", icon: Terminal },
              { title: "Homebrew", cmd: "brew tap AkshatNaruka/barkcli && brew install barkcli", icon: Shield },
              { title: "Cargo (from source)", cmd: "cargo install barkcli", icon: Code },
              { title: "GitHub Releases", cmd: "github.com/AkshatNaruka/barkcli/releases", icon: GitMerge },
              { title: "Windows", cmd: "irm https://barkcli.vercel.app/install.ps1 | iex", icon: Monitor },
            ].map((method, i) => (
              <AnimatedSection key={i} delay={i * 0.08}>
                <div className="group border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all duration-300 h-full">
                  <div className="flex items-center gap-2 mb-3">
                    <method.icon className="w-4 h-4 text-[#B8845C]" />
                    <h4 className="text-sm font-semibold">{method.title}</h4>
                  </div>
                  <code className="text-[#059669] text-xs font-mono block bg-white/5 rounded-lg px-3 py-2 break-all group-hover:bg-white/10 transition-colors">
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
                    <span className="text-white font-medium group-hover:text-[#B8845C] transition-colors pr-4 text-sm sm:text-base">
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
                      openFaq === i ? "max-h-40 pb-5 opacity-100" : "max-h-0 opacity-0"
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
              <div className="absolute inset-0 bg-[#B8845C]/5 blur-[100px] rounded-full" />
              <div className="relative border border-white/10 rounded-3xl p-8 sm:p-12 bg-gradient-to-b from-white/[0.02] to-transparent">
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
                  Stop managing tasks
                  <br />
                  <span className="bg-gradient-to-r from-[#B8845C] to-[#D4A574] bg-clip-text text-transparent">
                    in someone else&apos;s cloud.
                  </span>
                </h2>
                <p className="text-white/50 text-base sm:text-lg mb-8">
                  Install barkcli. Write intent. Let your agents do the work — reviewed.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                  <a
                    href="#install"
                    className="px-6 py-3 bg-[#B8845C] text-white font-medium rounded-xl hover:bg-[#B8845C]/80 transition-all duration-300 shadow-lg shadow-[#B8845C]/20 hover:shadow-[#B8845C]/30 flex items-center justify-center gap-2"
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
      <footer className="py-8 px-6 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#B8845C] flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-4 h-4" fill="none" stroke="white" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M29 24 Q14 27 11 42 Q10 54 19 59 Q27 56 30 47" />
                <path d="M71 24 Q86 27 89 42 Q90 54 81 59 Q73 56 70 47" />
                <path d="M29 24 Q50 15 71 24" />
                <path d="M30 47 Q26 61 30 71 Q34 83 50 83 Q66 83 70 71 Q74 61 70 47" />
                <path d="M50 59 Q45 54 41.5 60 Q41.5 67 50 72 Q58.5 67 58.5 60 Q55 54 50 59" />
                <path d="M50 74 L50 78 M45 78.5 Q50 81.5 55 78.5" />
              </svg>
            </div>
            <span className="text-sm text-white/40 font-mono">© 2024 barkcli · MIT License</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <a
              href="/docs"
              className="hover:text-white transition-colors"
            >
              Docs
            </a>
            <a
              href="/docs/web-app"
              className="hover:text-white transition-colors"
            >
              Web App
            </a>
            <a
              href="/docs/api-reference"
              className="hover:text-white transition-colors"
            >
              API
            </a>
            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://x.com/probiex007"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              X
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
