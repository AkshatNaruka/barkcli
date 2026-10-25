# Project: barkcli-ios — Modern iOS Client for barkcli

## Architecture
`barkcli-ios` is a modern, native iOS 17+ client inspired by Codex and t3codes that interfaces with `barkcli` — the management layer for AI agents.

### Package & Module Structure (`barkcli-ios/Sources/Barkcli/`)
1. **Models**: Pure Swift `Codable`, `Sendable`, `Identifiable`, `Hashable` data structures mirroring `barkcli-core` and `barkcli-server`:
   - `Board`, `Column`, `Card`, `Priority`, `Effort`, `CardComment`, `ChecklistItem`
   - `AgentItem`, `AgentRole`, `AgentStatus`, `TaskRequest`, `TaskStatus`, `TaskResult`, `LiveSession`
   - `SpecItem`, `Requirement`, `SpecStatus`, `ReqStatus`, `CoverageReport`
   - `GitCommit`, `GitDiff`, `CommitBundle`, `BundleStatus`
   - `MindSnapshot`, `AutopilotStatus`, `AutopilotPhase`, `PlanProposal`, `ProposedSlice`
   - `MemoryEntry`, `MemoryTier`, `ProjectFact`
   - `WorkspaceConfig`, `ConnectionState`, `ConnectionMode`
2. **Services**:
   - `APIClientProtocol`: Uniform async interface for all backend and mock operations.
   - `LiveAPIClient`: URLSession HTTP client with bearer auth, SSE/WebSocket streaming, and JSON decode.
   - `MockAPIClient`: Stateful in-memory mock engine backed by `DemoStore`.
   - `NetworkDiscoveryService`: Bonjour/mDNS service browser (`_barkcli._tcp`) and subnet probe for daemon port 4321.
   - `NetworkMonitor`: NWPathMonitor wrapper reporting live/cellular/offline connectivity states.
3. **Theme & Design System** (Codex & t3codes Aesthetics):
   - `BarkcliColors`: Obsidian Dark canvas (`#0A0A0E`), Space Black surfaces (`#12131A`), Slate Glass cards (`#181924`), Electric Violet (`#8B5CF6`), Cyber Cyan (`#06B6D4`), Amber pulse (`#F59E0B`), Emerald gate (`#10B981`), Crimson blocker (`#EF4444`).
   - `BarkcliTypography`: Monospace SF Mono tokens for hashes, paths, and metrics; crisp hierarchy for titles and badges.
   - `LiquidGlassModifier`: Translucent `.ultraThinMaterial` / `.glassEffect` with hairline borders and subtle glows.
   - Reusable components: `GlassCard`, `StatusBadge`, `MetricTile`, `ActionButton`, `SectionHeader`.
4. **Observable State Stores** (iOS 17 `@Observable`):
   - `WorkspaceStore`: Active workspace, connection state, discovery list, auto-init trigger.
   - `MindStore`: Project mind snapshot, velocity, attention feed, active autopilot phase.
   - `BoardStore`: Board list, columns, interactive cards, drag-and-drop, filtering, WIP badges.
   - `OrchestrationStore`: Fleet registry, task queue, live agent worktree runs, cycle execution.
   - `SpecsStore`: Traceability matrix, requirement status dots, test/code links.
   - `GitStore`: Branch commits DAG, diff inspector, commit-to-agent task assignment.
5. **SwiftUI Views & Presentation**:
   - `RootView`: Adaptive `NavigationSplitView` on iPadOS/macOS and floating liquid glass `TabView` on iOS.
   - `MindDashboardView`: Central command deck with health indicators, autopilot phase banner, live agent rail.
   - `KanbanBoardView`: Multi-column board with interactive cards, swipe actions, filters, and detail inspector.
   - `AgentsOrchestrationView`: Fleet control, live runner sessions, task queue, and cycle trigger.
   - `SpecsMatrixView`: Traceability matrix with coverage progress, requirement dots, and code chips.
   - `GitHistoryView`: Commit topology, additions/deletions, Codex diff modal, and task assignment CTA.
   - `IntentBar` & `PlanProposalSheet`: Floating prompt capsule and decomposed plan review/approval sheet.
   - `WorkspaceSwitcherView` & `AutoInitView`: Local/remote/offline selector, daemon discovery, and auto-setup trigger.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Serde & Model Parity | Codable Swift models for Board, Card, Agent, Task, Spec, Git, Mind, Autopilot | M1 | Survey 1, Survey 3 |
