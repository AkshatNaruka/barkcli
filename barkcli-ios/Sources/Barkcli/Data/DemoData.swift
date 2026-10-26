import Foundation

/// Bundled sample workspace engine providing rich, realistic offline preview datasets.
public enum DemoData: Sendable {
    // Relative date helper
    private static func daysAgo(_ days: Double) -> Date {
        Date(timeIntervalSinceNow: -days * 86400)
    }

    private static func hoursAgo(_ hours: Double) -> Date {
        Date(timeIntervalSinceNow: -hours * 3600)
    }

    private static func daysInFuture(_ days: Double) -> Date {
        Date(timeIntervalSinceNow: days * 86400)
    }

    // MARK: - Sample Boards

    public static func makeInitialBoards() -> [String: Board] {
        let devCards: [Card] = [
            Card(
                id: "add-oauth",
                title: "Add OAuth login",
                column: "todo",
                description: "Sign in with GitHub / Google behind the sso spec: provider adapters, redirect roundtrip, session bootstrap.",
                priority: .critical,
                labels: ["auth"],
                acceptanceCriteria: [
                    "Callback roundtrips without a 500",
                    "Session cookie set on success"
                ],
                effort: Effort(3),
                area: "web",
                specId: "sso",
                createdAt: daysAgo(4),
                updatedAt: hoursAgo(3)
            ),
            Card(
                id: "fix-checkout",
                title: "Fix checkout crash",
                column: "todo",
                description: "Nil unwrap on an unauthenticated cart crashes the buy flow; guard lands with the OAuth branch.",
                priority: .high,
                labels: ["bug"],
                blockedBy: "oauth-flow",
                acceptanceCriteria: [
                    "Regression test on anonymous cart",
                    "Crash no longer reproducible"
                ],
                effort: Effort(2),
                area: "web",
                specId: "checkout",
                createdAt: daysAgo(6),
                updatedAt: hoursAgo(6)
            ),
            Card(
                id: "autopilot-gates",
                title: "Autopilot human gates",
                column: "todo",
                description: "Agents work card-by-card; humans approve at phase gates (plan, review, merge).",
                priority: .high,
                labels: ["smart", "orchestrate"],
                blockedBy: "oauth-flow",
                links: [CardLink(type: .parent, target: "autopilot-intake")],
                acceptanceCriteria: [
                    "Plan approval happens in the user interface",
                    "Every gate also runs from the CLI"
                ],
                effort: Effort(5),
                area: "smart",
                specId: "autopilot",
                createdAt: daysAgo(18),
                updatedAt: hoursAgo(14)
            ),
            Card(
                id: "tui-mouse-scroll",
                title: "Mouse wheel scrolling in TUI",
                column: "todo",
                description: "Column panels should scroll with the wheel without leaving selection mode.",
                priority: .low,
                labels: ["tui"],
                effort: Effort(1),
                area: "tui",
                createdAt: daysAgo(60),
                updatedAt: daysAgo(9)
            ),
            Card(
                id: "oauth-flow",
                title: "Implement OAuth flow",
                column: "doing",
                description: "Wiring the redirect roundtrip: authorize URL, code exchange, and the first session write.",
                priority: .high,
                labels: ["auth"],
                checklist: [
                    ChecklistItem(text: "Authorize request builds state + nonce", done: true),
                    ChecklistItem(text: "Token exchange endpoint stubbed", done: true),
                    ChecklistItem(text: "Session cookie write", done: false)
                ],
                effort: Effort(5),
                area: "web",
                specId: "sso",
                createdAt: daysAgo(8),
                updatedAt: hoursAgo(1)
            ),
            Card(
                id: "demo-hosting",
                title: "Static demo hosting",
                column: "doing",
                description: "Serve the application on static hosts behind an offline demo store with full local persistence.",
                priority: .high,
                labels: ["web", "server"],
                checklist: [
                    ChecklistItem(text: "Detect static hosting automatically", done: true),
                    ChecklistItem(text: "Serve boards, sprints, memory, specs, docs", done: true),
                    ChecklistItem(text: "Keep every write interactive (no backend)", done: true)
                ],
                links: [CardLink(type: .related, target: "kiosk-mode")],
                effort: Effort(3),
                area: "web",
                pinned: true,
                createdAt: daysAgo(9),
                updatedAt: hoursAgo(2)
            ),
            Card(
                id: "store-tokens",
                title: "Store tokens securely",
                column: "review",
                description: "Refresh tokens in the OS keychain (not .board files), rotation on refresh, revocation on logout.",
                priority: .medium,
                labels: ["auth", "memory"],
                acceptanceCriteria: [
                    "No token ever hits the YAML",
                    "Keychain read/write on all three OSes"
                ],
                effort: Effort(2),
                area: "web",
                specId: "sso",
                createdAt: daysAgo(7),
                updatedAt: hoursAgo(4)
            ),
            Card(
                id: "share-links",
                title: "Shareable card permalinks",
                column: "review",
                description: "Deep links that open the card inspector directly from a URL.",
                priority: .low,
                labels: ["web"],
                effort: Effort(1),
                area: "web",
                createdAt: daysAgo(15),
                updatedAt: hoursAgo(9)
            ),
            Card(
                id: "kiosk-mode",
                title: "Kiosk mode for wall displays",
                column: "done",
                description: "Fullscreen chromeless board mode with autoscrolling column presets.",
                priority: .high,
                labels: ["web"],
                checklist: [ChecklistItem(text: "Hide chrome + autoscroll board", done: true)],
                links: [CardLink(type: .related, target: "demo-hosting")],
                effort: Effort(3),
                area: "web",
                createdAt: daysAgo(16),
                updatedAt: hoursAgo(6)
            ),
            Card(
                id: "card-crud",
                title: "Card CRUD",
                column: "done",
                description: "Add, list, show, update, remove cards.",
                priority: .high,
                labels: ["cli"],
                comments: [CardComment(author: "max", text: "shipped in 0.5.0", at: daysAgo(4))],
                effort: Effort(3),
                createdAt: daysAgo(45),
                updatedAt: daysAgo(4)
            ),
            Card(
                id: "burndown-chart",
                title: "Sprint burndown + effort reports",
                column: "done",
                description: "Burndown per sprint with effort estimates and story points.",
                priority: .medium,
                labels: ["web", "reports"],
                effort: Effort(2),
                createdAt: daysAgo(35),
                updatedAt: daysAgo(5)
            ),
            Card(
                id: "memory-tiers",
                title: "Memory tiers working → long_term",
                column: "done",
                description: "Decay + consolidation promote hot memories, evict the rest.",
                priority: .medium,
                labels: ["memory"],
                effort: Effort(3),
                createdAt: daysAgo(40),
                updatedAt: daysAgo(6)
            ),
            Card(
                id: "skill-registry",
                title: "Skills registry in .board/",
                column: "done",
                description: "BMAD style skills served to agents via /api/skills.",
                priority: .low,
                labels: ["orchestrate"],
                effort: Effort(2),
                createdAt: daysAgo(50),
                updatedAt: daysAgo(7)
            ),
            Card(
                id: "history-bundles",
                title: "History Bundles v0.7",
                column: "done",
                description: "Group related commits into reviewable bundles and map them to cards.",
                priority: .high,
                labels: ["cli", "smart"],
                checklist: [
                    ChecklistItem(text: "Scan git log into bundle candidates", done: true),
                    ChecklistItem(text: "Approve/reject/seal flow", done: true),
                    ChecklistItem(text: "Card ⇄ bundle linkage on board", done: true)
                ],
                comments: [CardComment(author: "max", text: "shipped in 0.7.0", at: daysAgo(3))],
                effort: Effort(5),
                area: "smart",
                specId: "bundles",
                createdAt: daysAgo(21),
                updatedAt: daysAgo(3)
            ),
            Card(
                id: "ws-live-reload",
                title: "WebSocket live reload",
                column: "done",
                description: "Push file changes to the browser over /ws; skip reloads caused by our own debounced saves.",
                priority: .medium,
                labels: ["web", "serve"],
                effort: Effort(2),
                area: "serve",
                createdAt: daysAgo(12),
                updatedAt: daysAgo(10)
            ),
            Card(
                id: "autopilot-intake",
                title: "Plain language intent intake",
                column: "done",
                description: "One text box translates intent into cards with acceptance criteria.",
                priority: .medium,
                labels: ["smart"],
                effort: Effort(2),
                area: "smart",
                createdAt: daysAgo(10),
                updatedAt: daysAgo(11)
            ),
            Card(
                id: "brain-view-polish",
                title: "Brain graph polish",
                column: "done",
                description: "Auto layout, minimap search focus, and connected node inspector for the memory graph.",
                priority: .medium,
                labels: ["web", "memory"],
                effort: Effort(2),
                area: "web",
                createdAt: daysAgo(20),
                updatedAt: daysAgo(12)
            ),
            Card(
                id: "calendar-remind",
                title: "Calendar reminders in web + TUI",
                column: "done",
                description: "remind_at fires a toast in the web app and a line in the TUI agenda.",
                priority: .medium,
                labels: ["web", "tui"],
                effort: Effort(3),
                createdAt: daysAgo(30),
                updatedAt: daysAgo(13)
            ),
            Card(
                id: "vscode-sync-review",
                title: "VS Code: review card diff before save",
                column: "done",
                description: "Show a diff preview tree side before writing YAML back to the board file.",
                priority: .medium,
                labels: ["vscode"],
                effort: Effort(2),
                area: "vscode",
                createdAt: daysAgo(28),
                updatedAt: daysAgo(14)
            )
        ]

        let devBoard = Board(
            title: "dev",
            description: "The management layer for AI agents: CLI, TUI, web and VS Code from one binary.",
            columns: [
                Column(id: "todo", name: "Todo"),
                Column(id: "doing", name: "Doing", wipLimit: 3),
                Column(id: "review", name: "Review"),
                Column(id: "done", name: "Done")
            ],
            cards: devCards
        )

        let roadmapCards: [Card] = [
            Card(
                id: "rm-server-mode",
                title: "Headless serve mode (systemd unit)",
                column: "planned",
                description: "Daemonized background server support with systemd and launchd service profiles.",
                priority: .high,
                labels: ["serve"],
                effort: Effort(3),
                createdAt: daysAgo(20),
                updatedAt: daysAgo(1)
            ),
            Card(
                id: "rm-multi-repo",
                title: "Multirepo memory hub",
                column: "idea",
                description: "Cross repository memory and architecture fact synchronization via local SQLite vector store.",
                priority: .medium,
                labels: ["memory"],
                effort: Effort(5),
                createdAt: daysAgo(15),
                updatedAt: daysAgo(2)
            ),
            Card(
                id: "rm-agent-skills",
                title: "Publish agent skill packs",
                column: "idea",
                description: "Curated agent roles, skills, and prompts distributable via git submodules.",
                priority: .low,
                labels: ["orchestrate"],
                effort: Effort(2),
                createdAt: daysAgo(12),
                updatedAt: daysAgo(5)
            ),
            Card(
                id: "rm-tui-themes",
                title: "TUI theme pack",
                column: "shipped",
                description: "Full terminal color themes including obsidian dark, cyberpunk neon, and solarized minimal.",
                priority: .low,
                labels: ["tui"],
                effort: Effort(1),
                createdAt: daysAgo(25),
                updatedAt: daysAgo(8)
            )
        ]

        let roadmapBoard = Board(
            title: "roadmap",
            description: "Strategic initiatives for the AI agent management layer.",
            columns: [
                Column(id: "idea", name: "Idea"),
                Column(id: "planned", name: "Planned"),
                Column(id: "shipped", name: "Shipped")
            ],
            cards: roadmapCards
        )

        return ["dev": devBoard, "roadmap": roadmapBoard]
    }

