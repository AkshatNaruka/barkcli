import Foundation
import Observation

public enum ConnectionMode: String, Sendable, CaseIterable, Identifiable {
    case connected = "connected"
    case connecting = "connecting"
    case disconnected = "disconnected"
    case demoMode = "demoMode"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .connected:
            return "Connected"
        case .connecting:
            return "Connecting"
        case .disconnected:
            return "Disconnected"
        case .demoMode:
            return "Demo Mode"
        }
    }
}

@Observable
public final class AppState: @unchecked Sendable {
    public static let shared = AppState()

    // MARK: Core Services

    public let apiClient: APIClient
    public let webSocketClient: WebSocketClient
    public let demoStore: DemoStore
    public let threadStore: ThreadStore

    // MARK: Connection State

    public var connectionMode: ConnectionMode = .demoMode
    public var projectURL: URL {
        didSet {
            apiClient.baseURL = projectURL
            webSocketClient.updateEndpoint(baseURL: projectURL, authToken: authToken)
        }
    }
    public var authToken: String? {
        didSet {
            apiClient.authToken = authToken
            webSocketClient.updateEndpoint(baseURL: projectURL, authToken: authToken)
        }
    }
    public var isBusy: Bool = false
    public var statusBannerMessage: String?

    // MARK: Boards and Cards

    public var availableBoards: [String] = []
    public var currentBoardName: String = "dev"
    public var currentBoard: Board?
    public var mindSnapshot: MindSnapshot?
    public var workspaceStatus: WorkspaceStatus?

    // MARK: Filtering and Search

    public var searchQuery: String = ""
    public var selectedPriorityFilter: Priority?
    public var selectedLabelFilter: String?
    public var selectedAreaFilter: String?

    // MARK: Agent Fleet and Task Queue

    public var agents: [AgentItem] = []
    public var tasks: [TaskRequest] = []
    public var liveRunners: [LiveRunnerSession] = []
    public var orchestrationStatus: OrchestrationStatus = OrchestrationStatus()
    public var specs: [Spec] = []
    public var specCoverage: SpecCoverage?
    public var lastGateVerdict: TestGateVerdict?

    // MARK: Git and Codex Diff Inspector

    public var gitCommits: [GitCommit] = []
    public var selectedCommit: GitCommit?
    public var selectedCommitDiff: GitDiffResponse?
    public var activeBranch: String = "main"
    public var availableBranches: [String] = ["main"]
    public var isLoadingDiff: Bool = false

    // MARK: Autopilot Intent and Plan Proposals

    public var intentDraft: String = ""
    public var isSubmittingIntent: Bool = false
    public var pendingProposal: PlanProposal?
    public var showPlanProposalModal: Bool = false
    public var executionProgress: Double = 0.0
    public var executionStatusMessage: String?
    public var isExecutingAutopilot: Bool = false

    // MARK: Initialization

    public init(
        initialURL: URL = URL(string: "http://localhost:4321")!,
        authToken: String? = nil,
        startInDemo: Bool = true
    ) {
        self.projectURL = initialURL
        self.authToken = authToken
        self.apiClient = APIClient(baseURL: initialURL, authToken: authToken)
        self.webSocketClient = WebSocketClient(baseURL: initialURL, authToken: authToken)
        self.demoStore = DemoStore.shared
        self.threadStore = ThreadStore(client: startInDemo ? MockAPIClient(store: self.demoStore) : self.apiClient)

        if startInDemo {
            loadDemoData()
        } else {
            self.connectionMode = .disconnected
        }

        setupWebSocketHandlers()
    }

    private func setupWebSocketHandlers() {
        webSocketClient.onReload = { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.refresh()
            }
        }

