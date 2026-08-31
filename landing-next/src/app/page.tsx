"use client";

import { useState } from "react";
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
  },
  {
    icon: CloudOff,
    title: "No Cloud",
    description: "Works offline. No accounts, no subscriptions, no vendor lock-in. Your data stays in your repo.",
    code: "$ barkcli list  # Works without internet",
  },
  {
    icon: Monitor,
    title: "Multi-Interface",
    description: "CLI, terminal UI, and web app. Same data, same commands, your choice.",
    code: "$ barkcli tui    # Terminal UI\n$ barkcli serve  # Web app",
  },
  {
    icon: Search,
    title: "Code Context",
    description: "Automatic code analysis with call graphs, test coverage mapping, and complexity metrics.",
    code: "$ barkcli context scan",
  },
  {
    icon: Bot,
    title: "AI-Ready",
    description: "MCP server for coding agent integration. Orchestrate task decomposition and agent coordination.",
    code: "$ barkcli mcp  # Start MCP server",
  },
  {
    icon: BookOpen,
    title: "Open Source",
    description: "MIT licensed. Built in Rust. Fast, reliable, and transparent. Contribute or self-host.",
    code: "$ cargo install barkcli",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Initialize",
    description: "Add barkcli to any project. Creates a .board directory with your configuration.",
    command: "$ barkcli init",
  },
  {
    number: "2",
    title: "Add Tasks",
    description: "Create cards with priorities, labels, and acceptance criteria.",
    command: '$ barkcli add "Build login page" -p high -l frontend',
  },
  {
    number: "3",
    title: "Work",
    description: "Move cards across columns. Track progress. Commit changes with your code.",
    command: "$ barkcli move build-login-page doing",
  },
];

