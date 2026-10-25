import Foundation
import Observation

public enum APIError: LocalizedError, Sendable {
    case invalidURL(String)
    case requestFailed(String)
    case invalidResponse(statusCode: Int, message: String)
    case decodingFailed(String)
    case timeout

    public var errorDescription: String? {
        switch self {
        case .invalidURL(let address):
            return "Invalid server address: \(address)"
        case .requestFailed(let message):
            return "Request failed: \(message)"
        case .invalidResponse(let code, let message):
            return "Server responded with status code \(code): \(message)"
        case .decodingFailed(let message):
            return "Decoding failed: \(message)"
        case .timeout:
            return "Network connection timed out after five seconds"
        }
    }
}

@Observable
public final class APIClient: @unchecked Sendable {
    public var baseURL: URL
    public var authToken: String?
    public var lastError: String?
    public var isBusy: Bool = false

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    public init(
        baseURL: URL = URL(string: "http://localhost:4321")!,
        authToken: String? = nil
    ) {
        self.baseURL = baseURL
        self.authToken = authToken

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 5.0
        config.timeoutIntervalForResource = 5.0
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    private func makeURL(path: String, queryItems: [URLQueryItem] = []) throws -> URL {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: true)
        if components == nil {
            throw APIError.invalidURL(baseURL.absoluteString + path)
        }
        var allQueryItems = queryItems
        if let token = authToken, !token.isEmpty {
            allQueryItems.append(URLQueryItem(name: "token", value: token))
        }
        if !allQueryItems.isEmpty {
            components?.queryItems = allQueryItems
        }
        guard let finalURL = components?.url else {
            throw APIError.invalidURL(baseURL.absoluteString + path)
        }
        return finalURL
    }

