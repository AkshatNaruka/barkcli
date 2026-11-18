# barkcli Competitive Strategy — How to Be Best vs DeepSeek Harness, T3 Code, and Peers

> **Status:** strategy, 2026-11-07 · Version 0.4.0 (verified in worktree)
> **Companion docs:** `ANALYSIS_BARKCLI.md`, `ANALYSIS_DEEPSEEK.md`, `ANALYSIS_T3CODE.md`, `MANAGEMENT_LAYER_VISION.md`, `DESIGN.md`, `project_context.md`
> **Positioning (non-negotiable):** barkcli is **the management layer for AI agents** — intent in, plans out, isolated worktrees, tests as the gate, and a merge train for whatever passes. The board is a feature; the product is the management layer (intent → plan → worktree → gate → merge).

---

## 1. TL;DR — Don't Out-Harness DeepSeek. Don't Out-Surface T3. Win on a Different Axis.

| | DeepSeek Harness (dsh) | T3 Code | **barkcli** |
|---|---|---|---|
| **One-line identity** | Everything-is-a-plugin agent harness (Cordis) | Bring-your-own-subscription control surface for CLI agents | **Management layer for AI agents** (file-is-truth, local-first) |
| **Job to be done** | Build/run an agent (turn/step loop, tools, sandbox) | Watch/steer/fork threads from web/mobile/desktop | **Decide what gets built** — intake → plan → dispatch → review → merge |
| **Where work runs** | In-process, sandboxed agent loop | Subprocess CLI per thread, event-sourced server | **External agent in isolated git worktree**; gate = project tests |
| **Durable truth** | Append-only `SessionEvent` JSONL log | SQLite event log + projections + receipts | `*.board` YAML + `.board/**` JSON/JSONL, committed specs/memory/context |
| **Trust model** | Policy/sandbox/permissions in the loop | Server-owned settlement + checkpoints (hidden git refs) | Deterministic `guard`, SHA-256 `receipt`, risk-ranked `review queue`, evidence-scored contribution DAG |
| **Extensibility** | Profiles + bundles + patches, HMR | Effect services, adapter registry | Skills registry (`skills.lock` rev+sha256), MCP server (~76 tools), `BARKCLI_AGENT_CMD` backend override |

**The bet:** DeepSeek wins on "build your own agent.", T3 wins on "follow one thread beautifully from your phone." **barkcli wins on "run ten intents in parallel and prove what merged."** Every roadmap choice below protects that axis. If a feature doesn't make parallel, gated, auditable delegation better, it's out of scope for the core — ship it as a skill, plugin, or integration instead.

Three sentences to reuse everywhere (README, landing, demos):

1. > barkcli is the management layer for AI agents — intent in, plans out, isolated worktrees, tests as the gate, and a merge train for whatever passes.
2. > Agents write code. barkcli proves it. (guard scans, receipts hash the result, run is done only when `cargo test` / gate passes in the worktree — never on the agent's self-report.)
3. > Your repo is the control plane. No cloud, no accounts, no subscriptions. `*.board` + `.board/` are the truth; `barkcli serve` is just a view.

---

## 2. What Each Competitor Does Best — Steal the Lesson, Not the Product

### 2.1 Against DeepSeek Harness (dsh)

**What dsh does better today (per `ANALYSIS_DEEPSEEK.md`):**

- **First-party agent loop:** turn (`agent/pre-step`, `agent/turn-stopping`) → step (model request + tools) with waterfall interception, cancellation, and `deriveMessages()` replay from the session log. barkcli has *no* first-party loop — it delegates to `opencode` / `claude` / `codex` via `agent/backend.rs` + `BARKCLI_AGENT_CMD`. In a bare CI container with no external CLI installed, `barkcli run` cannot complete a task.
- **Append-only session truth + compaction/spill:** durable `assistant/message` settlements, tool-result pruning, image offload, goal/plan-mode lifecycle. barkcli `threads/` is JSONL with 28+ `ThreadEventKind`s but no compaction, paging, or fork/revert.
- **Capability seams as code:** `ctx.llm`, `ctx.tools`, `ctx.sandbox`, `ctx.sessionProjections` — any capability is a swappable service. barkcli's seam is the `Backend` trait (5 backends) plus an MCP *server* (barkcli exposes tools *to* others) but not an MCP *client + provider registry with model catalogs, usage-limit recovery, and per-project overrides* (T3's adapter matrix is the reference; barkcli lacks catalogs, guided auth, usage limits, multi-instance providers).
- **Multi-surface from one runtime:** `web`, `headless`, `sdk`, `sdk-minimal`, `acp`, Electron — all composed from the same bundle tree. barkcli ships CLI, TUI, axum server + React web, Tauri desktop — but the web `App.tsx` is still a monolith (~1160 LOC) and there is no SDK/ACP surface.