const INTERFACES = [
  {
    id: "cli",
    title: "Command Line",
    description: "Full-featured CLI for scripts, automation, and power users. Every action available from your terminal.",
    demo: `$ barkcli add "Deploy to production" -p critical --due 2024-12-15
✓ Added card deploy-to-production

$ barkcli show deploy-to-production
ID:       deploy-to-production
Title:    Deploy to production
Priority: critical
Due:      2024-12-15
Column:   todo

$ barkcli status deploy-to-production done
✓ Moved to done`,
  },
  {
    id: "tui",
    title: "Terminal UI",
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

export default function Home() {
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState("cli");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeAgentTab, setActiveAgentTab] = useState("claude");

  return (
    <div className="min-h-screen w-full bg-black text-white">
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col overflow-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src={VIDEO_URL} type="video/mp4" />
        </video>
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
          <div className="flex items-center gap-6">
            <a
              href="#features"
              className="text-xs text-white/80 hover:text-white transition-colors hidden md:block"
            >
              Features
            </a>
            <a
              href="#interfaces"
              className="text-xs text-white/80 hover:text-white transition-colors hidden md:block"
            >
              Interfaces
            </a>
            <a
              href="#install"
              className="text-xs text-white/80 hover:text-white transition-colors hidden md:block"
            >
              Install
            </a>
            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-white/80 hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>
        </header>

        {/* Center */}
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-white text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-5">
            Tasks in your repo.
          </h1>
          <p className="text-white/85 text-base md:text-lg font-light max-w-md mb-10 leading-relaxed">
            Git-native kanban board — CLI, terminal UI, and web app
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
              className="ml-3 text-xs font-mono rounded-full border border-white/40 px-3 py-1.5 text-white/90 hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
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
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Features
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Everything you need.
              <br />
              Nothing you don&apos;t.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={i}
                  className="border border-white/10 rounded-xl p-6 hover:border-white/20 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#B8845C]/10 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-[#B8845C]" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed mb-4">
                    {feature.description}
                  </p>
                  <code className="text-[#059669] text-xs font-mono block bg-white/5 rounded-lg px-3 py-2">
                    {feature.code}
                  </code>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 px-6 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              How It Works
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Three commands to start.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <div key={i} className="text-center">
                <div className="w-12 h-12 rounded-full bg-[#B8845C] text-white font-bold text-xl flex items-center justify-center mx-auto mb-6">
                  {step.number}
                </div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed mb-4">
                  {step.description}
                </p>
                <code className="text-[#059669] text-xs font-mono block bg-white/5 rounded-lg px-3 py-2 max-w-xs mx-auto">
                  {step.command}
                </code>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interfaces Section */}
      <section id="interfaces" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Interfaces
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Your workflow. Your way.
            </h2>
          </div>
          <div className="flex justify-center gap-2 mb-8 flex-wrap">
            {INTERFACES.map((iface) => {
              const Icon = iface.id === "cli" ? Terminal : iface.id === "tui" ? Monitor : iface.id === "web" ? Globe : Code;
              return (
                <button
                  key={iface.id}
                  onClick={() => setActiveTab(iface.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2 ${
                    activeTab === iface.id
                      ? "bg-[#B8845C] text-white"
                      : "border border-white/20 text-white/60 hover:text-white hover:border-white/40"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {iface.title}
                </button>
              );
            })}
          </div>
          <div className="border border-white/10 rounded-xl p-8 md:p-12 bg-white/[0.02]">
            {INTERFACES.map((iface) => (
              <div
                key={iface.id}
                className={`text-center ${activeTab === iface.id ? "block" : "hidden"}`}
              >
                <h3 className="text-2xl font-semibold mb-3">{iface.title}</h3>
                <p className="text-white/60 max-w-lg mx-auto mb-8 leading-relaxed">
                  {iface.description}
                </p>
                <div className="bg-[#0A0A0A] border border-white/10 rounded-lg p-6 text-left max-w-2xl mx-auto overflow-x-auto">
                  <pre className="text-white/70 text-sm font-mono whitespace-pre">
                    {iface.demo}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Context Section */}
      <section className="py-24 px-6 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Code Intelligence
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Your codebase. Understood.
            </h2>
            <p className="text-white/60 max-w-lg mx-auto">
              barkcli analyzes your code to provide rich context for every task. See how changes impact your codebase.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {CODE_FEATURES.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className="bg-white/[0.02] border border-white/10 rounded-xl p-6"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="w-4 h-4 text-[#B8845C]" />
                    <h4 className="text-base font-semibold">{item.title}</h4>
                  </div>
                  <div className="text-3xl font-bold text-[#B8845C] mb-3 font-mono">
                    {item.metric}
                  </div>
                  <p className="text-white/60 text-sm leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Management Layer Section */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Management Layer
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Orchestrate coding agents.
            </h2>
            <p className="text-white/60 max-w-lg mx-auto">
              barkcli acts as a management layer above coding agents. Decompose tasks, assign roles, and track progress.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-white/10 rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-[#B8845C]/10 flex items-center justify-center mb-4">
                <Bot className="w-5 h-5 text-[#B8845C]" />
              </div>
              <h3 className="text-lg font-semibold mb-3">MCP Integration</h3>
              <p className="text-white/60 text-sm leading-relaxed mb-4">
                Connect coding agents via the Model Context Protocol. Standard JSON-RPC 2.0 over stdio.
              </p>
              <div className="flex flex-wrap gap-2">
                {["opencode", "claude-code", "cursor"].map((tag) => (
                  <span key={tag} className="text-[10px] font-mono bg-white/5 border border-white/10 rounded-full px-2 py-1 text-white/50">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="border border-white/10 rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-[#B8845C]/10 flex items-center justify-center mb-4">
                <Settings className="w-5 h-5 text-[#B8845C]" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Agent Roles</h3>
              <p className="text-white/60 text-sm leading-relaxed mb-4">
                Assign specialized roles for better task decomposition and execution.
              </p>
              <div className="flex flex-wrap gap-2">
                {["tech-lead", "scrum-master", "product-owner", "project-manager"].map((tag) => (
                  <span key={tag} className="text-[10px] font-mono bg-white/5 border border-white/10 rounded-full px-2 py-1 text-white/50">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="border border-white/10 rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-[#B8845C]/10 flex items-center justify-center mb-4">
                <BarChart3 className="w-5 h-5 text-[#B8845C]" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Task Lifecycle</h3>
              <p className="text-white/60 text-sm leading-relaxed mb-4">
                Full task lifecycle management with automatic assignment and progress tracking.
              </p>
              <div className="flex flex-wrap gap-2">
                {["pending", "assigned", "in_progress", "completed"].map((tag) => (
                  <span key={tag} className="text-[10px] font-mono bg-white/5 border border-white/10 rounded-full px-2 py-1 text-white/50">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Agent Integration Section */}
      <section className="py-24 px-6 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              AI Agent Integration
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Teach AI agents barkcli.
            </h2>
            <p className="text-white/60 max-w-lg mx-auto">
              Copy this prompt into your AI agent's context window. It will learn how to manage tasks, write code, and keep your board up to date.
            </p>
          </div>

          {/* Agent Config Tabs */}
          <div className="flex justify-center gap-2 mb-8">
            {[
              { id: "claude", label: "Claude Code" },
              { id: "opencode", label: "OpenCode" },
              { id: "cursor", label: "Cursor" },
            ].map((agent) => (
              <button
                key={agent.id}
                onClick={() => setActiveAgentTab(agent.id)}
                className={`text-xs font-mono px-4 py-2 rounded-lg transition-colors ${
                  activeAgentTab === agent.id
                    ? "bg-[#B8845C] text-white"
                    : "border border-white/20 text-white/60 hover:text-white hover:border-white/40"
                }`}
              >
                {agent.label}
              </button>
            ))}
          </div>

          {/* Agent Config Card */}
          <div className="border border-white/10 rounded-xl overflow-hidden mb-8">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
              <span className="text-xs font-mono text-white/50">
                {activeAgentTab === "claude"
                  ? ".claude/settings.json"
                  : activeAgentTab === "opencode"
                  ? ".opencode/config.json"
                  : ".cursor/mcp.json"}
              </span>
              <button
                onClick={() => {
                  const config = JSON.stringify(
                    {
                      mcpServers: {
                        barkcli: {
                          command: "barkcli",
                          args: ["mcp"],
                        },
                      },
                    },
                    null,
                    2
                  );
                  navigator.clipboard.writeText(config);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="text-xs text-white/40 hover:text-white flex items-center gap-1 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copy
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-[#059669] overflow-x-auto">
              <code>
                {JSON.stringify(
                  {
                    mcpServers: {
                      barkcli: {
                        command: "barkcli",
                        args: ["mcp"],
                      },
                    },
                  },
                  null,
                  2
                )}
              </code>
            </pre>
          </div>

          {/* Copy Prompt Button */}
          <div className="text-center mb-8">
            <button
              onClick={() => {
                const prompt = `# AI Agent Prompt for barkcli

> Copy this entire document into your AI agent's context to teach it how to use barkcli.

## System Prompt

You are an AI coding agent working on a project that uses **barkcli** — a git-native project management tool. Tasks are stored as YAML files in the repository. Your job is to help manage tasks, write code, and keep the project board up to date.

## What is barkcli?

barkcli is a CLI tool for task tracking inside any project. Like \`.git\` but for Kanban boards.

- **No cloud** — Tasks are YAML files in \`.board/\` directory
- **No accounts** — Works offline, no sign-ups
- **Git-native** — Diff tasks like code, merge with teammates
- **AI-ready** — MCP server for agent integration

## Installation

\`\`\`bash
# macOS / Linux
curl -fsSL https://barkcli.vercel.app/install.sh | sh

# Homebrew
brew tap AkshatNaruka/barkcli && brew install barkcli

# Cargo
cargo install barkcli
\`\`\`

## Project Setup

When starting work on a new project, always check if barkcli is initialized:

\`\`\`bash
# Check if barkcli is initialized
ls -la .board/

# If not initialized, initialize it
barkcli init

# Create a board (optional - init creates a default)
barkcli create <board-name>
\`\`\`

## Core Commands Reference

### Project Commands

| Command | Description | Usage |
|---------|-------------|-------|
| \`barkcli init\` | Initialize barkcli | Creates \`.board/\` directory |
| \`barkcli create <name>\` | Create a new board | \`barkcli create backend\` |
| \`barkcli list\` / \`ls\` | List all tasks | \`barkcli list\`, \`barkcli list -c doing\` |
| \`barkcli status\` | Cross-board summary | \`barkcli status\` |
| \`barkcli validate\` | Validate board files | \`barkcli validate\` |

### Card Operations

| Command | Description | Usage |
|---------|-------------|-------|
| \`barkcli add <title>\` | Add a task | \`barkcli add "Fix bug" -p high\` |
| \`barkcli show <id>\` | Show task details | \`barkcli show fix-bug\` |
| \`barkcli move <id> <col>\` | Move task | \`barkcli move fix-bug doing\` |
| \`barkcli done <id>\` | Mark as done | \`barkcli done fix-bug\` |
| \`barkcli update <id>\` | Update task | \`barkcli update fix-bug -t "New title"\` |
| \`barkcli remove <id>\` | Delete task | \`barkcli remove fix-bug\` |
| \`barkcli comment <id> <text>\` | Add comment | \`barkcli comment fix-bug "Started work"\` |

### Add Task Flags

| Flag | Description | Example |
|------|-------------|---------|
| \`-p, --priority\` | Priority (high/medium/low) | \`-p high\` |
| \`-l, --label\` | Labels (repeatable) | \`-l backend,auth\` |
| \`-a, --assignee\` | Assigned to | \`-a alice\` |
| \`-c, --column\` | Target column | \`-c doing\` |
| \`-d, --description\` | Description | \`-d "Add JWT auth"\` |
| \`--due\` | Due date | \`--due 2024-12-15\` |
| \`--effort\` | Story points | \`--effort 5\` |
| \`--ac\` | Acceptance criteria | \`--ac "Login works"\` |

## MCP Server Integration

### Start MCP Server

\`\`\`bash
barkcli mcp
\`\`\`

### Configure in Your Agent

Add to \`.claude/settings.json\`, \`.opencode/config.json\`, or \`.cursor/mcp.json\`:

\`\`\`json
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}
\`\`\`

## Agent Workflow

1. **Check project state**: \`barkcli status\`
2. **Get task details**: \`barkcli show <task-id>\`
3. **Move task to doing**: \`barkcli move <task-id> doing\`
4. **Write code** (implement the feature/fix)
5. **Run tests**
6. **Update task**: \`barkcli done <task-id>\`
7. **Sync context**: \`barkcli context sync\`

## Quick Reference

\`\`\`bash
barkcli list                    # All tasks
barkcli list -c todo            # Todo tasks
barkcli add "Title" -p high     # Add task
barkcli move <id> doing         # Move task
barkcli done <id>               # Complete task
barkcli status                  # Board summary
\`\`\`

Full documentation: https://github.com/AkshatNaruka/barkcli/tree/master/docs`;
                navigator.clipboard.writeText(prompt);
                setCopiedPrompt(true);
                setTimeout(() => setCopiedPrompt(false), 2000);
              }}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                copiedPrompt
                  ? "bg-green-600 text-white"
                  : "bg-[#B8845C] text-white hover:bg-[#B8845C]/80"
              }`}
            >
              {copiedPrompt ? "Copied to Clipboard!" : "Copy Full AI Agent Prompt"}
            </button>
            <p className="text-white/40 text-xs mt-3">
              Paste this into your AI agent's context window to teach it barkcli
            </p>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "1",
                title: "Install barkcli",
                desc: "Add barkcli to your project with a single command.",
                code: "curl -fsSL https://barkcli.vercel.app/install.sh | sh",
              },
              {
                step: "2",
                title: "Configure your agent",
                desc: "Add the MCP server config to your AI agent's settings.",
                code: 'barkcli mcp  # Start the MCP server',
              },
              {
                step: "3",
                title: "Paste the prompt",
                desc: "Copy the AI agent prompt into your agent's context window.",
                code: "# Your agent now knows barkcli!",
              },
            ].map((item, i) => (
              <div key={i} className="border border-white/10 rounded-xl p-6">
                <div className="w-8 h-8 rounded-full bg-[#B8845C]/10 flex items-center justify-center mb-4">
                  <span className="text-[#B8845C] text-sm font-mono font-bold">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed mb-4">
                  {item.desc}
                </p>
                <code className="text-[#059669] text-xs font-mono block bg-white/5 rounded-lg px-3 py-2">
                  {item.code}
                </code>
              </div>
            ))}
          </div>

          {/* Learn More Link */}
          <div className="text-center mt-12">
            <a
              href="/docs/getting-started"
              className="inline-flex items-center gap-2 text-[#B8845C] text-sm font-medium hover:underline"
            >
              Read the full integration guide
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Installation Section */}
      <section id="install" className="py-24 px-6 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              Install
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Get started in 10 seconds.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: "macOS / Linux", cmd: "curl -fsSL https://barkcli.vercel.app/install.sh | sh" },
              { title: "Homebrew", cmd: "brew tap AkshatNaruka/barkcli && brew install barkcli" },
              { title: "Cargo (from source)", cmd: "cargo install barkcli" },
              { title: "GitHub Releases", cmd: "https://github.com/AkshatNaruka/barkcli/releases" },
              { title: "Windows", cmd: "irm https://barkcli.vercel.app/install.ps1 | iex  # or .exe from Releases" },
            ].map((method, i) => (
              <div key={i} className="border border-white/10 rounded-xl p-4">
                <h4 className="text-sm font-semibold mb-2">{method.title}</h4>
                <code className="text-[#059669] text-xs font-mono block bg-white/5 rounded-lg px-3 py-2 break-all">
                  {method.cmd}
                </code>
              </div>
            ))}
          </div>
          <p className="text-center text-white/40 text-xs font-mono mt-6">
            All 5 targets + SHA256SUMS published together on every <code className="text-white/60">v*</code> tag — same binaries on GitHub Releases & Vercel mirror. Windows zip contains <code className="text-white/60">barkcli.exe</code>.
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
              FAQ
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Common questions.
            </h2>
          </div>
          <div className="space-y-0">
            {FAQ.map((item, i) => (
              <div key={i} className="border-b border-white/10">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left py-5 flex justify-between items-center cursor-pointer group"
                >
                  <span className="text-white font-medium group-hover:text-[#B8845C] transition-colors">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-white/40 transition-transform ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openFaq === i ? "max-h-40 pb-5" : "max-h-0"
                  }`}
                >
                  <p className="text-white/60 text-sm leading-relaxed">
                    {item.answer}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Get started in 10 seconds.
          </h2>
          <p className="text-white/60 text-lg mb-10">
            Install barkcli and add tasks to your repo today.
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <a
              href="#install"
              className="px-6 py-3 bg-[#B8845C] text-white font-medium rounded-lg hover:bg-[#B8845C]/80 transition-colors"
            >
              Install Now
            </a>
            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noreferrer"
              className="px-6 py-3 border border-white/20 text-white font-medium rounded-lg hover:bg-white/5 transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Final Footer */}
      <footer className="py-8 px-6 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 100 100"
              className="w-4 h-4"
              fill="none"
              stroke="#B8845C"
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M29 24 Q14 27 11 42 Q10 54 19 59 Q27 56 30 47" />
              <path d="M71 24 Q86 27 89 42 Q90 54 81 59 Q73 56 70 47" />
              <path d="M29 24 Q50 15 71 24" />
              <path d="M30 47 Q26 61 30 71 Q34 83 50 83 Q66 83 70 71 Q74 61 70 47" />
              <path d="M50 59 Q45 54 41.5 60 Q41.5 67 50 72 Q58.5 67 58.5 60 Q55 54 50 59" />
              <path d="M50 74 L50 78 M45 78.5 Q50 81.5 55 78.5" />
            </svg>
            <span className="text-sm text-white/50 font-mono">© 2024 barkcli · MIT License</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/50">
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
