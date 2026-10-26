import Foundation
import Observation

/// In-memory mock API client backed by `DemoStore`.
/// Provides 100% offline feature parity with `LiveAPIClient`, satisfying Requirement R3.
@Observable
public final class MockAPIClient: APIClientProtocol, @unchecked Sendable {
    public static let shared = MockAPIClient()
    public let store: DemoStore

    public init(store: DemoStore = .shared) {
        self.store = store
    }

    // MARK: - Workspace & Health

    public func checkHealth() async throws -> HealthStatus {
        HealthStatus(
            status: "ok",
            port: 4321,
            version: "0.8.0",
            uptimeSeconds: 3600
        )
    }

    public func autoInit(boardName: String? = "dev") async throws -> AutoInitResult {
        let name = boardName ?? "dev"
        if !store.boardNames.contains(name) {
            let newBoard = Board(
                title: name,
                description: "Auto initialized board for \(name)",
                columns: [
                    Column(id: "todo", name: "To Do"),
                    Column(id: "doing", name: "Doing"),
                    Column(id: "review", name: "Review"),
                    Column(id: "done", name: "Done")
                ],
                cards: []
            )
            store.boards[name] = newBoard
            store.boardNames.append(name)
        }
        return AutoInitResult(
            created: true,
            boardPath: ".board/\(name).board",
            message: "Workspace initialized with \(name) board"
        )
    }

    public func listBoards() async throws -> [String] {
        store.listBoardNames()
    }

    public func getBoard(name: String) async throws -> Board {
        store.getBoard(name: name)
    }

    public func saveCard(boardName: String, card: Card) async throws {
        store.saveCard(card, boardName: boardName)
    }

    public func moveCard(boardName: String, cardId: String, toColumn: String) async throws {
        store.moveCard(id: cardId, toColumn: toColumn, boardName: boardName)
    }

    public func checkWorkspaceStatus() async throws -> WorkspaceStatus {
        let boards = store.listBoardNames()
        return WorkspaceStatus(
            initialized: !boards.isEmpty,
            boardDirExists: true,
            configFileExists: true,
            boardsCount: boards.count,
            message: "Demo workspace active with \(boards.count) board(s)"
        )
    }

    public func saveBoard(_ board: Board, name: String? = nil) async throws {
        store.saveBoard(board, name: name)
    }

    public func addCardComment(boardName: String? = nil, cardId: String, text: String, author: String = "human") async throws {
        store.addCardComment(cardId: cardId, text: text, author: author, boardName: boardName)
    }

    public func addCardComment(cardId: String, text: String, author: String = "human", board: String? = nil) async throws {
        store.addCardComment(cardId: cardId, text: text, author: author, boardName: board)
    }

    // MARK: - Mind & Autopilot

    public func getMindSnapshot(board: String? = nil) async throws -> MindSnapshot {
        store.getMindSnapshot(boardName: board)
    }

    public func getAutopilotStatus(board: String? = nil) async throws -> AutopilotStatus {
        store.getAutopilotStatus(boardName: board)
    }

    public func submitIntent(prompt: String, kind: String? = "feature", backend: String? = "opencode", board: String? = nil) async throws -> IntentResponse {
        let card = store.submitIntent(text: prompt, kind: kind ?? "feature", boardName: board, backend: backend)
        return IntentResponse(
            cardId: card.id,
            title: card.title,
            board: board ?? "dev",
            status: "created"
        )
    }

    public func submitIntent(text: String, kind: String? = "feature", board: String? = nil) async throws -> String {
        let card = store.submitIntent(text: text, kind: kind ?? "feature", boardName: board, backend: "opencode")
        return "Created card \(card.id): \(card.title)"
    }

    public func planAndRun(cardId: String, board: String? = nil, backend: String? = nil) async throws {
        _ = try await proposePlan(cardId: cardId, board: board)
        try await approvePlan(cardId: cardId, board: board)
    }

    public func proposePlan(cardId: String, board: String? = nil) async throws -> PlanProposal {
        return store.proposePlan(cardId: cardId, boardName: board)
    }

    public func approvePlan(cardId: String, board: String? = nil) async throws {
        _ = store.approvePlan(cardId: cardId, boardName: board)
    }

    public func rejectPlan(cardId: String, reason: String? = nil, board: String? = nil) async throws {
        store.rejectPlan(cardId: cardId, reason: reason, boardName: board)
    }

