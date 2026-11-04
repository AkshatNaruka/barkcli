"use client";

import React, { useState } from "react";
import Link from "next/link";
import { MCP_TOOL_COUNT } from "@/lib/mcp";
import {
  ClaudeCodeLogo,
  CodexLogo,
  OpenCodeLogo,
  CursorLogo,
} from "@/components/AgentLogos";
import {
  Check,
  Copy,
  ArrowRight,
  ShieldCheck,
  GitBranch,
  Terminal,
  Cpu,
  Layers,
  Sparkles,
  GitMerge,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  FileCode2,
  AlertCircle,
  Play,
  RotateCcw,
} from "lucide-react";

const INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh";

const NAV_LINKS = [
  { href: "#the-loop", label: "The Loop" },
  { href: "#human-in-control", label: "Human Review" },
  { href: "#verification", label: "Verification" },
  { href: "/features", label: "Features" },
  { href: "/benchmark", label: "Benchmark" },
  { href: "/docs", label: "Docs" },
];

const LOOP_STEPS = [
  {
    step: "01",
    name: "Intent",
    tagline: "Human describes what they want in plain language.",
    cmd: 'barkcli run "add webhook signature verification" --yes',
    badge: "HUMAN",
    badgeColor: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  },
  {
    step: "02",
    name: "Plan",
    tagline: "barkcli turns intent into a spec and agent-ready tasks with acceptance criteria.",
    cmd: 'barkcli plan "webhook-verification" --tasks',
    badge: "BARKCLI",
    badgeColor: "text-[#E5AA7A] border-[#B8845C]/30 bg-[#B8845C]/10",
  },
  {
    step: "03",
    name: "Assign",
    tagline: "Tasks route to the right agent (Claude Code, Codex, OpenCode, Cursor) or role.",
    cmd: "barkcli dispatch --role builder --agents 3",
    badge: "FLEET",
    badgeColor: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  },
  {
    step: "04",
    name: "Execute",
    tagline: "Each agent works in its own isolated git worktree without touching main.",
    cmd: "git worktree list  # 3 isolated agent workspaces",
    badge: "WORKTREE",
    badgeColor: "text-indigo-400 border-indigo-400/30 bg-indigo-400/10",
  },
  {
    step: "05",
    name: "Verify",
    tagline: "Tests and a tester/reviewer agent check the work. Done when tests pass, never when agent claims.",
    cmd: 'barkcli verify --gate "cargo test" --worktree wt-1',
    badge: "GATE",
    badgeColor: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  },
  {
    step: "06",
    name: "Human Review",
    tagline: "Finished passing work lands in your review queue with diff, tests, and spec traceability.",
    cmd: "barkcli review --task-id auth-01",
    badge: "HUMAN",
    badgeColor: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  },
  {
    step: "07",
    name: "Merge & Remember",
    tagline: "Approved work merges via merge train; decisions and patterns persist to memory.",
    cmd: "barkcli merge-train && barkcli memory digest",
    badge: "MEMORY",
    badgeColor: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  },
];

const INSTALL_TABS = [
  {
    id: "curl",
    label: "macOS / Linux",
    cmd: "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh",
  },
  {
    id: "brew",
    label: "Homebrew",
    cmd: "brew tap AkshatNaruka/barkcli && brew install barkcli",
  },
  {
    id: "cargo",
    label: "Cargo",
    cmd: "cargo install barkcli",
  },
  {
    id: "windows",
    label: "Windows (PowerShell)",
    cmd: "iwr -useb https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.ps1 | iex",
  },
];

const FAQ_ITEMS = [
  {
    question: "How is barkcli different from task trackers like Jira or Linear?",
    answer:
      "Jira and Linear track tickets for humans in cloud databases. barkcli manages both humans and AI coding agents directly in your Git repository. Tasks, specs, memory, and agent runs are version-controlled YAML files that agents read and write through 83 MCP tools. No cloud accounts, no subscriptions, and agents work with the exact repository files you see.",
  },
  {
    question: "Does barkcli resell AI tokens or require an API account?",
    answer:
      "No. Bring the subscriptions and local CLIs you already pay for—Claude Code, OpenAI Codex, OpenCode, or Cursor. barkcli operates 100% locally on your machine with zero token markup, zero remote servers, and zero vendor lock-in.",
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
    question: "Can I use barkcli without an internet connection?",
    answer:
      "Yes. barkcli is a single compiled native binary with zero network dependencies. Specs, boards, memory, and verification run completely offline. You can review diffs, browse project history, and run local agents entirely air-gapped.",
  },
];