    // MARK: - Agent Fleet

    public static func makeInitialAgents() -> [AgentItem] {
        [
            AgentItem(
                id: "opencode-1",
                name: "opencode-1",
                role: .techLead,
                status: .working,
                createdAt: daysAgo(5),
                lastActive: Date(),
                lastHeartbeat: Date(),
                activeTasks: ["task-1"],
                completedTasks: ["task-6"],
                failedTasks: [],
                totalTimeMs: 1420000,
                metrics: AgentMetrics(
                    model: "opencode",
                    provider: "local",
                    maxConcurrentTasks: 3,
                    totalTokensUsed: 84200,
                    avgTaskDurationMs: 42000,
                    successRate: 0.96
                )
            ),
            AgentItem(
                id: "claude-2",
                name: "claude-2",
                role: .techLead,
                status: .working,
                createdAt: daysAgo(3),
                lastActive: Date(),
                lastHeartbeat: Date(),
                activeTasks: ["task-2"],
                completedTasks: [],
                failedTasks: [],
                totalTimeMs: 2840000,
                metrics: AgentMetrics(
                    model: "claude-3-5-sonnet",
                    provider: "anthropic",
                    maxConcurrentTasks: 2,
                    totalTokensUsed: 124500,
                    avgTaskDurationMs: 38000,
                    successRate: 0.98
                )
            ),
            AgentItem(
                id: "codex-1",
                name: "codex-1",
                role: .techLead,
                status: .working,
                createdAt: daysAgo(2),
                lastActive: Date(),
                lastHeartbeat: Date(),
                activeTasks: ["task-8"],
                completedTasks: [],
                failedTasks: [],
                totalTimeMs: 1120000,
                metrics: AgentMetrics(
                    model: "codex-5.2",
                    provider: "openai",
                    maxConcurrentTasks: 2,
                    totalTokensUsed: 53100,
                    avgTaskDurationMs: 29000,
                    successRate: 0.94
                )
            ),
            AgentItem(
                id: "human-you",
                name: "human-you",
                role: .projectManager,
                status: .working,
                createdAt: daysAgo(10),
                lastActive: Date(),
                lastHeartbeat: Date(),
                activeTasks: ["task-3"],
                completedTasks: [],
                failedTasks: [],
                totalTimeMs: 450000,
                metrics: AgentMetrics(
                    model: "human",
                    provider: "manual",
                    maxConcurrentTasks: 1,
                    totalTokensUsed: 0,
                    avgTaskDurationMs: 60000,
                    successRate: 1.0
                )
            ),
            AgentItem(
                id: "scrum-master-1",
                name: "scrum-master-1",
                role: .scrumMaster,
                status: .idle,
                createdAt: daysAgo(10),
                lastActive: hoursAgo(1),
                lastHeartbeat: Date(),
                activeTasks: [],
                completedTasks: ["task-7"],
                failedTasks: [],
                totalTimeMs: 980000,
                metrics: AgentMetrics(
                    model: "claude-3-5-sonnet",
                    provider: "anthropic",
                    maxConcurrentTasks: 4,
                    totalTokensUsed: 28400,
                    avgTaskDurationMs: 15000,
                    successRate: 1.0
                )
            )
        ]
    }