**Lesson for barkcli:** adopt dsh's *discipline* — turn/step framing, interception points, typed event folds, seat-belted sandbox — without becoming a harness. Keep the loop *outside* the core; make the management layer's log replayable and its tools composable.

### 2.2 Against T3 Code

**What T3 does better today (per `ANALYSIS_T3CODE.md`):**

- **Event-sourced orchestration:** client command → pure `Orchestrator` → `EventSink` (one SQLite txn: events + projections + command receipt + outbox) → `EffectWorker` side effects → re-enter as commands. Ack = intent committed; provider completion is a separate milestone. `barkcli run` in `barkcli-core/src/agent/` + `barkcli-core/src/runtime/` approximates this but persistence is file-scattered (`.board/runs/`, `.board/receipts/`, `.board/merge-trains/`) with no single command-receipt/idempotency story and no structured `runtime/trace` that is queryable in the UI.
- **Thread = durable, session = disposable:** fork (`latest_stable | run | checkpoint`), handoff across provider switch, delegate to linked env, pause/compact, guest share. barkcli cards are durable but agent runs are second-class: no fork/revert, no per-thread inspector surfaces (diff/files/terminal/PR), no history paging, no context-handoff service.
- **Inspector as ordered surfaces:** `rightPanelStore` (diff, files, preview, terminal, PR, side-chat) with closed-view memory, proactive open only if the user hasn't acted, and Vercel-grade streaming budgets (no WS spam, virtualized timeline, shallow metadata compare). barkcli web has Board/Orchestrate/Review-queue/Receipt surfaces but no per-run surface deck (gate log, diff, terminal), and no Lighthouse/FMP budget or `WireProjection` equivalent.
- **Provider depth:** model catalogs/manifests, usage limits + reset credits, guided auth (loopback/remote callbacks), maintenance runner, 64 KiB diagnostic log budget. barkcli `runtime/providers.rs` probes versions/auth/capabilities (headless/stream/resume/fork/skills) but has no catalog picker, no usage panel, no guided `auth login` hand-off in the web app.
- **Multi-device / multi-env:** split client (web/desktop/mobile) over shared `client-runtime` + typed `packages/contracts`, env switcher, peer links, relay/tunnel (`/pair`), scheduled tasks, device hub. barkcli has network discovery (desktop) and LAN `serve --daemon`, but no pairing, no scheduled tasks, no peer delegation.

**Lesson for barkcli:** copy T3's *contracts-first, surface-deck, and ack-vs-settled* patterns. Don't copy its single-thread focus — barkcli's value is the fleet view across worktrees.

### 2.3 Against OpenCode / generic CLI agents

OpenCode is the backend barkcli already speaks to; Claude Code / Codex / Cursor / Grok / Antigravity / fx / Pi are the provider zoo. None of them has a local-first management layer: no worktree isolation + gate + merge train, no deterministic guard, no SHA-256 receipt that a third party can verify without trusting the agent, no risk-ranked review queue, no 4-tier memory + living `project_context.md` that is byte-stable on no-op. That is the moat. Do not dilute it by building a second loops-and-tools stack.

---

## 3. Where barkcli Already Wins (Verified, Do Not Regress)

These are the claims you can make in a demo *today* (paths are evidence, not aspirations):

