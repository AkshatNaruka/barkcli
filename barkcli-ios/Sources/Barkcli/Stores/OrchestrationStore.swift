import Foundation
import Observation

/// Observable state store powering the Agents Fleet Orchestration control plane.
/// Manages agent fleet registry, task queue states (Pending, Assigned, InProgress, Completed, Failed),
/// real-time runner sessions (/api/run/live), and orchestration cycle dispatching.
@MainActor
@Observable
public final class OrchestrationStore: @unchecked Sendable {
    public static let shared = OrchestrationStore()

    // MARK: - Published State
    public var agents: [AgentItem]
    public var tasks: [TaskRequest]
    public var liveSessions: [LiveSession]
    public var lastCycleResult: CycleResult?
    public var isLoading: Bool
    public var isRunningCycle: Bool
    public var selectedStatusFilter: TaskStatus?
    public var selectedAgentFilter: String?
    public var searchQuery: String
    public var lastError: String?

    // MARK: - API Client
    public var client: any APIClientProtocol

    // MARK: - Initializer
    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.agents = []
        self.tasks = []
        self.liveSessions = []
        self.lastCycleResult = nil
        self.isLoading = false
        self.isRunningCycle = false
        self.selectedStatusFilter = nil
        self.selectedAgentFilter = nil
        self.searchQuery = ""
        self.lastError = nil
    }

    // MARK: - Filtered Queue & Derived Metrics

    public var filteredTasks: [TaskRequest] {
        tasks.filter { task in
            if let status = selectedStatusFilter, task.status != status {
                return false
            }
            if let agentId = selectedAgentFilter, !agentId.isEmpty, task.assignedAgent != agentId {
                return false
            }
            let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if !query.isEmpty {
                let matchesTitle = task.title.lowercased().contains(query)
                let matchesCard = task.cardId.lowercased().contains(query)
                let matchesId = task.id.lowercased().contains(query)
                let matchesDesc = task.description.lowercased().contains(query)
                if !matchesTitle && !matchesCard && !matchesId && !matchesDesc {
                    return false
                }
            }
            return true
        }
    }

    public var activeAgentsCount: Int {
        agents.filter { $0.status == .working }.count
    }

    public var idleAgentsCount: Int {
        agents.filter { $0.status == .idle }.count
    }

    public var totalTokensUsed: UInt64 {
        agents.reduce(0) { $0 + $1.metrics.totalTokensUsed }
    }

    public var overallSuccessRate: Double {
        guard !agents.isEmpty else { return 1.0 }
        let total = agents.reduce(0.0) { $0 + $1.metrics.successRate }
        return total / Double(agents.count)
    }

    public var runningSessionsCount: Int {
        liveSessions.filter { $0.status.lowercased() == "running" }.count
    }

    public var taskCountsByStatus: [TaskStatus: Int] {
        var counts: [TaskStatus: Int] = [:]
        for status in TaskStatus.allCases {
            counts[status] = 0
        }
        for task in tasks {
            counts[task.status, default: 0] += 1
        }
        return counts
    }

    // MARK: - Lifecycle Actions

    public func load() async {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            async let fetchedAgents = client.listAgents()
            async let fetchedTasks = client.listTasks()
            async let fetchedSessions = client.getLiveSessions()

            let (a, t, s) = try await (fetchedAgents, fetchedTasks, fetchedSessions)
            self.agents = a
            self.tasks = t
            self.liveSessions = s
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    public func refresh() async {
        await load()
    }

    public func runCycle() async throws -> CycleResult {
        isRunningCycle = true
        lastError = nil
        defer { isRunningCycle = false }

        do {
            let result = try await client.triggerOrchestrationCycle()
            self.lastCycleResult = result
            // Refresh tasks and sessions after dispatching a cycle
            async let fetchedTasks = client.listTasks()
            async let fetchedSessions = client.getLiveSessions()
            let (t, s) = try await (fetchedTasks, fetchedSessions)
            self.tasks = t
            self.liveSessions = s
            return result
        } catch {
            self.lastError = error.localizedDescription
            throw error
        }
    }

    @discardableResult
    public func registerAgent(name: String, role: AgentRole) async throws -> AgentItem {
        do {
            let newAgent = try await client.registerAgent(name: name, role: role)
            self.agents.append(newAgent)
            return newAgent
        } catch {
            self.lastError = error.localizedDescription
            throw error
        }
    }

    public func removeAgent(id: String) async throws {
        do {
            try await client.removeAgent(id: id)
            self.agents.removeAll { $0.id == id }
        } catch {
            self.lastError = error.localizedDescription
            throw error
        }
    }

    public func claimTask(taskId: String, agentId: String) async throws {
        do {
            try await client.claimTask(id: taskId, agentId: agentId)
            await load()
        } catch {
            self.lastError = error.localizedDescription
            throw error
        }
    }

    public func completeTask(taskId: String, agentId: String? = nil, durationMs: UInt64 = 0) async throws {
        do {
            try await client.completeTask(id: taskId, agentId: agentId, durationMs: durationMs)
            await load()
        } catch {
            self.lastError = error.localizedDescription
            throw error
        }
    }

    public func failTask(taskId: String, agentId: String? = nil, error: String? = nil) async throws {
        do {
            try await client.failTask(id: taskId, agentId: agentId, error: error)
            await load()
        } catch {
            self.lastError = error.localizedDescription
            throw error
        }
    }
}