    // MARK: - Task Queue

    public static func makeInitialTasks() -> [TaskRequest] {
        [
            TaskRequest(
                id: "task-1",
                cardId: "oauth-flow",
                title: "OAuth flow",
                description: "Drive the Implement OAuth flow card: redirect roundtrip, token exchange, session write.",
                priority: .high,
                assignedAgent: "opencode-1",
                createdAt: daysAgo(1),
                status: .inProgress
            ),
            TaskRequest(
                id: "task-2",
                cardId: "store-tokens",
                title: "Token storage",
                description: "Keychain backed token storage hardening for the sso spec.",
                priority: .medium,
                assignedAgent: "claude-2",
                createdAt: daysAgo(1),
                status: .inProgress
            ),
            TaskRequest(
                id: "task-3",
                cardId: "store-tokens",
                title: "Review queue",
                description: "Human review gate for the store tokens slice.",
                priority: .medium,
                assignedAgent: "human-you",
                createdAt: hoursAgo(4),
                status: .inProgress
            ),
            TaskRequest(
                id: "task-4",
                cardId: "add-oauth",
                title: "Add OAuth login",
                description: "Slice add oauth once the flow branch lands.",
                priority: .high,
                createdAt: hoursAgo(2),
                status: .pending
            ),
            TaskRequest(
                id: "task-5",
                cardId: "autopilot-gates",
                title: "Design human gate flow",
                description: "Gated dispatch after the OAuth workstream clears.",
                priority: .high,
                createdAt: hoursAgo(3),
                status: .pending
            ),
            TaskRequest(
                id: "task-6",
                cardId: "kiosk-mode",
                title: "Finish kiosk renderer",
                description: "Ship chromeless fullscreen board mode.",
                priority: .high,
                assignedAgent: "opencode-1",
                createdAt: daysAgo(3),
                status: .completed
            ),
            TaskRequest(
                id: "task-7",
                cardId: "brain-view-polish",
                title: "Groom the board",
                description: "Weekly board grooming pass.",
                priority: .medium,
                assignedAgent: "scrum-master-1",
                createdAt: daysAgo(4),
                status: .completed
            ),
            TaskRequest(
                id: "task-8",
                cardId: "add-oauth",
                title: "OAuth callback tests",
                description: "Regression coverage for the callback roundtrip before the flow merges.",
                priority: .high,
                assignedAgent: "codex-1",
                createdAt: hoursAgo(1),
                status: .inProgress
            )
        ]
    }

    // MARK: - Live Runner Sessions

    public static func makeInitialLiveSessions() -> [LiveSession] {
        [
            LiveSession(
                id: "ses-1",
                taskId: "task-1",
                agentId: "opencode-1",
                backend: "opencode",
                status: "running",
                branch: "feat/oauth-flow",
                worktreePath: ".board/worktrees/opencode-1",
                pid: 48123,
                startedAt: hoursAgo(1),
                lastHeartbeat: Date(),
                note: "Redirect roundtrip: authorize URL builds state+nonce",
                fresh: true
            ),
            LiveSession(
                id: "ses-2",
                taskId: "task-2",
                agentId: "claude-2",
                backend: "claude",
                status: "running",
                branch: "feat/token-storage",
                worktreePath: ".board/worktrees/claude-2",
                pid: 48124,
                startedAt: hoursAgo(2),
                lastHeartbeat: Date(),
                note: "Keychain backed token cache reviewed; rotation ready for signoff",
                fresh: true
            ),
            LiveSession(
                id: "ses-3",
                taskId: "task-8",
                agentId: "codex-1",
                backend: "codex",
                status: "running",
                branch: "feat/oauth-tests",
                worktreePath: ".board/worktrees/codex-1",
                pid: 48125,
                startedAt: hoursAgo(0.5),
                lastHeartbeat: Date(),
                note: "Running cargo test --package barkcli-core test_oauth",
                fresh: true
            )
        ]
    }

    // MARK: - Specs Matrix