| Moat | Evidence in tree |
|---|---|
| **Worktree isolation + gate + merge train** (not self-report) | `barkcli-core/src/agent/worktree.rs` (acquire/release, slug sanitization, quota 8, auto-prune, shared build cache), `barkcli-core/src/agent/gate.rs`, `barkcli-core/src/runtime/merge_train.rs` (train create/save/load/list), `barkcli-core/src/agent/orchestrate.rs`, `barkcli-core/src/agent/autopilot.rs`; `barkcli run "<intent>" --agents 3 --yes` dispatcher with conflict solo re-run |
| **Trust layer without an LLM in the decision path** | `barkcli-core/src/guard/` (secrets, deps, danger, diff size), `barkcli-core/src/receipt/` (`.board/receipts/`, content hash, `receipt verify`), `barkcli-core/src/review.rs` + `barkcli-core/src/review_risk.rs` (risk-ranked queue). Advisory by default; `"guard": { "block": true }` can block merges. |
| **Specs → requirements → code traceability** | `barkcli-core/src/models/spec.rs`, `barkcli-core/src/storage/specs.rs`, `Card.spec_id`, `barkcli-core/src/models/milestone.rs` + `barkcli-core/src/storage/milestones.rs` (roadmap checkpoint grouping cards/specs/sprints, progress + overdue). Use/extend this; do not let every other surface invent its own planning model. |
| **Collective memory (Git-backed contribution DAG)** | `barkcli-core/src/runtime/contribution.rs`, `barkcli-core/src/brain/`, `barkcli-core/src/runtime/store.rs`; parent edges, independent-reproduction only (self-verify rejected), evidence scores, neglected/contested branches, UCB recommendation. Rebuildable from `.board/runs/`. MCP contribution tools expose it. |
| **Living context that is self-healing and byte-stable** | `barkcli context prime/digest/wire`, `barkcli-core/src/context_file/`, `barkcli-core/src/context/`; `manual="true"` blocks preserved, `No-op digests write nothing`. `barkcli context benchmark` produces first-party token numbers — a metric T3/dsh don't ship. |
| **4-tier memory + hybrid search, local-first** | `barkcli-core/src/memory/{store,tiers,search,ingest,embeddings}.rs` (BM25+TF-IDF hybrid; embeddings optional ONNX behind a feature) |
| **File-is-truth, no DB** | `*.board` YAML (committed) + `.board/**/*.json` + JSONL (gitignored) across `barkcli-core/src/storage/`; `barkcli doctor/validate`, timeline checkpoints/undo/diff/blame, import/export (YAML/JSON). No SQLite, no cloud account, no subscription — the README's "no cloud, no accounts, no subscriptions" claim is literally the storage design. |
| **Broad provider surface via one trait** | `barkcli-core/src/agent/backend.rs` (`opencode`/`claude`/`codex`/`fx`/`human`), `barkcli-core/src/runtime/providers.rs`, `barkcli-core/src/commands/providers.rs`, `BARKCLI_AGENT_CMD` override; capability flags probe-able |
| **MCP server + skills registry + audit trail** | `barkcli-core/src/mcp.rs` (~4213 LOC, ~76 tools), `barkcli-core/src/skills/` (registry, loader, `skills.lock` rev+sha256), receipts + history JSONL |
| **Mind snapshot ("what's happening?")** | `barkcli-core/src/mind/{snapshot,digest}.rs`, `barkcli-core/src/commands/{mind,overview}.rs`; health, blockers, stale, next actions, velocity — T3 has no equivalent "mission control" first screen; DESIGN.md makes Mind the homepage |
| **Six surfaces, one binary** | `barkcli-cli` (CLI) + `barkcli-tui` (ratatui) + `barkcli-server` (axum + WS live reload, `/api/ping`, token auth) + `web/` (React+Vite) + `desktop/` (Tauri v2, `serve --app` sidecar, freshness-verified) + `vscode-extension/` (Custom Editor) |

**Watch-outs that are already handled and must stay handled:** desktop `bundled_web_dist` (bundle truth over project-local `web/dist`), `augmented_path()` (agent bins `~/.opencode/bin`, `~/.local/bin`, Homebrew visible from Finder launches), stale `.board/server-app.pid` cleanup, `switch_project` rollback that reopens the old project if the new one fails to start, thread-preference / sidebar-layout validation in `desktop/src/main.rs` (`write_thread_preference_at`, `durable_thread_key`, 4 MiB cap, `0o600` temp file). These are unglamorous — T3 demos never dramatize them — and they are exactly what "works when you double-click the .app" requires.

---

## 4. The Gaps That Make a Demo Feel Thin vs dsh/T3 (Prioritized)

