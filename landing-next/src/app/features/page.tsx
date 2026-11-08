"use client";

import React, { useState } from "react";
import Link from "next/link";
import { MCP_TOOL_COUNT } from "@/lib/mcp";
import { FEATURES_DATA } from "@/lib/features";
import { Footer } from "@/components/Footer";
import {
  Brain,
  Terminal,
  Clock,
  Sparkles,
  Layers,
  FolderOpen,
  Bot,
  Database,
  Laptop,
  Monitor,
  Globe,
  Search,
  GitBranch,
  TestTube,
  Zap,
  TrendingUp,
  Users,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Rocket,
  GitMerge,
  Boxes,
} from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Product" },
  { href: "/features", label: "Features", active: true },
  { href: "/benchmark", label: "Benchmark" },
  { href: "/docs", label: "Docs" },
];

export default function FeaturesPage() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#060709] text-white selection:bg-[#B8845C]/30 selection:text-white">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#060709]/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B8845C] shadow-[0_0_10px_#B8845C]" />
            <span className="font-semibold tracking-tight text-lg text-white">barkcli</span>
            <span className="text-[11px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border border-[#B8845C]/30 text-[#E5AA7A] bg-[#B8845C]/10">
              features
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`transition-colors ${
                  link.active
                    ? "text-white font-medium"
                    : "text-white/60 hover:text-white"
                }`}
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
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all text-white/80 hover:text-white"
            >
              GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <section className="pt-20 pb-16 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bark-radial-glow pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#B8845C]/30 bg-[#B8845C]/10 text-xs font-mono text-[#E5AA7A] mb-6">
            CAPABILITIES & ARCHITECTURE
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6">
            Supporting the loop with deep repo intelligence
          </h1>
          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed mb-8">
            The intent → plan → worktree → gate → review loop is powered by local memory, compiled mind snapshots, reproducible skills, and multi-surface ergonomics.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 max-w-4xl mx-auto">
            {FEATURES_DATA.map((feat) => (
              <Link
                key={feat.slug}
                href={`/features/${feat.slug}`}
                className="text-xs font-mono px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:border-[#B8845C]/40 hover:text-[#E5AA7A] transition-all flex items-center gap-1.5"
              >
                <span>{feat.title}</span>
                <span className="text-[#B8845C]">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Main Feature Grid */}
      <main className="max-w-6xl mx-auto px-6 pb-28 space-y-20">
        {/* Collective Memory */}
        <section id="collective-memory" className="p-8 md:p-10 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm relative overflow-hidden">
          <div className="flex flex-col lg:flex-row gap-8 lg:items-center justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-xs font-mono text-[#D4A574] mb-3">
                <Brain className="w-4 h-4" />
                <span>PERSISTENT CONTEXT</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Collective Memory & Git Contribution Graph</h2>
              <p className="text-white/65 leading-relaxed mb-6">
                Every agent run is recorded as a node in a Git-backed contribution graph. Four tiers of local memory (ephemeral, session, working, long-term) preserve decisions, patterns, and failed hypotheses across sessions. Hybrid BM25 + TF-IDF search retrieves facts offline without external vector databases.
              </p>
              <ul className="space-y-2 text-sm text-white/70 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Independent verification and evidence scores per memory node
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Neglected-branch nudging and UCB exploration recommendations
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  100% offline, stored as readable YAML/JSON files inside your repository
                </li>
              </ul>
            </div>
            <div className="w-full lg:w-96 rounded-xl bg-black/60 border border-white/10 p-4 font-mono text-xs">
              <div className="flex items-center justify-between text-white/40 border-b border-white/10 pb-2 mb-3">
                <span>CLI EXAMPLE</span>
                <button
                  onClick={() => copyCode("barkcli memory search \"auth errors\"")}
                  className="hover:text-white transition-colors"
                >
                  {copiedCode === "barkcli memory search \"auth errors\"" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[#E5AA7A] mb-2">$ barkcli analyze && barkcli contribute --title &quot;oauth retry pattern&quot; --kind hypothesis</p>
              <p className="text-white/50 mb-3">✓ Node recorded with SHA and acceptance score</p>
              <p className="text-[#E5AA7A] mb-2">$ barkcli memory search &quot;auth errors&quot;</p>
              <p className="text-emerald-400">Match (0.91): OAuth token refresh race condition resolved by worktree #4a</p>
            </div>
          </div>
        </section>

        {/* Mind & Project Intelligence */}
        <section id="mind" className="p-8 md:p-10 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm relative overflow-hidden">
          <div className="flex flex-col lg:flex-row gap-8 lg:items-center justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-xs font-mono text-[#D4A574] mb-3">
                <Sparkles className="w-4 h-4" />
                <span>COMPILED SNAPSHOT</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Mind: What&apos;s Happening in Your Project</h2>
              <p className="text-white/65 leading-relaxed mb-6">
                One command aggregates delivery velocity, critical blockers, stale work, and unassigned ready tasks into an actionable snapshot. The mind snapshot compiles git branch state, board tasks, and agent sessions into a single view.
              </p>
              <ul className="space-y-2 text-sm text-white/70 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Health score based on open bugs, blocked cards, and test pass ratios
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Autopilot recommendations: unblocks tasks and detects stalled worktrees
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Real-time synchronization with active agent sessions
                </li>
              </ul>
            </div>
            <div className="w-full lg:w-96 rounded-xl bg-black/60 border border-white/10 p-4 font-mono text-xs">
              <div className="flex items-center justify-between text-white/40 border-b border-white/10 pb-2 mb-3">
                <span>CLI EXAMPLE</span>
                <button
                  onClick={() => copyCode("barkcli mind sync && barkcli overview")}
                  className="hover:text-white transition-colors"
                >
                  {copiedCode === "barkcli mind sync && barkcli overview" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[#E5AA7A] mb-2">$ barkcli mind sync && barkcli overview</p>
              <p className="text-white/70">Health: 94% · 3 Active Worktrees · 1 Awaiting Review</p>
              <p className="text-white/50">Next suggested action: dispatch tester for API endpoints</p>
            </div>
          </div>
        </section>

        {/* Automations & Scheduled Runs */}
        <section id="automations" className="p-8 md:p-10 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm relative overflow-hidden">
          <div className="flex flex-col lg:flex-row gap-8 lg:items-center justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-xs font-mono text-[#D4A574] mb-3">
                <Clock className="w-4 h-4" />
                <span>AUTONOMOUS SCHEDULING</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Automations & Interval Runs</h2>
              <p className="text-white/65 leading-relaxed mb-6">
                Schedule recurring intent runs on any interval. When an intent triggers, barkcli invokes the full autonomy loop: creates the isolated worktree, runs the agents, enforces the project test gate, and reports the passing work directly to your review queue.
              </p>
              <ul className="space-y-2 text-sm text-white/70 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Scheduled doc audits, dependency upgrades, or test suite maintenance
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Zero unverified commits land without test gate approval
                </li>
              </ul>
            </div>
            <div className="w-full lg:w-96 rounded-xl bg-black/60 border border-white/10 p-4 font-mono text-xs">
              <div className="flex items-center justify-between text-white/40 border-b border-white/10 pb-2 mb-3">
                <span>CLI EXAMPLE</span>
                <button
                  onClick={() => copyCode("barkcli schedule add \"summarize the README\" --every 1h")}
                  className="hover:text-white transition-colors"
                >
                  {copiedCode === "barkcli schedule add \"summarize the README\" --every 1h" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[#E5AA7A] mb-2">$ barkcli schedule add &quot;clean dead dependencies&quot; --every 24h</p>
              <p className="text-emerald-400">✓ Scheduled automation registered (.board/automations.json)</p>
              <p className="text-white/50">Next execution in 23h 59m</p>
            </div>
          </div>
        </section>

        {/* Skills & Ecosystem Tools */}
        <section id="skills" className="p-8 md:p-10 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm relative overflow-hidden">
          <div className="flex flex-col lg:flex-row gap-8 lg:items-center justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-xs font-mono text-[#D4A574] mb-3">
                <Layers className="w-4 h-4" />
                <span>ECOSYSTEM INTEGRATIONS</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Skills & External Tooling</h2>
              <p className="text-white/65 leading-relaxed mb-6">
                Install remote skills and playbooks from skills.sh with SHA-pinned lockfiles. barkcli exposes {MCP_TOOL_COUNT} MCP tools to agents, and automatically discovers and binds external CLI helpers such as security scanners, linters, and headless browser drivers.
              </p>
              <ul className="space-y-2 text-sm text-white/70 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Deterministic, tamper-proof skills.lock committed to Git
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Seamless prompt injection for Claude Code, OpenCode, and Cursor
                </li>
              </ul>
            </div>
            <div className="w-full lg:w-96 rounded-xl bg-black/60 border border-white/10 p-4 font-mono text-xs">
              <div className="flex items-center justify-between text-white/40 border-b border-white/10 pb-2 mb-3">
                <span>CLI EXAMPLE</span>
                <button
                  onClick={() => copyCode("barkcli skills install owner/repo && barkcli tools list")}
                  className="hover:text-white transition-colors"
                >
                  {copiedCode === "barkcli skills install owner/repo && barkcli tools list" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[#E5AA7A] mb-2">$ barkcli skills install rust-lang/clippy-fix</p>
              <p className="text-white/70">✓ Verified SHA-256 and locked into .board/skills.lock</p>
              <p className="text-[#E5AA7A] mb-2">$ barkcli tools list</p>
              <p className="text-emerald-400">83 MCP tools active across stdio & HTTP</p>
            </div>
          </div>
        </section>

        {/* Code Intelligence */}
        <section id="quick-open" className="p-8 md:p-10 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm relative overflow-hidden">
          <div className="flex flex-col lg:flex-row gap-8 lg:items-center justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-xs font-mono text-[#D4A574] mb-3">
                <Search className="w-4 h-4" />
                <span>CODE GRAPH</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Code Intelligence & Symbol Graphs</h2>
              <p className="text-white/65 leading-relaxed mb-6">
                Give agents immediate O(1) codebase understanding. barkcli indexes AST symbols, function call graphs, and test-to-task relationships so agents claim only the files they actually need to modify.
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-[#E5AA7A]" />
                    Call Graphs
                  </div>
                  <div className="text-white/60">Cross-file dependency mapping</div>
                </div>
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                    <TestTube className="w-3.5 h-3.5 text-[#E5AA7A]" />
                    Test Mapping
                  </div>
                  <div className="text-white/60">Automatic test-to-spec linkage</div>
                </div>
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-[#E5AA7A]" />
                    Complexity Score
                  </div>
                  <div className="text-white/60">Cognitive & cyclomatic metrics</div>
                </div>
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#E5AA7A]" />
                    Risk Analysis
                  </div>
                  <div className="text-white/60">Calculated change impact</div>
                </div>
              </div>
            </div>
            <div className="w-full lg:w-96 rounded-xl bg-black/60 border border-white/10 p-4 font-mono text-xs">
              <div className="flex items-center justify-between text-white/40 border-b border-white/10 pb-2 mb-3">
                <span>CLI EXAMPLE</span>
                <button
                  onClick={() => copyCode("barkcli code \"auth\"")}
                  className="hover:text-white transition-colors"
                >
                  {copiedCode === "barkcli code \"auth\"" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[#E5AA7A] mb-2">$ barkcli code &quot;verify_token&quot;</p>
              <p className="text-white/70">src/auth/token.rs:42: fn verify_token(raw: &amp;str) -&gt; Result&lt;Claims&gt;</p>
              <p className="text-white/50">Called by: 4 functions · Covered by: tests/auth_test.rs</p>
            </div>
          </div>
        </section>

        {/* Codebase Brain & Architecture Knowledge Graph */}
        <section id="codebase-brain" className="p-8 md:p-10 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.02] backdrop-blur-sm relative overflow-hidden">
          <div className="flex flex-col lg:flex-row gap-8 lg:items-center justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-3">
                <Brain className="w-4 h-4" />
                <span>STRUCTURAL ARCHITECTURE</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Codebase Brain & 3D Knowledge Graph</h2>
              <p className="text-white/65 leading-relaxed mb-6">
                A persistent, self-improving architectural graph representing repository subsystems, modules, services, domain models, APIs, and governing invariants. The Brain strictly filters out ephemeral session activity noise, promoting only verified architectural knowledge with full source code evidence.
              </p>
              <ul className="space-y-2 text-sm text-white/70 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  Structural repo analyzer discovering crates, modules, and API gateways
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  Enforces architectural invariants directly into agent context packs
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  Interactive 2D & 3D knowledge graph with glowing palettes and evidence tracing
                </li>
              </ul>
            </div>
            <div className="w-full lg:w-96 rounded-xl bg-black/60 border border-white/10 p-4 font-mono text-xs">
              <div className="flex items-center justify-between text-white/40 border-b border-white/10 pb-2 mb-3">
                <span>CLI EXAMPLE</span>
                <button
                  onClick={() => copyCode("barkcli brain stats")}
                  className="hover:text-white transition-colors"
                >
                  {copiedCode === "barkcli brain stats" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[#E5AA7A] mb-2">$ barkcli brain stats</p>
              <p className="text-white/70">Nodes: 64 | Edges: 200 (subsystems: 8, modules: 5)</p>
              <p className="text-cyan-400 mb-3">Invariants: Isolated Worktrees, Local-First, Merge Train</p>
              <p className="text-[#E5AA7A] mb-2">$ barkcli serve --open # View Brain (3D)</p>
              <p className="text-white/50">✓ Interactive force-directed 3D explorer launched</p>
            </div>
          </div>
        </section>

        {/* Continuous Releases */}
        <section id="continuous-releases" className="p-8 md:p-10 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.02] backdrop-blur-sm relative overflow-hidden">
          <div className="flex flex-col lg:flex-row gap-8 lg:items-center justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-3">
                <Rocket className="w-4 h-4" />
                <span>DISTRIBUTION & AUTOMATION</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Auto-Release on Master Merge</h2>
              <p className="text-white/65 leading-relaxed mb-6">
                Ship every verified improvement immediately. Merges to the master branch trigger an automated release pipeline in GitHub Actions that bumps semantic versions across Cargo crates and Tauri desktop configurations, compiles native binaries, codesigns macOS app bundles, and publishes GitHub Releases.
              </p>
              <ul className="space-y-2 text-sm text-white/70 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Automated version bump and changelog generation on master push
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Multi-platform binaries (macOS Apple Silicon/Intel, Linux, Windows)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Signed native Bark.app bundles ready for instant deployment
                </li>
              </ul>
            </div>
            <div className="w-full lg:w-96 rounded-xl bg-black/60 border border-white/10 p-4 font-mono text-xs">
              <div className="flex items-center justify-between text-white/40 border-b border-white/10 pb-2 mb-3">
                <span>WORKFLOW TRIGGER</span>
                <button
                  onClick={() => copyCode("git push origin master")}
                  className="hover:text-white transition-colors"
                >
                  {copiedCode === "git push origin master" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[#E5AA7A] mb-2">$ git push origin master</p>
              <p className="text-white/70">→ Auto-release workflow triggered on master</p>
              <p className="text-emerald-400 mb-2">✓ Version bumped: v0.4.2 → v0.4.3</p>
              <p className="text-white/50">✓ Binaries, Bark.app bundle & release notes published</p>
            </div>
          </div>
        </section>

        {/* Multi-Surface Experience */}
        <section className="p-8 md:p-10 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm relative overflow-hidden">
          <div className="max-w-3xl mb-8">
            <div className="flex items-center gap-2 text-xs font-mono text-[#D4A574] mb-3">
              <Laptop className="w-4 h-4" />
              <span>EVERY SURFACE</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Five Interfaces. One Git Repository.</h2>
            <p className="text-white/65 leading-relaxed">
              barkcli is not locked into a single UI. The same underlying board and agent state is rendered seamlessly across terminal, browser, and desktop.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.01]">
              <div className="flex items-center gap-2 mb-2 text-[#E5AA7A] font-semibold text-sm">
                <Laptop className="w-4 h-4" />
                Native macOS Client
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                Native App (Bark.app) with embedded daemon, dock integration, ⌘K command palette, and local system notifications.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.01]">
              <div className="flex items-center gap-2 mb-2 text-[#E5AA7A] font-semibold text-sm">
                <Globe className="w-4 h-4" />
                Web Application
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                Browser interface at localhost:4321 with real-time WebSocket updates, review cards, diff inspectors, and token analytics.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.01]">
              <div className="flex items-center gap-2 mb-2 text-[#E5AA7A] font-semibold text-sm">
                <Monitor className="w-4 h-4" />
                Terminal UI (TUI)
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                Full ratatui terminal board with vim navigation, fast card movement, filter views, and zero mouse dependency.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.01]">
              <div className="flex items-center gap-2 mb-2 text-[#E5AA7A] font-semibold text-sm">
                <Terminal className="w-4 h-4" />
                Unix Command Line
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                Deterministic, scriptable CLI with JSON output flags, ideal for CI pipelines, scripts, and shell power users.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.01]">
              <div className="flex items-center gap-2 mb-2 text-[#E5AA7A] font-semibold text-sm">
                <Layers className="w-4 h-4" />
                VS Code Extension
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                Custom visual editor for *.board files right inside your VS Code workspace without context switching.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.01]">
              <div className="flex items-center gap-2 mb-2 text-[#E5AA7A] font-semibold text-sm">
                <Bot className="w-4 h-4" />
                {MCP_TOOL_COUNT} MCP Tools
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                Native Model Context Protocol server exposing board, spec, git, and memory tools directly to your AI agents.
              </p>
            </div>
          </div>
        </section>

        {/* Multiplayer & Collaboration Roadmap */}
        <section className="p-8 md:p-10 rounded-2xl border border-amber-500/20 bg-amber-500/[0.02] backdrop-blur-sm relative">
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-3">
            <Users className="w-4 h-4" />
            <span>ROADMAP · PLANNED ARCHITECTURE</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-3">Multiplayer & Peer-to-Peer Relay</h2>
          <p className="text-white/70 max-w-2xl leading-relaxed mb-6">
            barkcli is strictly local-first and account-free today. For distributed teams, we are designing a peer-to-peer relay sync that respects repository boundaries without requiring any proprietary cloud databases or remote account sign-ups.
          </p>
          <div className="flex flex-wrap gap-4 text-xs font-mono text-white/60">
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">No cloud accounts required</span>
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">Git as the authoritative sync layer</span>
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">End-to-end encrypted session relays</span>
          </div>
        </section>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
