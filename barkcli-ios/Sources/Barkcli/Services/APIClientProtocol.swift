import Foundation

/// Unified async interface for all backend and mock operations across barkcli.
/// Conforms to `Sendable` to guarantee thread-safe operation in modern Swift concurrency.
public protocol APIClientProtocol: Sendable {
    // MARK: - Workspace & Health
    func checkHealth() async throws -> HealthStatus
    func autoInit() async throws -> AutoInitResult
    func listBoards() async throws -> [String]
    func getBoard(name: String) async throws -> Board
    func saveCard(boardName: String, card: Card) async throws
    func moveCard(boardName: String, cardId: String, toColumn: String) async throws

    // MARK: - Mind & Autopilot
    func getMindSnapshot() async throws -> MindSnapshot
    func getAutopilotStatus() async throws -> AutopilotStatus
    func submitIntent(prompt: String, kind: String?) async throws -> IntentResponse
    func approvePlan(cardId: String) async throws
    func rejectPlan(cardId: String, reason: String?) async throws
    func runReviewGate(cardId: String) async throws -> ReviewGateResult

    // MARK: - Orchestration & Fleet
    func listAgents() async throws -> [AgentItem]
    func listTasks() async throws -> [TaskRequest]
    func getLiveSessions() async throws -> [LiveSession]
    func triggerOrchestrationCycle() async throws -> CycleResult

    // MARK: - Specs & Git
    func listSpecs() async throws -> [SpecItem]
    func getSpecsCoverage() async throws -> CoverageReport
    func getGitCommits() async throws -> [GitCommit]
    func getGitDiff(sha: String) async throws -> GitDiff
    func assignCommitToAgent(sha: String, prompt: String) async throws

    // MARK: - Extended Operations (Optional / Convenience)
    func getMindSnapshot(board: String?) async throws -> MindSnapshot
    func getAutopilotStatus(board: String?) async throws -> AutopilotStatus
    func proposePlan(cardId: String, board: String?) async throws -> PlanProposal
    func approvePlan(cardId: String, board: String?) async throws
    func rejectPlan(cardId: String, reason: String?, board: String?) async throws
    func listTasks(status: String?, cardId: String?, agentId: String?) async throws -> [TaskRequest]
    func getGitCommits(branch: String?, limit: Int?) async throws -> [GitCommit]
    func checkWorkspaceStatus() async throws -> WorkspaceStatus
    func autoInit(boardName: String?) async throws -> AutoInitResult
    func saveBoard(_ board: Board, name: String?) async throws
    func addCardComment(boardName: String?, cardId: String, text: String, author: String) async throws
    func registerAgent(name: String, role: AgentRole) async throws -> AgentItem
    func removeAgent(id: String) async throws
    func claimTask(id: String, agentId: String) async throws
    func completeTask(id: String, agentId: String?, durationMs: UInt64) async throws
    func failTask(id: String, agentId: String?, error: String?) async throws
}

// MARK: - Default Implementations & Convenience Overloads
public extension APIClientProtocol {
    func getBoard() async throws -> Board {
        try await getBoard(name: "dev")
    }

    func getMindSnapshot() async throws -> MindSnapshot {
        try await getMindSnapshot(board: nil)
    }

    func getAutopilotStatus() async throws -> AutopilotStatus {
        try await getAutopilotStatus(board: nil)
    }

    func submitIntent(prompt: String) async throws -> IntentResponse {
        try await submitIntent(prompt: prompt, kind: "feature")
    }

    func approvePlan(cardId: String) async throws {
        try await approvePlan(cardId: cardId, board: nil)
    }

    func rejectPlan(cardId: String, reason: String?) async throws {
        try await rejectPlan(cardId: cardId, reason: reason, board: nil)
    }

    func listTasks() async throws -> [TaskRequest] {
        try await listTasks(status: nil, cardId: nil, agentId: nil)
    }

    func getGitCommits() async throws -> [GitCommit] {
        try await getGitCommits(branch: nil, limit: 60)
    }

    func autoInit() async throws -> AutoInitResult {
        try await autoInit(boardName: "dev")
    }

    func proposePlan(cardId: String) async throws -> PlanProposal {
        try await proposePlan(cardId: cardId, board: nil)
    }

    func addCardComment(cardId: String, text: String, author: String = "human", board: String? = nil) async throws {
        try await addCardComment(boardName: board, cardId: cardId, text: text, author: author)
    }

    func submitIntent(text: String, kind: String? = "feature", board: String? = nil) async throws -> String {
        let res = try await submitIntent(prompt: text, kind: kind)
        return "Created card \(res.cardId): \(res.title)"
    }
}

