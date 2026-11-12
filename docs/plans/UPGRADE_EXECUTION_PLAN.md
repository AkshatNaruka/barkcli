# BarkCLI Upgrade: Greater than t3.codes + DeepSeek Harness

## Vision
Transform barkcli from "management layer for AI agents" into the best agent harness - combining t3code's polish (event-sourced, provider adapters, inspector UX) with DeepSeek harness's plugin architecture and agent runtime, while keeping barkcli's unique strengths (git-native worktrees, tests as gate, merge train, spec/traceability).

## Free Models Pool
- opencode-go/crouton-alpha-free (free)
- opencode-go/iceman-contributor-free (free)
- opencode-go/beam-free (free)
Use all until exhausted. Rotate across agents.

## Phase 1: Foundation & Architecture (Parallel)
### 1a. Event-Sourced Core (like t3code)
- [ ] Adopt command→event→projection pattern in barkcli-core
- [ ] Add command receipts/idempotency
- [ ] Separate "accepted" vs "completed" states
- [ ] Event store with outbox pattern
- Use: app-builder skill, spawn agent with crouton-alpha-free

### 1b. Plugin System (like DeepSeek)
- [ ] Design plugin architecture (hooks, extensions, tools)
- [ ] Plugin loader/registry
- [ ] Core plugins for providers, UI, commands
- Use: app-builder skill, spawn agent with iceman-contributor-free

### 1c. Provider Adapter System (improved)
- [ ] Unify provider interface with capability matrix
- [ ] Better auth flows, model catalogs
- [ ] Support for steering, subagents
- Use: spawn agent with beam-free

## Phase 2: Thread/Session Model
- [ ] Thread = durable, session = disposable (like t3code)
- [ ] Fork/revert/steer capabilities
- [ ] Subagent support (native + app-owned)
- [ ] Timeline-based UI like t3code

## Phase 3: Inspector/Workbench UX
- [ ] Right panel with ordered surfaces (diff, files, terminal, PR, context)
- [ ] Proactive surface opening
- [ ] Closed-view memory
- [ ] Better diff viewer

## Phase 4: Orchestration Improvements
- [ ] First-class agent loop (like DeepSeek)
- [ ] Better worktree lifecycle
- [ ] Improved merge train with conflict handling
- [ ] Milestones/roadmap (already planned, implement)

## Phase 5: Polish & Integration
- [ ] UI improvements per DESIGN.md but better than both
- [ ] MCP enhancements
- [ ] TUI parity
- [ ] Performance optimizations

## Execution Strategy
- Spawn multiple subagents in parallel using different free models
- Each agent works in its own worktree
- Use skills (brainstorming, planning-and-task-breakdown, app-builder, frontend-design, etc.)
- Run tests continuously
- Don't stop until models exhausted