    private func makeRequest(url: URL, method: String = "GET", body: Data? = nil) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 5.0
        if let token = authToken, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func performRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, _) = try await execute(request)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            let bodyText = String(data: data, encoding: .utf8) ?? "Unreadable payload"
            throw APIError.decodingFailed("Expected \(T.self), error: \(error.localizedDescription). Payload: \(bodyText)")
        }
    }

    private func execute(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let err as URLError where err.code == .timedOut {
            throw APIError.timeout
        } catch {
            throw APIError.requestFailed(error.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.requestFailed("Server returned non HTTP response")
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorText = String(data: data, encoding: .utf8) ?? "No error details returned"
            throw APIError.invalidResponse(statusCode: httpResponse.statusCode, message: errorText)
        }

        return (data, httpResponse)
    }

    // MARK: Boards and Cards

    public func fetchBoards() async throws -> [String] {
        struct ResponseContainer: Codable {
            let boards: [String]
        }
        let url = try makeURL(path: "api/boards")
        let request = makeRequest(url: url)
        let container: ResponseContainer = try await performRequest(request)
        return container.boards
    }

    public func fetchBoard(name: String? = nil) async throws -> Board {
        var queryItems: [URLQueryItem] = [URLQueryItem(name: "format", value: "json")]
        if let name {
            queryItems.append(URLQueryItem(name: "name", value: name))
        }
        let exportURL = try makeURL(path: "api/export", queryItems: queryItems)
        let request = makeRequest(url: exportURL)
        return try await performRequest(request)
    }

    public func saveBoard(_ board: Board, name: String? = nil) async throws {
        struct ImportPayload: Codable {
            let name: String?
            let json: String
        }
        let boardData = try encoder.encode(board)
        let boardJsonString = String(decoding: boardData, as: UTF8.self)
        let payload = ImportPayload(name: name ?? board.title, json: boardJsonString)
        let payloadData = try encoder.encode(payload)

        let url = try makeURL(path: "api/import")
        let request = makeRequest(url: url, method: "POST", body: payloadData)
        _ = try await execute(request)
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

    // MARK: Mind Snapshot

    public func fetchMindSnapshot(board: String? = nil) async throws -> MindSnapshot {
        var queryItems: [URLQueryItem] = []
        if let board {
            queryItems.append(URLQueryItem(name: "name", value: board))
        }
        let url = try makeURL(path: "api/mind", queryItems: queryItems)
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    // MARK: Tasks

    public func fetchTasks(status: String? = nil, cardId: String? = nil, agentId: String? = nil) async throws -> [TaskRequest] {
        struct TasksContainer: Codable {
            let tasks: [TaskRequest]
        }
        var queryItems: [URLQueryItem] = []
        if let status {
            queryItems.append(URLQueryItem(name: "status", value: status))
        }
        if let cardId {
            queryItems.append(URLQueryItem(name: "card_id", value: cardId))
        }
        if let agentId {
            queryItems.append(URLQueryItem(name: "agent_id", value: agentId))
        }
        let url = try makeURL(path: "api/tasks", queryItems: queryItems)
        let request = makeRequest(url: url)
        let container: TasksContainer = try await performRequest(request)
        return container.tasks
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

    // MARK: Agents

    public func fetchAgents() async throws -> [AgentItem] {
        struct AgentsContainer: Codable {
            let agents: [AgentItem]
        }
        let url = try makeURL(path: "api/agents")
        let request = makeRequest(url: url)
        let container: AgentsContainer = try await performRequest(request)
        return container.agents
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

    // MARK: Orchestration

    public func runCycle() async throws -> OrchestrationCycleResult {
        let url = try makeURL(path: "api/orchestrate/cycle")
        let request = makeRequest(url: url, method: "POST")
        return try await performRequest(request)
    }

    public func fetchOrchestrationStatus() async throws -> OrchestrationStatus {
        let url = try makeURL(path: "api/orchestrate/status")
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    // MARK: Git Operations

    public func fetchGitCommits(branch: String? = nil, limit: Int? = 60) async throws -> GitCommitsResponse {
        var queryItems: [URLQueryItem] = []
        if let branch {
            queryItems.append(URLQueryItem(name: "branch", value: branch))
        }
        if let limit {
            queryItems.append(URLQueryItem(name: "limit", value: String(limit)))
        }
        let url = try makeURL(path: "api/git/commits", queryItems: queryItems)
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    public func fetchCommitDiff(sha: String) async throws -> GitDiffResponse {
        let url = try makeURL(path: "api/git/diff/\(sha)")
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    public func assignCommitToAgent(request: AssignCommitRequest) async throws -> AssignCommitResponse {
        let url = try makeURL(path: "api/git/assign")
        let bodyData = try encoder.encode(request)
        let urlRequest = makeRequest(url: url, method: "POST", body: bodyData)
        return try await performRequest(urlRequest)
    }

    // MARK: Autopilot and Intent Intake

    public func submitIntent(text: String, kind: String? = "feature", board: String? = nil) async throws -> String {
        struct IntakePayload: Codable {
            let text: String
            let kind: String?
            let board: String?
        }
        let url = try makeURL(path: "api/intake")
        let bodyData = try encoder.encode(IntakePayload(text: text, kind: kind, board: board))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        let (data, _) = try await execute(request)
        return String(decoding: data, as: UTF8.self)
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

    public func approvePlan(cardId: String, board: String? = nil) async throws -> Bool {
        struct ApprovePayload: Codable {
            let card_id: String
            let board: String?
            let create_tasks: Bool
        }
        let url = try makeURL(path: "api/autopilot/approve")
        let bodyData = try encoder.encode(ApprovePayload(card_id: cardId, board: board, create_tasks: true))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        _ = try await execute(request)
        return true
    }

    public func rejectPlan(cardId: String, reason: String? = nil, board: String? = nil) async throws -> Bool {
        struct RejectPayload: Codable {
            let card_id: String
            let board: String?
            let reason: String?
        }
        let url = try makeURL(path: "api/autopilot/reject")
        let bodyData = try encoder.encode(RejectPayload(card_id: cardId, board: board, reason: reason))
        let request = makeRequest(url: url, method: "POST", body: bodyData)
        _ = try await execute(request)
        return true
    }

    // MARK: Specs

    public func fetchSpecs(board: String? = nil) async throws -> [Spec] {
        struct SpecsContainer: Codable {
            let specs: [Spec]
        }
        var queryItems: [URLQueryItem] = []
        if let board {
            queryItems.append(URLQueryItem(name: "name", value: board))
        }
        let url = try makeURL(path: "api/specs", queryItems: queryItems)
        let request = makeRequest(url: url)
        let container: SpecsContainer = try await performRequest(request)
        return container.specs
    }

    public func fetchSpecCoverage(board: String? = nil) async throws -> SpecCoverage {
        var queryItems: [URLQueryItem] = []
        if let board {
            queryItems.append(URLQueryItem(name: "name", value: board))
        }
        let url = try makeURL(path: "api/specs/coverage", queryItems: queryItems)
        let request = makeRequest(url: url)
        return try await performRequest(request)
    }

    // MARK: Live Runners

    public func fetchLiveRunners() async throws -> [LiveRunnerSession] {
        struct RunLiveContainer: Codable {
            let sessions: [LiveRunnerSession]
        }
        let url = try makeURL(path: "api/run/live")
        let request = makeRequest(url: url)
        let container: RunLiveContainer = try await performRequest(request)
        return container.sessions
    }

    // MARK: Workspace Status and Auto Init Check

    public func checkWorkspaceStatus() async throws -> WorkspaceStatus {
        do {
            let boards = try await fetchBoards()
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
                message: "Workspace healthy with \(boards.count) board files"
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

    public func initWorkspace(boardName: String? = "dev") async throws -> WorkspaceStatus {
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
        return try await checkWorkspaceStatus()
    }
}