    public static func makeInitialSpecs() -> [Spec] {
        [
            Spec(
                id: "sso",
                title: "Single sign on (OAuth)",
                description: "Provider backed sign in: redirect roundtrip, token exchange, secure token storage.",
                status: .inProgress,
                priority: "high",
                requirements: [
                    SpecRequirement(
                        id: "req-7",
                        title: "OAuth redirect roundtrip",
                        description: "State + nonce validated; callback never returns 500.",
                        status: .inProgress,
                        acceptanceCriteria: ["State + nonce validated", "Callback never 500s"],
                        linkedCode: ["web/src/lib/auth.ts"],
                        linkedTasks: ["task-1"],
                        stale: false,
                        updatedAt: hoursAgo(1)
                    ),
                    SpecRequirement(
                        id: "req-8",
                        title: "Tokens live in the OS keychain",
                        description: "No token ever written to board YAML files; automatic rotation on refresh.",
                        status: .inProgress,
                        acceptanceCriteria: ["No token in board YAML", "Rotation on refresh"],
                        linkedCode: ["web/src/lib/auth.ts"],
                        linkedTasks: ["task-2", "task-3"],
                        stale: false,
                        updatedAt: hoursAgo(2)
                    ),
                    SpecRequirement(
                        id: "req-9",
                        title: "GitHub + Google providers",
                        description: "Feature flagged provider authentication adapters.",
                        status: .pending,
                        acceptanceCriteria: ["Feature flagged provider list"],
                        stale: false,
                        updatedAt: daysAgo(2)
                    )
                ],
                tags: ["auth", "web"],
                createdAt: daysAgo(8),
                updatedAt: hoursAgo(1)
            ),
            Spec(
                id: "bundles",
                title: "History Bundles",
                description: "Distill agent history into reviewable, card-linked bundles.",
                status: .inProgress,
                priority: "high",
                requirements: [
                    SpecRequirement(
                        id: "req-1",
                        title: "Scan git log into bundles",
                        description: "Automated commit grouping from commit messages and worktrees.",
                        status: .implemented,
                        acceptanceCriteria: ["Runs offline", "Stable ids under rescan"],
                        linkedCode: ["barkcli-core/src/history.rs"],
                        linkedTests: ["barkcli-core/tests/bundles.rs"],
                        stale: false,
                        updatedAt: daysAgo(6)
                    ),
                    SpecRequirement(
                        id: "req-2",
                        title: "Approve / reject / seal lifecycle",
                        description: "Sealed bundles are immutable and ready for PR merge trains.",
                        status: .inProgress,
                        acceptanceCriteria: ["Sealed bundles are immutable"],
                        linkedCode: ["barkcli-server/src/lib.rs"],
                        stale: false,
                        updatedAt: hoursAgo(30)
                    ),
                    SpecRequirement(
                        id: "req-3",
                        title: "Squash merge detection",
                        description: "Detect squash merges and relink commits to original intent cards.",
                        status: .pending,
                        acceptanceCriteria: ["95% recall on sample repo"],
                        stale: true,
                        staleReason: "Card changed hands; retriage before work",
                        updatedAt: daysAgo(2)
                    )
                ],
                tags: ["smart", "cli"],
                createdAt: daysAgo(30),
                updatedAt: hoursAgo(30)
            ),
            Spec(
                id: "autopilot",
                title: "Autopilot phases",
                description: "Autonomous agent loop with human gates at plan, review, and merge.",
                status: .draft,
                priority: "high",
                requirements: [
                    SpecRequirement(
                        id: "req-4",
                        title: "Phase machine with human prompts",
                        description: "Gate rendered in web UI and mobile interface; CLI equivalent exits non zero when blocked.",
                        status: .inProgress,
                        acceptanceCriteria: ["Gate rendered in UI", "CLI equivalent exits non zero when blocked"],
                        linkedCode: ["barkcli-core/src/autopilot.rs"],
                        linkedTasks: ["task-5"],
                        stale: false,
                        updatedAt: hoursAgo(14)
                    ),
                    SpecRequirement(
                        id: "req-5",
                        title: "Intent intake normalizer",
                        description: "Translate one natural language sentence into a card with acceptance criteria.",
                        status: .pending,
                        acceptanceCriteria: ["One sentence → draft card"],
                        stale: false,
                        updatedAt: daysAgo(2)
                    ),
                    SpecRequirement(
                        id: "req-6",
                        title: "Reviewer pass scoring",
                        description: "Multi agent review scoring with automated lint and test verdicts.",
                        status: .pending,
                        acceptanceCriteria: [],
                        stale: false,
                        updatedAt: daysAgo(2)
                    )
                ],
                tags: ["smart", "orchestrate"],
                createdAt: daysAgo(12),
                updatedAt: hoursAgo(14)
            ),
            Spec(
                id: "checkout",
                title: "Checkout flow",
                description: "Buy path hardening: anonymous cart guard and crash free checkout.",
                status: .draft,
                priority: "high",
                requirements: [
                    SpecRequirement(
                        id: "req-10",
                        title: "Anonymous cart guard",
                        description: "Guard against nil unwrap on anonymous cart purchases.",
                        status: .pending,
                        acceptanceCriteria: ["Regression test on anonymous cart", "Crash no longer reproducible"],
                        stale: false,
                        updatedAt: hoursAgo(6)
                    )
                ],
                tags: ["web", "reliability"],
                createdAt: daysAgo(6),
                updatedAt: hoursAgo(6)
            )
        ]
    }

    // MARK: - Git Commits & Diffs

    public static func makeInitialCommits() -> [GitCommit] {
        [
            GitCommit(
                sha: "b7b647b29a8f4c1e0b53d7119f4a13c9e6d8a701",
                parents: ["5dbb04fc819e4a3b7d6c52a09f8e12b7a4c9d602"],
                subject: "feat: git history visualizer with flow graph, tree dag, codex diff drawer, and agent task assignment",
                body: "Implement workflow canvas, DAG tree timeline, and Codex diff drawer for autonomous worktrees.",
                author: "Agent Architect",
                authorEmail: "agent@barkcli.internal",
                date: hoursAgo(0.5),
                trailers: [GitTrailer(key: "Card", value: "history-bundles")],
                filesChanged: [
                    "barkcli-core/src/history/git.rs",
                    "barkcli-server/src/lib.rs",
                    "web/src/components/HistoryView.tsx",
                    "web/src/lib/api.ts",
                    "web/src/lib/types.ts"
                ],
                additions: 1332,
                deletions: 90
            ),
            GitCommit(
                sha: "5dbb04fc819e4a3b7d6c52a09f8e12b7a4c9d602",
                parents: ["685e74fe10a7b9c4d3e218f7a6b5c4d3e21f0987"],
                subject: "feat: complete master upgrade across sixteen core management subsystems",
                body: "Upgrade Mind, Board, Specs, Agents, Sprints, Code, Context, Memory, Brain, Skills, Docs, Calendar, Reports, Timeline, History, Activity.",
                author: "DeepMind Engineer",
                authorEmail: "engineer@barkcli.internal",
                date: hoursAgo(3),
                trailers: [GitTrailer(key: "Subsystems", value: "all")],
                filesChanged: [
                    "barkcli-core/src/mind/snapshot.rs",
                    "barkcli-core/src/models/board.rs",
                    "barkcli-core/src/memory/store.rs",
                    "barkcli-server/src/lib.rs"
                ],
                additions: 2480,
                deletions: 142
            ),
            GitCommit(
                sha: "685e74fe10a7b9c4d3e218f7a6b5c4d3e21f0987",
                parents: ["3a2b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b"],
                subject: "feat(orchestrate): collision free parallel agent dispatch with worktree leases",
                body: "Isolate concurrent workers and evaluate file touch overlaps before dispatch.",
                author: "Agent Dispatcher",
                authorEmail: "dispatcher@barkcli.internal",
                date: hoursAgo(12),
                filesChanged: [
                    "barkcli-core/src/agent/queue.rs",
                    "barkcli-core/src/agent/orchestrate.rs"
                ],
                additions: 384,
                deletions: 28
            ),
            GitCommit(
                sha: "3a2b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
                parents: ["1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b"],
                subject: "feat(memory): multi tier memory store with BM25 and TF IDF hybrid search",
                body: "Local offline semantic retrieval and time decay consolidation loop.",
                author: "Agent Architect",
                authorEmail: "agent@barkcli.internal",
                date: daysAgo(1),
                filesChanged: [
                    "barkcli-core/src/memory/store.rs",
                    "barkcli-core/src/memory/search.rs"
                ],
                additions: 612,
                deletions: 45
            ),
            GitCommit(
                sha: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
                parents: [],
                subject: "initial commit: barkcli autonomous agent management layer",
                body: "Intent in, plans out, isolated worktrees, tests as the gate, merge train.",
                author: "DeepMind Engineer",
                authorEmail: "engineer@barkcli.internal",
                date: daysAgo(2),
                filesChanged: ["Cargo.toml", "README.md", "barkcli-core/src/lib.rs"],
                additions: 890,
                deletions: 0
            )
        ]
    }

