import Foundation

/// Unified async interface for all backend and mock operations across barkcli.
/// Conforms to Sendable to guarantee thread safe operation in modern Swift concurrency.
public protocol APIClientProtocol: Sendable {
    // MARK: Workspace and Health
    func checkHealth() async throws -> HealthStatus
    func autoInit() async throws -> AutoInitResult
    func listBoards() async throws -> [String]
    func getBoard(name: String) async throws -> Board
    func saveCard(boardName: String, card: Card) async throws
    func moveCard(boardName: String, cardId: String, toColumn: String) async throws

    // MARK: Mind and Autopilot
    func getMindSnapshot() async throws -> MindSnapshot
    func getAutopilotStatus() async throws -> AutopilotStatus
    func submitIntent(prompt: String, kind: String?, backend: String?, board: String?) async throws -> IntentResponse
    func planAndRun(cardId: String, board: String?, backend: String?) async throws
    func approvePlan(cardId: String) async throws
    func rejectPlan(cardId: String, reason: String?) async throws
    func runReviewGate(cardId: String) async throws -> ReviewGateResult

    // MARK: Threads Engine
    func listThreads(board: String?) async throws -> [ThreadSummaryItem]
    func getThread(id: String, board: String?) async throws -> ThreadDetailItem
    func createThread(text: String, kind: String?, backend: String?, mode: String?, board: String?) async throws -> String
    func postThreadMessage(id: String, text: String, author: String?, board: String?, backend: String?) async throws -> ThreadEventItem
    func getTaskDiff(taskId: String) async throws -> TaskDiffResult

    // MARK: Agent Session Controls
    func stopSession(id: String) async throws
    func steerSession(id: String, guidance: String) async throws
    func forkSession(id: String) async throws -> String
    func raceTask(id: String, backendA: String?, backendB: String?) async throws -> [String]
    func evalSession(id: String) async throws -> SessionEvalResult

    // MARK: Orchestration and Fleet
    func listAgents() async throws -> [AgentItem]
    func listTasks() async throws -> [TaskRequest]
    func getLiveSessions() async throws -> [LiveSession]
    func triggerOrchestrationCycle() async throws -> CycleResult

    // MARK: Specs and Git
    func listSpecs() async throws -> [SpecItem]
    func getSpecsCoverage() async throws -> CoverageReport
    func getGitCommits() async throws -> [GitCommit]
    func getGitDiff(sha: String) async throws -> GitDiff
    func assignCommitToAgent(sha: String, prompt: String) async throws

    // MARK: Extended Operations
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

    // MARK: Subsystems
    func listSprints() async throws -> [SprintDetail]
    func createSprint(name: String, goal: String, start: String?, end: String?) async throws -> SprintDetail
    func searchCode(query: String) async throws -> [CodeSymbol]
    func linkCodeToCard(symbolId: String, cardId: String) async throws
    func getLivingContext() async throws -> LivingContext
    func refreshLivingContext() async throws -> LivingContext
    func listMemories(query: String?, tier: MemoryTier?) async throws -> [MemoryEntry]
    func addMemory(content: String, tier: MemoryTier) async throws -> MemoryEntry
    func listProjectFacts() async throws -> [ProjectFact]
    func addProjectFact(fact: String, category: String) async throws -> ProjectFact
    func getBrainGraph() async throws -> BrainGraph
    func listSkills() async throws -> [Skill]
    func toggleSkillInstall(id: String) async throws -> Skill
    func listDocs() async throws -> [DocItem]
    func getDoc(id: String) async throws -> DocItem
    func getAgenda() async throws -> [AgendaItem]
    func getReportMetrics() async throws -> ReportMetrics
    func listCheckpoints() async throws -> [Checkpoint]
    func createCheckpoint(description: String) async throws -> Checkpoint
    func restoreCheckpoint(id: String) async throws
    func runDoctor() async throws -> [DoctorIssue]
    func fixDoctorIssues() async throws -> [DoctorIssue]
}

// MARK: Default Implementations and Convenience Overloads
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

    func submitIntent(prompt: String, kind: String?, backend: String?) async throws -> IntentResponse {
        try await submitIntent(prompt: prompt, kind: kind, backend: backend, board: nil)
    }

    func submitIntent(prompt: String, kind: String?) async throws -> IntentResponse {
        try await submitIntent(prompt: prompt, kind: kind, backend: "opencode", board: nil)
    }

    func submitIntent(prompt: String) async throws -> IntentResponse {
        try await submitIntent(prompt: prompt, kind: "feature", backend: "opencode", board: nil)
    }

    func listThreads() async throws -> [ThreadSummaryItem] {
        try await listThreads(board: nil)
    }

    func getThread(id: String) async throws -> ThreadDetailItem {
        try await getThread(id: id, board: nil)
    }

    func planAndRun(cardId: String) async throws {
        try await planAndRun(cardId: cardId, board: nil, backend: nil)
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

    // Default implementations for subsystems
    func listSprints() async throws -> [SprintDetail] {
        []
    }

    func createSprint(name: String, goal: String, start: String?, end: String?) async throws -> SprintDetail {
        SprintDetail(name: name, goal: goal, start: start, end: end)
    }

    func searchCode(query: String) async throws -> [CodeSymbol] {
        []
    }

    func linkCodeToCard(symbolId: String, cardId: String) async throws {}

    func getLivingContext() async throws -> LivingContext {
        LivingContext()
    }

    func refreshLivingContext() async throws -> LivingContext {
        LivingContext()
    }

    func listMemories(query: String?, tier: MemoryTier?) async throws -> [MemoryEntry] {
        []
    }

    func addMemory(content: String, tier: MemoryTier) async throws -> MemoryEntry {
        MemoryEntry(id: UUID().uuidString, content: content, tier: tier)
    }

    func listProjectFacts() async throws -> [ProjectFact] {
        []
    }

    func addProjectFact(fact: String, category: String) async throws -> ProjectFact {
        ProjectFact(fact: fact, category: category)
    }

    func getBrainGraph() async throws -> BrainGraph {
        BrainGraph()
    }

    func listSkills() async throws -> [Skill] {
        []
    }

    func toggleSkillInstall(id: String) async throws -> Skill {
        Skill(id: id, name: id, description: "")
    }

    func listDocs() async throws -> [DocItem] {
        []
    }

    func getDoc(id: String) async throws -> DocItem {
        DocItem(id: id, title: id, category: "Manual", path: "", summary: "", content: "")
    }

    func getAgenda() async throws -> [AgendaItem] {
        []
    }

    func getReportMetrics() async throws -> ReportMetrics {
        ReportMetrics()
    }

    func listCheckpoints() async throws -> [Checkpoint] {
        []
    }

    func createCheckpoint(description: String) async throws -> Checkpoint {
        Checkpoint(id: UUID().uuidString, description: description)
    }

    func restoreCheckpoint(id: String) async throws {}

    func runDoctor() async throws -> [DoctorIssue] {
        []
    }

    func fixDoctorIssues() async throws -> [DoctorIssue] {
        []
    }
}
