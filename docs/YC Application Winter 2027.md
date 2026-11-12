# YC Application Winter 2027 — barkcli

## Company

**Name:** barkcli  
**URL:** https://akshatnaruka.github.io/barkcli/  
**Demo:** https://akshatnaruka.github.io/barkcli/app/  
**GitHub:** https://github.com/AkshatNaruka/barkcli  
**Contact:** Akshat Naruka (founder)  
**Location:** San Francisco / Remote (global)  
**One-line description:** The management layer for AI agents. Turns intent into shipped code with isolated worktrees, tests as the gate, and a merge train.  

## Problem

Today, everyone is pasting vague prompts into Claude Code, Cursor, OpenCode, or Codex. These tools are great at writing code in a single terminal session, but they have no concept of "project management": no way to break a product idea into tasks, no memory across sessions, no guardrails against breaking tests, and no way to run multiple agents in parallel without them stepping on each other. The result is chaos — agents mutate your working tree directly, forget everything between sessions, and confidently claim "done" when nothing actually passes.

## Solution

**barkcli is the management layer for AI agents.** 

Just like `git` is the version control layer that made distributed software development possible, barkcli is the layer that makes human-AI software development coordinated, auditable, and scalable. 

Humans write intent ("Build auth flow with OAuth"), barkcli turns it into a plan with acceptance criteria, dispatches it to agents working in isolated git worktrees, runs your project's tests as the hard acceptance gate, and only merges passing work via a merge train. Everything lives in your repo in plain YAML/JSON (`.board/`), so it's offline-first, git-trackable, and fully under your control.

## How it works

1. **Intake** - Describe what you want in natural language; barkcli creates structured cards/specs with acceptance criteria
2. **Plan** - Decomposes work into agent-ready tasks with file context and dependencies
3. **Dispatch** - Spawns agents in isolated git worktrees (parallel pool supported with `--agents N`)
4. **Gate** - Runs your actual test suite in each worktree; "done" means tests pass, not agent self-report
5. **Merge train** - Passing branches merge in order with conflict handling; failed branches get re-dispatched with test feedback

## Key Differentiators

- **Tests as the acceptance gate**: We don't trust agent self-reporting. If `cargo test`/`npm test`/`pytest` fails, it doesn't merge. Period.
- **True isolation**: Every agent gets its own git worktree. No dirty diffs, no merge conflicts from parallel agents stepping on each other.
- **Repo-native & offline-first**: Everything lives in `.board/` as plain files committed to git. No cloud accounts, no subscriptions, works completely offline.
- **Collective memory**: Cross-session memory with 4-tier system (working/short/long/external), BM25 search, and auto-capture from sessions. Agents learn from past work.
- **MCP-native**: 76 MCP tools let any MCP-compatible agent (Claude, Cursor, OpenCode, Codex) plug in directly.
- **Unified across surfaces**: CLI, TUI (ratatui), web app (React/Vite), VS Code extension, and even iOS app (SwiftUI) all share the same core.

## Traction / Demo

- **Fully functional**: Working CLI, web UI at live demo, TUI, MCP server, iOS app in repo
- **Production-quality codebase**: Rust core (barkcli-core) with comprehensive test suite, TypeScript web app with 170+ tests passing
- **Open source**: MIT licensed, growing community interest
- **Real usage**: Built to solve our own pain point managing multiple AI agents on real projects

## Market

The AI coding agent market is exploding - Cursor, Claude Code, OpenCode, Codex, RooCode etc. are all seeing massive adoption. But as teams start running 3-5 agents in parallel on real codebases, coordination becomes the bottleneck. This is exactly the problem Linear/Jira solved for human teams, but for AI agent swarms. The TAM is everyone using AI coding agents (millions of developers), and the wedge is "make your agent swarm actually work together without chaos".

## Why now?

1. **Agent proliferation**: Developers regularly use 2-4 different coding agents
2. **Scale pain is real**: Running multiple agents in parallel causes constant conflicts and broken state
3. **Test-driven development is the answer**: The only reliable way to verify agent output is to run the actual tests
4. **Local-first is winning**: Developers increasingly want tools that work offline and don't lock their data in the cloud

## Team

**Akshat Naruka** - Solo founder. Built the entire stack (Rust, TypeScript, Swift) from scratch. Deep experience with developer tools and a clear vision for the "operating system for human-AI collaboration".

## Ask

$500k for 12 months. We'll use it to polish the UX, grow adoption in the AI coding community, and build towards making barkcli the de-facto standard for coordinating AI agent teams. The goal is to become the "git for agent orchestration" - a foundational tool that every AI-assisted engineering team relies on.