    public static func makeInitialDiffs() -> [String: GitDiffResponse] {
        let diff1 = """
        diff --git a/barkcli-core/src/history/git.rs b/barkcli-core/src/history/git.rs
        index 9a12c4f..d8b31a2 100644
        --- a/barkcli-core/src/history/git.rs
        +++ b/barkcli-core/src/history/git.rs
        @@ -45,6 +45,18 @@ pub fn read_commits(
        +pub fn extract_trailers(message: &str) -> Vec<(String, String)> {
        +    let mut trailers = Vec::new();
        +    for line in message.lines().rev() {
        +        if let Some((k, v)) = line.split_once(':') {
        +            trailers.push((k.trim().to_string(), v.trim().to_string()));
        +        }
        +    }
        +    trailers
        +}
        """

        let diff2 = """
        diff --git a/barkcli-core/src/agent/orchestrate.rs b/barkcli-core/src/agent/orchestrate.rs
        index 109bf31..82cc991 100644
        --- a/barkcli-core/src/agent/orchestrate.rs
        +++ b/barkcli-core/src/agent/orchestrate.rs
        @@ -88,6 +88,14 @@ impl OrchestrationEngine {
        +    pub fn evaluate_lease(&self, task: &Task) -> bool {
        +        if let Some(lease) = &task.lease {
        +            return !lease.is_expired();
        +        }
        +        true
        +    }
        """

        return [
            "b7b647b29a8f4c1e0b53d7119f4a13c9e6d8a701": GitDiffResponse(
                sha: "b7b647b29a8f4c1e0b53d7119f4a13c9e6d8a701",
                message: "feat: git history visualizer with flow graph, tree dag, codex diff drawer",
                diff: diff1,
                filesChanged: [
                    "barkcli-core/src/history/git.rs",
                    "barkcli-server/src/lib.rs",
                    "web/src/components/HistoryView.tsx"
                ],
                additions: 1332,
                deletions: 90
            ),
            "685e74fe10a7b9c4d3e218f7a6b5c4d3e21f0987": GitDiffResponse(
                sha: "685e74fe10a7b9c4d3e218f7a6b5c4d3e21f0987",
                message: "feat(orchestrate): collision free parallel agent dispatch with worktree leases",
                diff: diff2,
                filesChanged: [
                    "barkcli-core/src/agent/queue.rs",
                    "barkcli-core/src/agent/orchestrate.rs"
                ],
                additions: 384,
                deletions: 28
            )
        ]
    }

    // MARK: - History Bundles

    public static func makeInitialBundles() -> [GitBundle] {
        [
            GitBundle(
                id: "bundle-1",
                title: "Kiosk mode for wall displays",
                summary: "Fullscreen chromeless board with autoscroll.",
                kind: .feat,
                status: .sealed,
                cardId: "kiosk-mode",
                branch: "feat/kiosk",
                commits: [
                    BundleCommitRef(sha: "3aa91c7", subject: "feat(web): kiosk toggle in top bar", author: "orbiter", date: daysAgo(3)),
                    BundleCommitRef(sha: "41cd905", subject: "feat(web): autoscroll column presets", author: "orbiter", date: daysAgo(3)),
                    BundleCommitRef(sha: "77b2e10", subject: "fix(web): pause scroll on hover", author: "you", date: daysAgo(2)),
                    BundleCommitRef(sha: "9f4bd21", subject: "docs: kiosk mode notes", author: "you", date: daysAgo(2))
                ],
                filesTouched: ["web/src/components/BoardView.tsx", "web/src/App.tsx"],
                stats: BundleStats(commits: 4, additions: 280, deletions: 14),
                confidence: 0.92,
                createdAt: daysAgo(3),
                sealedAt: daysAgo(1),
                source: .heuristic
            ),
            GitBundle(
                id: "bundle-2",
                title: "WebSocket live reload",
                summary: "Skip reloads caused by our own debounced saves.",
                kind: .fix,
                status: .open,
                cardId: "ws-live-reload",
                branch: "fix/ws-reload",
                commits: [
                    BundleCommitRef(sha: "6b5510f", subject: "fix(web): tag own reload versions", author: "you", date: hoursAgo(8)),
                    BundleCommitRef(sha: "d91cc88", subject: "fix(serve): debounce 1.5s window", author: "you", date: hoursAgo(4))
                ],
                filesTouched: ["barkcli-server/src/lib.rs", "web/src/lib/api.ts"],
                stats: BundleStats(commits: 2, additions: 45, deletions: 12),
                confidence: 0.71,
                createdAt: hoursAgo(10),
                source: .heuristic
            ),
            GitBundle(
                id: "bundle-3",
                title: "Memory tier consolidation",
                summary: "Decay scheduler and promotion to long term memory tier.",
                kind: .chore,
                status: .open,
                cardId: "memory-tiers",
                branch: "feat/memory-tiers",
                commits: [
                    BundleCommitRef(sha: "082ff2e", subject: "feat(memory): decay scheduler", author: "orbiter", date: daysAgo(6)),
                    BundleCommitRef(sha: "be421aa", subject: "feat(memory): promote + evict", author: "orbiter", date: daysAgo(6)),
                    BundleCommitRef(sha: "7ca15f9", subject: "test: consolidation cases", author: "you", date: daysAgo(5))
                ],
                filesTouched: ["barkcli-core/src/memory/store.rs", "barkcli-core/src/memory/tiers.rs"],
                stats: BundleStats(commits: 3, additions: 180, deletions: 22),
                confidence: 0.85,
                createdAt: daysAgo(6),
                source: .heuristic
            )
        ]
    }

