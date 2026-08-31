"use client";

import { useState, useEffect, useRef } from "react";
import {
  FolderOpen,
  CloudOff,
  Monitor,
  Search,
  Bot,
  BookOpen,
  GitBranch,
  TestTube,
  Zap,
  TrendingUp,
  Terminal,
  Globe,
  Code,
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  FileCode,
  LayoutDashboard,
  Calendar,
  BarChart3,
  Settings,
  Sparkles,
  ArrowRight,
  Play,
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
  Braces,
} from "lucide-react";

const INSTALL = "curl -fsSL https://barkcli.vercel.app/install.sh | sh";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_171521_25968ba2-b594-4b32-aab7-f6b69398a6fa.mp4";

const FEATURES = [
  {
    icon: FolderOpen,
    title: "Git-Native",
    description: "Tasks are YAML files in your repo. Diff them, merge them, grep them. Version control for your project management.",
    code: "$ git diff main..feature -- *.board",
    gradient: "from-amber-500/20 to-orange-500/20",
  },
  {
    icon: CloudOff,
    title: "No Cloud",
    description: "Works offline. No accounts, no subscriptions, no vendor lock-in. Your data stays in your repo.",
    code: "$ barkcli list  # Works without internet",
    gradient: "from-blue-500/20 to-cyan-500/20",
  },
  {
    icon: Monitor,
    title: "Multi-Interface",
    description: "CLI, terminal UI, and web app. Same data, same commands, your choice.",
    code: "$ barkcli tui    # Terminal UI\n$ barkcli serve  # Web app",
    gradient: "from-purple-500/20 to-pink-500/20",
  },
  {
    icon: Search,
    title: "Code Context",
    description: "Automatic code analysis with call graphs, test coverage mapping, and complexity metrics.",
    code: "$ barkcli context scan",
    gradient: "from-green-500/20 to-emerald-500/20",
  },
  {
    icon: Bot,
    title: "AI-Ready",
    description: "MCP server for coding agent integration. Orchestrate task decomposition and agent coordination.",
    code: "$ barkcli mcp  # Start MCP server",
    gradient: "from-rose-500/20 to-red-500/20",
  },
  {
    icon: BookOpen,
    title: "Open Source",
    description: "MIT licensed. Built in Rust. Fast, reliable, and transparent. Contribute or self-host.",
    code: "$ cargo install barkcli",
    gradient: "from-teal-500/20 to-cyan-500/20",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Initialize",
    description: "Add barkcli to any project. Creates a .board directory with your configuration.",
    command: "barkcli init",
    icon: Sparkles,
  },
  {
    number: "2",
    title: "Add Tasks",
    description: "Create cards with priorities, labels, and acceptance criteria.",
    command: 'barkcli add "Build login page" -p high -l frontend',
    icon: Boxes,
  },
  {
    number: "3",
    title: "Work",
    description: "Move cards across columns. Track progress. Commit changes with your code.",
    command: "barkcli move build-login-page doing",
    icon: Wand2,
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
    description: "Beautiful kanban board in your browser. Drag-and-drop, calendar view, reports, and real-time updates via WebSocket.",
    demo: `Dashboard · Board · Calendar · Reports · Code

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
  { icon: GitBranch, title: "Call Graphs", metric: "→", desc: "Map function calls across files. Understand impact before you change." },
  { icon: TestTube, title: "Test Coverage", metric: "87%", desc: "See which tests cover which code. Identify gaps automatically." },
  { icon: Zap, title: "Complexity", metric: "C-12", desc: "Cyclomatic and cognitive complexity scores. Find risky code early." },
  { icon: TrendingUp, title: "Risk Score", metric: "0.3", desc: "Combined risk assessment. Prioritize refactoring where it matters." },
];

const FAQ = [
  {
    question: "What makes barkcli different from Jira or Linear?",
    answer: "barkcli is git-native. Tasks are YAML files in your repo, not in someone else's cloud. No accounts, no subscriptions, no vendor lock-in. Diff tasks like code, merge them with git, and keep everything version-controlled.",
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
    question: "What about the AI features?",
    answer: "barkcli includes an MCP server for coding agent integration. It can decompose tasks, analyze code complexity, and orchestrate multiple agents. The AI features are optional — the core tool works without them.",
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

After running these commands, barkcli will be fully configured. You can now:
• Use "barkcli add <title>" to create tasks
• Use "barkcli list" to see all tasks
• Use "barkcli move <id> doing" to start working on a task
• Use "barkcli done <id>" to mark tasks complete
• Use "barkcli tui" for a terminal kanban board
• Use "barkcli serve" for a web interface

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

After running these commands, barkcli will be fully configured. You can now:
• Use "barkcli add <title>" to create tasks
• Use "barkcli list" to see all tasks
• Use "barkcli move <id> doing" to start working on a task
• Use "barkcli done <id>" to mark tasks complete
• Use "barkcli tui" for a terminal kanban board
• Use "barkcli serve" for a web interface

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

After running these commands, barkcli will be fully configured. You can now:
• Use "barkcli add <title>" to create tasks
• Use "barkcli list" to see all tasks
• Use "barkcli move <id> doing" to start working on a task
• Use "barkcli done <id>" to mark tasks complete
• Use "barkcli tui" for a terminal kanban board
• Use "barkcli serve" for a web interface

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

After running these commands, barkcli will be fully configured. You can now:
• Use "barkcli add <title>" to create tasks
• Use "barkcli list" to see all tasks
• Use "barkcli move <id> doing" to start working on a task
• Use "barkcli done <id>" to mark tasks complete
• Use "barkcli tui" for a terminal kanban board
• Use "barkcli serve" for a web interface

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
              { href: "#features", label: "Features" },
              { href: "#interfaces", label: "Interfaces" },
              { href: "#ai-agent", label: "AI Agent" },
              { href: "#install", label: "Install" },
            ].map((link) => (
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

        {/* Center */}
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
            <Sparkles className="w-3 h-3 text-[#B8845C]" />
            <span className="text-xs text-white/60 font-mono">Now with MCP server for AI agents</span>
          </div>
          <h1 className="text-white text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05] mb-6">
            Git for{" "}
            <span className="bg-gradient-to-r from-[#B8845C] via-[#D4A574] to-[#B8845C] bg-clip-text text-transparent">
              tasks
            </span>
            .
          </h1>
          <p className="text-white/60 text-sm sm:text-base md:text-lg font-light max-w-xl mb-10 leading-relaxed px-2">
            Project management that lives in your repo, not someone else&apos;s cloud.
            Diff tasks like code. Let AI agents read and write them.
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
              href="#ai-agent"
              className="flex items-center gap-2 text-sm font-medium text-white/60 hover:text-white transition-colors px-4 py-2.5"
            >
              <Bot className="w-4 h-4" />
              Setup with AI Agent
              <ArrowRight className="w-3 h-3" />
            </a>
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
      <section className="py-24 px-6 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Three commands.
              <br />
              <span className="text-white/40">That&apos;s it.</span>
            </h2>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-[#B8845C]/30 to-transparent" />
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
                  <p className="text-white/50 max-w-lg mx-auto mb-8 leading-relaxed">
                    {iface.description}
                  </p>
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
                  Install barkcli. Add tasks to your repo. Let your AI agent handle the rest.
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