| 2 | Bundled Sample Workspaces | Rich offline dataset (dev board with 15+ cards, roadmap board, 5 agents, specs, commits, memories) | M1 | Survey 3, R3 |
| 3 | Stateful Mock API Engine | In-memory `MockAPIClient` and `DemoStore` supporting card moves, intent intake, plan proposals, and cycles | M1 | Survey 3, R3 |
| 4 | Uniform API Client Protocol | `APIClientProtocol` abstraction allowing seamless switching between live daemon and offline demo | M2 | Survey 1, Survey 3 |
| 5 | Live HTTP & WebSocket Client | URLSession client for `/api/*` and `/ws` with token authentication and error recovery | M2 | Survey 1, R1 |
| 6 | Daemon Discovery & Health Check | Bonjour mDNS scanner (`_barkcli._tcp`) and subnet probe on port 4321 with latency tracking | M2 | Survey 1, Survey 3, R1 |
| 7 | Workspace Auto-Initialization | Detect missing `.board/` and trigger remote or local auto-setup flow | M2 | Survey 1, R1 |
| 8 | Codex Dark-Mode Theme Tokens | Obsidian dark palette, hairline borders, accent glows, and SF Mono developer typography | M3 | Survey 2, R2 |
| 9 | Liquid Glass UI Modifiers | Translucent materials, frosted glass navigation bars, and glowing interactive cards | M3 | Survey 2, R2 |
| 10 | Dynamic Mind Dashboard | Central command deck with stats, blockers, stale cards, autopilot status, and live agent rail | M3 | Survey 2, AGENTS.md |
| 11 | Interactive Kanban Board View | Multi-column board with swipe actions, WIP limits, effort chips, checklists, and filtering | M3 | Survey 2, R2 |
| 12 | Card Detail & Inspector Sheet | Full card modal with history, comments, spec links, and blocked-by dependency links | M3 | Survey 2, R2 |
| 13 | Agents Fleet Orchestration View | Registered agent cards, status indicators, cycle triggering, and task queue filtering | M4 | Survey 2, AGENTS.md |
| 14 | Real-time Runner Sessions | Live view of active agent worktree runs (`/api/run/live`) with branch, tests gate status, and logs | M4 | Survey 2, R4 |
| 15 | Specs Matrix & Traceability | Requirement checklist, coverage bar, status dots (pending/progress/verified/failed), code links | M4 | Survey 2, R2 |
| 16 | Git History & Codex Diff View | Commit DAG stream, additions/deletions, color-coded diff inspector, and commit-to-agent CTA | M4 | Survey 2, R2 |
| 17 | Floating Intent Input Bar | Bottom-anchored liquid glass prompt capsule for dispatching natural language intent | M4 | Survey 2, R4 |
| 18 | Plan Proposal Review & Approval | Decomposed slice inspector with acceptance criteria review, approval, and gate triggers | M4 | Survey 2, R4 |
| 19 | Workspace Switcher & Status Bar | Switch between Local, Remote IP:Port, and Demo Workspace with live health beacon | M4 | Survey 2, R1, R3 |
| 20 | E2E Acceptance Test Pass | 100% pass of Tiers 1–4 test suite across models, mock engine, and integration flows | M5 | Survey 3, Acceptance Criteria |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Models, Serde & Bundled Datasets | Complete Swift models, JSON serialization tests, and rich `DemoData.swift` / `DemoStore.swift` | none | DONE |
| M2 | Networking, Discovery & Auto-Init | `APIClientProtocol`, `LiveAPIClient`, `MockAPIClient`, Bonjour discovery, and auto-setup flow | M1 | DONE |
| M3 | Codex Design System & Core Views | Theme tokens, liquid glass, `MindDashboardView`, `KanbanBoardView`, `CardDetailView` | M1, M2 | DONE |
| M4 | Fleet Orchestration, Specs, Git & Intent Autopilot | `AgentsOrchestrationView`, `SpecsMatrixView`, `GitHistoryView`, `DiffInspector`, `IntentBar`, `PlanProposalSheet`, and `RootView` | M2, M3 | DONE |
| M5 | Final Acceptance Gate, Hardening & 100% E2E Pass | Full build clean verification for iOS 17+, 100% E2E test execution, Reviewer & Auditor pass | M1–M4 | DONE |