    // MARK: - Memories & Project Facts

    public static func makeInitialMemories() -> [MemoryEntry] {
        [
            MemoryEntry(
                id: "mem-1",
                content: "Board YAML is the source of truth: the client saves the whole board via PUT /api/board, never per card writes.",
                tier: .longTerm,
                tags: ["architecture"],
                source: "AIDER",
                createdAt: daysAgo(30),
                lastAccessed: daysAgo(1),
                accessCount: 12,
                importance: 0.9
            ),
            MemoryEntry(
                id: "mem-2",
                content: "Board server default port is 4321 (deliberately avoids Vite/Next on :3000).",
                tier: .longTerm,
                tags: ["serve"],
                source: "AGENTS",
                createdAt: daysAgo(28),
                lastAccessed: daysAgo(2),
                accessCount: 9,
                importance: 0.7
            ),
            MemoryEntry(
                id: "mem-3",
                content: "Agent sessions live in .board/sessions.jsonl; history bundles scan distills them into reviewable commits.",
                tier: .shortTerm,
                tags: ["smart"],
                source: "SESSION",
                createdAt: daysAgo(3),
                lastAccessed: hoursAgo(1),
                accessCount: 4,
                importance: 0.5
            ),
            MemoryEntry(
                id: "mem-4",
                content: "Sprint burndown uses the effort field; cards without effort count as 1 point.",
                tier: .shortTerm,
                tags: ["reports"],
                source: "SESSION",
                createdAt: daysAgo(5),
                lastAccessed: daysAgo(1),
                accessCount: 3,
                importance: 0.4
            ),
            MemoryEntry(
                id: "mem-5",
                content: "User prefers handoff summaries printed to stdout, not opened in an editor.",
                tier: .working,
                tags: ["workflow"],
                source: "SESSION",
                createdAt: hoursAgo(2),
                lastAccessed: hoursAgo(1),
                accessCount: 6,
                importance: 0.6
            ),
            MemoryEntry(
                id: "mem-6",
                content: "External: design color system is obsidian dark canvas with violet and cyan accents.",
                tier: .external,
                tags: ["design"],
                source: "URL",
                createdAt: daysAgo(60),
                lastAccessed: daysAgo(10),
                accessCount: 2,
                importance: 0.3
            )
        ]
    }

    public static func makeInitialFacts() -> [ProjectFact] {
        [
            ProjectFact(
                fact: "barkcli is written in Rust; the mobile app is native SwiftUI for iOS 17+.",
                category: "architecture",
                confidence: 1.0,
                sources: ["AGENTS.md"],
                createdAt: daysAgo(45)
            ),
            ProjectFact(
                fact: "All kanban state lives in <name>.board YAML files next to the code.",
                category: "data",
                confidence: 0.95,
                sources: ["README.md"],
                createdAt: daysAgo(40)
            ),
            ProjectFact(
                fact: "The client derives card mutations client side, then persists via PUT /api/board.",
                category: "architecture",
                confidence: 0.9,
                sources: ["web/src/App.tsx"],
                createdAt: daysAgo(20)
            ),
            ProjectFact(
                fact: "Fibonacci efforts (1, 2, 3, 5) map to burndown story points.",
                category: "process",
                confidence: 0.8,
                sources: ["docs"],
                createdAt: daysAgo(15)
            )
        ]
    }

    // MARK: - Sprints, History & Sessions

    public static func makeInitialSprints() -> [Sprint] {
        [
            Sprint(
                name: "sprint-14",
                start: ISO8601DateFormatter().string(from: daysAgo(6)).prefix(10).description,
                end: ISO8601DateFormatter().string(from: daysInFuture(8)).prefix(10).description,
                createdAt: daysAgo(6)
            ),
            Sprint(
                name: "sprint-13",
                start: ISO8601DateFormatter().string(from: daysAgo(20)).prefix(10).description,
                end: ISO8601DateFormatter().string(from: daysAgo(7)).prefix(10).description,
                createdAt: daysAgo(20)
            )
        ]
    }

    public static func makeInitialSessions() -> [SessionEntry] {
        [
            SessionEntry(
                id: "ses-1",
                agent: "opencode-1",
                model: "opencode",
                board: "dev",
                prompt: "Implement the OAuth flow card",
                commitSha: "a1d9c02",
                filesTouched: ["web/src/lib/auth.ts", "web/src/App.tsx"],
                summary: "Redirect roundtrip: authorize URL builds state+nonce, exchange endpoint stubbed.",
                at: "1 hour ago",
                durationMs: 1120000
            ),
            SessionEntry(
                id: "ses-2",
                agent: "claude-2",
                model: "claude-sonnet-4-5",
                board: "dev",
                prompt: "Store tokens securely card",
                filesTouched: ["web/src/lib/auth.ts"],
                summary: "Keychain backed token cache reviewed; rotation ready for signoff.",
                at: "2 hours ago",
                durationMs: 640000
            ),
            SessionEntry(
                id: "ses-3",
                agent: "human-you",
                board: "dev",
                prompt: "Review the review queue",
                filesTouched: ["dev.board"],
                summary: "Reviewing Store tokens securely: 2 acceptance criteria checked, 1 open.",
                at: "3 hours ago",
                durationMs: 180000
            ),
            SessionEntry(
                id: "ses-4",
                agent: "codex-1",
                model: "codex-5.2",
                board: "dev",
                prompt: "Implement kiosk mode for wall displays",
                commitSha: "9f4bd21",
                filesTouched: ["web/src/components/BoardView.tsx", "web/src/App.tsx"],
                summary: "Kiosk mode hides chrome, autoscrolls board columns, 10s refresh.",
                at: "6 hours ago",
                durationMs: 1420000
            ),
            SessionEntry(
                id: "ses-5",
                agent: "opencode-1",
                model: "opencode",
                board: "dev",
                prompt: "Wire memory tiers + consolidation decay",
                commitSha: "7ca15f9",
                filesTouched: ["barkcli-core/src/memory.rs"],
                summary: "Decay scheduler promotes hot memories to long_term every 24h.",
                at: "6 days ago",
                durationMs: 950000
            ),
            SessionEntry(
                id: "ses-6",
                agent: "scrum-master-1",
                board: "dev",
                prompt: "Weekly board grooming",
                filesTouched: ["dev.board"],
                summary: "Closed 3 stale cards, promoted 2 into doing.",
                at: "7 days ago",
                durationMs: 210000
            ),
            SessionEntry(
                id: "ses-7",
                agent: "codex-1",
                model: "codex-5.2",
                board: "roadmap",
                prompt: "Draft 2026 roadmap slices",
                filesTouched: ["roadmap.board"],
                summary: "Roadmap board created with 4 seeded initiatives.",
                at: "8 days ago",
                durationMs: 640000
            )
        ]
    }

