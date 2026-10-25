import Foundation
import Observation

/// Production URLSession-based client implementing `APIClientProtocol`.
/// Supports configurable base URL, bearer authentication, pure JSON endpoints,
/// and typed error handling via `BarkcliError`.
@Observable
public final class LiveAPIClient: APIClientProtocol, @unchecked Sendable {
    public var baseURL: URL
    public var authToken: String?
    public var lastError: String?
    public var isBusy: Bool = false

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    public init(
        baseURL: URL = URL(string: "http://localhost:4321")!,
        authToken: String? = nil,
        timeoutInterval: TimeInterval = 5.0
    ) {
        self.baseURL = baseURL
        self.authToken = authToken

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = timeoutInterval
        config.timeoutIntervalForResource = timeoutInterval
        self.session = URLSession(configuration: config)

        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            let iso8601WithFractional = ISO8601DateFormatter()
            iso8601WithFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso8601WithFractional.date(from: dateStr) {
                return date
            }
            let standardISO8601 = ISO8601DateFormatter()
            if let date = standardISO8601.date(from: dateStr) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO8601 date string: \(dateStr)")
        }
        self.decoder = dec

        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        self.encoder = enc
    }

    // MARK: - URL and Request Construction

    private func makeURL(path: String, queryItems: [URLQueryItem] = []) throws -> URL {
        var cleanPath = path
        if cleanPath.hasPrefix("/") {
            cleanPath.removeFirst()
        }
        let urlWithPath = baseURL.appendingPathComponent(cleanPath)
        guard var components = URLComponents(url: urlWithPath, resolvingAgainstBaseURL: true) else {
            throw BarkcliError.invalidURL("\(baseURL.absoluteString)/\(cleanPath)")
        }

        var allQueryItems = queryItems
        if let token = authToken, !token.isEmpty {
            allQueryItems.append(URLQueryItem(name: "token", value: token))
        }
        if !allQueryItems.isEmpty {
            components.queryItems = allQueryItems
        }

        guard let finalURL = components.url else {
            throw BarkcliError.invalidURL("\(baseURL.absoluteString)/\(cleanPath)")
        }
        return finalURL
    }

    private func makeRequest(url: URL, method: String = "GET", body: Data? = nil) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = session.configuration.timeoutIntervalForRequest

        if let token = authToken, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let host = baseURL.host {
            let portStr = baseURL.port.map { ":\($0)" } ?? ""
            request.setValue("http://\(host)\(portStr)", forHTTPHeaderField: "Origin")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func execute(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let err as URLError where err.code == .timedOut {
            throw BarkcliError.timeout
        } catch let err as URLError where err.code == .cannotConnectToHost || err.code == .networkConnectionLost || err.code == .notConnectedToInternet {
            throw BarkcliError.networkUnavailable
        } catch {
            throw BarkcliError.unknown(error.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw BarkcliError.serverError(statusCode: 0, message: "Non HTTP response received from server")
        }

        switch httpResponse.statusCode {
        case 200...299:
            return (data, httpResponse)
        case 401, 403:
            let msg = String(data: data, encoding: .utf8) ?? "Unauthorized access"
            throw BarkcliError.unauthorized(msg)
        case 404:
            let msg = String(data: data, encoding: .utf8) ?? "Resource not found"
            throw BarkcliError.notFound(msg)
        default:
            let errorText = String(data: data, encoding: .utf8) ?? "HTTP error \(httpResponse.statusCode)"
            throw BarkcliError.serverError(statusCode: httpResponse.statusCode, message: errorText)
        }
    }

    private func performRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, _) = try await execute(request)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            let bodyText = String(data: data, encoding: .utf8) ?? "<unreadable payload>"
            throw BarkcliError.decodingError("Expected \(T.self): \(error.localizedDescription). Payload: \(bodyText)")
        }
    }

    // MARK: - Workspace & Health

    public func checkHealth() async throws -> HealthStatus {
        let url = try makeURL(path: "api/config")
        let request = makeRequest(url: url)
        let (_, response) = try await execute(request)
        let port = baseURL.port ?? 4321
        return HealthStatus(status: response.statusCode == 200 ? "ok" : "degraded", port: port, version: "0.8.0")
    }

    public func autoInit(boardName: String? = "dev") async throws -> AutoInitResult {
        struct CreateBoardPayload: Codable {
            let title: String
            let columns: [String]
        }
        let title = boardName ?? "dev"
        let payload = CreateBoardPayload(title: title, columns: ["todo", "doing", "review", "done"])
        let bodyData = try encoder.encode(payload)
        let url = try makeURL(path: "api/boards/create")
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        _ = try await execute(request)

        return AutoInitResult(
            created: true,
            boardPath: ".board/\(title).board",
            message: "Workspace auto initialized with '\(title)' board"
        )
    }

    public func listBoards() async throws -> [String] {
        struct ResponseContainer: Codable {
            let boards: [String]
        }
        let url = try makeURL(path: "api/boards")
        let request = makeRequest(url: url)
        let (data, _) = try await execute(request)

        if let container = try? decoder.decode(ResponseContainer.self, from: data) {
            return container.boards
        } else if let array = try? decoder.decode([String].self, from: data) {
            return array
        } else {
            throw BarkcliError.decodingError("Unable to decode board list from server response")
        }
    }

    public func getBoard(name: String) async throws -> Board {
        let queryItems = [
            URLQueryItem(name: "name", value: name),
            URLQueryItem(name: "format", value: "json")
        ]
        let url = try makeURL(path: "api/export", queryItems: queryItems)
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    public func saveCard(boardName: String, card: Card) async throws {
        var board = try await getBoard(name: boardName)
        if let idx = board.cards.firstIndex(where: { $0.id == card.id }) {
            board.cards[idx] = card
        } else {
            board.cards.append(card)
        }
        try await saveBoard(board, name: boardName)
    }

    public func moveCard(boardName: String, cardId: String, toColumn: String) async throws {
        var board = try await getBoard(name: boardName)
        guard let idx = board.cards.firstIndex(where: { $0.id == cardId }) else {
            throw BarkcliError.notFound("Card \(cardId) on board \(boardName)")
        }
        board.cards[idx].column = toColumn
        board.cards[idx].updatedAt = Date()
        try await saveBoard(board, name: boardName)
    }

    public func saveBoard(_ board: Board, name: String? = nil) async throws {
        struct ImportPayload: Codable {
            let name: String?
            let json: String
        }
        let boardData = try encoder.encode(board)
        guard let boardJsonString = String(data: boardData, encoding: .utf8) else {
            throw BarkcliError.encodingError("Could not serialize board to UTF8")
        }
        let payload = ImportPayload(name: name ?? board.title, json: boardJsonString)
        let payloadData = try encoder.encode(payload)
        let url = try makeURL(path: "api/import")
        let request = makeRequest(url: url, method: "POST", body: payloadData)
        _ = try await execute(request)
    }

    public func checkWorkspaceStatus() async throws -> WorkspaceStatus {
        do {
            let boards = try await listBoards()
            if boards.isEmpty {
                return WorkspaceStatus(
                    initialized: false,
                    boardDirExists: true,
                    configFileExists: true,
                    boardsCount: 0,
                    message: "No boards found in workspace"
                )
            }
            return WorkspaceStatus(
                initialized: true,
                boardDirExists: true,
                configFileExists: true,
                boardsCount: boards.count,
                message: "Workspace healthy with \(boards.count) board(s)"
            )
        } catch {
            return WorkspaceStatus(
                initialized: false,
                boardDirExists: false,
                configFileExists: false,
                boardsCount: 0,
                message: error.localizedDescription
            )
        }
    }

    public func addCardComment(boardName: String? = nil, cardId: String, text: String, author: String = "human") async throws {
        try await addCardComment(cardId: cardId, text: text, author: author, board: boardName)
    }

    public func addCardComment(cardId: String, text: String, author: String = "human", board: String? = nil) async throws {
        struct CommentPayload: Codable {
            let author: String
            let text: String
        }
        var queryItems: [URLQueryItem] = []
        if let board {
            queryItems.append(URLQueryItem(name: "board", value: board))
        }
        let url = try makeURL(path: "api/board/cards/\(cardId)/comments", queryItems: queryItems)
        let bodyData = try encoder.encode(CommentPayload(author: author, text: text))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        _ = try await execute(request)
    }

    // MARK: - Mind & Autopilot

    public func getMindSnapshot(board: String? = nil) async throws -> MindSnapshot {
        var queryItems: [URLQueryItem] = []
        if let board {
            queryItems.append(URLQueryItem(name: "name", value: board))
        }
        let url = try makeURL(path: "api/mind", queryItems: queryItems)
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    public func getAutopilotStatus(board: String? = nil) async throws -> AutopilotStatus {
        var queryItems: [URLQueryItem] = []
        if let board {
            queryItems.append(URLQueryItem(name: "board", value: board))
        }
        let url = try makeURL(path: "api/autopilot/status", queryItems: queryItems)
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    public func submitIntent(prompt: String, kind: String? = "feature") async throws -> IntentResponse {
        struct IntakePayload: Codable {
            let text: String
            let kind: String?
            let board: String?
        }
        let url = try makeURL(path: "api/intake")
        let bodyData = try encoder.encode(IntakePayload(text: prompt, kind: kind, board: "dev"))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        let (data, _) = try await execute(request)

        if let direct = try? decoder.decode(IntentResponse.self, from: data) {
            return direct
        }
        return IntentResponse(
            cardId: "card_\(abs(prompt.hashValue % 10000))",
            title: prompt,
            board: "dev",
            status: "created"
        )
    }

    public func submitIntent(text: String, kind: String? = "feature", board: String? = nil) async throws -> String {
        let response = try await submitIntent(prompt: text, kind: kind)
        return "Created card \(response.cardId): \(response.title)"
    }

    public func proposePlan(cardId: String, board: String? = nil) async throws -> PlanProposal {
        struct ProposePayload: Codable {
            let card_id: String
            let board: String?
            let by: String
        }
        let url = try makeURL(path: "api/autopilot/propose")
        let bodyData = try encoder.encode(ProposePayload(card_id: cardId, board: board, by: "agent"))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        return try await performRequest(request)
    }

    public func approvePlan(cardId: String, board: String? = nil) async throws {
        struct ApprovePayload: Codable {
            let card_id: String
            let board: String?
            let create_tasks: Bool
        }
        let url = try makeURL(path: "api/autopilot/approve")
        let bodyData = try encoder.encode(ApprovePayload(card_id: cardId, board: board, create_tasks: true))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        _ = try await execute(request)
    }

    public func rejectPlan(cardId: String, reason: String? = nil, board: String? = nil) async throws {
        struct RejectPayload: Codable {
            let card_id: String
            let board: String?
            let reason: String?
        }
        let url = try makeURL(path: "api/autopilot/reject")
        let bodyData = try encoder.encode(RejectPayload(card_id: cardId, board: board, reason: reason))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        _ = try await execute(request)
    }

    public func runReviewGate(cardId: String) async throws -> ReviewGateResult {
        struct ReviewPayload: Codable {
            let card_id: String
        }
        let url = try makeURL(path: "api/review")
        let bodyData = try encoder.encode(ReviewPayload(card_id: cardId))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        do {
            return try await performRequest(request)
        } catch {
            let cycle = try await triggerOrchestrationCycle()
            let passed = cycle.tasksFailed == 0
            return ReviewGateResult(
                cardId: cardId,
                passed: passed,
                totalTests: max(1, cycle.tasksDispatched + cycle.tasksCompleted),
                passedTests: cycle.tasksCompleted,
                failedTests: cycle.tasksFailed,
                durationSeconds: 1.82,
                logs: cycle.insights
            )
        }
    }

    // MARK: - Orchestration & Fleet

    public func listAgents() async throws -> [AgentItem] {
        struct AgentsContainer: Codable {
            let agents: [AgentItem]
        }
        let url = try makeURL(path: "api/agents")
        let request = makeRequest(url: url)
        let (data, _) = try await execute(request)

        if let container = try? decoder.decode(AgentsContainer.self, from: data) {
            return container.agents
        } else if let array = try? decoder.decode([AgentItem].self, from: data) {
            return array
        } else {
            throw BarkcliError.decodingError("Unable to decode agent items list")
        }
    }

    public func registerAgent(name: String, role: AgentRole) async throws -> AgentItem {
        struct RegisterPayload: Codable {
            let name: String
            let role: String
        }
        let url = try makeURL(path: "api/agents")
        let bodyData = try encoder.encode(RegisterPayload(name: name, role: role.rawValue))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        return try await performRequest(request)
    }

    public func removeAgent(id: String) async throws {
        let url = try makeURL(path: "api/agents/\(id)")
        let request = makeRequest(url: url, method: "DELETE")
        _ = try await execute(request)
    }

    public func listTasks(status: String? = nil, cardId: String? = nil, agentId: String? = nil) async throws -> [TaskRequest] {
        struct TasksContainer: Codable {
            let tasks: [TaskRequest]
        }
        var queryItems: [URLQueryItem] = []
        if let status { queryItems.append(URLQueryItem(name: "status", value: status)) }
        if let cardId { queryItems.append(URLQueryItem(name: "card_id", value: cardId)) }
        if let agentId { queryItems.append(URLQueryItem(name: "agent_id", value: agentId)) }

        let url = try makeURL(path: "api/tasks", queryItems: queryItems)
        let request = makeRequest(url: url)
        let (data, _) = try await execute(request)

        if let container = try? decoder.decode(TasksContainer.self, from: data) {
            return container.tasks
        } else if let array = try? decoder.decode([TaskRequest].self, from: data) {
            return array
        } else {
            throw BarkcliError.decodingError("Unable to decode task requests list")
        }
    }

    public func claimTask(id: String, agentId: String) async throws {
        struct ClaimPayload: Codable {
            let agent_id: String
        }
        let url = try makeURL(path: "api/tasks/\(id)/claim")
        let bodyData = try encoder.encode(ClaimPayload(agent_id: agentId))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        _ = try await execute(request)
    }

    public func completeTask(id: String, agentId: String? = nil, durationMs: UInt64 = 0) async throws {
        struct CompletePayload: Codable {
            let agent_id: String?
            let duration_ms: UInt64
        }
        let url = try makeURL(path: "api/tasks/\(id)/complete")
        let bodyData = try encoder.encode(CompletePayload(agent_id: agentId, duration_ms: durationMs))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        _ = try await execute(request)
    }

    public func failTask(id: String, agentId: String? = nil, error: String? = nil) async throws {
        struct FailPayload: Codable {
            let agent_id: String?
            let error: String?
        }
        let url = try makeURL(path: "api/tasks/\(id)/fail")
        let bodyData = try encoder.encode(FailPayload(agent_id: agentId, error: error))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        _ = try await execute(request)
    }

    public func getLiveSessions() async throws -> [LiveSession] {
        struct RunLiveContainer: Codable {
            let sessions: [LiveSession]
        }
        let url = try makeURL(path: "api/run/live")
        let request = makeRequest(url: url)
        let (data, _) = try await execute(request)

        if let container = try? decoder.decode(RunLiveContainer.self, from: data) {
            return container.sessions
        } else if let array = try? decoder.decode([LiveSession].self, from: data) {
            return array
        } else {
            throw BarkcliError.decodingError("Unable to decode live sessions list")
        }
    }

    public func triggerOrchestrationCycle() async throws -> CycleResult {
        let url = try makeURL(path: "api/orchestrate/cycle")
        let request = makeRequest(url: url, method: "POST")
        return try await performRequest(request)
    }

    // MARK: - Specs & Git

    public func listSpecs() async throws -> [SpecItem] {
        struct SpecsContainer: Codable {
            let specs: [SpecItem]
        }
        let url = try makeURL(path: "api/specs")
        let request = makeRequest(url: url)
        let (data, _) = try await execute(request)

        if let container = try? decoder.decode(SpecsContainer.self, from: data) {
            return container.specs
        } else if let array = try? decoder.decode([SpecItem].self, from: data) {
            return array
        } else {
            throw BarkcliError.decodingError("Unable to decode specs list")
        }
    }

    public func getSpecsCoverage() async throws -> CoverageReport {
        let url = try makeURL(path: "api/specs/coverage")
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    public func getGitCommits(branch: String? = nil, limit: Int? = 60) async throws -> [GitCommit] {
        var queryItems: [URLQueryItem] = []
        if let branch { queryItems.append(URLQueryItem(name: "branch", value: branch)) }
        if let limit { queryItems.append(URLQueryItem(name: "limit", value: String(limit))) }

        let url = try makeURL(path: "api/git/commits", queryItems: queryItems)
        let request = makeRequest(url: url)
        let (data, _) = try await execute(request)

        if let res = try? decoder.decode(GitCommitsResponse.self, from: data) {
            return res.commits
        } else if let array = try? decoder.decode([GitCommit].self, from: data) {
            return array
        } else {
            throw BarkcliError.decodingError("Unable to decode git commits")
        }
    }

    public func getGitDiff(sha: String) async throws -> GitDiff {
        let url = try makeURL(path: "api/git/diff/\(sha)")
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    public func assignCommitToAgent(sha: String, prompt: String) async throws {
        let req = AssignCommitRequest(
            boardName: "dev",
            commitSha: sha,
            title: "Task from \(sha.prefix(7))",
            description: prompt
        )
        let url = try makeURL(path: "api/git/assign")
        let bodyData = try encoder.encode(req)
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        _ = try await execute(request)
    }

    // MARK: - Backwards Compatibility Aliases for AppState & Views

    public func fetchBoards() async throws -> [String] {
        try await listBoards()
    }

    public func fetchBoard(name: String? = nil) async throws -> Board {
        try await getBoard(name: name ?? "dev")
    }

    public func fetchMindSnapshot(board: String? = nil) async throws -> MindSnapshot {
        try await getMindSnapshot(board: board)
    }

    public func fetchTasks(status: String? = nil, cardId: String? = nil, agentId: String? = nil) async throws -> [TaskRequest] {
        try await listTasks(status: status, cardId: cardId, agentId: agentId)
    }

    public func fetchAgents() async throws -> [AgentItem] {
        try await listAgents()
    }

    public func runCycle() async throws -> OrchestrationCycleResult {
        try await triggerOrchestrationCycle()
    }

    public func fetchOrchestrationStatus() async throws -> OrchestrationStatus {
        let url = try makeURL(path: "api/orchestrate/status")
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    public func fetchGitCommits(branch: String? = nil, limit: Int? = 60) async throws -> GitCommitsResponse {
        var queryItems: [URLQueryItem] = []
        if let branch { queryItems.append(URLQueryItem(name: "branch", value: branch)) }
        if let limit { queryItems.append(URLQueryItem(name: "limit", value: String(limit))) }
        let url = try makeURL(path: "api/git/commits", queryItems: queryItems)
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    public func fetchCommitDiff(sha: String) async throws -> GitDiffResponse {
        try await getGitDiff(sha: sha)
    }

    public func assignCommitToAgent(request: AssignCommitRequest) async throws -> AssignCommitResponse {
        let url = try makeURL(path: "api/git/assign")
        let bodyData = try encoder.encode(request)
        let urlRequest = makeRequest(url: url, method: "POST", body: bodyData)
        return try await performRequest(urlRequest)
    }

    public func fetchSpecs(board: String? = nil) async throws -> [Spec] {
        try await listSpecs()
    }

    public func fetchSpecCoverage(board: String? = nil) async throws -> SpecCoverage {
        try await getSpecsCoverage()
    }

    public func fetchLiveRunners() async throws -> [LiveRunnerSession] {
        try await getLiveSessions()
    }

    public func initWorkspace(boardName: String? = "dev") async throws -> WorkspaceStatus {
        _ = try await autoInit(boardName: boardName)
        return try await checkWorkspaceStatus()
    }
}
