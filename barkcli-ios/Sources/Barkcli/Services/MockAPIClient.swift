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
        store.boardNames
    }

    public func getBoard(name: String) async throws -> Board {
        store.getBoard(name: name)
    }

    public func saveCard(boardName: String, card: Card) async throws {
        var board = store.getBoard(name: boardName)
        if let idx = board.cards.firstIndex(where: { $0.id == card.id }) {
            board.cards[idx] = card
        } else {
            board.cards.append(card)
        }
        store.boards[boardName] = board
    }

    public func moveCard(boardName: String, cardId: String, toColumn: String) async throws {
        store.moveCard(id: cardId, toColumn: toColumn, boardName: boardName)
    }

    public func checkWorkspaceStatus() async throws -> WorkspaceStatus {
        let boards = store.boardNames
        return WorkspaceStatus(
            initialized: !boards.isEmpty,
            boardDirExists: true,
            configFileExists: true,
            boardsCount: boards.count,
            message: "Demo workspace active with \(boards.count) board(s)"
        )
    }


    public func saveBoard(_ board: Board, name: String? = nil) async throws {
        let targetName = name ?? board.title
        store.boards[targetName] = board
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

    public func submitIntent(prompt: String, kind: String? = "feature") async throws -> IntentResponse {
        let card = store.submitIntent(text: prompt, kind: kind ?? "feature", boardName: nil)
        return IntentResponse(
            cardId: card.id,
            title: card.title,
            board: "dev",
            status: "created"
        )
    }

    public func submitIntent(text: String, kind: String? = "feature", board: String? = nil) async throws -> String {
        let card = store.submitIntent(text: text, kind: kind ?? "feature", boardName: board)
        return "Created card \(card.id): \(card.title)"
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

    // MARK: - Orchestration & Fleet

    public func listAgents() async throws -> [AgentItem] {
        store.agents
    }

    public func registerAgent(name: String, role: AgentRole) async throws -> AgentItem {
        store.registerAgent(name: name, role: role)
    }

    public func removeAgent(id: String) async throws {
        store.removeAgent(id: id)
    }

    public func listTasks(status: String? = nil, cardId: String? = nil, agentId: String? = nil) async throws -> [TaskRequest] {
        var tasks = store.tasks
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
        store.liveRunners
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
        let all = store.commits
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
}
