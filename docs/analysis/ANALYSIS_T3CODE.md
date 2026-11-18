# T3 Code Analysis

Source: `ref/t3code` (pingdotgg/t3code, ~500k users). Open-source "bring-your-own-subscription" GUI for coding agents. Last reviewed Nov 2026.

## 1. MVP in one sentence

Minimal control surface where a user picks a project + provider, writes a prompt, watches a streaming timeline of thoughts/tools/diffs, and can interrupt, steer, rewind, fork, or delegate — from web / desktop / mobile against any remote server.

Non-negotiables (from AGENTS.md):
1. Open at core (fork-friendly, shared roadmap).
2. Performance without compromise (no WS spam, no GPU-pegging animations, fast lists).
3. Remote-ready (LAN / Tailscale / T3 Connect tunnel, multi-env).
4. Multi-surface (web + app.t3.codes + Electron desktop + React Native mobile).

> "Complexity belongs at the adapter boundary. Orchestration stays pure, UI stays dumb." — taste rule.

## 2. System architecture

```
Client (web/desktop/mobile)
  │  typed WebSocket RPC (Effect RPC) + HTTP for blobs/snapshots
  ▼
Node server (apps/server) — Effect services
  ├─ Orchestrator (pure, no I/O) — serializes commands → events
  ├─ EventSink — 1 SQLite txn: events + projections + command receipt + outbox
  ├─ EffectWorker — runs side effects (provider turns, checkpoints), feeds back as commands
  ├─ Provider adapters — subprocess CLIs → normalized turn-items
  └─ CheckpointStore — hidden git refs for diff/revert
```

Key guarantees:
- Event log is source of truth; projections are read models committed in same txn. Retries idempotent via command receipt.
- Ack = intent committed, NOT provider work finished. Turn completion and finalization are separate milestones (late checkpoint must not extend provider duration / spinner).
- Execution stays in the environment owning the workspace. Remote client never substitutes its FS/creds/machine. Desktop bundles server but renderer obeys same boundary.
- Contracts are the wire boundary: `packages/contracts` (Effect Schema) is imported by server, web, mobile. Schema change → all surfaces follow. Backward compat: forward-compatible unions with unknown-kind fallback, replay-tolerant decoding.
- Server features are services; transports are thin: `ws.ts` / HTTP / MCP tool = decode → call 1 service method → map errors. Agents reach capability via MCP tools; scheduled tasks reuse same service path.

Tech: pnpm monorepo, Vite+ (`vp`), Node 26, TypeScript, Effect + Effect Schema + Effect RPC, SQLite (`statev2.sqlite`), TanStack Router + Zustand + Effect Atom on web, Electron (desktop), React Native/Expo (mobile), Rust resource-monitor, `vp` tooling. Effect services conventions enforced by lint/knip.

## 3. Monorepo layout

| Path | Role |
|---|---|
| `apps/server` | WS server, orch-v2, providers, checkpointing, persistence, git, terminals, PR, MCP, scheduled tasks, relay/peer |
| `apps/web` | React/Vite UI (also served by `npx t3` and app.t3.codes) |
| `apps/desktop` | Electron shell wrapping web + bundling server runner; can host server for remote clients |
| `apps/mobile` | React Native/Expo; connects to any server |
| `apps/marketing` | marketing site |
| `packages/contracts` | Effect/Schema wire contracts + small derived helpers. No heavy logic |
| `packages/client-runtime` | Shared client logic (web+mobile): connection, RPC, state, work-log, PR, threads. Platform supplies storage/creds/network/lifecycle |
| `packages/shared` | Shared runtime utils (subpath exports, no barrel) |
| `packages/provider-*` | Per-driver packages: `provider-core`, `provider-acp`, `provider-muse/opencode/cursor/fx/grok/pi`, `provider-testing` |
| `packages/source-control-*`, `secret-provider-*`, `effect-acp`, `effect-codex-app-server`, `ssh`, `tailscale` | Forge integrations, secrets, ACP/Codex protocol libs, transports |
| `native/resource-monitor`, `evals/`, `docs/internals/`, `.repos/` (vendored read-only refs) | |

## 4. Routing & app shell

Router: TanStack file-based (`routeTree.gen.ts`, `router.ts`). Layout route `/_chat` (`routes/_chat.tsx`) keeps `ChatView` mounted across draft→server promotion and modal overlays (settings/usage render *over* background thread, no remount).

