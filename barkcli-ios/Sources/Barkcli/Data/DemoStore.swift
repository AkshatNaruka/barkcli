import Foundation
import Observation

public final class DemoStore: @unchecked Sendable {
    public static let shared = DemoStore()

    public var boardNames: [String] = []
    public var boards: [String: Board] = [:]
    public var sprints: [Sprint] = []
    public var agents: [AgentItem] = []
    public var tasks: [TaskRequest] = []
    public var liveRunners: [LiveSession] = []
    public var commits: [GitCommit] = []
    public var diffsBySha: [String: GitDiffResponse] = [:]
    public var specs: [Spec] = []
    public var bundles: [GitBundle] = []
    public var memories: [MemoryEntry] = []
    public var facts: [ProjectFact] = []
    public var history: [HistoryEntry] = []
    public var sessions: [SessionEntry] = []

    public var pendingProposal: PlanProposal?
    public var lastGateVerdict: TestGateVerdict?
    public var orchestrationStatus: OrchestrationStatus = OrchestrationStatus()
    public var cycleCount: Int = 12
    private let lock = NSRecursiveLock()

    public init() {
        resetToDefaults()
    }

    public func resetToDefaults() {
        lock.lock()
        defer { lock.unlock() }
        var initialBoards = DemoData.makeInitialBoards()

        // Include agent-infra board for runtime verification
        let infraCards = [
            Card(
                id: "worktree-pool",
                title: "Parallel worktree isolation pool",
                column: "todo",
                description: "Create separate git worktrees for each agent attempt with automatic cleanup.",
                priority: .critical,
                labels: ["infra", "git"],
                effort: Effort(5)
            ),
            Card(
                id: "gate-timeout",
                title: "Project test gate execution timeout",
                column: "todo",
                description: "Enforce strict execution limits on acceptance gate test runs.",
                priority: .high,
                labels: ["gate", "security"],
                effort: Effort(3)
            ),
            Card(
                id: "agent-leases",
                title: "Heartbeat leases for agent fleet",
                column: "doing",
                description: "Prevent collision between concurrent workers via distributed task leases.",
                priority: .critical,
                labels: ["orchestrate", "fleet"],
                effort: Effort(5)
            ),
            Card(
                id: "merge-train",
                title: "Automated merge train for passing gates",
                column: "review",
                description: "Queue passing agent branches and merge in completion order.",
                priority: .high,
                labels: ["git", "merge"],
                effort: Effort(3)
            ),
            Card(
                id: "transcript-watcher",
                title: "Transcript file watcher",
                column: "done",
                description: "Stream agent tool calls and thinking into live session logs.",
                priority: .medium,
                labels: ["logging"],
                effort: Effort(2)
            )
        ]

        let infraBoard = Board(
            title: "agent-infra",
            description: "Agent runtime fleet, worktree sandbox isolation, and gate verification.",
            columns: [
                Column(id: "todo", name: "Todo"),
                Column(id: "doing", name: "Doing"),
                Column(id: "review", name: "Review"),
                Column(id: "done", name: "Done")
            ],
            cards: infraCards
        )
        initialBoards["agent-infra"] = infraBoard

        self.boardNames = ["dev", "roadmap", "agent-infra"]
        self.boards = initialBoards
        self.sprints = DemoData.makeInitialSprints()
        self.agents = DemoData.makeInitialAgents()
        self.tasks = DemoData.makeInitialTasks()
        self.liveRunners = DemoData.makeInitialLiveSessions()
        self.commits = DemoData.makeInitialCommits()
        self.diffsBySha = DemoData.makeInitialDiffs()
        self.specs = DemoData.makeInitialSpecs()
        self.bundles = DemoData.makeInitialBundles()
        self.memories = DemoData.makeInitialMemories()
        self.facts = DemoData.makeInitialFacts()
        self.history = DemoData.makeInitialHistory()
        self.sessions = DemoData.makeInitialSessions()

        self.pendingProposal = nil
        self.lastGateVerdict = TestGateVerdict(
            passed: true,
            command: "cargo test",
            output: "Running 48 tests. All verification gates passed with zero failures.",
            durationSeconds: 3.42,
            timestamp: Date()
        )
        self.orchestrationStatus = OrchestrationStatus(
            status: "idle",
            cycleCount: 12,
            tasksDispatched: 18,
            tasksCompleted: 14,
            tasksFailed: 1
        )
        self.cycleCount = 12
    }

