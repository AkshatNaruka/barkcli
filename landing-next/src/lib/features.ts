export interface FeatureDetail {
  slug: string;
  title: string;
  category: string;
  description: string;
  code: string;
  gradient: string;
  iconName: string;
  overview: string;
  capabilities: string[];
  cliExamples: {
    cmd: string;
    output?: string;
    desc: string;
  }[];
  architecture: {
    title: string;
    description: string;
  }[];
  docsHref: string;
}

export const FEATURES_DATA: FeatureDetail[] = [
  {
    slug: "collective-memory",
    title: "Collective memory",
    category: "Persistence & Graph",
    description:
      "Every run is a node in a Git-backed contribution graph. Independent verification, evidence scores, neglected-branch nudging, and UCB recommendations. Agents build on verified work instead of starting from zero.",
    code: '$ barkcli analyze && barkcli contribute --title "insight" --kind hypothesis',
    gradient: "from-amber-500/20 to-orange-500/20",
    iconName: "Brain",
    overview:
      "Collective memory turns transient AI coding agent sessions into a cumulative knowledge graph backed entirely by Git. When agents test code, solve bugs, or formulate hypotheses, their findings are recorded as verified nodes with evidence scores rather than lost in discarded context windows.",
    capabilities: [
      "Git-backed contribution graph recording every run, intent, and outcome",
      "Evidence scoring and independent verification gates for hypotheses",
      "Neglected-branch nudging to prevent abandoned exploration work",
      "Upper Confidence Bound (UCB) multi-armed bandit algorithm for agent recommendations",
      "100% offline, zero external vector DB dependencies, fully version-controlled",
    ],
    cliExamples: [
      {
        cmd: 'barkcli analyze && barkcli contribute --title "insight" --kind hypothesis',
        output: "✓ Contribution node c7f49a recorded with evidence score 0.94\n✓ Linked to spec-auth-jwt in git graph",
        desc: "Analyze workspace and contribute a verified hypothesis node.",
      },
      {
        cmd: "barkcli memory search \"oauth token race condition\"",
        output: "Match (score 0.92): Fixed in worktree #3b by wrapping token refresh in mutex lock.",
        desc: "Search cross-session collective memory for prior solutions.",
      },
    ],
    architecture: [
      {
        title: "Node Storage in Git",
        description: "Nodes are stored as structured YAML files inside .board/memory/ and track parent commit SHAs, author agents, and verification status.",
      },
      {
        title: "Evidence & Acceptance Scoring",
        description: "Each node receives an evidence weight derived from unit test gates, diff sizes, and peer agent review scores.",
      },
      {
        title: "Cumulative Context Injection",
        description: "Subsequent agents automatically ingest top verified nodes matching their assigned spec before writing new code.",
      },
    ],
    docsHref: "/docs/concepts/code-context",
  },
  {
    slug: "real-local-agent-chat",
    title: "Real local-agent chat",
    category: "Interactive Agent Harness",
    description:
      "Ask or build with the same opencode, claude, or codex CLIs you already pay for. Read-only Ask turns stream text and tool calls; Build turns get an isolated worktree and a test gate.",
    code: "$ barkcli serve --open # then chat in the app",
    gradient: "from-emerald-500/20 to-teal-500/20",
    iconName: "Terminal",
    overview:
      "Interact with AI coding agents directly through your existing CLI subscriptions. Ask questions in read-only streaming mode, or trigger build turns where agents work inside isolated git worktrees gated on real project test suites.",
    capabilities: [
      "Bring Your Own Subscription (BYOS) — works with Claude Code, OpenCode, Codex, and Cursor",
      "Zero token markups, zero third-party intermediaries, direct local execution",
      "Dual mode: Read-only Ask turns for instant answers vs Build turns with isolated worktrees",
      "Live streaming of stdout, stderr, and MCP tool call transcripts",
      "Automatic recovery and transcript checkpointing across session restarts",
    ],
    cliExamples: [
      {
        cmd: "barkcli serve --open",
        output: "✓ Bark server listening on http://localhost:4321\n✓ Opening browser dashboard and real-time chat interface...",
        desc: "Start local server with Web UI and interactive chat.",
      },
      {
        cmd: 'barkcli chat --backend claude --prompt "Explain the auth middleware"',
        output: "Streaming response from Claude Code (read-only)...",
        desc: "Direct terminal chat using installed agent CLIs.",
      },
    ],
    architecture: [
      {
        title: "Process Supervision",
        description: "barkcli wraps local agent binaries in PTY sessions, capturing structured JSON-RPC and ANSI streams without modifying the underlying agent.",
      },
      {
        title: "Worktree Isolation for Build Turns",
        description: "Whenever a turn produces code modifications, barkcli spins up a lightweight ephemeral git worktree to protect your active working branch.",
      },
    ],
    docsHref: "/docs/interfaces/web",
  },
  {
    slug: "quick-open",
    title: "Quick open & command runner",
    category: "Developer Ergonomics",
    description:
      "⌘P jumps to any file with a preview; ⌘⇧R runs real project tests, builds, and git commands without leaving Bark.",
    code: '$ barkcli code "auth" # or ⌘P / ⌘⇧R in the app',
    gradient: "from-blue-500/20 to-cyan-500/20",
    iconName: "Search",
    overview:
      "Instant fuzzy file navigation, code intelligence search, and an integrated project command runner right within Bark desktop and web interfaces. Jump to symbols, inspect AST relationships, and trigger test suites in milliseconds.",
    capabilities: [
      "⌘P instant fuzzy file search with syntax-highlighted previews",
      "⌘⇧R runner for project tests, cargo/npm builds, and arbitrary git commands",
      "AST symbol indexing across Rust, TypeScript, JavaScript, Python, and Go",
      "Real-time test execution with status notifications and clickable failure line links",
      "Integrated keybindings with vim navigation and modal shortcuts",
    ],
    cliExamples: [
      {
        cmd: 'barkcli code "auth"',
        output: "src/auth/token.rs:42: fn verify_token(raw: &str) -> Result<Claims>\nsrc/auth/middleware.rs:18: pub async fn require_auth(...)",
        desc: "Search AST symbols and code references from CLI.",
      },
      {
        cmd: "barkcli exec -- git status --short",
        output: " M src/auth/token.rs\n?? tests/token_test.rs",
        desc: "Run repository commands in project root context.",
      },
    ],
    architecture: [
      {
        title: "In-Memory Fuzzy Indexer",
        description: "Pre-indexes project file trees and AST symbols, supporting sub-millisecond query latency across repositories with 100k+ files.",
      },
      {
        title: "Sandboxed Command Execution",
        description: "Commands executed via ⌘⇧R run with project environment isolation, capturing exit codes and streaming live terminal output.",
      },
    ],
    docsHref: "/docs/code-context",
  },
  {
    slug: "automations",
    title: "Automations",
    category: "Scheduled Execution",
    description:
      "Schedule agent runs on an interval. Each due intent invokes the normal autonomy loop — worktree, gate, merge train — and reports back.",
    code: '$ barkcli schedule add "summarize the README" --every 1h',
    gradient: "from-rose-500/20 to-red-500/20",
    iconName: "Clock",
    overview:
      "Set your codebase maintenance on continuous autopilot. Automations trigger AI coding agents on cron schedules or intervals to perform routine tasks like documentation sync, dependency audits, security scanning, and test fixes.",
    capabilities: [
      "Interval & cron scheduling (e.g. --every 1h, --cron '0 0 * * *')",
      "Full autonomy loop: intent → plan → worktree → test gate → review queue",
      "Zero unverified commits — automated runs must pass acceptance tests before queueing",
      "Persistent schedule registry stored in .board/automations.json",
      "Status reporting to terminal, desktop notification, and review queue",
    ],
    cliExamples: [
      {
        cmd: 'barkcli schedule add "summarize the README" --every 1h',
        output: "✓ Automation registered: 'summarize the README' (interval: 1h)\nNext run: in 59m 59s",
        desc: "Register a recurring agent automation.",
      },
      {
        cmd: "barkcli schedule list",
        output: "ID       SCHEDULE   INTENT                    LAST RUN   STATUS\nauto-01  1h         summarize the README      10m ago    PASSED\nauto-02  24h        audit security advisories 4h ago     PASSED",
        desc: "List active automations and historical execution verdicts.",
      },
    ],
    architecture: [
      {
        title: "Daemon & Event Loop",
        description: "The lightweight barkcli daemon checks scheduled intents against clock timestamps, spawning isolated agent worktrees when due.",
      },
      {
        title: "Test Gate Safety Barrier",
        description: "Even if an automation runs unattended, its output is gated by acceptance tests and lands in the human review queue before merging.",
      },
    ],
    docsHref: "/docs/commands/schedule",
  },
  {
    slug: "mind",
    title: "Mind",
    category: "Project Intelligence",
    description:
      "A compiled snapshot of your project — health, blockers, stale work, next actions. One command answers what's happening across agents and developers.",
    code: "$ barkcli mind sync && barkcli overview",
    gradient: "from-violet-500/20 to-purple-500/20",
    iconName: "Sparkles",
    overview:
      "Mind gives engineering teams and autonomous agents a single compiled source of truth. It analyzes active worktrees, open specs, test pass rates, and blocker dependencies into an actionable project health snapshot.",
    capabilities: [
      "Holistic project health scoring (0-100%) based on tests, blockers, and card velocity",
      "Detection of stale worktrees, orphaned sessions, and conflicting branches",
      "Autopilot next-action recommendations for both humans and agents",
      "Living context file synchronization (project_context.md) with 57× token savings",
      "O(1) compiled overview without querying external SaaS boards",
    ],
    cliExamples: [
      {
        cmd: "barkcli mind sync && barkcli overview",
        output: "Health Score: 96% | Velocity: 8.4 tasks/day\nBlockers: 0 | Stale Worktrees: 0 | Active Agents: 3\nNext Action: Dispatch tester for auth endpoints",
        desc: "Synchronize project state and print executive health overview.",
      },
      {
        cmd: "barkcli context digest --polish",
        output: "✓ Regenerated project_context.md\n✓ Byte-stable facts updated with active board state",
        desc: "Refresh living context engine for all agent sessions.",
      },
    ],
    architecture: [
      {
        title: "Unified Metadata Engine",
        description: "Aggregates Git commit logs, active worktrees, .board files, and agent queue states into a fast in-memory graph.",
      },
      {
        title: "Living Context Compiler",
        description: "Maintains project_context.md at repo root so incoming agents start with instant full-context comprehension without re-crawling.",
      },
    ],
    docsHref: "/docs/concepts/projects",
  },
  {
    slug: "skills",
    title: "Skills & Ecosystem Tools",
    category: "Tooling & Extensions",
    description:
      "Install remote playbooks from skills.sh with sha-pinned skills.lock files. Automatically detect, inspect, and run external agent tools including fx, deepsec, and agent-browser.",
    code: "$ barkcli skills install owner/repo && barkcli tools list",
    gradient: "from-indigo-500/20 to-blue-500/20",
    iconName: "Layers",
    overview:
      "Extend your coding agents with reproducible playbooks, specialized domain skills, and external toolchains. All remote skills are cryptographically verified and pinned in skills.lock for zero supply chain risk.",
    capabilities: [
      "Install verified skills from skills.sh with SHA-256 lockfile pinning",
      "83 standard MCP tools exposed over stdio and JSON-RPC HTTP",
      "Auto-discovery of external agent binaries (e.g. fx, deepsec, agent-browser)",
      "Strict provenance tracking and tamper-proof execution guarantees",
      "Cross-agent compatibility with Claude Code, Cursor, Codex, and OpenCode",
    ],
    cliExamples: [
      {
        cmd: "barkcli skills install rust-lang/clippy-fix",
        output: "✓ Downloaded skill rust-lang/clippy-fix\n✓ Computed SHA-256: e8b4c2...\n✓ Pinned to .board/skills.lock",
        desc: "Install remote skill with cryptographic verification.",
      },
      {
        cmd: "barkcli tools list",
        output: "Active MCP Tools: 83\nExternal Toolchain: fx, deepsec, agent-browser, ripgrep\nMode: Local stdio & loopback HTTP",
        desc: "Inspect available MCP tools and connected CLI helpers.",
      },
    ],
    architecture: [
      {
        title: "Tamper-Proof Lockfile",
        description: "The .board/skills.lock file records exact hashes of all installed playbooks, ensuring deterministic execution across different machines.",
      },
      {
        title: "Dynamic MCP Discovery",
        description: "Agents automatically query available tools at runtime, receiving clean JSON schemas for safe programmatic invocation.",
      },
    ],
    docsHref: "/docs/commands/skills",
  },
  {
    slug: "board-traceability",
    title: "Board + Traceability",
    category: "Git-Native Specs",
    description:
      "Kanban with spec_id on every card — spec ↔ card ↔ task ↔ code, O(1). Diff it, merge it, grep it.",
    code: "$ git diff main..feature -- *.board",
    gradient: "from-zinc-500/20 to-neutral-500/20",
    iconName: "FolderOpen",
    overview:
      "Forget SaaS task trackers that live disconnected from your source code. barkcli stores every board, card, and requirement as human-readable YAML directly in your Git repository with O(1) bi-directional traceability.",
    capabilities: [
      "spec ↔ card ↔ task ↔ code traceability: every change links to an exact requirement",
      "Git-versioned .board YAML files: diff, branch, merge, and rollback tasks like code",
      "Conflict-free resolution during concurrent team merges",
      "Zero vendor lock-in, zero cloud databases, 100% works on airplanes and airgapped setups",
      "Bi-directional sync between boards and code symbols",
    ],
    cliExamples: [
      {
        cmd: "git diff main..feature -- *.board",
        output: "--- a/features.board\n+++ b/features.board\n@@ -14,3 +14,3 @@\n-  column: doing\n+  column: done",
        desc: "Review task status changes directly in Git diffs.",
      },
      {
        cmd: 'barkcli dev add "Implement JWT auth" -c doing --due 2026-11-15',
        output: "✓ Added card [auth-jwt] to dev.board in column 'doing'",
        desc: "Add and organize cards from the command line.",
      },
    ],
    architecture: [
      {
        title: "YAML Storage Engine",
        description: "Board files are clean YAML documents structured for minimal git merge conflicts and immediate readability in editors.",
      },
      {
        title: "Spec ID Traceability Linker",
        description: "Cards carry spec_id references that connect tasks to requirement specs and automated tests, generating instant audit reports.",
      },
    ],
    docsHref: "/docs/concepts/boards",
  },
  {
    slug: "agent-queue",
    title: "Agent Queue",
    category: "Task Dispatch & Fleet",
    description:
      "Tasks dispatch to OpenCode, Claude Code, Cursor, or a human. Claim, work, complete — with a test review gate before done.",
    code: "$ barkcli dispatch --role builder && barkcli review",
    gradient: "from-green-500/20 to-emerald-500/20",
    iconName: "Bot",
    overview:
      "Coordinate multiple coding agents working in parallel. barkcli manages task claiming, worker heartbeat leasing, role assignment (builder, tester, reviewer), and enforces acceptance testing before any task is marked done.",
    capabilities: [
      "Task claiming protocol with heartbeat leases to prevent duplicate work",
      "Role-based worker allocation: Builder, Tester, Verifier, and Human reviewer",
      "Parallel worktrees: run N agents simultaneously on separate branches",
      "Automatic merge train: passes gate, merges in order, re-dispatches on conflict",
      "Review queue handoff: human acts at plan approval and final acceptance",
    ],
    cliExamples: [
      {
        cmd: "barkcli dispatch --role builder && barkcli review",
        output: "✓ Dispatched 3 tasks to agent pool\n✓ Worktrees active: wt-1 (builder), wt-2 (tester)\n✓ 1 task ready in review queue (tests passed)",
        desc: "Dispatch pending tasks and open human review queue.",
      },
      {
        cmd: 'barkcli run "Add Stripe checkout" --agents 3 --yes',
        output: "✓ Plan approved (3 tasks)\n✓ 3 worktrees running in parallel pool\n✓ Merge train: 3/3 tasks passing acceptance tests",
        desc: "Run multi-agent parallel pool with acceptance gate.",
      },
    ],
    architecture: [
      {
        title: "Autonomous Merge Train",
        description: "Finished branches enter a FIFO merge train where project tests run against main. Passing branches merge; conflicted branches re-run solo.",
      },
      {
        title: "Role Separation",
        description: "Builders write code, testers author edge cases, and reviewers audit security diffs before human final review.",
      },
    ],
    docsHref: "/docs/concepts/tasks",
  },
  {
    slug: "memory",
    title: "Memory",
    category: "4-Tier Architecture",
    description:
      "Four-tier local memory with hybrid BM25 + TF-IDF search. Decisions and patterns survive across sessions — offline.",
    code: '$ barkcli memory search "auth errors"',
    gradient: "from-teal-500/20 to-cyan-500/20",
    iconName: "Database",
    overview:
      "Never repeat solved bugs or lost architectural decisions. barkcli provides a hierarchical four-tier local memory system combining BM25 exact term matching with TF-IDF semantic scoring, operating completely offline.",
    capabilities: [
      "Four memory tiers: Ephemeral (in-turn), Session, Working, and Long-term",
      "Hybrid BM25 + TF-IDF ranking for high precision retrieval without vector embeddings",
      "Decision preservation: records why architectural trade-offs were made",
      "Failure memory: prevents agents from re-trying disproven hypotheses",
      "100% private and offline: zero external API calls or vector databases needed",
    ],
    cliExamples: [
      {
        cmd: 'barkcli memory search "auth errors"',
        output: "Rank #1 (BM25: 4.82, TF-IDF: 0.91):\nFact: 'Bearer token parsing requires stripping trailing whitespace'\nRecorded: 3 days ago in session #42",
        desc: "Search project memory across all historical agent sessions.",
      },
      {
        cmd: 'barkcli memory add "Use sha256 for skill checksums" --tier long-term',
        output: "✓ Fact recorded to long-term memory (.board/memory/facts.json)",
        desc: "Persist architectural rule into long-term project memory.",
      },
    ],
    architecture: [
      {
        title: "Hierarchical Tiering",
        description: "Facts promote from ephemeral session buffers to working and long-term memory as their verification frequency increases.",
      },
      {
        title: "Hybrid Search Pipeline",
        description: "Combines Okapi BM25 keyword relevance with document-frequency vector scoring for instant offline search.",
      },
    ],
    docsHref: "/docs/commands/memory",
  },
  {
    slug: "codebase-brain",
    title: "Codebase Brain (3D)",
    category: "Architecture & Invariants",
    description:
      "Self-improving structural repository knowledge graph. Discovers subsystems, modules, services, APIs, domain models, and architectural invariants, eliminating raw session activity noise. Rendered in glowing 2D & 3D with evidence inspectors.",
    code: "$ barkcli brain stats && barkcli serve --open",
    gradient: "from-cyan-500/20 to-blue-500/20",
    iconName: "Brain",
    overview:
      "The Codebase Brain gives developers and autonomous agents a durable, self-improving architectural understanding of the repository. Rather than polluting the knowledge graph with ephemeral session activity notes, the Brain discovers real subsystems, modules, services, domain models, and key architectural invariants, linking them directly to source files and AST symbols.",
    capabilities: [
      "Structural repository architecture discovery (subsystems, modules, services, APIs, and domain models)",
      "Governing architectural invariants (e.g. isolated worktree execution, local-first data ownership, gate-driven merge trains)",
      "Strict separation of persistent architecture knowledge from transient session activity logs",
      "Interactive 2D & 3D knowledge graph with glowing palettes and Lucide entity kind icons",
      "Source evidence inspector tracking files, symbols, commit SHAs, and verification gates",
      "Zero-latency context pack injection directly into Claude Code, OpenCode, Codex, and Antigravity",
    ],
    cliExamples: [
      {
        cmd: "barkcli brain stats",
        output: "Brain graph for 'dev':\n  Nodes: 64   Edges: 200\n  By kind: subsystem: 8, module: 5, service: 3, model: 2, api: 1, invariant: 3, fact: 24\n  Most connected: subsystem:barkcli-core (38 links)",
        desc: "Inspect architectural graph nodes, kinds, and connectivity stats.",
      },
      {
        cmd: "barkcli brain graph",
        output: "Subsystems: barkcli-core, barkcli-server, barkcli-cli, barkcli-tui, web, desktop, barkcli-ios\nInvariants: Isolated Worktree Execution, Local-First Data Ownership, Gate-Driven Merge Train",
        desc: "Query repository architecture hierarchy and constraints.",
      },
    ],
    architecture: [
      {
        title: "Structural Codebase Analyzer",
        description: "Recursively inspects repository crates, module boundaries, entry points, and domain models, constructing a typed dependency graph.",
      },
      {
        title: "Architectural Invariant Enforcement",
        description: "Governing invariants and pitfalls are automatically injected into agent context packs, preventing agents from violating design rules.",
      },
      {
        title: "Source Evidence Tracing",
        description: "Every architectural node maintains verifiable evidence linking it to source code paths, AST symbols, and git commit provenance.",
      },
    ],
    docsHref: "/docs/code-context",
  },
  {
    slug: "continuous-releases",
    title: "Continuous Releases",
    category: "Distribution & CI/CD",
    description:
      "Automated release pipeline on every master merge. Automatically bumps semantic versions across crates, generates changelogs, compiles signed binaries and desktop bundles, and publishes GitHub Releases.",
    code: "git merge feature && git push origin master # auto-releases",
    gradient: "from-amber-500/20 to-emerald-500/20",
    iconName: "Rocket",
    overview:
      "Ship updates with zero release overhead. When PRs or commits land in the master branch, GitHub Actions automatically calculates semantic version bumps across all workspace manifests, compiles native binaries for macOS, Linux, and Windows, ad-hoc signs desktop app bundles, and creates tagged GitHub Releases with automated notes.",
    capabilities: [
      "Automated semver version bumping across Cargo workspace manifests and Tauri desktop configuration",
      "Multi-platform compilation: macOS (Apple Silicon + Intel), Linux (x86_64, aarch64), Windows (x64)",
      "Native macOS Bark.app bundle creation with ad-hoc and developer codesigning",
      "Automated changelog generation from git commit history since the last release tag",
      "SHA256 checksum generation and automated asset upload to GitHub Releases",
      "Protected concurrency preventing overlapping release runs on rapid merges",
    ],
    cliExamples: [
      {
        cmd: "bash scripts/auto_release_on_master.sh",
        output: "==> Latest release tag: v0.4.2\n==> Auto-bumping release version: 0.4.2 -> 0.4.3 (v0.4.3)\n==> Updated Cargo.toml and desktop/tauri.conf.json to version 0.4.3\n==> Created tag v0.4.3 with automated release notes",
        desc: "Run automated release script locally or in CI.",
      },
      {
        cmd: "git push origin master",
        output: "✓ Pushed to master\n→ GitHub Actions workflow 'Auto Release on Master' triggered\n→ Building multi-platform binaries & publishing GitHub Release",
        desc: "Push to master to trigger automated production release.",
      },
    ],
    architecture: [
      {
        title: "Automated Workflow Concurrency",
        description: "GitHub Actions workflow locks on master pushes to ensure releases are sequenced deterministically without tag collisions.",
      },
      {
        title: "Multi-Platform Build Matrix",
        description: "Compiles release binaries and bundles across Ubuntu, macOS, and Windows runners, attaching verified checksums to the release.",
      },
      {
        title: "Zero-Human Release Cycle",
        description: "Eliminates tedious manual version editing, tagging, building, and uploading steps from the software development lifecycle.",
      },
    ],
    docsHref: "/docs/getting-started",
  },
  {
    slug: "interactive-threads",
    title: "Interactive Threads & Timeline",
    category: "Agent Collaboration & Surfaces",
    description:
      "Multi-turn agent threads with live tool-calling streams, a left-rail dashed timeline scrubber to inspect earlier execution checkpoints, and floating surface launcher.",
    code: "$ barkcli serve --open # then launch thread or surface",
    gradient: "from-indigo-500/20 to-purple-500/20",
    iconName: "Bot",
    overview:
      "Threads give developers and autonomous agents a persistent workspace for multi-turn collaboration. Every action taken by an agent is tracked along an interactive vertical dashed timeline on the left rail. Hovering over any step reveals what happened at that exact execution checkpoint—including modified files, shell runs, and tool outputs. A top-level floating surface launcher connects directly to terminals, files, diffs, pull requests, and the inbuilt browser.",
    capabilities: [
      "Vertical dashed timeline scrubber with live tool execution step inspection on hover",
      "Floating surface launcher with fast single-key hotkeys (Browser, Terminal, Files, Diff, PR)",
      "Multi-turn streaming transcripts with collapsible thought processes and shell outputs",
      "Tabbed surface management with clean close buttons and background task persistence",
      "Automatic recovery and state synchronization across thread lifecycles",
    ],
    cliExamples: [
      {
        cmd: "barkcli serve --open",
        output: "✓ Bark running on http://localhost:4321\n✓ Opening Threads workspace with timeline scrubber and floating surface launcher...",
        desc: "Launch web/desktop app with interactive thread surfaces.",
      },
      {
        cmd: "barkcli run \"implement OAuth2 refresh flow\" --agents 2",
        output: "→ Spawning thread run_auth_01 (opencode)\n→ Left rail timeline checkpoints streaming in real-time",
        desc: "Autonomous thread run with live streaming step timeline.",
      },
    ],
    architecture: [
      {
        title: "Step Timeline Indexer",
        description: "Captures step indices, source annotations, tool names, and affected file paths in real-time, feeding the interactive hover scrubber.",
      },
      {
        title: "Floating Surface Dispatcher",
        description: "Decouples workbench views into persistent tabs with isolated keyboard shortcuts, iframe/terminal shells, and git state bindings.",
      },
      {
        title: "Multi-Turn Context Preservation",
        description: "Thread memory and session history are saved to disk with zero cloud transmission, ensuring complete privacy and offline reproducibility.",
      },
    ],
    docsHref: "/docs/interfaces",
  },
  {
    slug: "inbuilt-browser",
    title: "Inbuilt Web Browser",
    category: "Live Surfaces & Previews",
    description:
      "Full-fledged embedded browser surface: test and interact with local development servers (http://localhost:*), preview web apps, and inspect documentation directly inside Bark.",
    code: "$ barkcli serve --open # open Browser surface (B)",
    gradient: "from-blue-500/20 to-emerald-500/20",
    iconName: "Globe",
    overview:
      "Bark eliminates window context switching with a built-in browser surface embedded directly inside the application. When agents spin up local development servers, web endpoints, or documentation previews, developers can view, navigate, inspect, and interact with localhost ports or external URLs without leaving Bark.",
    capabilities: [
      "Embedded web surface supporting arbitrary URLs and local development servers (http://localhost:*)",
      "Instant keyboard navigation with address bar, refresh, forward/back, and dev console inspection",
      "Tabbed multitasking alongside Terminal, Code Files, and Git Diff surfaces",
      "Zero external window bouncing — keep agent chat, code diffs, and live app output side-by-side",
      "Automatic detection and preview link generation for common development ports (3000, 4321, 5173, 8080)",
    ],
    cliExamples: [
      {
        cmd: "barkcli serve --open",
        output: "✓ Bark running on http://localhost:4321\n✓ Inbuilt browser ready: press 'B' in surface launcher to open any URL or localhost",
        desc: "Open Bark with built-in embedded web browser.",
      },
      {
        cmd: "npm run dev # on port 5173",
        output: "→ Inbuilt browser opens http://localhost:5173 directly in surface tab",
        desc: "Preview live development server inside Bark tabs.",
      },
    ],
    architecture: [
      {
        title: "Loopback Proxy & Security Sandbox",
        description: "Safely sandboxes web content and proxies loopback addresses without CORS restrictions or external browser redirection.",
      },
      {
        title: "Tabbed Surface Integration",
        description: "Mounts as a standard workbench tab with custom URL history, reload triggers, and full-screen expansion options.",
      },
      {
        title: "Developer Workflow Efficiency",
        description: "Allows users to inspect UI renders right next to agent diffs, eliminating multi-monitor window clutter.",
      },
    ],
    docsHref: "/docs/web-app-guide",
  },
  {
    slug: "modern-analytics",
    title: "Modern Delivery Analytics",
    category: "Metrics & Throughput",
    description:
      "Interactive column throughput and effort metrics with SVG linear gradients, view filters (All, Cards, Effort), glassmorphic tooltips, and Donut priority charts with centered totals.",
    code: "$ barkcli report # or view Reports surface in app",
    gradient: "from-emerald-500/20 to-indigo-500/20",
    iconName: "BarChart3",
    overview:
      "Bark delivers executive-grade delivery metrics designed for modern engineering teams and autonomous fleets. The Reports surface provides real-time throughput analysis, story point effort distributions, priority breakdowns, and completion velocity with responsive dark-mode styling.",
    capabilities: [
      "Interactive dual-gradient Column Throughput & Effort Chart (emerald cards, indigo story points)",
      "Segmented view mode filters (All, Cards, Effort) to drill into volume vs complexity",
      "Custom glassmorphic tooltips displaying percentage shares of board totals and average complexity per card",
      "Modern Donut Priority Distribution chart with dynamic centered card count labels",
      "Zero-glare dark-mode cursor highlight eliminating light-theme hover artifacts",
    ],
    cliExamples: [
      {
        cmd: "barkcli report",
        output: "Completion Rate: 78.4%\nDelivered Effort: 42 pts\nIn Flight Execution: 14 cards (22 pts)\nReady for Dispatch: 6 cards",
        desc: "Generate terminal delivery and throughput report.",
      },
      {
        cmd: "barkcli serve --open # navigate to Reports",
        output: "✓ Reports surface loaded with SVG gradients, interactive toggles, and priority donut",
        desc: "View interactive graphical delivery analytics in web/desktop app.",
      },
    ],
    architecture: [
      {
        title: "Real-Time Aggregation Engine",
        description: "Computes column card throughput, total and completed story points, and priority counts directly from YAML boards in sub-millisecond time.",
      },
      {
        title: "T3-Style Visual Aesthetics",
        description: "Utilizes Recharts with SVG linear gradient fills, rounded caps, segmented pills, and dark-theme rgba cursor boundaries.",
      },
      {
        title: "Story Point Velocity & Ratio Analysis",
        description: "Calculates live complexity ratios (average points per card) to help engineering leads identify bloated epics.",
      },
    ],
    docsHref: "/docs/web-app-guide",
  },
  {
    slug: "worktree-cleanup",
    title: "Worktree Cleanup",
    category: "Workspace Hygiene",
    description:
      "Every agent checkout with its size on disk, merge state, and age in Settings → Worktrees. Merged and stale checkouts are removed only after a confirmation that names the exact bytes reclaimed.",
    code: "$ barkcli serve --open # Settings → Worktrees",
    gradient: "from-sky-500/20 to-emerald-500/20",
    iconName: "GitBranch",
    overview:
      "Isolated worktrees are what keep agents from contaminating your checkout, but abandoned attempts add up. Bark inventories each managed checkout, measures what it actually occupies (skipping shared build caches), and lets you reclaim space without guessing.",
    capabilities: [
      "Size on disk per checkout, with symlinked build caches excluded so numbers are honest",
      "Merge detection against the base branch plus age and live-run status",
      "A confirmation step that names the worktrees and the exact bytes before anything is deleted",
      "Hard protection for active runs, uncommitted changes, and unmerged commits",
      "Unmerged stale branches are kept after their checkout is removed, so commits survive",
    ],
    cliExamples: [
      {
        cmd: "GET /api/worktrees/inventory",
        output: '{"base_branch":"master","removable_count":2,"reclaimable_bytes":412000000,...}',
        desc: "Inspect every agent checkout and what it costs.",
      },
      {
        cmd: 'POST /api/worktrees/cleanup {"slugs":["run-123"],"dry_run":true}',
        output: '{"dry_run":true,"planned":[{"slug":"run-123","size_bytes":206000000}],"removed_count":0}',
        desc: "Preview exactly what a cleanup would free before it runs.",
      },
    ],
    architecture: [
      {
        title: "Ground Truth from Git",
        description: "The inventory walks `git worktree list` and the worktree directory, so deleted checkouts and orphaned folders are both reported instead of silently assumed.",
      },
      {
        title: "Conservative Removal Rules",
        description: "A checkout is removable only when its branch is merged and the tree is clean, or when it is stale with no live run; the server re-checks every slug before deleting.",
      },
      {
        title: "Branch-Safe Cleanup",
        description: "Merged `bark/*` branches are deleted with their checkout; stale unmerged branches are left in place so their commits stay recoverable.",
      },
    ],
    docsHref: "/docs/web-app-guide",
  },
];

export function getFeatureBySlug(slug: string): FeatureDetail | undefined {
  return FEATURES_DATA.find((f) => f.slug === slug);
}