    public func runReviewGate(cardId: String) async throws -> ReviewGateResult {
        store.runReviewGate(cardId: cardId)
    }

    // MARK: - Threads Engine
    public func listThreads(board: String? = nil) async throws -> [ThreadSummaryItem] {
        let b = store.getBoard(name: board ?? "dev")
        return b.cards.map { card in
            let statusGroup: String
            switch card.column.lowercased() {
            case "doing":
                statusGroup = "running"
            case "review":
                statusGroup = "needs_you"
            case "done":
                statusGroup = "settled"
            default:
                statusGroup = "features"
            }
            let updatedStr = card.updatedAt.map { ISO8601DateFormatter().string(from: $0) } ?? ISO8601DateFormatter().string(from: Date())
            return ThreadSummaryItem(
                id: card.id,
                title: card.title,
                statusGroup: statusGroup,
                eventCount: 3,
                updatedAt: updatedStr,
                column: card.column,
                backend: card.assignee ?? "opencode"
            )
        }
    }

    public func getThread(id: String, board: String? = nil) async throws -> ThreadDetailItem {
        let b = store.getBoard(name: board ?? "dev")
        let card = b.cards.first(where: { $0.id == id })
        let now = ISO8601DateFormatter().string(from: Date())
        let events = [
            ThreadEventItem(
                id: "evt_1_\(id)",
                cardId: id,
                kind: .user,
                author: "you",
                text: card?.title ?? "Plan feature",
                createdAt: now
            ),
            ThreadEventItem(
                id: "evt_2_\(id)",
                cardId: id,
                kind: .assistant,
                author: "barkcli",
                text: "Requirements analyzed and slice plan generated.",
                createdAt: now
            ),
            ThreadEventItem(
                id: "evt_3_\(id)",
                cardId: id,
                kind: .planProposed,
                author: "barkcli",
                text: "Proposed plan with atomic tasks.",
                createdAt: now
            )
        ]
        return ThreadDetailItem(id: id, card: card, events: events)
    }

    public func createThread(text: String, kind: String? = "feature", backend: String? = "opencode", mode: String? = "plan_first", board: String? = nil) async throws -> String {
        let card = store.submitIntent(text: text, kind: kind ?? "feature", boardName: board, backend: backend)
        return card.id
    }

    public func postThreadMessage(id: String, text: String, author: String? = "you", board: String? = nil, backend: String? = nil) async throws -> ThreadEventItem {
        let now = ISO8601DateFormatter().string(from: Date())
        return ThreadEventItem(
            id: "evt_\(Int(Date().timeIntervalSince1970))",
            cardId: id,
            kind: .user,
            author: author ?? "you",
            text: text,
            createdAt: now
        )
    }

    public func getTaskDiff(taskId: String) async throws -> TaskDiffResult {
        TaskDiffResult(
            taskId: taskId,
            diff: "diff --git a/src/main.rs b/src/main.rs\nindex 123..456 100644\n--- a/src/main.rs\n+++ b/src/main.rs\n@@ -1,3 +1,4 @@\n+// Added feature in worktree\n",
            hasDiff: true
        )
    }

    public func stopSession(id: String) async throws {}

    public func steerSession(id: String, guidance: String) async throws {}

    public func forkSession(id: String) async throws -> String {
        "\(id)_fork"
    }

    public func raceTask(id: String, backendA: String? = "opencode", backendB: String? = "claude") async throws -> [String] {
        ["\(id)_race_a", "\(id)_race_b"]
    }

    public func evalSession(id: String) async throws -> SessionEvalResult {
        SessionEvalResult(
            sessionId: id,
            taskId: "task_mock",
            backend: "opencode",
            status: "done",
            durationMs: 8400,
            testGatePassed: true,
            filesChangedCount: 3,
            qualityScore: 0.96
        )
    }

    // MARK: - Orchestration & Fleet

    public func listAgents() async throws -> [AgentItem] {
        store.listAgents()
    }

    public func registerAgent(name: String, role: AgentRole) async throws -> AgentItem {
        store.registerAgent(name: name, role: role)
    }

    public func removeAgent(id: String) async throws {
        store.removeAgent(id: id)
    }

    public func listTasks(status: String? = nil, cardId: String? = nil, agentId: String? = nil) async throws -> [TaskRequest] {
        var tasks = store.listTasks()
        if let status, !status.isEmpty {
            tasks = tasks.filter { $0.status.rawValue.lowercased() == status.lowercased() }
        }
        if let cardId, !cardId.isEmpty {
            tasks = tasks.filter { $0.cardId == cardId }
        }
        if let agentId, !agentId.isEmpty {
            tasks = tasks.filter { $0.assignedAgent == agentId }
        }
        return tasks
    }