    public static func makeInitialHistory() -> [HistoryEntry] {
        [
            HistoryEntry(op: "move", board: "dev", card: "demo-hosting", oldValue: "todo", newValue: "doing", at: "2 hours ago"),
            HistoryEntry(op: "add", board: "roadmap", card: "rm-multi-repo", newValue: "idea", at: "2 days ago"),
            HistoryEntry(op: "update", board: "dev", card: "calendar-remind", newValue: "2026-11-01", field: "due_date", at: "2 days ago"),
            HistoryEntry(op: "move", board: "dev", card: "history-bundles", oldValue: "todo", newValue: "doing", at: "1 day ago"),
            HistoryEntry(op: "comment", board: "dev", card: "history-bundles", newValue: "Bundle scan missed squash merges…", at: "30 hours ago"),
            HistoryEntry(op: "update", board: "dev", card: "ws-live-reload", oldValue: "web", newValue: "web, serve", field: "labels", at: "5 hours ago"),
            HistoryEntry(op: "move", board: "dev", card: "kiosk-mode", oldValue: "review", newValue: "done", at: "6 hours ago"),
            HistoryEntry(op: "add", board: "dev", card: "vscode-sync-review", newValue: "todo", at: "3 days ago"),
            HistoryEntry(op: "close", board: "dev", card: "burndown-chart", newValue: "done", at: "5 days ago"),
            HistoryEntry(op: "add", board: "dev", card: "demo-hosting", newValue: "doing", at: "9 days ago")
        ]
    }

    // MARK: Subsystems Sample Datasets

    public static func makeInitialSprintDetails() -> [SprintDetail] {
        [
            SprintDetail(
                name: "Sprint 42: Agent Autonomy",
                goal: "Deliver isolated worktrees and automated acceptance gate verification",
                start: "2026 10 15",
                end: "2026 10 29",
                status: "active",
                cardIds: ["autopilot gates", "agent leases", "merge train"],
                totalEffort: 24,
                completedEffort: 16
            ),
            SprintDetail(
                name: "Sprint 41: Native Client Overhaul",
                goal: "Transition native interface to developer zinc aesthetic and full subsystem stores",
                start: "2026 10 01",
                end: "2026 10 14",
                status: "completed",
                cardIds: ["design tokens", "liquid glass", "symbol search"],
                totalEffort: 30,
                completedEffort: 30
            ),
            SprintDetail(
                name: "Sprint 43: Fleet Coordination",
                goal: "Scale agent pool to eight concurrent workers with conflict resolution",
                start: "2026 10 30",
                end: "2026 11 13",
                status: "planned",
                cardIds: ["pool scaling", "lease timeouts"],
                totalEffort: 28,
                completedEffort: 0
            )
        ]
    }

    public static func makeInitialCodeSymbols() -> [CodeSymbol] {
        [
            CodeSymbol(
                id: "sym 1",
                name: "run acceptance gate",
                kind: "function",
                filePath: "barkcli core/src/gate.rs",
                line: 42,
                language: "rust",
                documentation: "Executes project test suite inside isolated worktree",
                linkedCardId: "gate timeout"
            ),
            CodeSymbol(
                id: "sym 2",
                name: "WorktreePool",
                kind: "struct",
                filePath: "barkcli core/src/worktree.rs",
                line: 18,
                language: "rust",
                documentation: "Manages pool of temporary git worktrees for agent attempts",
                linkedCardId: "worktree pool"
            ),
            CodeSymbol(
                id: "sym 3",
                name: "SprintStore",
                kind: "class",
                filePath: "barkcli ios/Sources/Barkcli/Stores/SprintStore.swift",
                line: 8,
                language: "swift",
                documentation: "Observable state store for active sprint progress and effort rollups"
            ),
            CodeSymbol(
                id: "sym 4",
                name: "submitIntent",
                kind: "function",
                filePath: "barkcli ios/Sources/Barkcli/Stores/MindStore.swift",
                line: 64,
                language: "swift",
                documentation: "Dispatches human intent to autopilot plan engine"
            ),
            CodeSymbol(
                id: "sym 5",
                name: "MergeTrainCoordinator",
                kind: "struct",
                filePath: "barkcli server/src/merge train.rs",
                line: 95,
                language: "rust",
                documentation: "Queues passing branches and executes sequential merges",
                linkedCardId: "merge train"
            ),
            CodeSymbol(
                id: "sym 6",
                name: "useOrchestration",
                kind: "function",
                filePath: "web/src/hooks/useOrchestration.ts",
                line: 12,
                language: "typescript",
                documentation: "React hook subscribing to live runner telemetry"
            )
        ]
    }

    public static func makeInitialLivingContext() -> LivingContext {
        let sections = [
            ContextSection(
                id: "sec 1",
                title: "Brief",
                content: "barkcli is the management layer for AI agents where humans write intent and agents execute in isolated worktrees.",
                isManual: true,
                staleness: "verified"
            ),
            ContextSection(
                id: "sec 2",
                title: "Architecture Rules",
                content: "Acceptance gate test suite serves as the single source of truth for branch completion. Passing branches queue on merge train.",
                isManual: true,
                staleness: "fresh"
            ),
            ContextSection(
                id: "sec 3",
                title: "Active Workspaces",
                content: "Current primary workspace barkcli with Rust backend and native Apple client.",
                isManual: false,
                staleness: "reconciled"
            )
        ]
        return LivingContext(
            rawMarkdown: "# Project Context\nbarkcli is the management layer for AI agents.",
            tokenBudget: 8000,
            tokensUsed: 2150,
            stalenessSeconds: 45,
            sections: sections
        )
    }