Routes (`apps/web/src/routes/`):
- Thread: `/$environmentId/$threadId` (server thread), `/draft/$draftId` (unsent), `/new`, `/` (index), `/pull-requests`
- Settings (modal over thread): about, access, appearance, archived, chat, connections, devices, diagnostics, diffs, general, integrations, keybindings, providers, projects, scheduled-tasks, secrets, snap-shot, source-control, storage, threads, worktrees, beta, browser, labs, maintenance
- Standalone: `/pair`, `/connect`, `/connect-agent`, `/guest`, `/welcome`, `/projects/$projectKey`

Thread identity everywhere is `ScopedThreadRef { environmentId, threadId }` (`scopeThreadRef` / `scopedThreadKey` in client-runtime). Draft ids survive promotion (`threadRoutes.ts: resolveThreadRouteTarget/Ref`). Guard: `beforeLoad` redirects unauthenticated to `/pair`.

Shell: sidebar (projects/threads, grouping, snooze/pin, search) + main ChatView + right panel + terminal drawer + command palette (`Cmd/Ctrl+K`), `?` shortcuts, `N` new card on board-like view. Desktop adds Electron shell/IPC (updates, snapshot, shortcut portal). Mobile uses separate React Native navigation (`Stack.tsx`) but same runtime.

"Hit every surface" checklist is culture: entry points (chat, settings, palette, keybinding), clients (web/desktop/mobile), providers (6 adapters), agents (MCP), contracts, reverse states (snooze↔unsnooze), connection modes (local/relay/tunnel), docs.

## 5. UI component map

`apps/web/src/components/` (~186 entries) + `components/chat/` (~350 files):

- Essentials: `ChatView.tsx` (1500+ lines orchestrator-component), `ThreadRouteView`, `Sidebar`, `CommandPalette`, `DiffPanel`, `ChatMarkdown`, `BranchToolbar`, `GitActionsControl`, `RightPanelTabs/Sheet`, `ThreadTerminalDrawer`, `UsageToggle`, `TerminalDrawers`.
- Chat: `chat/ChatComposer.tsx` (Tiptap editor, slash commands, mentions, context chips, stash), `MessagesTimeline.tsx`, `ThreadTimeline`, `Timeline*Row.tsx` (assistant/user/work/event), `WorkLog.tsx`, `V2LifecycleRow.tsx`, `V2ItemInspector.tsx`, `QueuedRunsControl`, `ProposedPlanCard`, `ProviderModelPicker`, `ComposerPending*` (approvals, user-input), `ThreadDetailsPanel` (PR rows, usage, automations), `ContextWindowMeter`, `UsageLimitRecoveryBanner`.
- Workbench/inspector evidence, not a separate "workbench" product: center is timeline; right panel is inspector; terminal is persistent drawer; diff is panel surface.
- Primitives: `components/ui/` (shadcn-derived, variant/size owned, lint forbids restyle via className), `AppRouteModal`, `ConfirmDialogHost`, `BackgroundThreadAnnouncer` (a11y).

Design law: derive in render, act in handlers; React effects only for syncing with outside React (lint `no-unreasoned-state-sync`); no continuously repainting animations; visible focus, reduced-motion.

## 6. Thread / session management

Glossary terms: Project (env-local workspace record), Workspace root, Worktree (separate git checkout per thread), Thread (durable conversation + work history, survives provider exits), Turn = one V2 Run (user→agent cycle incl. checkpointing).

