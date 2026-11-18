# DeepSeek Harness (dsh) - MVP & Architecture Analysis

**Reference:** `ref/deepseek-harness/` (git ref `deepseek-harness`)  
**Version:** 0.2.2-rc.1  
**License:** MIT  
**Architecture:** Everything-is-a-plugin built on [Cordis](https://github.com/cordiverse/cordis)

## 1) Overview & MVP Scope

DeepSeek Harness (`dsh`) is an open-source agent harness for building and running AI coding agents. It provides:
- **Multi-interface execution**: Web UI (`web` profile), CLI/headless runner (`headless`), SDK JSON-RPC server (`sdk`/`sdk-minimal`), ACP server (`acp`), and Electron desktop app
- **Plugin-composable runtime**: Everything is a plugin; profiles/bundles compose the full system
- **Agent orchestration**: Turn/step agent loop with subagents, agent teams, tasks/planning, goals
- **Tool ecosystem**: Rich built-in tools (bash/pwsh, fs, search, jobs, skills, web, MCP) with policy/sandboxing
- **Session-centric model**: Append-only session log is the source of truth for model context and replay

The MVP is a general-purpose coding agent harness with extensibility as a first-class concern.

## 2) Plugin System Architecture

### Core Concepts (Cordis-based)
- **Plugins** are units that contribute services, typed events, and reversible effects to shared context
- **No privileged core** - extend by mounting plugins; registrations unwind on unload
- **HMR support**: `dsh-base` enables config-only HMR; headless/sdk/acp disable; configurable via profile patches

### Profiles & Bundles
- **Profile**: Named composition stored in Harness home. Lists ordered bundles, out-of-tree plugins, and user's `cordis.patch.yml`
- Shipped profiles: `web`, `headless`, `sdk`, `sdk-minimal`, `acp`, `plugin` (management)
- **Bundle**: Distribution format for Cordis config rows + code; patchable by higher layers
- Bundle metadata in `package.json` under `dsh.bundle.patch` or `dsh.profile` 
- **Layer precedence** (empty entry list): profile's ordered bundles → profile's `cordis.patch.yml` → home patch → `--patch` overlays; `preset` patches apply inside declaration's `config.plugins`

Key bundles: `dsh-base` (shared core for web/headless/sdk/acp), `dsh-web-app` (browser app), `dsh-headless`, `dsh-sdk-app`, `dsh-acp-app`, `dsh-sdk-minimal` (standalone bundle owning full tree).

### Composition & Loading
- Launch via named profiles (`dsh --profile web` or `dsh web`); CLI entry in `apps/cli` wires everything
- Plugin Manager (`@deepseek-ai/dsh-plugin-manager`) available in Web and agents
- Config inspection: `dsh --profile web --dump-config` shows the full tree
- Custom composition via profile + ordered patch files (not arbitrary inline trees except through patches)
- Python SDK uses same architecture, launching `dsh --profile sdk` with controlled profile/patch selection

### Extensibility Points
- Add services via plugin registration on `ctx`
- Intercept via events (agent/*, tools/*, session/*, capability seams)
- Replace capabilities by providing different service providers
- Scope registrations to specific agents via `agent.ctx` / scope primitives

## 3) Agent Runtime

### Core Components
- **`@deepseek-ai/dsh-agent`**: Agent interface, live registry, `agent/*` events, model selection projection, runtime types
- **`@deepseek-ai/dsh-agent-loop`**: Default driver implementing Agent interface; manages turn/step flow, inbox, retries, cancellation
- **`@deepseek-ai/dsh-scope`**: Per-agent scoped registration primitive
- **`@deepseek-ai/dsh-system-prompt`**: Prompt assembly from sections + tool schemas

### Turn/Step Flow
A **step** = one model request + tools it calls. A **turn** = zero or more steps (opens on first input claim, closes when nothing owed).

Flow (from architecture):
```
turn/start
  claim next-step input + queued message
  snapshot Session model selection; assemble prompt sections + step-admitted tool schemas
  -> agent/pre-step (can accept/rewrite/reject; reject/empty closes turn with no step)
  step/start
  agent/request (adjust controls, doesn't change provider/model/effort)
  prepareCall() binds adapter before committing system/users
  append entered messages as user/message; reconcile runtime context
  log request/header/context as needed
  freeze model history from log
  stream bound call -> llm/stream -> agent/assistant-stream (start/chunk/end)
    assistant/message | assistant/attempt -> agent/assistant-stream end
  tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
  step/end
  if tools owe request or next input arrived -> claim -> next step
-> agent/turn-stopping (serial, no next())
turn/end
```

Key behaviors:
- **Durable events**: `turn/*`, `step/*`, `system/message`, `user/message`, `assistant/message`, `assistant/attempt`, `tool/*` go to session log
- **Live events**: `agent/*`, `llm/stream`, `agent/assistant-stream` are process-local/ephemeral
- **Agent events** are waterfalls for interception (`agent/pre-step`, `agent/request`, `llm/stream`, `tools/*` all require `next()`); `agent/turn-stopping` is serial with no `next()`
- **Model history** derived from session log via `deriveMessages()`; `assistant/message` embeds the exact compact timed stream
- **Retries** don't repeat assembly/pre-step; request series tracked (fresh request/header on series/change)
- **Cancellation** is live; prepareCall commits neither system nor users on cancellation
- **Failed steps** record missing tool results

### Agent Lifecycle
- AgentLoop rolls back failed init, awaits serial `agent/created` before queued work
- Unload retains resources through teardown
- One inbox feeds driver; injected context waits for waking message
- `AgentRegistry` exposes turn/step state; fork via `ctx.agents.create({ sessionId, seed, inheritedEventCount, meta:{isSeeded:true} })` (only agent-loop-published sessions persist)

## 4) UI/UX Patterns

### Architecture
- **Client-side Cordis**: UI built as Cordis plugins (`packages/client/ui-*`) - e.g. `ui-chat`, `ui-conversation`, `ui-agent-preset`, `ui-agent-team`, `ui-commands`, `ui-approval`, etc.
- **Web app shell**: `apps/web` uses Vite; entry loads via `@deepseek-ai/dsh-client-web` (`AppWebEntry`). Desktop uses Electron with shared web runtime
- **Boot flow**: Mount point → boot page/loader → activate client plugins after audit accepts client plugin tree → dynamic UI renderers mount
- **Transport**: Web owns RPC/streams; desktop carrier connects local page to authenticated Host via Node IPC

### UI Organization
Client packages follow `ui-*` pattern for features:
- **Chat/Conversation**: `ui-chat`, `ui-conversation` - chat settings, transcript view modes, submission settings
- **Agent controls**: `ui-agent-preset`, `ui-agent-team` - agent configuration/presentation
- **Interaction**: `ui-approval`, `ui-ask-user`, commands, context menus
- **Content**: `ui-attachment`, `ui-deliverables`, file actions/drag
- **System**: `ui-commands`, `ui-dockkit`, `ui-entry-customization`, `ui-settings` (via settings integration)

### Patterns
- **Plugin-driven UI**: Features register UI components/behaviors through client Cordis plugins
- **Settings integration**: UI preferences projected via `ctx.settings`; e.g. chat settings (transcript view, collapse timing, folded replies, performance usage, link opening)
- **Boot with progress**: Startup page shows progress during activation
- **Desktop/native integration**: Directory pickers have browse/native variants; platform-specific behaviors
- **Theming/Branding**: `ui-brand-official`, brand fonts loaded in web entry
- **Modular feature sets**: UI composed from many small plugins, similar to backend

## 5) Task Management

### Plan Mode
- `@deepseek-ai/dsh-plan-mode` (package in bundle/base) - structured planning capabilities
- Tool: `@deepseek-ai/dsh-tool-goal` and goal system (`@deepseek-ai/dsh-goal`, `dsh-goal-round-driver`)

### Goals
- `@deepseek-ai/dsh-goal` manages same-session objectives
- Continues through `agent/*` events
- Goal-related commands/tools integrated into runtime

### Todos
- `@deepseek-ai/dsh-tool-todo` provides todo/task tracking tools for agents

### Agent Teams (Orchestration/Task Management)
- **`@deepseek-ai/dsh-agent-team`**: Shared task DAG and change waits for subagent trees
- **`@deepseek-ai/dsh-tool-agent-team`**: Tools for agent team operations
- Enables coordinated multi-agent work with task dependencies and synchronization
- Architecture notes say "Agent Teams adds task policy and a shared task board when enabled for a root Session"

### Subagents
- **`@deepseek-ai/dsh-subagent`** core + multiple implementations:
  - `subagent-fork-in-process` - fork within same process
  - `subagent-spawn-in-process` - spawn in-process
  - `subagent-acp`, `subagent-claude-code`, `subagent-codex`, `subagent-dsh-sdk` - external/adopted agents
- **Tools**: `dsh-tool-subagent`, `dsh-tool-subagent-control`
- Subagent Activations own runtime tree membership
- Controls own identity, messaging, discovery, interruption, inbox waiting

## 6) Orchestration

### Multi-Agent Coordination
- **Agent Teams** provide task DAG, change waits, shared task board for subagent trees
- **Subagent system** supports different execution models (fork/spawn/in-process/external)
- **Agent registry/loop** coordinates live agents, inboxes, turn boundaries
- **Session tree/forking**: Fork at turn boundary creates new agent/session relationships

### Execution Modes
- **Parallel tool calls**: Configurable `maxParallelToolCalls` (default from constants)
- **Step/turn structure** allows multi-step reasoning with tool use
- **Compaction**: `@deepseek-ai/dsh-compaction-basic`, `dsh-compaction-tool-result-pruner`, `dsh-compaction-image-offload` manage context
- **PTC runtime**: `@deepseek-ai/dsh-ptc-runtime-node` for programmatic tool calling / advanced execution patterns

### Orchestration Surfaces
- Profiles/bundles compose different orchestrators (agent-loop is default)
- Events allow interception and custom orchestration logic
- Jobs system (`@deepseek-ai/dsh-jobs-local`, `dsh-tool-jobs`) for background work

## 7) Provider/Model Handling

### LLM Abstraction
- **`@deepseek-ai/dsh-llm`**: Provider-neutral interface - message/stream vocabulary, adapter seam, brand/metadata
- Adapters register on `ctx.llm`; adding provider = register adapter
- **Model selection** tracked per session/agent; snapshots in `agent/pre-step`, retries retain selection
- **Reasoning effort**: `ReasoningEffortId` with adapter defaults if omitted

### Supported Providers (in bundle/base)
- `@deepseek-ai/dsh-llm-deepseek-api-key`, `@deepseek-ai/dsh-llm-deepseek-account` - DeepSeek
- `@deepseek-ai/dsh-llm-pi-ai` - Pi/other providers
- `@deepseek-ai/dsh-llm-retry` - retry logic
- `@deepseek-ai/dsh-deepseek-llm-api-extensions` - DeepSeek-specific extensions
- `@deepseek-ai/dsh-deepseek-account-platform` - account/platform integration

### Request/Stream Handling
- **Prepare call** binds adapter before committing system/users
- **Streaming**: `llm/stream` events, `agent/assistant-stream` frames (start/chunk/end)
- **Assistant settlement**: Complete compact stream committed as one message or log-only attempt before end frame
- **Model history freeze** derived from session log before streaming
- **Token metering**: `@deepseek-ai/dsh-token-meter`
- **Session title generation**: `@deepseek-ai/dsh-session-title`, `dsh-session-title-first-prompt-llm` with sole `ctx.sessionTitle` provider

## 8) MCP Integration

### MCP Client (`@deepseek-ai/dsh-mcp-client`, in packages/mcp/mcp-client)
- **Purpose**: Connect to external MCP servers and register tools on `ctx.tools` as `mcp__<serverName>__<rawName>`
- **Transports**: `stdio` (spawn child process) and `streamable-http` (HTTP/SSE)
- **Features**:
  - Namespace reservation per registration scope (agent-scoped servers can reuse namespaces across agents; duplicates in same agent/global conflict)
  - Reconnection with configurable policy (defaults via `RECONNECT_DEFAULTS`)
  - Timeouts: `toolCallTimeoutMs`, `startupTimeoutMs`, `closeTimeoutMs`
  - Template expansion for credentials/headers (`${credential:...}`) with redaction
  - `failOnStartupError` controls activation failure
  - Server instructions captured (byte-limited)
  - Tool/resource sync on connect; status tracking via `connectionStatusOf()`
  - HMR-safe (dispose old instance, recreate)
- **Lifecycle**: Effect-scoped disposal disconnects, unregisters tools, releases namespace
- **Types/exports**: Config schemas, connection status, probe, templates

### MCP Ecosystem
- `@deepseek-ai/dsh-mcp-manager` - manages MCP server instances/composition
- `@deepseek-ai/dsh-mcp-resources` - MCP resources handling
- Experimental MCP integrations: browser-use with Chrome DevTools/playwright, computer-use CUA driver

### Integration Pattern
MCP tools become first-class tools in the registry - go through same tool pipeline (`tools/pre-execute`, `tools/execute`, `tools/post-execute`), subject to permissions/policy.

## 9) Terminal Integration

### Terminal Core
- **`@deepseek-ai/dsh-terminal`** - Terminal backend interface/registry
- **`@deepseek-ai/dsh-terminal-bash`** - Persistent shell PTY backend (shared with pwsh patterns)
- **`@deepseek-ai/dsh-tool-bash`**, **`@deepseek-ai/dsh-tool-bash-persistent`** - Bash tools
- **`@deepseek-ai/dsh-tool-pwsh`**, **`@deepseek-ai/dsh-tool-pwsh-persistent`** - PowerShell tools
- **`@deepseek-ai/dsh-pwsh-local`** - pwsh support
- **`@deepseek-ai/dsh-tmux-context`** - tmux integration

### Features
- **Persistent PTY sessions** via subprocess terminal primitive
- **Shell dialects**: bash and pwsh with tailored prompt/setup
- **Sandbox integration**: Respects `ctx.sandbox` policy; confine args when not in danger-full-access mode
- **Working directory integration**: Uses `@deepseek-ai/dsh-working-directory`
- **Session management**: Controlled prompts with OSC markers for readiness detection; bounded output
- **Environment setup**: Sets `TERM=dumb`, `DSH_SESSION_ID`, `DSH_PTY_SESSION_ID`, custom prompts
- **Concurrency/safety**: Sandbox mode fence prevents changing sandbox mode while terminals open; startup timeouts/readiness checks

### Execution Model
Shell execution goes through `ctx.shell` backend registered by terminal plugins; terminals integrate with the same policy/sandboxing as other process execution.

## 10) Session & Persistence

### Session Log (Source of Truth)
- **`@deepseek-ai/dsh-session`**: Append-only `SessionEvent` log, in-memory store
- **`deriveMessages()`** projects model history from log
- **Session events** are durable facts; live events are ephemeral
- **Format/versioning**: JSONL v0 (`session.jsonl[.zstd]`), v1+ (`session.vN.jsonl[.zstd]`); migrations between versions, generation selection
- **Projections**: `@deepseek-ai/dsh-session-projection` with `ctx.sessionProjections` - registered units fold events, carriers read views via `snapshot()`

### Persistence
- **`@deepseek-ai/dsh-session-persistence`** interface
- **`@deepseek-ai/dsh-session-persistence-jsonl`** implementation
- Fork/resume, transcripts, telemetry derive from durable settlements

### Other Session Features
- **Working directories**: `@deepseek-ai/dsh-working-directory` provides user context/execution paths without changing project identity
- **Session query**: `@deepseek-ai/dsh-session-query-sqlite` for querying
- **Compaction**: manages long sessions

## 11) Key Patterns & Design Principles

- **Everything is a plugin**: Extensibility without forking core
- **Cordis framework**: Service/context model, lifecycle management, events
- **Layered composition**: Profiles + bundles + patches enable flexible deployment modes
- **Event-driven architecture**: Three domains (session durable, agent live, capability seams)
- **Policy-first**: Sandbox, permissions, approval integrated throughout
- **Tool-centric**: All capabilities exposed as tools or services through unified registry
- **Session-centric**: Full history in log enables replay, forking, analysis
- **Multi-modal interfaces**: Same runtime powers web/CLI/SDK/ACP/desktop
- **Provider-agnostic**: LLM adapters behind clean interface

## 12) Quick Reference - Key Packages

| Area | Key Packages |
|------|--------------|
| CLI/App Entry | `apps/cli` (@deepseek-ai/dsh), `apps/web`, `apps/desktop`, `apps/desktop-host` |
| Plugin System | `@deepseek-ai/dsh-app-boot`, `@deepseek-ai/dsh-base`, bundles (`dsh-web-app`, `dsh-headless`, `dsh-sdk-app`, `dsh-acp-app`) |
| Agent Runtime | `@deepseek-ai/dsh-agent`, `@deepseek-ai/dsh-agent-loop`, `@deepseek-ai/dsh-scope` |
| Tools | `@deepseek-ai/dsh-tools`, `dsh-tool-bash/pwsh/fs/search/agent-team/subagent/todo/goal/jobs/skill` |
| LLM/Providers | `@deepseek-ai/dsh-llm`, `dsh-llm-deepseek-*`, `dsh-llm-pi-ai`, `dsh-llm-retry` |
| MCP | `@deepseek-ai/dsh-mcp-client`, `@deepseek-ai/dsh-mcp-manager`, `@deepseek-ai/dsh-mcp-resources` |
| Terminal | `@deepseek-ai/dsh-terminal`, `@deepseek-ai/dsh-terminal-bash`, `dsh-tool-bash/pwsh(-persistent)` |
| Orchestration | `@deepseek-ai/dsh-agent-team`, `@deepseek-ai/dsh-subagent*`, `@deepseek-ai/dsh-plan-mode`, `@deepseek-ai/dsh-goal` |
| Session/Persistence | `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-session-persistence-jsonl`, `@deepseek-ai/dsh-session-projection` |
| UI (Client) | `@deepseek-ai/dsh-client-web`, `@deepseek-ai/dsh-client-ui-chat`, `@deepseek-ai/dsh-client-ui-conversation`, many `ui-*` packages |
| Web Features | `packages/web/*` (tool-web, web-search-deepseek, web-fetch-http, etc.) |

## Actionable Insights for barkcli

- **Plugin architecture is powerful**: Consider adopting Cordis-style plugin model for extensibility; everything composable via bundles/profiles
- **Session log as source of truth**: Append-only event log enables replay, forking, debugging - valuable pattern
- **Event waterfall model**: Clear interception points (`agent/pre-step`, `tools/*`, etc.) with `next()` delegation is flexible
- **Turn/step abstraction**: Clean separation between turns (conversation units) and steps (model requests+tools) 
- **MCP integration is first-class**: Tool registration pattern `mcp__<server>__<tool>` is clean namespace management
- **Terminal as backend**: Persistent PTY with sandbox integration and readiness detection is robust
- **Agent teams + subagents**: DAG-based task management with change waits is sophisticated orchestration
- **Profile/bundle composition**: Enables multiple deployment modes from same codebase (web/CLI/SDK/desktop)
- **Client/server both Cordis**: Consistent mental model across frontend/backend
- **Policy/sandbox integrated early**: Security considerations built into execution model