---

## Interface Contracts

### `APIClientProtocol`
```swift
public protocol APIClientProtocol: Sendable {
    // Workspace & Health
    func checkHealth() async throws -> HealthStatus
    func autoInit() async throws -> AutoInitResult
    func listBoards() async throws -> [String]
    func getBoard(name: String) async throws -> Board
    func saveCard(boardName: String, card: Card) async throws
    func moveCard(boardName: String, cardId: String, toColumn: String) async throws
    
    // Mind & Autopilot
    func getMindSnapshot() async throws -> MindSnapshot
    func getAutopilotStatus() async throws -> AutopilotStatus
    func submitIntent(prompt: String, kind: String?) async throws -> IntentResponse
    func approvePlan(cardId: String) async throws
    func rejectPlan(cardId: String, reason: String?) async throws
    
    // Orchestration & Fleet
    func listAgents() async throws -> [AgentItem]
    func listTasks() async throws -> [TaskRequest]
    func getLiveSessions() async throws -> [LiveSession]
    func triggerOrchestrationCycle() async throws -> CycleResult
    
    // Specs & Git
    func listSpecs() async throws -> [SpecItem]
    func getSpecsCoverage() async throws -> CoverageReport
    func getGitCommits() async throws -> [GitCommit]
    func getGitDiff(sha: String) async throws -> GitDiff
    func assignCommitToAgent(sha: String, prompt: String) async throws
}
```

---

## Code Layout
```
barkcli-ios/
├── Package.swift
├── Sources/
│   └── Barkcli/
│       ├── Models/
│       │   ├── Board.swift
│       │   ├── Card.swift
│       │   ├── Agent.swift
│       │   ├── Task.swift
│       │   ├── Spec.swift
│       │   ├── GitCommit.swift
│       │   ├── MindSnapshot.swift
│       │   ├── Autopilot.swift
│       │   └── Workspace.swift
│       ├── Services/
│       │   ├── APIClientProtocol.swift
│       │   ├── LiveAPIClient.swift
│       │   ├── MockAPIClient.swift
│       │   ├── NetworkDiscoveryService.swift
│       │   └── NetworkMonitor.swift
│       ├── Data/
│       │   ├── DemoData.swift
│       │   └── DemoStore.swift
│       ├── Theme/
│       │   ├── Colors.swift
│       │   ├── Typography.swift
│       │   ├── LiquidGlass.swift
│       │   └── Components.swift
│       ├── Stores/
│       │   ├── WorkspaceStore.swift
│       │   ├── MindStore.swift
│       │   ├── BoardStore.swift
│       │   ├── OrchestrationStore.swift
│       │   ├── SpecsStore.swift
│       │   └── GitStore.swift
│       └── Views/
│           ├── RootView.swift
│           ├── Mind/
│           │   ├── MindDashboardView.swift
│           │   └── AutopilotBanner.swift
│           ├── Board/
│           │   ├── KanbanBoardView.swift
│           │   ├── KanbanColumnView.swift
│           │   └── CardDetailSheet.swift
│           ├── Orchestrate/
│           │   ├── AgentsOrchestrationView.swift
│           │   ├── AgentCardView.swift
│           │   └── LiveSessionRow.swift
│           ├── Specs/
│           │   ├── SpecsMatrixView.swift
│           │   └── SpecDetailRow.swift
│           ├── Git/
│           │   ├── GitHistoryView.swift
│           │   └── DiffInspectorSheet.swift
│           ├── Intent/
│           │   ├── IntentBar.swift
│           │   └── PlanProposalSheet.swift
│           └── Workspace/
│               ├── WorkspaceSwitcherView.swift
│               └── AutoInitView.swift
└── Tests/
    └── BarkcliTests/
        ├── ModelTests.swift
        ├── MockClientTests.swift
        ├── StoreTests.swift
        └── E2EFlowTests.swift
```