    public static func makeInitialBrainGraph() -> BrainGraph {
        let nodes = [
            BrainNode(id: "node 1", label: "Intent Engine", category: "Autonomy", degree: 4, importance: 0.95),
            BrainNode(id: "node 2", label: "Worktree Sandbox", category: "Isolation", degree: 5, importance: 0.92),
            BrainNode(id: "node 3", label: "Test Gate", category: "Verification", degree: 6, importance: 0.98),
            BrainNode(id: "node 4", label: "Merge Train", category: "Git", degree: 3, importance: 0.88),
            BrainNode(id: "node 5", label: "Living Context", category: "Memory", degree: 4, importance: 0.85),
            BrainNode(id: "node 6", label: "Agent Fleet", category: "Fleet", degree: 5, importance: 0.90)
        ]
        let edges = [
            BrainEdge(id: "e 1", sourceId: "node 1", targetId: "node 2", relation: "spawns", weight: 1.0),
            BrainEdge(id: "e 2", sourceId: "node 2", targetId: "node 3", relation: "verifies via", weight: 1.0),
            BrainEdge(id: "e 3", sourceId: "node 3", targetId: "node 4", relation: "promotes to", weight: 0.9),
            BrainEdge(id: "e 4", sourceId: "node 5", targetId: "node 1", relation: "informs", weight: 0.8),
            BrainEdge(id: "e 5", sourceId: "node 6", targetId: "node 2", relation: "leases", weight: 0.9)
        ]
        return BrainGraph(nodes: nodes, edges: edges)
    }

    public static func makeInitialSkills() -> [Skill] {
        [
            Skill(
                id: "rust pro",
                name: "Rust Systems Engineer",
                description: "Deep expertise in Rust memory safety async runtimes and cargo workspaces",
                author: "barkcli",
                installed: true,
                tags: ["systems", "rust", "backend"],
                entrypoint: "skills/rust pro/SKILL.md"
            ),
            Skill(
                id: "swiftui pro",
                name: "Apple Native Engineer",
                description: "Expert SwiftUI development strict Swift 6 concurrency and high density layouts",
                author: "barkcli",
                installed: true,
                tags: ["apple", "swift", "frontend"],
                entrypoint: "skills/swiftui pro/SKILL.md"
            ),
            Skill(
                id: "tdd workflow",
                name: "Test Driven Acceptance Gate",
                description: "Enforces red green refactor cycles and acceptance gate verification",
                author: "barkcli",
                installed: true,
                tags: ["testing", "gates", "qa"],
                entrypoint: "skills/tdd workflow/SKILL.md"
            ),
            Skill(
                id: "git master",
                name: "Git Worktree Orchestrator",
                description: "Manages worktree branching rebase conflict isolation and clean merges",
                author: "barkcli",
                installed: false,
                tags: ["git", "worktree", "vcs"],
                entrypoint: "skills/git master/SKILL.md"
            )
        ]
    }

    public static func makeInitialDocs() -> [DocItem] {
        [
            DocItem(
                id: "architecture",
                title: "System Architecture",
                category: "Manual",
                path: "docs/ARCHITECTURE.md",
                summary: "Core design of the management layer for AI agents",
                content: "# System Architecture\n\nbarkcli coordinates autonomous agents through structured intent proposals isolated git worktrees and test acceptance gates."
            ),
            DocItem(
                id: "agent prompt",
                title: "AI Agent Guidelines",
                category: "Reference",
                path: "docs/AI_AGENT_PROMPT.md",
                summary: "Instructions for coding agents executing worktree tasks",
                content: "# AI Agent Guidelines\n\nAlways verify changes using cargo test or swift test before marking tasks complete."
            ),
            DocItem(
                id: "context guide",
                title: "Living Context Digest",
                category: "Guide",
                path: "docs/CONTEXT.md",
                summary: "How project context is maintained across agent sessions",
                content: "# Living Context Digest\n\nLiving context keeps memory facts and project constraints synchronized without context drift."
            )
        ]
    }

    public static func makeInitialAgenda() -> [AgendaItem] {
        [
            AgendaItem(
                id: "ag 1",
                cardId: "add oauth",
                title: "Complete OAuth redirect roundtrip",
                dueDate: daysAgo(1),
                column: "todo",
                priority: .critical,
                isOverdue: true,
                isToday: false
            ),
            AgendaItem(
                id: "ag 2",
                cardId: "oauth flow",
                title: "Verify session cookie storage",
                dueDate: Date(),
                column: "doing",
                priority: .high,
                isOverdue: false,
                isToday: true
            ),
            AgendaItem(
                id: "ag 3",
                cardId: "autopilot gates",
                title: "Review gate integration test",
                dueDate: daysInFuture(2),
                column: "todo",
                priority: .high,
                isOverdue: false,
                isToday: false
            ),
            AgendaItem(
                id: "ag 4",
                cardId: "worktree pool",
                title: "Sandbox cleanup verification",
                dueDate: daysInFuture(5),
                column: "todo",
                priority: .medium,
                isOverdue: false,
                isToday: false
            )
        ]
    }

    public static func makeInitialReportMetrics() -> ReportMetrics {
        ReportMetrics(
            effortByColumn: [
                "todo": 16,
                "doing": 12,
                "review": 8,
                "done": 46
            ],
            cardsByPriority: [
                "critical": 4,
                "high": 9,
                "medium": 14,
                "low": 6
            ],
            completionVelocity: 14.5,
            cycleTimeDays: 2.3,
            throughputPerWeek: 18.2
        )
    }

    public static func makeInitialCheckpoints() -> [Checkpoint] {
        [
            Checkpoint(
                id: "cp 4",
                timestamp: hoursAgo(1),
                description: "Completed t3 codes design system token overhaul",
                author: "developer",
                fileCount: 4
            ),
            Checkpoint(
                id: "cp 3",
                timestamp: hoursAgo(5),
                description: "Added sprint store and code symbol search models",
                author: "agent",
                fileCount: 6
            ),
            Checkpoint(
                id: "cp 2",
                timestamp: daysAgo(1),
                description: "Merged passing gate for worktree isolation pool",
                author: "merge train",
                fileCount: 12
            ),
            Checkpoint(
                id: "cp 1",
                timestamp: daysAgo(3),
                description: "Initial workspace bootstrap with auto init",
                author: "system",
                fileCount: 22
            )
        ]
    }

    public static func makeInitialDoctorIssues() -> [DoctorIssue] {
        [
            DoctorIssue(
                id: "doc 1",
                severity: "warning",
                description: "Card checkout references missing spec requirement checkout 04",
                fixable: true,
                fixed: false
            ),
            DoctorIssue(
                id: "doc 2",
                severity: "info",
                description: "Stale living context digest has uncommitted updates in dev board",
                fixable: true,
                fixed: false
            ),
            DoctorIssue(
                id: "doc 3",
                severity: "resolved",
                description: "Worktree lease expired on agent codex 1 and was auto reclaimed",
                fixable: false,
                fixed: true
            )
        ]
    }
}