Thread model (contracts `orchestrationV2.ts`):
- `OrchestrationV2AppThread`: id, projectId, title, providerInstanceId, modelSelection, runtimeMode, interactionMode, branch, worktreePath, activeProviderThreadId, lineage (parent/root, fork/subagent/sideChat — subagents/sideChats hidden from thread lists), forkedFrom, timestamps, archival/snooze/pin/tags, settledOverride, limitRecovery, guestShare, delegatedFrom/linkOrigin for cross-env delegation.
- Run: ordinal, providerInstanceId, model, providerThreadId, rootNodeId, activeAttempt, status (`preparing|queued|starting|running|waiting|completed|interrupted|failed|cancelled|rolled_back`), workspacePreparation (root|existing_worktree|worktree), checkpointId, contextHandoffId.
- Execution nodes: root_turn, assistant_message, reasoning, plan, todo_list, tool_call, approval_request, user_input_request, subagent, hook, system (tree with parent/root ids, countsForRun).
- Turn items: user_message, assistant_message, reasoning, command_execution, file_change/search, web_search, dynamic_tool, todo_list, proposed_plan, checkpoint, compaction, notification, error, approval/user_input/secret/link requests, fork/handoff, subagent.
- Subagents: `provider_native` (cannot receive messages) vs `app_owned` (T3 delegate_task, can), plus remote-child in linked env. Workflows: phases + agents with token/tool metrics.
- Runtime requests: approval / user_input / dynamic_tool / auth_refresh with responseCapability `live | message | not_resumable`. Codex async questions persist as `user_input_request` with `message` capability — survive restart/turn end.

Client sync:
- Shell snapshot (list) + thread detail (projection) are independent streams (`state/shell.ts`, `threads.ts`, `entities.ts`). Shell may omit idle subagent children / older settled threads (25-newest cut + `olderSettled` counts); detail/subscription decides existence, not shell absence.
- Thread detail: mounted consumers share one live stream (stops on last unmount), 5-min idle cache keeps cursor for back-nav. Desktop keep-alive mounts all running threads.
- Timeline derivation: `session-logic.ts` (~1150 lines) maps `visibleTurnItems` (committed order) interleaved with optimistic/anchored messages → `TimelineEntry[]` (message | proposed-plan | html-render | mcp-app | work | event). Incremental reuse avoids full rebuilds. Revert turn counts derived from checkpoints. Optimistic sends reconcile on ack.
- History paging, bounded snapshots, dedupe of streaming text (metadata-only compare), `threadHistoryController/Merge`, generation-keyed on-demand reads after first authoritative snapshot.

Lifecycle: create (draft → promote), fork (latest_stable | run | checkpoint → native fork or portable handoff), handoff across provider switch, delegate to linked env, archive/snooze/pin/settle, delete, guest share, title regen, idle compaction (`/compact`), goal (`/goal` show/clear/pause/resume/set).

## 7. Agent orchestration (server v2)

Flow: client WS request → command → Orchestrator (pure: serialize, decide events, no I/O) → EventSink (single txn: events + projections + receipt + outbox) → subscribers → EffectWorker → side effects (start provider turn, capture checkpoint) → results re-enter as commands.

Services (~40 in `orchestration-v2/`): `Orchestrator`, `EventStore/Sink`, `ProjectionStore`, `EffectWorker/Outbox`, `ProviderSessionManager`, `ProviderTurnStartService`, `ProviderEventIngestor`, `RunExecution/FinalizationService`, `CheckpointCapture/RollbackService`, `ThreadLaunch/Stop/Fork/ManagementService`, `ThreadSettlementService` (server-owned PR/inactivity settle, merge notifications), `PullRequestSyncReactor`, `ContextHandoffService`, `UsageLimitRecoveryWorker`, `IdleCompactionService`, `WireProjection`, `ThreadStream/ShellStream`.

Steering: queued messages, interrupt, steer-in-place (if adapter supports `supportsActiveSteering`, else interrupt-restart), model switch in session (if supported), runtime-mode/interaction-mode switch, queued-run edit. Settlement is server-owned; clients render persisted result, never derive from local clocks/PR caches.

Persistence: SQLite `statev2.sqlite` under `~/.t3/userdata/` (T3 home). Event store + command receipts + projection tables + migrations. Dev seeds a *copy* (never symlink, never live DB) capped ~500 MiB; `vp run migrate-dev-db` rebuilds.

Tests: event-sourced, drain effect worker / await persisted event or Deferred — no sleep/polling, no wall-clock, `TestClock` for Effect tests.

## 8. Provider system

Abstraction: `ProviderAdapter` at `packages/provider-core/src/server/ProviderAdapter.ts`. "Normalize at adapter, don't branch everywhere." Driver kind = integration; instance = one config/account lifecycle (multi-account isolation). Capabilities advertised per provider (`OrchestrationV2ProviderCapabilities`: sessions, threads, turns, streaming, tools, approvals, planning, subagents, context, checkpointing, identity, runtimePolicy enforcement). UI gates on capabilities; unsupported = "not supported here" per adapter.