Not code bugs — *narrative gaps* a user hits in the first 30 minutes.

| # | Gap (vs dsh/T3) | One product sentence a user needs to read | Current state (verified) |
|---|---|---|---|
| G1 | **No "embeddable" story** | "`barkcli run` speaks any agent; `BARKCLI_AGENT_CMD` is the SDK. To run without an installed CLI, point it at your own script or `human`." | Delegation = subprocess, transcript to `.board/`. No first-party loop (by design), but the `human` backend + `BARKCLI_AGENT_CMD` escape hatch are under-documented for "pure-container" runs |
| G2 | **No per-run inspector (gate log / diff / terminal)** | "Every run is a surface deck: gate log, diff, files, terminal — same tab order as the board." | Orchestrate view shows queue + live sessions; `runtime/trace.rs` + `ThreadEvent` have the data, but no right-panel deck per run |
| G3 | **Threads lack fork/revert/paging/compaction** | "`barkcli thread fork <id>`, `thread revert <checkpoint>` — git refs, not magic." | `threads/mod.rs` JSONL, liveness classification (running/stalled/settled/read), `checkpoint` exists (`commands/checkpoint.rs`, `/api/checkpoints`) but is card/board-scoped, not turn-scoped; no paging, no fork service |
| G4 | **Provider depth shallow (no catalog / usage / guided auth)** | "`barkcli providers` tells you what's signed in, what's stale, and what to run to fix it." | Version/auth probe exists (`commands/providers.rs`); `desktop open_provider_login` already opens Terminal for allowlisted commands. Missing: model catalog, usage-limit panel, per-project overrides, multi-instance registry |
| G5 | **Planner exists, scheduler incomplete** | "Blocked-by cards don't dispatch. Capacity is enforced." | `TaskQueue::next_pending` respects task `dependencies`; `Card.blocked_by` and `VelocityTracker` (`agent/capacity.rs`) are wired but not enforced end-to-end (per `ANALYSIS_BARKCLI.md` §4.2) |
| G6 | **Surface monolith + a11y/perf not budgeted** | "Mind answers in 15 seconds. `⌘K` does everything. Loading is measured." | `web/src/App.tsx` ~1160 LOC, ~79 components; `DESIGN.md` is strong but no FMP/Lighthouse budget, no `render-metrics` equivalent, no presence ("who changed what" — Figma's lesson) |
| G7 | **Extensibility: skills, not ports** | "New backend = one `Backend` impl + capabilities manifest. New UI = a skill or an MCP tool." | Skills registry + MCP server is the two seams; no plugin runtime (deliberately deferred in `MANAGEMENT_LAYER_VISION.md`), no ACP/SDK surface |
| G8 | **No scheduled / delegated cross-env work** | "`barkcli schedule` + `barkcli delegate` finish the 2 a.m. agent story." | T3 has scheduled tasks + delegation to linked envs; barkcli has `barkcli run` as the only autonomous loop |

**What to ignore (explicit non-goals for the core):** a built-in model↔tool loop that competes with dsh, mobile as a separate app (responsive web only; iOS stays frozen), remote multi-machine by default (LAN `serve --daemon` stays opt-in), dense embeddings in the default path (keep ONNX optional), and any "AI-vibe" UI chrome DESIGN.md forbids (no sparkles/magic/robot/glow marketing chrome; graphite/T3-inspired minimalism; verbose detail under **Details**).

---

## 5. Five Pillars to Be Best — And How to Prove It

Each pillar is a product bet + a measurable acceptance bar + the smallest slice that proves it. Ship pillars in this order; each is an independent vertical slice (one card, ≤3 days, effort 1–3, per `mvp` skill).

### Pillar 1 — Gated Autonomy (the core loop, end-to-end, boringly reliable)

**Why first:** this is the entire product. If `run` is flaky, nothing else matters.

- Contract (already stated in `AGENTS.md`, keep it): *done = gate passes in the worktree, never the agent's self-report; crashed agent + no changes + no-op gate still fails; failed gate verdict is fed back into the retry prompt and recorded as a memory fact.*
- **Slices:** (a) surface `GET /api/run/live` heartbeats + gate verdict + diff stats in the Orchestrate view (data exists in `runtime/store.rs`, `runtime/trace.rs`, `runtime/runner.rs`); (b) worktree setup tracking (run `cargo fetch`/`npm install` on acquire, record status — cheap, T3's `WorktreeSetupTracker` equivalent); (c) enqueue card-level `blocked_by` into `TaskQueue::next_pending` and enforce `VelocityTracker` capacity — two one-line wiring fixes in `agent/queue.rs` + `agent/orchestrate.rs`.
- **Prove it:** a demo script: `barkcli run "add ping healthcheck" --agents 3 --yes` — three worktrees, two gates pass, one conflicts and re-runs solo, merge train converges. Publish the transcript as `.board/runs/`.

### Pillar 2 — Trust by Default (the moat no harness advertises)

**Why second:** dsh has policy/sandbox; T3 has checkpoints. Neither has *deterministic, verifiable, local-first* receipts a reviewer can audit offline. This is the wedge for teams, enterprises, and YC.

- **Slices:** (a) make `barkcli guard` + `barkcli receipt verify` + `barkcli review next` the *merge default* in the web app: gate panel → guard findings → receipt hash → review queue, one strip, no extra navigation; (b) content-address every merge-train entry (`runtime/merge_train.rs` already persists trains — add head SHA + gate exit code to the train item); (c) add `barkcli receipt publish` that renders the existing Markdown receipt for pasting into a PR (no cloud sync; clipboard-first).
- **Prove it:** an external check: clone, `barkcli receipt verify <id>` on a *second machine* with no agent secret, exit 0. Document it in `docs/`; this is one command T3 cannot match without a server.

### Pillar 3 — Memory + Living Context (token and time economy)

**Why third:** every agent harness bleeds tokens re-learning the repo. barkcli's `project_context.md` is the only auto-maintained, self-healing, byte-stable context file — and `barkcli context benchmark` is a built-in evaluator.

- **Slices:** (a) wire `context benchmark` into CI + `docs/` so the token claim is a number, not a slogan: cold-start vs context-file tokens per repo; (b) promote *decisions* into memory facts on gate failure (already recorded — surface them in Mind as "what changed our mind and why"); (c) keep 4-tier memory BM25+TF-IDF default; ONNX embeddings stay behind `--features embeddings` — do not pay tarball weight for a novelty.
- **Prove it:** publish benchmark numbers per release in `README.md` "Benchmarks & Comparisons" (the anchors already exist — page `landing-next` / docs `compare`).

### Pillar 4 — Fleet Surfaces (management layer, not one thread)

**Why fourth:** T3 wins "one perfect thread." barkcli wins "twelve parallel agents, zero leaked state."

- **Slices:** (a) run inspector deck: per `RunRecord` (provider, branch, head SHA, gate, diff stats, trace spans) — a right-panel with four tabs (gate log | diff | files | terminal) reusing `BoardView`/`KanbanCard` primitives; (b) thread fork/revert at the *checkpoint* level (`commands/checkpoint.rs` + hidden git refs, the T3 `CheckpointStore` pattern, contained to barkcli worktrees — no provider conversation rollback needed); (c) presence on the board ("who/what changed this card last, heartbeat `last_seen` from `ThreadSummary` already exists).
- **Prove it:** 15-second Mind test from DESIGN.md §3: open `barkcli serve` and answer "what's blocked, what's next, who's working on what" without touching a tab. Everything else is Details.

### Pillar 5 — Open Seams (be the layer, not the loop)

**Why fifth:** dsh's superpower is "everything is a plugin." barkcli's equivalent is "every agent is a backend, every capability is an MCP tool."

- **Slices:** (a) finish the MCP surface: resources (board, board dir, mind digest), worktree acquire/list/release, thread events read/append, `provider_status`, `run_live` (`barkcli-core/src/mcp.rs` — 76 tools today; `ANALYSIS_BARKCLI.md` §4.6 enumerates the missing ones); (b) add Cursor / Grok / Antigravity backends as thin `Backend` impls reusing the capability probe (don't fork provider logic per backend — T3's "normalize at adapter" rule); (c) keep `BARKCLI_AGENT_CMD` + `human` as the documented "embed anything" story (script, test double, human operator).
- **Prove it:** an external agent (Cursor/Claude via MCP) can drive barkcli end-to-end: create card → dispatch → gate → receipt, without ever clicking.

---

## 6. Roadmap — Smallest Slices First

*Effort scale: 1 = half-day, 2 = 1 day, 3 = 2–3 days. Each slice is one card, ≤3 days, and ships behind existing flags where possible. No horizontal layers; every slice is a vertical demo.*

### Horizon 0 — 2 weeks: make the loop legible (Pillars 1+2)

| # | Slice | Effort | Acceptance (maps to a test) |
|---|---|---|---|
| H0.1 | Orchestrate live panel: run heartbeats + gate verdict + diff stats from `/api/run/live` | 2 | `GET /api/run/live` returns `status`, `gate`, `diff_stats` during `barkcli run --agents 2`; web Orchestrate shows it without polling-spam |
| H0.2 | Worktree setup tracking (`agent/worktree.rs`): run project setup on acquire, record `ready/failed` | 1 | New worktree reports setup status; failure blocks dispatch with a logged reason |
| H0.3 | Wire `blocked_by` + `VelocityTracker` into scheduler | 1 | Blocked card never dispatches; capacity ceiling ejects lowest-value task to backlog — unit test in `agent/queue.rs` style |
| H0.4 | Guard → receipt → review strip in web workbench (single panel) | 2 | Merging a run shows guard findings + receipt hash + next-review candidate on one surface; `barkcli guard` still advisory unless `block:true` |

### Horizon 1 — 4 weeks: thread + provider depth (Pillars 4+5)

| # | Slice | Effort | Acceptance |
|---|---|---|---|
| H1.1 | Per-run inspector deck (gate log \| diff \| files \| terminal) | 3 | Open any `RunRecord`; gate log and diff are visible without a second app; terminal is persistent per run |
| H1.2 | Thread fork/revert at checkpoint (hidden git ref) | 3 | `barkcli thread revert <checkpoint>` restores files + thread cursor; `git reflog` shows the ref; fork clones thread history |
| H1.3 | MCP resources + worktree/thread/run-live tools | 2 | External MCP client lists resources (`board`, `mind digest`), acquires a worktree, streams run-live, reads receipt — all over stdio |
| H1.4 | Provider depth: model catalog, usage panel, guided auth hand-off | 2 | `barkcli providers` shows version/auth/usage/capabilities; web provider card links to the allowlisted login (`desktop open_provider_login` pattern) |
| H1.5 | TUI Orchestrate + Mind tabs (DESIGN.md §15.2) | 2 | `barkcli tui` tab 7 = Agents, 8 = Orchestrate (already in AGENTS.md); Mind tab mirrors `mind snapshot` |

### Horizon 2 — 6+ weeks: autonomy at scale (Pillars 1+4, strategic)

| # | Slice | Effort | Note |
|---|---|---|---|
| H2.1 | `barkcli run --dry-run / --json` stable contract + `GET /api/run/live` SSE (no WS spam) | 2 | CI can drive `run` programmatically; web streams, not polls |
| H2.2 | Checkpoint/rollback tied to worktrees (turn-level undo/diff) | 3 | Builds on H1.2; revert refuses early if the provider can't roll back (T3's Antigravity trap) |
| H2.3 | `barkcli schedule` + `barkcli delegate` (cron + linked-env) | 3 | T3 parity; local `serve --daemon` stays opt-in, no cloud scheduler |
| H2.4 | App.tsx route split, card-drawer (Retool 3-pane), presence, a11y audit | 3 | DESIGN.md compliance gate: keyboard-first, `⌘K` everything, visible focus, reduced-motion, ≤7 nav items |

**Explicitly later (track, don't build until demanded):** first-party agent loop, native mobile app, plugin runtime (WASM), dense ONNX embeddings in default path, remote multi-machine pairing, desktop auto-update.

---

## 7. Benchmarks — How to Prove "Best" Without a Cloud Benchmark

T3 publishes performance numbers (`test:perf:v2-wire`, `render-metrics.ts`). dsh publishes bundle composition (`--dump-config`). barkcli should publish numbers that map to its moat:

| Claim | Metric (how to measure) | Target for v0.5 |
|---|---|---|
| Parallel, gated autonomy is real | `barkcli run --agents 3` on a toy repo: time-to-merge vs serial, conflict re-run rate | 3× wall-clock vs serial; 0 manual merges |
| Trust is verifiable offline | `barkcli receipt verify` on a fresh clone without agent secret | exit 0, no network |
| Living context saves tokens | `barkcli context benchmark` (already ships) — cold-start vs context-file tokens per repo | 30–60% fewer tokens; publish per release |
| Review is prioritized, not FIFO | Risk-ranked queue precision: top-5 riskiest cards contain the security finding (guard seeded repo) | top-5 hit rate ≥ 80% on the seeded set |
| UI is fast and calm | FCP + input latency (card drag debounced 250 ms, per DESIGN.md), `⌘K` to any action ≤ 2 keystrokes | FCP ≤ 1.5 s local; no continuous repaint (T3 design law) |

Publish these in `README.md` (§ Benchmarks & Comparisons) and on `landing-next/compare`, replacing slogan comparisons with the Sunday-demo script above. The homepage claim stays one sentence; the numbers stay one table.

---

## 8. What Not to Build (Anti-Roadmap)

1. **A first-party coding agent loop.** It competes directly with dsh/OpenCode on their turf, needs a sandbox + compaction + goal system, and makes barkcli a worse management layer. The `Backend` trait + `BARKCLI_AGENT_CMD` already solve "any agent."
2. **A cloud sync or account system.** The moment `*.board` needs a server, "no cloud, no accounts, no subscriptions" dies and the gate+receipt story becomes unfalsifiable. Keep receipts local; share by pasting Markdown.
3. **A mobile app.** Responsive web is enough for the "check the merge train from the couch" story. The frozen `barkcli-ios/` stays frozen.
4. **Plugin runtime / WASM sandbox.** Skills + MCP cover the real use cases (playbooks + tools). Add a third seam only when a user cannot shape what they need with those two.
5. **A provider zoo for its own sake.** Each backend is a week of auth/capability drift. Add Cursor/Grok/Antigravity only as thin adapters over the existing probe; never as a fork.

---

## 9. Appendix — Pointers (for the next agent)

- **Management loop:** `barkcli-core/src/commands/run_cmd.rs`, `barkcli-core/src/agent/orchestrate.rs`, `barkcli-core/src/agent/gate.rs`, `barkcli-core/src/agent/worktree.rs`
- **Trains & runs:** `barkcli-core/src/runtime/merge_train.rs`, `barkcli-core/src/runtime/runner.rs`, `barkcli-core/src/runtime/store.rs`, `barkcli-core/src/runtime/trace.rs`
- **Trust:** `barkcli-core/src/guard/`, `barkcli-core/src/receipt/`, `barkcli-core/src/review*.rs`
- **Planning:** `barkcli-core/src/models/milestone.rs`, `barkcli-core/src/storage/milestones.rs`, `barkcli-core/src/models/spec.rs`, `barkcli-core/src/commands/{plan,intake,monitor}.rs`
- **Memory & context:** `barkcli-core/src/memory/`, `barkcli-core/src/context{,_file}/`, `barkcli-core/src/brain/`, `barkcli-core/src/runtime/contribution.rs`, `barkcli-core/src/mind/`
- **Seams:** `barkcli-core/src/agent/backend.rs`, `barkcli-core/src/mcp.rs`, `barkcli-core/src/skills/`
- **Surfaces:** `barkcli-cli/src/main.rs`, `barkcli-tui/src/`, `barkcli-server/src/lib.rs`, `web/src/App.tsx`, `desktop/src/main.rs`, `vscode-extension/`
- **Design & vision:** `DESIGN.md` (mandatory for web/desktop UI), `MANAGEMENT_LAYER_VISION.md`, `MANAGEMENT_LAYER_PLAN.md`, `UPGRADE_PLAN.md`, `project_context.md` (read first — lives in the worktree root; the `.board/` that hosts worktrees is gitignored in the parent)
- **Reference analyses:** `ANALYSIS_DEEPSEEK.md` (Cordis plugin model, session log, turn/step), `ANALYSIS_T3CODE.md` (event-sourced orchestration, inspector surfaces), `ANALYSIS_BARKCLI.md` (gap analysis P0–P2, now partially landed: milestones and merge train verified present at 0.4.0)

*End of strategy. Next step: pick Horizon 0, one slice at a time, each with its test.*