    public func claimTask(id: String, agentId: String) async throws {
        store.claimTask(id: id, agentId: agentId)
    }

    public func completeTask(id: String, agentId: String? = nil, durationMs: UInt64 = 0) async throws {
        store.completeTask(id: id, agentId: agentId)
    }

    public func failTask(id: String, agentId: String? = nil, error: String? = nil) async throws {
        store.failTask(id: id, agentId: agentId, error: error)
    }

    public func getLiveSessions() async throws -> [LiveSession] {
        store.listLiveRunners()
    }

    public func triggerOrchestrationCycle() async throws -> CycleResult {
        store.triggerOrchestrationCycle(boardName: nil)
    }

    // MARK: - Specs & Git

    public func listSpecs() async throws -> [SpecItem] {
        store.getSpecs(boardName: nil)
    }

    public func getSpecsCoverage() async throws -> CoverageReport {
        store.getSpecCoverage(boardName: nil)
    }

    public func getGitCommits(branch: String? = nil, limit: Int? = 60) async throws -> [GitCommit] {
        let all = store.listCommits()
        if let limit, limit > 0 {
            return Array(all.prefix(limit))
        }
        return all
    }

    public func getGitDiff(sha: String) async throws -> GitDiff {
        store.getCommitDiff(sha: sha)
    }

    public func assignCommitToAgent(sha: String, prompt: String) async throws {
        let request = AssignCommitRequest(
            boardName: "dev",
            commitSha: sha,
            title: "Task from \(sha.prefix(7))",
            description: prompt
        )
        _ = store.assignCommitToAgent(request: request)
    }

    // MARK: Subsystems Mock Handlers

    public func listSprints() async throws -> [SprintDetail] {
        store.listSprintDetails()
    }

    public func createSprint(name: String, goal: String, start: String? = nil, end: String? = nil) async throws -> SprintDetail {
        store.createSprintDetail(name: name, goal: goal, start: start, end: end)
    }

    public func searchCode(query: String) async throws -> [CodeSymbol] {
        store.searchCode(query: query)
    }

    public func linkCodeToCard(symbolId: String, cardId: String) async throws {
        store.linkCodeToCard(symbolId: symbolId, cardId: cardId)
    }

    public func getLivingContext() async throws -> LivingContext {
        store.getLivingContext()
    }

    public func refreshLivingContext() async throws -> LivingContext {
        store.refreshLivingContext()
    }

    public func listMemories(query: String?, tier: MemoryTier?) async throws -> [MemoryEntry] {
        store.getMemories(query: query, tier: tier?.rawValue)
    }

    public func addMemory(content: String, tier: MemoryTier) async throws -> MemoryEntry {
        store.addMemory(content: content, tier: tier)
    }

    public func listProjectFacts() async throws -> [ProjectFact] {
        store.getFacts()
    }

    public func addProjectFact(fact: String, category: String) async throws -> ProjectFact {
        store.addProjectFact(fact: fact, category: category)
    }

    public func getBrainGraph() async throws -> BrainGraph {
        store.getBrainGraph()
    }

    public func listSkills() async throws -> [Skill] {
        store.listSkills()
    }

    public func toggleSkillInstall(id: String) async throws -> Skill {
        store.toggleSkillInstall(id: id)
    }

    public func listDocs() async throws -> [DocItem] {
        store.listDocs()
    }

    public func getDoc(id: String) async throws -> DocItem {
        store.getDoc(id: id)
    }

    public func getAgenda() async throws -> [AgendaItem] {
        store.getAgenda()
    }

    public func getReportMetrics() async throws -> ReportMetrics {
        store.getReportMetrics()
    }

    public func listCheckpoints() async throws -> [Checkpoint] {
        store.listCheckpoints()
    }

    public func createCheckpoint(description: String) async throws -> Checkpoint {
        store.createCheckpoint(description: description)
    }

    public func restoreCheckpoint(id: String) async throws {
        store.restoreCheckpoint(id: id)
    }

    public func runDoctor() async throws -> [DoctorIssue] {
        store.runDoctor()
    }

    public func fixDoctorIssues() async throws -> [DoctorIssue] {
        store.fixDoctorIssues()
    }
}