Built-ins (`apps/server/src/provider/` + `packages/provider-*`):
- Codex (+ ChatGPT managed auth, handoff to remote env, token broker), Claude Code, Cursor, Grok Build, OpenCode (1.x per-thread server / 2.x one server per instance + per-thread MCP entry), Antigravity (profile isolation, immutable releases + leases, file creds), Pi (RPC mode, user-owned install), fx, plus ACP generic registry + dev `Replay (dev)` provider for free pipeline testing.

Cross-cutting: model catalogs/manifests, usage limits + reset credits, auth (per-instance install/sign-in flows with loopback/remote callbacks), maintenance runner (installer-ownership proof: brew/npm/pnpm/bun/volta; else provider's own updater), diagnostics (64 KiB log budget, redaction, structural summaries).

Notable traps (providers.md): Codex questions → notifications → answer-as-message; Codex `/goal` multi-turn runs; Antigravity can checkpoint but cannot roll back conversation → revert must reject before touching FS; file attachments vs image-only client replay compat.

## 9. Workbench / inspector patterns

No separate workbench — inspector is composable surfaces around the timeline:

- **Right panel** (`rightPanelStore.ts`, ~1250 lines, Zustand persisted to localStorage, versioned+migrated): per-thread tab list. Kinds: `diff`, `files`, `file:<path>`, `preview` (browser), `device`, `terminal:<id>` (split/h/v), `pull-request:<…>`, `pull-requests`, `side-chat:<id>`. Features: maximize, inline/popover presentations, proactive diff/PR open (refused if user acted since offer), browser/file reconciliation (close surfaces when session/workspace gone), closed-view memory (remember tab, reopen shortcut), side-chat hosts panel in parent.
- **Diff**: `DiffPanel` + per-turn diff from checkpoints (`checkpointDiff.ts`), branch scope, file tree, open-in-editor.
- **Preview**: browser tabs (local + server browser), mini-player when panel closed, annotations, local-server discovery.
- **Terminal**: persistent per-thread terminals (PTY), split panes, attach/observe, metadata stream, drawer + panel surface.
- **Files**: explorer + file viewer with line reveal, attachment handoff (blob→server URL), drag-drop from workspace/sidebar.
- **PR inspector**: summary/guide/timeline/code tabs, checks, review guide, comments/resolution/reactions, stack layers, link/unlink to threads.
- **Item inspector**: `V2ItemInspector` for turn-item detail; `CommandOutputPanel`, `ChangedFilesTree`, HTML render + MCP app frames.
- **Composer context**: typed chips (`t3-context://`), file/terminal/thread/image references, prompt stash, model/effort/speed pickers, fanout multi-model send.

## 10. State management

Three layers, deliberately separated:

1. **Server (durable)**: Event log + projections + receipts (SQLite). Only owner of truth. Effect services (`Context.Service` + `Layer`), transports thin.
2. **Client-runtime (shared domain state)**: `packages/client-runtime/src/state/` (~160 files): `shell.ts`, `threads.ts`, `thread-execution.ts` (run/runtime derivation), `threadHistoryController`, `entities.ts`, `connections.ts`, `session.ts` (scoped by environment), `orchestrationV2Projection`, `terminalSession`, `pullRequests`, `review`, `archived/snoozed/settled`, `subagentRuntime`, plus `operations/`, `connection/supervisor+registry`, `rpc/session+client`, `authorization`.
   - Connection supervisor: single retry owner per env (jittered backoff ≤5 min, probes on foreground/network/explicit retry, probes distinguish dead socket vs alive-but-slow VPN/DERP).
   - Atoms: `@effect/atom-react` (`appAtomRegistry`, `useAtomCommand`, `useOrchestrationCommand`, `createEnvironmentRpcCommand`, `CLIENT_GUARDED_RPC_SCOPES` + `permissionAtom` for UI availability; server re-checks grants against destination env).
3. **Web UI (ephemeral)**: ~60 Zustand stores + colocated logic: `rightPanelStore`, `composerDraftStore`, `diffPanelStore`, `threadSelectionStore`, `previewStateStore`, `promptStashStore`, `closedViewStore`, `uiStateStore`, `browserHistoryStore`. Persisted via `localStorage` (JSON, versioned migrations, partialize). Server state is never mirrored into Zustand beyond projection hooks (`useQuietThread*` avoid re-render storms).

Performance discipline: shell excludes heavy history; per-thread streams, not broadcast; streaming updates do in-place rerender (shallow/Equal on item metadata only); virtualized timeline (LegendList); incremental timeline derivation; no CSS GPU loops. Backed by `test:perf:v2-wire`, `render-metrics.ts`, `WireProjection`/`ThreadTransportPerformance` tests.

AuthZ: socket auth ≠ method auth. Scopes per RPC method (`CLIENT_GUARDED_RPC_SCOPES`), `RuntimeMode` (permission policy) vs `InteractionMode` (plan etc.), environment auth, peer links, MCP client access.

## 11. Features inventory (beyond core chat)

Timeline: messages, reasoning, tool activity, todos, proposed plans, checkpoints/diffs, errors with retry, usage limits, compaction, goal, workflow runs, native child work dialog, subagent bar, citations (assistant text → composer), thread find/highlight, history paging.

Collab/infra: multi-env with env switcher, peer links + delegation across envs, guest share (read-only link + pending messages), relay/tunnel (T3 Connect), pairing (`/pair`), device hub (iOS/Android device control, EAS), scheduled tasks + webhooks, usage dashboard, provider updates, server self-update, storage cleanup, resource telemetry + diagnostics triage, keybindings editor, themes (VS Code import), onboarding, projects (clone/publish, worktrees, scripts), source control (GitHub/GitLab/Bitbucket/Azure DevOps/Forgejo/GitCafe), PR stack review, review guides, secrets (1Password etc.), ACP registry search/install, skills search, MCP apps, HTML render, browser import, agent sessions scan/import, outside agents via MCP.

## 12. What maps cleanly to barkcli

| t3code pattern | barkcli insight |
|---|---|
| Event-sourced orchestration (command→event→projection→effect) | `barkcli run` gate semantics are similar (intent→plan→worktree→gate→merge); adopt receipt+outbox so retry-after-crash is idempotent, and separate "accepted" from "gate passed". |
| Thread = durable, session = disposable | Keep board cards durable; treat worktree/agent process as resumable session, not card lifetime. |
| Checkpoint = hidden git ref, revert = fs + conversation coordinated | Reuse for turn-level undo/diff in barkcli worktrees; reject revert early if provider can't roll back. |
| Provider adapter + capability matrix | barkcli backends (`opencode`/`claude`/`codex`, `BARKCLI_AGENT_CMD`) should declare capabilities (steer? fork? subagents?) instead of if-chains. |
| Inspector as ordered surfaces (diff/files/terminal/PR) | barkcli web board could add per-card right-panel surfaces (gate log, diff, terminal) with same lifecycle (proactive open, closed-view memory) rather than modal pages. |
| Shared `client-runtime` | If barkcli grows mobile/desktop, extract non-UI connection/state logic from web now. |
| Thin transports, service-owned features | CLI/MCP/web all call same service methods so agents/scheduled runs get parity. |

## 13. Key file pointers

- Architecture: `docs/internals/overview.md`, `glossary.md`, `providers.md`, `connection-runtime.md`, `effect-services.md`; entry: `AGENTS.md`, `README.md`
- Contracts: `packages/contracts/src/orchestrationV2.ts`, `rpc.ts`, `provider.ts`, `providerInstance.ts`, `checkpointDiff.ts`, `threadPullRequest.ts`, `composerContext.ts`
- Server: `apps/server/src/ws.ts`, `orchestration-v2/Orchestrator.ts|EventSink.ts|EffectWorker.ts|RuntimeLayer`, `provider/*`, `checkpointing/`, `persistence/`, `mcp/`, `scheduledTasks/`
- Web: `apps/web/src/routes/_chat*.tsx`, `threadRoutes.ts`, `components/ChatView.tsx`, `session-logic.ts`, `rightPanelStore.ts`, `components/chat/` (~350 files), `components/ui/`
- Runtime: `packages/client-runtime/src/connection/`, `state/`, `rpc/`, `operations/`
- Mobile/desktop: `apps/mobile/src/`, `apps/desktop/src/`

---
*Generated from static analysis of ref/t3code; line counts approximate. See source for definitive behavior.*