        webSocketClient.onRunnerHeartbeat = { [weak self] runner in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let index = self.liveRunners.firstIndex(where: { $0.id == runner.id }) {
                    self.liveRunners[index] = runner
                } else {
                    self.liveRunners.append(runner)
                }
            }
        }
    }

    // MARK: Computed Properties

    public var isDemoMode: Bool {
        connectionMode == .demoMode
    }

    public var cards: [Card] {
        currentBoard?.cards ?? []
    }

    public var filteredCards: [Card] {
        guard let currentBoard else { return [] }
        return currentBoard.cards.filter { card in
            if !searchQuery.isEmpty {
                let matchesTitle = card.title.localizedCaseInsensitiveContains(searchQuery)
                let matchesDescription = card.description?.localizedCaseInsensitiveContains(searchQuery) ?? false
                let matchesId = card.id.localizedCaseInsensitiveContains(searchQuery)
                if !matchesTitle && !matchesDescription && !matchesId {
                    return false
                }
            }
            if let priority = selectedPriorityFilter, card.priority != priority {
                return false
            }
            if let label = selectedLabelFilter, !card.labels.contains(label) {
                return false
            }
            if let area = selectedAreaFilter, card.area != area {
                return false
            }
            return true
        }
    }

    public var unblockedReadyCards: [Card] {
        currentBoard?.unblockedReadyCards() ?? []
    }

    // MARK: Mode Switching and Connection

    public func toggleDemoMode() {
        if connectionMode == .demoMode {
            Task {
                await connect()
            }
        } else {
            switchToDemoMode()
        }
    }

    public func switchToDemoMode() {
        webSocketClient.disconnect()
        connectionMode = .demoMode
        threadStore.client = MockAPIClient(store: demoStore)
        statusBannerMessage = "Running in offline demo mode"
        loadDemoData()
    }

    public func connect(url: URL? = nil, authToken: String? = nil) async {
        if let url {
            self.projectURL = url
        }
        if let authToken {
            self.authToken = authToken
        }

        connectionMode = .connecting
        statusBannerMessage = "Connecting to barkcli server"

        do {
            let status = try await apiClient.checkWorkspaceStatus()
            self.workspaceStatus = status

            let remoteBoards = try await apiClient.fetchBoards()
            self.availableBoards = remoteBoards
            if let first = remoteBoards.first {
                self.currentBoardName = first
            }

            threadStore.client = apiClient
            webSocketClient.connect()
            self.connectionMode = .connected
            self.statusBannerMessage = nil

            await refresh()
        } catch {
            self.connectionMode = .disconnected
            self.statusBannerMessage = "Connection failed. Please check if the server is running."
        }
    }

    public func disconnect() {
        webSocketClient.disconnect()
        connectionMode = .disconnected
        threadStore.client = MockAPIClient(store: demoStore)
        statusBannerMessage = "Disconnected from server"
    }

    // MARK: Data Refresh

    public func refresh() async {
        isBusy = true
        defer { isBusy = false }

        if isDemoMode {
            loadDemoData()
            return
        }

        do {
            async let boardListTask = apiClient.fetchBoards()
            async let boardTask = apiClient.fetchBoard(name: currentBoardName)
            async let mindTask = apiClient.fetchMindSnapshot(board: currentBoardName)
            async let tasksTask = apiClient.fetchTasks()
            async let agentsTask = apiClient.fetchAgents()
            async let runnersTask = apiClient.fetchLiveRunners()
            async let commitsTask = apiClient.fetchGitCommits(branch: activeBranch, limit: 60)
            async let specsTask = apiClient.fetchSpecs(board: currentBoardName)
            async let coverageTask = apiClient.fetchSpecCoverage(board: currentBoardName)
            async let orchTask = apiClient.fetchOrchestrationStatus()

            let (boards, board, mind, tasks, agents, runners, commitsResp, specs, cov, orch) = try await (
                boardListTask,
                boardTask,
                mindTask,
                tasksTask,
                agentsTask,
                runnersTask,
                commitsTask,
                specsTask,
                coverageTask,
                orchTask
            )

            self.availableBoards = boards
            self.currentBoard = board
            self.mindSnapshot = mind
            self.tasks = tasks
            self.agents = agents
            self.liveRunners = runners
            self.gitCommits = commitsResp.commits
            self.activeBranch = commitsResp.branch
            self.availableBranches = commitsResp.branches
            self.specs = specs
            self.specCoverage = cov
            self.orchestrationStatus = orch

            if selectedCommit == nil, let firstCommit = commitsResp.commits.first {
                await selectCommit(commit: firstCommit)
            }
            await threadStore.loadThreads(board: currentBoardName)
        } catch {
            self.statusBannerMessage = "Refresh warning: \(error.localizedDescription)"
        }
    }

    private func loadDemoData() {
        self.availableBoards = demoStore.boardNames
        self.currentBoard = demoStore.getBoard(name: currentBoardName)
        self.mindSnapshot = demoStore.getMindSnapshot(boardName: currentBoardName)
        self.agents = demoStore.agents
        self.tasks = demoStore.tasks
        self.liveRunners = demoStore.liveRunners
        self.gitCommits = demoStore.commits
        self.specs = demoStore.specs
        self.pendingProposal = demoStore.pendingProposal
        self.lastGateVerdict = demoStore.lastGateVerdict
        self.orchestrationStatus = demoStore.orchestrationStatus

        if let firstCommit = demoStore.commits.first {
            self.selectedCommit = firstCommit
            self.selectedCommitDiff = demoStore.getCommitDiff(sha: firstCommit.sha)
        }
        Task {
            await threadStore.loadThreads(board: currentBoardName)
        }
    }

    // MARK: Board Actions

    public func switchBoard(to name: String) async {
        guard name != currentBoardName || currentBoard == nil else { return }
        currentBoardName = name

        if isDemoMode {
            currentBoard = demoStore.getBoard(name: name)
            mindSnapshot = demoStore.getMindSnapshot(boardName: name)
            await threadStore.loadThreads(board: name)
            return
        }

        do {
            let board = try await apiClient.fetchBoard(name: name)
            let mind = try await apiClient.fetchMindSnapshot(board: name)
            self.currentBoard = board
            self.mindSnapshot = mind
            await threadStore.loadThreads(board: name)
        } catch {
            self.statusBannerMessage = "Failed to switch board: \(error.localizedDescription)"
        }
    }

    public func createBoard(name: String) async {
        if isDemoMode {
            let empty = Board(
                title: name,
                description: "The management layer for AI agents",
                columns: [
                    Column(id: "todo", name: "Todo"),
                    Column(id: "doing", name: "Doing"),
                    Column(id: "review", name: "Review"),
                    Column(id: "done", name: "Done")
                ],
                cards: []
            )
            demoStore.saveBoard(empty, name: name)
            await switchBoard(to: name)
            return
        }

        do {
            _ = try await apiClient.initWorkspace(boardName: name)
            await switchBoard(to: name)
        } catch {
            self.statusBannerMessage = "Failed creating board \(name)"
        }
    }

    public func moveCard(cardId: String, toColumn: String) async {
        if isDemoMode {
            demoStore.moveCard(id: cardId, toColumn: toColumn, boardName: currentBoardName)
            currentBoard = demoStore.getBoard(name: currentBoardName)
            mindSnapshot = demoStore.getMindSnapshot(boardName: currentBoardName)
            return
        }

        guard var board = currentBoard else { return }
        for index in board.cards.indices {
            if board.cards[index].id == cardId {
                board.cards[index].column = toColumn
                board.cards[index].updatedAt = Date()
                break
            }
        }
        self.currentBoard = board

        do {
            try await apiClient.saveBoard(board, name: currentBoardName)
            self.mindSnapshot = try await apiClient.fetchMindSnapshot(board: currentBoardName)
        } catch {
            self.statusBannerMessage = "Failed moving card"
        }
    }

    public func addComment(cardId: String, text: String, author: String = "human") async {
        if isDemoMode {
            demoStore.addCardComment(cardId: cardId, text: text, author: author, boardName: currentBoardName)
            currentBoard = demoStore.getBoard(name: currentBoardName)
            return
        }

        do {
            try await apiClient.addCardComment(cardId: cardId, text: text, author: author, board: currentBoardName)
            self.currentBoard = try await apiClient.fetchBoard(name: currentBoardName)
        } catch {
            self.statusBannerMessage = "Failed adding comment"
        }
    }

    public func saveCard(_ card: Card) async {
        guard var board = currentBoard else { return }
        if let idx = board.cards.firstIndex(where: { $0.id == card.id }) {
            board.cards[idx] = card
        } else {
            board.cards.append(card)
        }
        self.currentBoard = board

        if isDemoMode {
            demoStore.saveBoard(board, name: currentBoardName)
            mindSnapshot = demoStore.getMindSnapshot(boardName: currentBoardName)
            return
        }

        do {
            try await apiClient.saveBoard(board, name: currentBoardName)
            self.mindSnapshot = try await apiClient.fetchMindSnapshot(board: currentBoardName)
        } catch {
            self.statusBannerMessage = "Failed saving card"
        }
    }

    public func deleteCard(cardId: String) async {
        guard var board = currentBoard else { return }
        board.cards.removeAll(where: { $0.id == cardId })
        self.currentBoard = board

        if isDemoMode {
            demoStore.saveBoard(board, name: currentBoardName)
            mindSnapshot = demoStore.getMindSnapshot(boardName: currentBoardName)
            return
        }

        do {
            try await apiClient.saveBoard(board, name: currentBoardName)
            self.mindSnapshot = try await apiClient.fetchMindSnapshot(board: currentBoardName)
        } catch {
            self.statusBannerMessage = "Failed deleting card"
        }
    }

    public func pingServer() async -> Bool {
        if isDemoMode {
            return true
        }
        do {
            let status = try await apiClient.checkWorkspaceStatus()
            self.workspaceStatus = status
            return status.initialized
        } catch {
            return false
        }
    }

    // MARK: Autopilot Intent and Plan Proposals

    public func submitIntent(text: String, kind: String = "feature", backend: String = "opencode") async {
        let cleanText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanText.isEmpty else { return }

        isSubmittingIntent = true
        defer { isSubmittingIntent = false }

        if isDemoMode {
            let createdCard = demoStore.submitIntent(text: cleanText, kind: kind, boardName: currentBoardName, backend: backend)
            currentBoard = demoStore.getBoard(name: currentBoardName)
            mindSnapshot = demoStore.getMindSnapshot(boardName: currentBoardName)
            intentDraft = ""
            statusBannerMessage = "Intent registered on card \(createdCard.id)"
            return
        }

        do {
            _ = try await apiClient.submitIntent(prompt: cleanText, kind: kind, backend: backend)
            intentDraft = ""
            await refresh()
            statusBannerMessage = "Intent submitted successfully to agent runtime"
        } catch {
            statusBannerMessage = "Intent intake error: \(error.localizedDescription)"
        }
    }

    public func proposePlan(cardId: String) async {
        isBusy = true
        defer { isBusy = false }

        if isDemoMode {
            let proposal = demoStore.proposePlan(cardId: cardId, boardName: currentBoardName)
            self.pendingProposal = proposal
            self.showPlanProposalModal = true
            return
        }

        do {
            let proposal = try await apiClient.proposePlan(cardId: cardId, board: currentBoardName)
            self.pendingProposal = proposal
            self.showPlanProposalModal = true
        } catch {
            statusBannerMessage = "Plan proposal error: \(error.localizedDescription)"
        }
    }

    public func planAndRun(cardId: String) async {
        isBusy = true
        defer { isBusy = false }

        if isDemoMode {
            _ = demoStore.proposePlan(cardId: cardId, boardName: currentBoardName)
            _ = demoStore.approvePlan(cardId: cardId, boardName: currentBoardName)
            currentBoard = demoStore.getBoard(name: currentBoardName)
            mindSnapshot = demoStore.getMindSnapshot(boardName: currentBoardName)
            statusBannerMessage = "Plan running for \(cardId)"
            return
        }

        do {
            try await apiClient.planAndRun(cardId: cardId, board: currentBoardName, backend: nil)
            await refresh()
            statusBannerMessage = "Plan running for \(cardId)"
        } catch {
            statusBannerMessage = "Plan and run error: \(error.localizedDescription)"
        }
    }

    public func approvePlan(cardId: String) async {
        isBusy = true
        defer { isBusy = false }

        if isDemoMode {
            _ = demoStore.approvePlan(cardId: cardId, boardName: currentBoardName)
            self.showPlanProposalModal = false
            self.pendingProposal = nil
            currentBoard = demoStore.getBoard(name: currentBoardName)
            mindSnapshot = demoStore.getMindSnapshot(boardName: currentBoardName)
            statusBannerMessage = "Plan approved and child tasks queued"
            return
        }

        do {
            _ = try await apiClient.approvePlan(cardId: cardId, board: currentBoardName)
            self.showPlanProposalModal = false
            self.pendingProposal = nil
            await refresh()
            statusBannerMessage = "Plan approved. Child worktrees dispatched."
        } catch {
            statusBannerMessage = "Plan approval error: \(error.localizedDescription)"
        }
    }

    public func rejectPlan(cardId: String, reason: String? = nil) async {
        if isDemoMode {
            demoStore.rejectPlan(cardId: cardId, reason: reason, boardName: currentBoardName)
            self.showPlanProposalModal = false
            self.pendingProposal = nil
            statusBannerMessage = "Plan proposal rejected"
            return
        }

        do {
            _ = try await apiClient.rejectPlan(cardId: cardId, reason: reason, board: currentBoardName)
            self.showPlanProposalModal = false
            self.pendingProposal = nil
            statusBannerMessage = "Plan proposal rejected"
        } catch {
            statusBannerMessage = "Plan rejection error: \(error.localizedDescription)"
        }
    }

    public func runAcceptanceGate(cardId: String) async {
        isExecutingAutopilot = true
        executionProgress = 0.2
        executionStatusMessage = "Starting isolated worktree acceptance gate"

        if isDemoMode {
            let result = demoStore.runReviewGate(cardId: cardId)
            let verdict = TestGateVerdict(
                passed: result.passed,
                command: "barkcli gate run --card \(cardId)",
                output: result.logs.joined(separator: "\n"),
                durationSeconds: result.durationSeconds,
                timestamp: result.timestamp
            )
            self.lastGateVerdict = verdict
            executionProgress = 1.0
            isExecutingAutopilot = false
            executionStatusMessage = result.passed ? "Gate passed cleanly" : "Gate verification failed"
            return
        }

        do {
            executionProgress = 0.5
            let result = try await apiClient.runReviewGate(cardId: cardId)
            let verdict = TestGateVerdict(
                passed: result.passed,
                command: "barkcli gate run --card \(cardId)",
                output: result.logs.joined(separator: "\n"),
                durationSeconds: result.durationSeconds,
                timestamp: result.timestamp
            )
            self.lastGateVerdict = verdict
            executionProgress = 1.0
            isExecutingAutopilot = false
            executionStatusMessage = result.passed ? "Gate passed cleanly" : "Gate verification failed"
        } catch {
            isExecutingAutopilot = false
            executionStatusMessage = "Gate execution failed: \(error.localizedDescription)"
        }
    }

    // MARK: Git Operations and Codex Diff Inspector

    public func selectCommit(commit: GitCommit) async {
        selectedCommit = commit
        isLoadingDiff = true
        defer { isLoadingDiff = false }

        if isDemoMode {
            selectedCommitDiff = demoStore.getCommitDiff(sha: commit.sha)
            return
        }

        do {
            let diffResp = try await apiClient.fetchCommitDiff(sha: commit.sha)
            self.selectedCommitDiff = diffResp
        } catch {
            self.selectedCommitDiff = nil
        }
    }

    public func assignCommit(request: AssignCommitRequest) async {
        isBusy = true
        defer { isBusy = false }

        if isDemoMode {
            _ = demoStore.assignCommitToAgent(request: request)
            currentBoard = demoStore.getBoard(name: currentBoardName)
            tasks = demoStore.tasks
            statusBannerMessage = "Commit task assigned to agent"
            return
        }

        do {
            _ = try await apiClient.assignCommitToAgent(request: request)
            await refresh()
            statusBannerMessage = "Commit task assigned to agent"
        } catch {
            statusBannerMessage = "Commit assignment error: \(error.localizedDescription)"
        }
    }

    // MARK: Task Operations

    public func claimTask(taskId: String, agentId: String) async {
        if isDemoMode {
            demoStore.claimTask(id: taskId, agentId: agentId)
            tasks = demoStore.tasks
            agents = demoStore.agents
            return
        }

        do {
            try await apiClient.claimTask(id: taskId, agentId: agentId)
            await refresh()
        } catch {
            statusBannerMessage = "Claim task error: \(error.localizedDescription)"
        }
    }

    public func completeTask(taskId: String, agentId: String? = nil) async {
        if isDemoMode {
            demoStore.completeTask(id: taskId, agentId: agentId)
            tasks = demoStore.tasks
            agents = demoStore.agents
            return
        }

        do {
            try await apiClient.completeTask(id: taskId, agentId: agentId)
            await refresh()
        } catch {
            statusBannerMessage = "Complete task error: \(error.localizedDescription)"
        }
    }

    public func failTask(taskId: String, agentId: String? = nil, error: String? = nil) async {
        if isDemoMode {
            demoStore.failTask(id: taskId, agentId: agentId, error: error)
            tasks = demoStore.tasks
            agents = demoStore.agents
            return
        }

        do {
            try await apiClient.failTask(id: taskId, agentId: agentId, error: error)
            await refresh()
        } catch {
            statusBannerMessage = "Fail task error: \(error.localizedDescription)"
        }
    }

    // MARK: Agent Operations

    public func registerAgent(name: String, role: AgentRole) async {
        if isDemoMode {
            _ = demoStore.registerAgent(name: name, role: role)
            agents = demoStore.agents
            return
        }

        do {
            _ = try await apiClient.registerAgent(name: name, role: role)
            await refresh()
        } catch {
            statusBannerMessage = "Register agent error: \(error.localizedDescription)"
        }
    }

    public func removeAgent(agentId: String) async {
        if isDemoMode {
            demoStore.removeAgent(id: agentId)
            agents = demoStore.agents
            tasks = demoStore.tasks
            return
        }

        do {
            try await apiClient.removeAgent(id: agentId)
            await refresh()
        } catch {
            statusBannerMessage = "Remove agent error: \(error.localizedDescription)"
        }
    }

    // MARK: Orchestration

    public func runOrchestrationCycle() async {
        isBusy = true
        defer { isBusy = false }

        if isDemoMode {
            let result = demoStore.runCycle(boardName: currentBoardName)
            tasks = demoStore.tasks
            orchestrationStatus = demoStore.orchestrationStatus
            statusBannerMessage = "Orchestration cycle \(result.cycleNumber) completed"
            return
        }

        do {
            let result = try await apiClient.runCycle()
            self.orchestrationStatus = try await apiClient.fetchOrchestrationStatus()
            await refresh()
            statusBannerMessage = "Orchestration cycle \(result.cycleNumber) completed"
        } catch {
            statusBannerMessage = "Orchestration cycle error: \(error.localizedDescription)"
        }
    }
}