export default function HomePage() {
  const [copied, setCopied] = useState(false);
  const [activeInstallTab, setActiveInstallTab] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#060709] text-white selection:bg-[#B8845C]/30 selection:text-white">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#060709]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B8845C] shadow-[0_0_10px_#B8845C]" />
            <span className="font-semibold tracking-tight text-lg text-white">barkcli</span>
            <span className="hidden sm:inline text-xs text-white/40 font-mono">
              / management layer
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-white/60 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all text-white/80 hover:text-white flex items-center gap-1.5"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3 h-3 text-white/40" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-20 md:pt-28 pb-16 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bark-radial-glow pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Category Line */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-[#B8845C]/30 bg-[#B8845C]/10 text-xs font-mono text-[#E5AA7A] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E5AA7A]" />
            THE MANAGEMENT LAYER FOR AI AGENTS
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-8 leading-[1.08]">
            You write the intent. <br className="hidden sm:block" />
            Agents do the work. <br className="hidden sm:block" />
            <span className="text-[#E5AA7A]">You review what&apos;s finished.</span>
          </h1>

          {/* Subline */}
          <p className="text-lg md:text-xl text-white/65 max-w-2xl mx-auto leading-relaxed mb-10">
            barkcli plans the work, assigns it to your coding agents, has them build and test in isolated worktrees, and sends you only passing work to review. No cloud, no accounts.
          </p>

          {/* Two CTAs only */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-xl mx-auto mb-16">
            <div className="w-full sm:w-auto flex items-center bg-black/60 border border-white/15 rounded-xl px-4 py-2.5 font-mono text-xs text-white/80 backdrop-blur-md hover:border-[#B8845C]/50 transition-colors group">
              <span className="text-[#E5AA7A] mr-2">$</span>
              <span className="truncate max-w-[260px] sm:max-w-xs">{INSTALL_CMD}</span>
              <button
                onClick={() => handleCopy(INSTALL_CMD)}
                className="ml-3 p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                title="Copy install command"
                aria-label="Copy install command"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold tracking-wide text-white transition-all flex items-center justify-center gap-2 hover:border-white/30"
            >
              <span>View on GitHub</span>
              <ArrowRight className="w-3.5 h-3.5 text-white/50" />
            </a>
          </div>

          {/* Real recording video player */}
          <div className="rounded-2xl border border-white/10 bg-[#0A0B0E] p-2 sm:p-3 shadow-2xl shadow-black/80 max-w-4xl mx-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 text-[11px] font-mono text-white/40 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              </div>
              <span className="text-white/50">Full Loop: Intent → Worktrees → Test Gate → Review</span>
              <span className="text-emerald-400 font-medium">● LIVE RUN</span>
            </div>
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[16/10] max-h-[520px]">
              <video
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
                poster="/screenshots/mind-dark.png"
              >
                <source src="/run-agents-demo.webm" type="video/webm" />
                <source src="/run-agents-demo.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* Agent Strip */}
      <section className="py-12 border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-6">
            Bring your own subscription. barkcli never resells tokens.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14 opacity-85">
            <div className="flex items-center gap-2.5 text-sm font-medium text-white/80">
              <ClaudeCodeLogo className="w-5 h-5" />
              <span>Claude Code</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm font-medium text-white/80">
              <CodexLogo className="w-5 h-5 text-emerald-400" />
              <span>OpenAI Codex</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm font-medium text-white/80">
              <OpenCodeLogo className="w-5 h-5" />
              <span>OpenCode</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm font-medium text-white/80">
              <CursorLogo className="w-5 h-5" />
              <span>Cursor</span>
            </div>
          </div>
        </div>
      </section>

      {/* The Loop Section */}
      <section id="the-loop" className="py-24 px-6 relative">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#B8845C]/30 bg-[#B8845C]/10 text-xs font-mono text-[#E5AA7A] mb-4">
              THE 7-STEP LIFECYCLE
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              The Loop: You manage intent and review. Agents do everything in between.
            </h2>
            <p className="text-white/60 text-sm md:text-base leading-relaxed">
              Every feature, fix, or refactor follows this deterministic loop. No skipped test steps, no ghost branches.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {LOOP_STEPS.map((item) => (
              <div
                key={item.step}
                className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-white/20 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xl font-mono font-bold text-[#E5AA7A]">
                      {item.step}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider ${item.badgeColor}`}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{item.name}</h3>
                  <p className="text-sm text-white/65 leading-relaxed mb-6">
                    {item.tagline}
                  </p>
                </div>
                <div className="bg-black/50 border border-white/5 rounded-xl p-3 font-mono text-xs flex items-center justify-between">
                  <span className="text-[#D4A574] truncate mr-2">$ {item.cmd}</span>
                  <button
                    onClick={() => handleCopyCmd(item.cmd)}
                    className="text-white/40 hover:text-white transition-colors shrink-0"
                    title="Copy command"
                  >
                    {copiedCmd === item.cmd ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Human in Control Section */}
      <section id="human-in-control" className="py-24 px-6 border-t border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-400/30 bg-amber-400/10 text-xs font-mono text-amber-300 mb-4">
              HUMAN IN THE LOOP
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Two moments where you act. Zero babysitting.
            </h2>
            <p className="text-white/60 text-sm md:text-base leading-relaxed">
              You stay in full control at the two critical gates that matter: approving the plan before agents write code, and approving verified work before it merges.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-mono font-bold text-sm mb-4">
                01
              </div>
              <h3 className="text-lg font-semibold mb-2">Approve the Plan</h3>
              <p className="text-sm text-white/65 leading-relaxed">
                Before agents execute a single file modification, you inspect the generated spec, targeted subtasks, file contexts, and acceptance criteria. Adjust constraints or approve in 1 click.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono font-bold text-sm mb-4">
                02
              </div>
              <h3 className="text-lg font-semibold mb-2">Review Finished Work</h3>
              <p className="text-sm text-white/65 leading-relaxed">
                You never read broken code. Work arrives in your review queue only after isolated worktree tests have passed and reviewer agents have scanned for regressions.
              </p>
            </div>
          </div>

          {/* Review Queue Mock Card */}
          <div className="border border-white/15 rounded-2xl overflow-hidden bg-[#0A0B0E] shadow-2xl shadow-black/80">
            <div className="px-5 py-3.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="font-semibold text-sm text-white">Review Queue</span>
                <span className="text-xs font-mono text-white/40">· 1 task awaiting your decision</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ALL GATES PASSING
                </span>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-6">
              {/* Task Title & Spec Trace */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-white/10">
                <div>
                  <div className="text-xs font-mono text-[#D4A574] mb-1">SPEC-042: HMAC Webhook Signature Verification</div>
                  <h4 className="text-xl font-bold text-white">Add constant-time signature verification for webhooks</h4>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-white/50">
                  <GitBranch className="w-3.5 h-3.5 text-white/40" />
                  <span>worktree/agent-claude-3b</span>
                </div>
              </div>

              {/* Acceptance Criteria Checklist */}
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-white/40 mb-3">Acceptance Criteria Verified</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 text-xs text-white/80">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>HMAC SHA-256 payload signatures verified against secret</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-white/80">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Reject timestamp drift &gt; 300s to prevent replay attacks</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-white/80">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Zero dynamic heap allocations on webhook hot path</span>
                  </div>
                </div>
              </div>

              {/* Diff Preview */}
              <div className="rounded-xl border border-white/10 bg-black/60 overflow-hidden font-mono text-xs">
                <div className="px-4 py-2 border-b border-white/10 bg-white/[0.02] flex items-center justify-between text-white/40">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="w-3.5 h-3.5" />
                    <span className="text-white/80 font-medium">src/auth/webhook.rs</span>
                  </div>
                  <span className="text-emerald-400">+48</span>
                  <span className="text-red-400">-12</span>
                </div>
                <div className="p-4 space-y-1 text-white/70 overflow-x-auto">
                  <div className="text-white/40">@@ -42,6 +42,14 @@ pub fn verify_webhook(...) -&gt; Result&lt;bool&gt; &#123;</div>
                  <div className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">+ let expected = subtle::ConstantTimeEq::ct_eq(&amp;computed_mac, &amp;provided_mac);</div>
                  <div className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">+ if !expected.into() &#123; return Err(AuthError::BadSignature); &#125;</div>
                  <div className="text-white/60 px-2">  // Timestamp check preventing replay attacks</div>
                  <div className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">+ if now.duration_since(timestamp).as_secs() &gt; 300 &#123; return Err(AuthError::Expired); &#125;</div>
                </div>
              </div>

              {/* Test Gate & Verifier Result */}
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <div>
                    <div className="text-xs font-semibold text-emerald-300">Acceptance Gate: PASS</div>
                    <div className="text-[11px] font-mono text-white/50">cargo test --package auth (14 passed, 0 failed in 0.42s)</div>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-emerald-400 font-medium">100% GATED</span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#B8845C] hover:bg-[#A3724B] text-black font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Approve &amp; Merge</span>
                </button>
                <button
                  type="button"
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-amber-300 transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Request Changes</span>
                </button>
                <button
                  type="button"
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs text-white/40 hover:text-red-400 transition-colors sm:ml-auto"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Agents Verify Their Own Work */}
      <section id="verification" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 text-xs font-mono text-emerald-300 mb-4">
              RIGOROUS VERIFICATION
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Agents verify their own work before you ever see it.
            </h2>
            <p className="text-white/60 text-sm md:text-base leading-relaxed">
              &quot;Gate &gt; Self-report.&quot; An agent cannot claim a task is complete. It must satisfy three verifier roles and pass the project acceptance test suite.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="text-xs font-mono text-[#D4A574] uppercase tracking-wider mb-2">ROLE 01</div>
              <h3 className="text-lg font-semibold mb-2">Builder Agent</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Claims scoped task with relevant file context and writes minimal, correct code inside its isolated worktree.
              </p>
            </div>
            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-2">ROLE 02</div>
              <h3 className="text-lg font-semibold mb-2">Tester Agent</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Generates edge cases, verifies boundaries, and enforces the project acceptance gate (<code className="text-xs font-mono text-white/80">cargo test</code>, <code className="text-xs font-mono text-white/80">npm test</code>).
              </p>
            </div>
            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="text-xs font-mono text-blue-400 uppercase tracking-wider mb-2">ROLE 03</div>
              <h3 className="text-lg font-semibold mb-2">Reviewer Agent</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Audits the diff against the spec, checks for cognitive complexity spikes, and flags any security risks before human handoff.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.01]">
              <h4 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[#E5AA7A]" />
                Isolated Git Worktrees
              </h4>
              <p className="text-sm text-white/65 leading-relaxed">
                Every agent works in its own separate directory with a private git branch. Zero merge conflicts during active coding, zero locking issues, and zero accidental file overwrites across concurrent agents.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.01]">
              <h4 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-emerald-400" />
                Deterministic Merge Train
              </h4>
              <p className="text-sm text-white/65 leading-relaxed">
                Once human approval is granted, passing branches merge in order of completion. If upstream changes introduce conflicts, barkcli isolates and re-dispatches only the conflicting attempt without stalling other branches.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Proof: Context Benchmark */}
      <section className="py-24 px-6 border-t border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-400/30 bg-blue-400/10 text-xs font-mono text-blue-300 mb-4">
              REPRODUCIBLE PROOF
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Context Benchmark: 57× fewer tokens.
            </h2>
            <p className="text-white/60 text-sm md:text-base leading-relaxed">
              Raw agents explore codebases by dump-reading hundreds of files every session. barkcli compiles and auto-maintains <code className="text-xs font-mono text-[#D4A574]">project_context.md</code>, slashing input overhead.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center mb-12">
            <div className="space-y-4">
              <div className="p-6 rounded-2xl border border-red-500/20 bg-red-500/[0.02]">
                <div className="text-xs font-mono uppercase tracking-wider text-red-400 mb-1">Cold-Start Raw Agent</div>
                <div className="text-3xl font-bold text-white mb-2">84,320 tokens</div>
                <p className="text-xs text-white/60">
                  Multiple prompt turns re-reading whole directories, searching for symbols, and exhausting context budgets.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04]">
                <div className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-1">barkcli Living Context</div>
                <div className="text-3xl font-bold text-emerald-400 mb-2">1,480 tokens (57× reduction)</div>
                <p className="text-xs text-white/70">
                  One-shot injected digest with file provenance, AST boundaries, and test linkages. byte-stable and git-clean.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/60 font-mono text-xs">
              <div className="flex items-center justify-between text-white/40 pb-3 mb-3 border-b border-white/10">
                <span>REPRODUCE IN YOUR REPO</span>
                <button
                  onClick={() => handleCopyCmd("barkcli context benchmark --json")}
                  className="hover:text-white transition-colors"
                >
                  {copiedCmd === "barkcli context benchmark --json" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[#E5AA7A] mb-2">$ barkcli context benchmark --json</p>
              <pre className="text-white/70 overflow-x-auto text-[11px] leading-relaxed">
{`{
  "cold_start_tokens": 84320,
  "barkcli_tokens": 1480,
  "ratio": "57.0x",
  "cache_hit_rate": "96.4%",
  "verdict": "reproducible across git history"
}`}
              </pre>
              <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
                <Link
                  href="/benchmark"
                  className="text-xs text-[#E5AA7A] hover:underline flex items-center gap-1"
                >
                  <span>Explore full benchmark report</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Install Section */}
      <section id="install" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Get Started in Seconds
            </h2>
            <p className="text-white/60 text-sm md:text-base">
              Single binary. MIT Licensed. Open source. No credit card, no sign-up.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0A0B0E] p-4 sm:p-6 shadow-2xl">
            {/* Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4 mb-6">
              {INSTALL_TABS.map((tab, idx) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveInstallTab(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeInstallTab === idx
                      ? "bg-[#B8845C]/20 text-[#E5AA7A] border border-[#B8845C]/40"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Active Command */}
            <div className="flex items-center justify-between bg-black/60 border border-white/10 rounded-xl p-4 font-mono text-xs text-white/90">
              <span className="truncate mr-4">
                <span className="text-[#E5AA7A] mr-2">$</span>
                {INSTALL_TABS[activeInstallTab].cmd}
              </span>
              <button
                onClick={() => handleCopyCmd(INSTALL_TABS[activeInstallTab].cmd)}
                className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"
                title="Copy command"
              >
                {copiedCmd === INSTALL_TABS[activeInstallTab].cmd ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-6 border-t border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-white/60 text-sm">
              Everything you need to know about barkcli and how it manages agent fleets.
            </p>
          </div>

          <div className="space-y-4">
            {FAQ_ITEMS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={faq.question}
                  className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 font-semibold text-sm hover:text-[#E5AA7A] transition-colors"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-white/40 shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-[#E5AA7A]" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-xs sm:text-sm text-white/65 leading-relaxed border-t border-white/5 pt-3">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6 border-t border-white/5 text-center relative overflow-hidden">
        <div className="absolute inset-0 bark-radial-glow pointer-events-none" />
        <div className="max-w-3xl mx-auto relative z-10">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6">
            You manage intent and review. <br />
            <span className="text-[#E5AA7A]">Agents do everything in between.</span>
          </h2>
          <p className="text-white/60 text-base md:text-lg max-w-xl mx-auto mb-10">
            Install barkcli in your repository and experience deterministic AI agent management.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
            <div className="w-full flex items-center justify-between bg-black/60 border border-white/15 rounded-xl px-4 py-3 font-mono text-xs text-white/80">
              <span className="truncate mr-2">$ {INSTALL_CMD}</span>
              <button
                onClick={() => handleCopy(INSTALL_CMD)}
                className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#B8845C] hover:bg-[#A3724B] text-black font-semibold text-xs transition-colors shrink-0 flex items-center justify-center gap-1.5"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6 text-center text-xs text-white/40">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} barkcli. Free and open source under MIT License.</p>
          <div className="flex items-center gap-6">
            <Link href="/" className="hover:text-white transition-colors">Product</Link>
            <Link href="/features" className="hover:text-white transition-colors">Features</Link>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/benchmark" className="hover:text-white transition-colors">Benchmark</Link>
            <a href="https://github.com/AkshatNaruka/barkcli" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