    // MARK: - Thread Safe Collection Accessors

    public func listBoardNames() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return boardNames
    }

    public func listAgents() -> [AgentItem] {
        lock.lock()
        defer { lock.unlock() }
        return agents
    }

    public func listTasks() -> [TaskRequest] {
        lock.lock()
        defer { lock.unlock() }
        return tasks
    }

    public func listLiveRunners() -> [LiveSession] {
        lock.lock()
        defer { lock.unlock() }
        return liveRunners
    }

    public func listCommits() -> [GitCommit] {
        lock.lock()
        defer { lock.unlock() }
        return commits
    }

    // MARK: - Board Access & Mutations

    public func getBoard(name: String? = nil) -> Board {
        lock.lock()
        defer { lock.unlock() }
        let key = name ?? boardNames.first ?? "dev"
        if let existing = boards[key] {
            return existing
        }
        let fallback = Board(
            title: key,
            description: "The management layer for AI agents",
            columns: [
                Column(id: "todo", name: "Todo"),
                Column(id: "doing", name: "Doing"),
                Column(id: "review", name: "Review"),
                Column(id: "done", name: "Done")
            ],
            cards: []
        )
        boards[key] = fallback
        if !boardNames.contains(key) {
            boardNames.append(key)
        }
        return fallback
    }

    public func saveBoard(_ board: Board, name: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        let key = name ?? board.title
        boards[key] = board
        if !boardNames.contains(key) {
            boardNames.append(key)
        }
    }

    public func createBoard(name: String, columns: [String] = ["todo", "doing", "review", "done"]) -> Board {
        lock.lock()
        defer { lock.unlock() }
        let newCols = columns.map { Column(id: $0.lowercased(), name: $0.capitalized) }
        let newBoard = Board(title: name, description: "Board created in workspace.", columns: newCols, cards: [])
        boards[name] = newBoard
        if !boardNames.contains(name) {
            boardNames.append(name)
        }
        return newBoard
    }

    public func deleteBoard(name: String) {
        lock.lock()
        defer { lock.unlock() }
        boards.removeValue(forKey: name)
        boardNames.removeAll { $0 == name }
    }

    public func moveCard(id: String, toColumn: String, boardName: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        let key = boardName ?? boardNames.first ?? "dev"
        guard var board = boards[key] else { return }

        for index in board.cards.indices {
            if board.cards[index].id == id {
                let oldCol = board.cards[index].column
                board.cards[index].column = toColumn
                board.cards[index].updatedAt = Date()
                boards[key] = board

                history.insert(
                    HistoryEntry(op: "move", board: key, card: id, oldValue: oldCol, newValue: toColumn, at: "Just now"),
                    at: 0
                )
                return
            }
        }
    }

    public func addCard(_ card: Card, boardName: String? = nil) -> Card {
        lock.lock()
        defer { lock.unlock() }
        let key = boardName ?? boardNames.first ?? "dev"
        var board = getBoard(name: key)
        board.cards.insert(card, at: 0)
        boards[key] = board

        history.insert(
            HistoryEntry(op: "add", board: key, card: card.id, newValue: card.column, at: "Just now"),
            at: 0
        )
        return card
    }

    public func updateCard(_ card: Card, boardName: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        let key = boardName ?? boardNames.first ?? "dev"
        guard var board = boards[key] else { return }

        for index in board.cards.indices {
            if board.cards[index].id == card.id {
                board.cards[index] = card
                board.cards[index].updatedAt = Date()
                boards[key] = board
                return
            }
        }
    }

    public func removeCard(id: String, boardName: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        let key = boardName ?? boardNames.first ?? "dev"
        guard var board = boards[key] else { return }
        board.cards.removeAll { $0.id == id }
        boards[key] = board
    }

    public func addCardComment(cardId: String, text: String, author: String = "human", boardName: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        let key = boardName ?? boardNames.first ?? "dev"
        guard var board = boards[key] else { return }

        for index in board.cards.indices {
            if board.cards[index].id == cardId {
                let comment = CardComment(author: author, text: text, at: Date())
                board.cards[index].comments.append(comment)
                board.cards[index].updatedAt = Date()
                boards[key] = board

                history.insert(
                    HistoryEntry(op: "comment", board: key, card: cardId, newValue: text, at: "Just now"),
                    at: 0
                )
                return
            }
        }
    }

    // MARK: - Mind Snapshot

    public func getMindSnapshot(boardName: String? = nil) -> MindSnapshot {
        lock.lock()
        defer { lock.unlock() }
        let board = getBoard(name: boardName)
        var byCol: [String: Int] = [:]
        for col in board.columns {
            byCol[col.id] = 0
        }
        for card in board.cards {
            byCol[card.column, default: 0] += 1
        }

        var blockers: [BlockerItem] = []
        for card in board.cards {
            if let blocker = card.blockedBy, !blocker.isEmpty {
                blockers.append(
                    BlockerItem(
                        cardId: card.id,
                        title: card.title,
                        blockedBy: [blocker],
                        column: card.column,
                        resolutionHint: "Blocked until \(blocker) reaches done status"
                    )
                )
            }
            for link in card.links where link.type == .blockedBy {
                blockers.append(
                    BlockerItem(
                        cardId: card.id,
                        title: card.title,
                        blockedBy: [link.target],
                        column: card.column,
                        resolutionHint: "Blocked by \(link.target)"
                    )
                )
            }
        }

        let totalCards = board.cards.count
        let doneCards = board.cards.filter { $0.column == "done" }.count
        let completionRate = totalCards > 0 ? (Double(doneCards) / Double(totalCards)) * 100.0 : 100.0

        let health = HealthMetrics(
            healthScore: max(40.0, 100.0 - Double(blockers.count * 15)),
            wipViolationsCount: board.validateWipLimits().count,
            blockedCardsCount: blockers.count,
            staleCardsCount: 1,
            completionRate: completionRate
        )

        let nextActions = [
            NextActionSummary(action: "barkcli dispatch", reason: "Ready tasks in todo await agent allocation"),
            NextActionSummary(action: "barkcli review", reason: "Cards in review column require human signoff gate")
        ]

        let activeSprint = sprints.first { $0.name == "sprint-14" }

        return MindSnapshot(
            boardName: board.title,
            generatedAt: Date(),
            healthMetrics: health,
            blockers: blockers,
            velocity: VelocitySummary(totalDone: doneCards, totalPoints: board.completedEffort, avgEffort: 2.8),
            staleCards: [
                StaleCardSummary(id: "tui-mouse-scroll", title: "Mouse wheel scrolling in TUI", column: "todo", days: 14)
            ],
            nextActions: nextActions,
            stats: BoardStatsSummary(total: totalCards, byColumn: byCol),
            activeSprint: activeSprint,
            recentHistory: Array(history.prefix(6)),
            recentSessions: Array(sessions.prefix(5)),
            topMemories: Array(memories.prefix(4)),
            bundleStats: BundleStats(commits: 9, additions: 505, deletions: 48)
        )
    }

    // MARK: - Autopilot State Machine & Intent Loop

    public func getAutopilotStatus(boardName: String? = nil) -> AutopilotStatus {
        lock.lock()
        defer { lock.unlock() }
        let board = getBoard(name: boardName)
        let unplanned = board.cards.filter { $0.column == "todo" && $0.specId == nil }.count
        let inReview = board.cards.filter { $0.column == "review" }.count
        let blocked = board.cards.filter { $0.blockedBy != nil }.count
        let queuePending = tasks.filter { $0.status == .pending }.count
        let queueActive = tasks.filter { $0.status == .inProgress || $0.status == .assigned }.count

        let phase: AutopilotPhase
        let phaseLabel: String
        let needsHuman: Bool
        let humanPrompt: String
        let agentAction: String

        if let proposal = pendingProposal {
            phase = .awaitingPlanApproval(cardId: proposal.cardId)
            phaseLabel = "Awaiting Plan Approval"
            needsHuman = true
            humanPrompt = "A plan proposal is waiting for your review and approval gate."
            agentAction = "Waiting for human approval on card '\(proposal.cardId)'"
        } else if unplanned > 0, let firstUnplanned = board.cards.first(where: { $0.column == "todo" && $0.specId == nil }) {
            phase = .needsPlan(cardId: firstUnplanned.id)
            phaseLabel = "Needs Plan"
            needsHuman = true
            humanPrompt = "Cards need a plan: propose one to launch the autonomy loop."
            agentAction = "Plan '\(firstUnplanned.id)': human approves at the gate"
        } else if inReview > 0 {
            let reviewIds = board.cards.filter { $0.column == "review" }.map(\.id)
            phase = .awaitingMerge(cardIds: reviewIds)
            phaseLabel = "Awaiting Merge"
            needsHuman = true
            humanPrompt = "Cards in review await an acceptance gate merge decision."
            agentAction = "Running project test gates on passing worktrees"
        } else if queueActive > 0 {
            phase = .inProgress(active: queueActive, pending: queuePending)
            phaseLabel = "In Progress"
            needsHuman = false
            humanPrompt = "Autopilot loop active in isolated git worktrees."
            agentAction = "Agents executing slices in parallel"
        } else {
            phase = .running
            phaseLabel = "Running"
            needsHuman = false
            humanPrompt = "Autopilot is idle: all verification gates clear."
            agentAction = "Nothing needs a human right now"
        }

        let counts = StatusCounts(
            todoUnplanned: unplanned,
            pendingProposals: pendingProposal != nil ? 1 : 0,
            queuePending: queuePending,
            queueActive: queueActive,
            inReview: inReview,
            blocked: blocked
        )

        return AutopilotStatus(
            board: board.title,
            phase: phase,
            phaseLabel: phaseLabel,
            needsHuman: needsHuman,
            humanPrompt: humanPrompt,
            agentAction: agentAction,
            counts: counts,
            proposal: pendingProposal
        )
    }

    public func submitIntent(text: String, kind: String = "feature", boardName: String? = nil) -> Card {
        lock.lock()
        defer { lock.unlock() }
        let key = boardName ?? boardNames.first ?? "dev"
        var board = getBoard(name: key)

        let slug = text.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .prefix(3)
            .joined(separator: "_")
        let cardId = "intent_\(slug.isEmpty ? "task" : slug)"

        let newCard = Card(
            id: cardId,
            title: text,
            column: "todo",
            description: "Natural language intent registered for autonomous execution: '\(text)'",
            priority: .high,
            labels: [kind, "autopilot"],
            acceptanceCriteria: [
                "Intent behavior verified with automated tests",
                "Worktree builds cleanly and passes acceptance gate"
            ],
            effort: Effort(3)
        )

        board.cards.insert(newCard, at: 0)
        boards[key] = board

        let newTask = TaskRequest(
            id: "task_\(cardId)",
            cardId: cardId,
            title: "Autonomous execution: \(text)",
            description: "Worktree attempt for proposed intent card.",
            priority: .high,
            status: .pending
        )
        tasks.insert(newTask, at: 0)

        history.insert(
            HistoryEntry(op: "add", board: key, card: cardId, newValue: "todo", at: "Just now"),
            at: 0
        )

        return newCard
    }

    public func proposePlan(cardId: String, boardName: String? = nil) -> PlanProposal {
        lock.lock()
        defer { lock.unlock() }
        let board = getBoard(name: boardName)
        let targetCard = board.cards.first { $0.id == cardId }
        let title = targetCard?.title ?? "Selected Card"
        let criteria = targetCard?.acceptanceCriteria.isEmpty == false
            ? targetCard!.acceptanceCriteria
            : ["Meets the card's intent", "Passes automated acceptance tests"]

        let slice1Effort = max(1, Int(Double(targetCard?.effort?.points ?? 3) * 0.6))
        let slice2Effort = max(1, Int(Double(targetCard?.effort?.points ?? 3) * 0.4))

        let proposal = PlanProposal(
            cardId: cardId,
            cardTitle: title,
            proposedAt: Date(),
            proposedBy: "opencode-1",
            requirements: [
                PlanRequirement(
                    title: "\(title): slice 1 (core loop)",
                    acceptanceCriteria: [criteria.first ?? "Core logic and state handling pass"],
                    effort: slice1Effort
                ),
                PlanRequirement(
                    title: "\(title): slice 2 (polish + edge cases)",
                    acceptanceCriteria: criteria.count > 1 ? [criteria[1]] : ["Acceptance gate passes cleanly"],
                    effort: slice2Effort
                )
            ],
            children: [
                PlanChildCard(
                    title: "\(title): slice 1 (core loop)",
                    description: "Core logic and state handling in isolated worktree.\n\nFrom card: \(targetCard?.description ?? "")",
                    priority: targetCard?.priority ?? .high,
                    effort: slice1Effort,
                    labels: targetCard?.labels ?? ["autonomy"],
                    acceptanceCriteria: [criteria.first ?? "Isolated unit tests pass"]
                ),
                PlanChildCard(
                    title: "\(title): slice 2 (polish + edge cases)",
                    description: "Interface integration and acceptance verification.\n\nFrom card: \(targetCard?.description ?? "")",
                    priority: .medium,
                    effort: slice2Effort,
                    labels: targetCard?.labels ?? ["ui"],
                    acceptanceCriteria: criteria.count > 1 ? [criteria[1]] : ["Acceptance gate passes without error"]
                )
            ],
            estimatedTotalEffort: slice1Effort + slice2Effort,
            riskLevel: targetCard?.priority == .critical ? "high" : "low",
            rationale: "Decomposed into two isolated worktree branches: core loop first, polish and gates following."
        )

        self.pendingProposal = proposal
        return proposal
    }

    public func approvePlan(cardId: String, boardName: String? = nil) -> [Card] {
        lock.lock()
        defer { lock.unlock() }
        let key = boardName ?? boardNames.first ?? "dev"
        var board = getBoard(name: key)
        var createdCards: [Card] = []

        if let proposal = pendingProposal, proposal.cardId == cardId {
            for (index, child) in proposal.children.enumerated() {
                let slug = child.title.lowercased()
                    .components(separatedBy: CharacterSet.alphanumerics.inverted)
                    .filter { !$0.isEmpty }
                    .joined(separator: "_")
                let childId = "\(cardId)_\(slug.prefix(12))_\(index + 1)"

                let childCard = Card(
                    id: childId,
                    title: child.title,
                    column: "todo",
                    description: child.description,
                    priority: child.priority,
                    labels: child.labels,
                    links: [CardLink(type: .parent, target: cardId)],
                    acceptanceCriteria: child.acceptanceCriteria,
                    effort: Effort(child.effort),
                    specId: board.cards.first { $0.id == cardId }?.specId
                )
                board.cards.append(childCard)
                createdCards.append(childCard)

                let childTask = TaskRequest(
                    id: "task_\(childId)",
                    cardId: childId,
                    title: child.title,
                    description: child.description,
                    priority: TaskPriority(rawValue: child.priority.rawValue) ?? .medium,
                    status: .pending
                )
                tasks.append(childTask)

                history.insert(
                    HistoryEntry(op: "add", board: key, card: childId, newValue: "todo", at: "Just now"),
                    at: 0
                )
            }
        }

        // Pin the parent as planned
        for index in board.cards.indices {
            if board.cards[index].id == cardId {
                board.cards[index].pinned = true
                board.cards[index].updatedAt = Date()
                break
            }
        }

        boards[key] = board
        pendingProposal = nil
        return createdCards
    }

    public func rejectPlan(cardId: String, reason: String? = nil, boardName: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        pendingProposal = nil
    }

    public func runSimulatedTestGate(cardId: String) -> TestGateVerdict {
        lock.lock()
        defer { lock.unlock() }
        let verdict = TestGateVerdict(
            passed: true,
            command: "cargo test --workspace",
            output: "Running 48 tests. Verification acceptance gates passed with zero errors.",
            durationSeconds: 2.85,
            timestamp: Date()
        )
        self.lastGateVerdict = verdict
        return verdict
    }

    public func runReviewGate(cardId: String) -> ReviewGateResult {
        lock.lock()
        defer { lock.unlock() }
        var passed = true
        var logs: [String] = []
        var totalTests = 0
        var passedTests = 0
        var failedTests = 0

        logs.append("Executing barkcli project acceptance gate for card: \(cardId)")

        let proposal = pendingProposal?.cardId == cardId ? pendingProposal : nil
        let targetCard = boards.values.flatMap(\.cards).first { $0.id == cardId } ?? getBoard(name: nil).cards.first { $0.id == cardId }

        // 1. Slices & Acceptance Criteria Validation
        let criteriaList: [String]
        if let slices = proposal?.children, !slices.isEmpty {
            criteriaList = slices.flatMap { $0.acceptanceCriteria }
            logs.append("  Inspecting \(slices.count) proposed architectural slices...")
        } else if let cardCriteria = targetCard?.acceptanceCriteria, !cardCriteria.isEmpty {
            criteriaList = cardCriteria
            logs.append("  Inspecting target card acceptance criteria...")
        } else {
            criteriaList = ["Core logic and state handling pass", "Acceptance gate passes cleanly"]
        }

        for (index, criterion) in criteriaList.enumerated() {
            totalTests += 1
            let trimmed = criterion.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                passedTests += 1
                logs.append("  [PASS] Acceptance criterion #\(index + 1): '\(trimmed)' verified")
            } else {
                failedTests += 1
                passed = false
                logs.append("  [FAIL] Acceptance criterion #\(index + 1): Empty criteria definition")
            }
        }

        // 2. Worktree & Branch Name Validation
        totalTests += 1
        let titleSource = targetCard?.title ?? proposal?.cardTitle ?? cardId
        let branchSlug = titleSource.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        let branchName = "feat/\(branchSlug.prefix(20))"

        if !branchSlug.isEmpty {
            passedTests += 1
            logs.append("  [PASS] Isolated git worktree branch: '\(branchName)'")
        } else {
            failedTests += 1
            passed = false
            logs.append("  [FAIL] Invalid branch slug generation")
        }

        // 3. Card Properties & Lifecycle Validation
        totalTests += 1
        let title = targetCard?.title ?? proposal?.cardTitle ?? ""
        if !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            passedTests += 1
            logs.append("  [PASS] Card title registered: '\(title)'")
        } else {
            failedTests += 1
            passed = false
            logs.append("  [FAIL] Missing card title")
        }

        totalTests += 1
        let priority = targetCard?.priority ?? proposal?.children.first?.priority
        if priority != nil {
            passedTests += 1
            logs.append("  [PASS] Card execution priority assigned: \(priority!.rawValue)")
        } else {
            failedTests += 1
            passed = false
            logs.append("  [FAIL] Unassigned card priority")
        }

        let durationSeconds = 1.45
        let result = ReviewGateResult(
            cardId: cardId,
            passed: passed,
            totalTests: totalTests,
            passedTests: passedTests,
            failedTests: failedTests,
            durationSeconds: durationSeconds,
            logs: logs,
            timestamp: Date()
        )

        self.lastGateVerdict = TestGateVerdict(
            passed: passed,
            command: "barkcli gate run --card \(cardId)",
            output: logs.joined(separator: "\n"),
            durationSeconds: durationSeconds,
            timestamp: Date()
        )
        return result
    }

    // MARK: - Task Management

    public func claimTask(id: String, agentId: String) {
        lock.lock()
        defer { lock.unlock() }
        for index in tasks.indices {
            if tasks[index].id == id {
                tasks[index].status = .inProgress
                tasks[index].assignedAgent = agentId
                tasks[index].lease = TaskLease(agentId: agentId)
                break
            }
        }
        for index in agents.indices {
            if agents[index].id == agentId {
                if !agents[index].activeTasks.contains(id) {
                    agents[index].activeTasks.append(id)
                }
                agents[index].status = .working
                agents[index].lastHeartbeat = Date()
                break
            }
        }
    }

    public func completeTask(id: String, agentId: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        for index in tasks.indices {
            if tasks[index].id == id {
                tasks[index].status = .completed
                break
            }
        }
        if let agentId {
            for index in agents.indices {
                if agents[index].id == agentId {
                    agents[index].activeTasks.removeAll { $0 == id }
                    agents[index].completedTasks.append(id)
                    if agents[index].activeTasks.isEmpty {
                        agents[index].status = .idle
                    }
                    break
                }
            }
        }
        orchestrationStatus.tasksCompleted += 1
    }

    public func failTask(id: String, agentId: String? = nil, error: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        for index in tasks.indices {
            if tasks[index].id == id {
                tasks[index].status = .failed
                tasks[index].blockedReason = error ?? "Acceptance test gate failed in worktree"
                break
            }
        }
        if let agentId {
            for index in agents.indices {
                if agents[index].id == agentId {
                    agents[index].activeTasks.removeAll { $0 == id }
                    agents[index].failedTasks.append(id)
                    if agents[index].activeTasks.isEmpty {
                        agents[index].status = .idle
                    }
                    break
                }
            }
        }
        orchestrationStatus.tasksFailed += 1
    }

    // MARK: - Agent Operations

    public func registerAgent(name: String, role: AgentRole) -> AgentItem {
        lock.lock()
        defer { lock.unlock() }
        let cleanId = name.lowercased().replacingOccurrences(of: " ", with: "_")
        let newAgent = AgentItem(
            id: cleanId,
            name: name,
            role: role,
            status: .idle,
            createdAt: Date(),
            lastHeartbeat: Date(),
            metrics: AgentMetrics(model: "local", provider: "barkcli", maxConcurrentTasks: 2, totalTokensUsed: 0)
        )
        agents.append(newAgent)
        return newAgent
    }

    public func removeAgent(id: String) {
        lock.lock()
        defer { lock.unlock() }
        agents.removeAll { $0.id == id }
        for index in tasks.indices {
            if tasks[index].assignedAgent == id {
                tasks[index].assignedAgent = nil
                tasks[index].status = .pending
            }
        }
    }

    // MARK: - Orchestration Cycles

    public func runCycle(boardName: String? = nil) -> OrchestrationCycleResult {
        lock.lock()
        defer { lock.unlock() }
        return triggerOrchestrationCycle(boardName: boardName)
    }

    public func triggerOrchestrationCycle(boardName: String? = nil) -> OrchestrationCycleResult {
        lock.lock()
        defer { lock.unlock() }
        cycleCount += 1
        let targetBoard = boardName ?? "dev"
        var board = getBoard(name: targetBoard)

        // Advance 1 task from InProgress to Completed if available
        var completedCount = 0
        if let activeTask = tasks.first(where: { $0.status == .inProgress }) {
            completeTask(id: activeTask.id, agentId: activeTask.assignedAgent)
            completedCount = 1

            // Move the corresponding card to review
            for index in board.cards.indices {
                if board.cards[index].id == activeTask.cardId && board.cards[index].column == "doing" {
                    board.cards[index].column = "review"
                    board.cards[index].updatedAt = Date()
                    break
                }
            }
        }

        // Dispatch 1 pending task to an idle agent
        var dispatchedCount = 0
        if let pendingTask = tasks.first(where: { $0.status == .pending }),
           let idleAgent = agents.first(where: { $0.status == .idle }) {
            claimTask(id: pendingTask.id, agentId: idleAgent.id)
            dispatchedCount = 1

            // Move the corresponding card to doing
            for index in board.cards.indices {
                if board.cards[index].id == pendingTask.cardId && board.cards[index].column == "todo" {
                    board.cards[index].column = "doing"
                    board.cards[index].updatedAt = Date()
                    break
                }
            }
        }

        boards[targetBoard] = board

        orchestrationStatus.cycleCount = cycleCount
        orchestrationStatus.tasksDispatched += dispatchedCount

        return OrchestrationCycleResult(
            cycleNumber: cycleCount,
            tasksCreated: 1,
            tasksDispatched: dispatchedCount,
            tasksCompleted: completedCount,
            tasksFailed: 0,
            insights: [
                "Cycle \(cycleCount) evaluated ready queues cleanly",
                "Advanced passing worktree tasks through verification gate",
                "Fleet heartbeats synchronized"
            ]
        )
    }

    // MARK: - Git History & Diff Inspection

    public func assignCommitToAgent(request: AssignCommitRequest) -> AssignCommitResponse {
        lock.lock()
        defer { lock.unlock() }
        let cardId = "card_from_\(request.commitSha?.prefix(7) ?? "commit")"
        let taskId = "task_\(cardId)"

        let card = Card(
            id: cardId,
            title: request.title,
            column: request.column ?? "doing",
            description: request.description ?? "Task created from commit inspection.",
            priority: Priority(rawValue: request.priority?.lowercased() ?? "medium") ?? .medium
        )

        let targetBoard = request.boardName ?? "dev"
        var b = getBoard(name: targetBoard)
        b.cards.append(card)
        boards[targetBoard] = b

        let task = TaskRequest(
            id: taskId,
            cardId: cardId,
            title: request.title,
            description: request.description ?? "",
            priority: TaskPriority(rawValue: request.priority?.lowercased() ?? "medium") ?? .medium,
            assignedAgent: request.agentId,
            status: request.agentId != nil ? .inProgress : .pending
        )
        tasks.append(task)

        return AssignCommitResponse(
            cardId: cardId,
            taskId: taskId,
            boardName: targetBoard,
            agentId: request.agentId,
            title: request.title,
            status: "assigned"
        )
    }

    public func getCommitDiff(sha: String) -> GitDiffResponse {
        lock.lock()
        defer { lock.unlock() }
        if let cached = diffsBySha[sha] {
            return cached
        }
        return GitDiffResponse(
            sha: sha,
            message: "Commit inspection diff",
            diff: "Unified diff for \(sha)",
            filesChanged: ["barkcli-core/src/lib.rs"],
            additions: 10,
            deletions: 2
        )
    }

    // MARK: - Memories & Project Facts

    public func getMemories(query: String? = nil, tier: String? = nil) -> [MemoryEntry] {
        lock.lock()
        defer { lock.unlock() }
        return memories.filter { mem in
            if let tier, !tier.isEmpty && mem.tier.rawValue != tier.lowercased() {
                return false
            }
            if let query, !query.isEmpty {
                return mem.content.localizedCaseInsensitiveContains(query) ||
                    mem.tags.contains { $0.localizedCaseInsensitiveContains(query) }
            }
            return true
        }
    }

    public func addMemory(
        content: String,
        tier: MemoryTier = .working,
        tags: [String] = [],
        source: String? = nil
    ) -> MemoryEntry {
        lock.lock()
        defer { lock.unlock() }
        let newEntry = MemoryEntry(
            id: "mem_\(memories.count + 1)",
            content: content,
            tier: tier,
            tags: tags,
            source: source ?? "MANUAL",
            createdAt: Date(),
            lastAccessed: Date(),
            accessCount: 1,
            importance: 0.6
        )
        memories.insert(newEntry, at: 0)
        return newEntry
    }

    public func deleteMemory(id: String) {
        lock.lock()
        defer { lock.unlock() }
        memories.removeAll { $0.id == id }
    }

    public func getFacts() -> [ProjectFact] {
        lock.lock()
        defer { lock.unlock() }
        return facts
    }

    public func addProjectFact(
        fact: String,
        category: String = "convention",
        confidence: Float = 1.0,
        sources: [String] = []
    ) -> ProjectFact {
        lock.lock()
        defer { lock.unlock() }
        let newFact = ProjectFact(
            fact: fact,
            category: category,
            confidence: confidence,
            sources: sources.isEmpty ? ["client"] : sources,
            createdAt: Date()
        )
        facts.insert(newFact, at: 0)
        return newFact
    }

    // MARK: - Specs & Traceability

    public func getSpecs(boardName: String? = nil) -> [Spec] {
        lock.lock()
        defer { lock.unlock() }
        return specs
    }

    public func getSpecCoverage(boardName: String? = nil) -> SpecCoverage {
        lock.lock()
        defer { lock.unlock() }
        let allReqs = specs.flatMap(\.requirements)
        let total = allReqs.count
        let implemented = allReqs.filter { $0.status == .implemented || $0.status == .verified }.count
        let verified = allReqs.filter { $0.status == .verified }.count
        let stale = allReqs.filter(\.stale).count
        let percent = total > 0 ? (Double(implemented) / Double(total)) * 100.0 : 100.0

        return SpecCoverage(
            totalRequirements: total,
            implemented: implemented,
            verified: verified,
            stale: stale,
            coveragePercent: percent
        )
    }
}
