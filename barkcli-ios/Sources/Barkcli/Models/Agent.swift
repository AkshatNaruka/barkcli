import Foundation

public enum AgentRole: String, Codable, Sendable, Hashable, CaseIterable, Identifiable {
    case scrumMaster = "ScrumMaster"
    case productOwner = "ProductOwner"
    case techLead = "TechLead"
    case projectManager = "ProjectManager"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .scrumMaster:
            return "Scrum Master"
        case .productOwner:
            return "Product Owner"
        case .techLead:
            return "Tech Lead"
        case .projectManager:
            return "Project Manager"
        }
    }

    public var iconName: String {
        switch self {
        case .scrumMaster:
            return "person.badge.shield.checkmark"
        case .productOwner:
            return "briefcase.fill"
        case .techLead:
            return "chevron.left.forwardslash.chevron.right"
        case .projectManager:
            return "chart.bar.doc.horizontal"
        }
    }

    public var description: String {
        switch self {
        case .scrumMaster:
            return "Facilitates delivery rituals, unblocks impediments, and tracks team capacity."
        case .productOwner:
            return "Defines product backlog, prioritizes intent, and validates acceptance criteria."
        case .techLead:
            return "Guides technical architecture, oversees reviews, and manages code quality."
        case .projectManager:
            return "Coordinates milestone schedules, tracks deadlines, and monitors risks."
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self).lowercased()
        switch raw {
        case "scrummaster", "scrum_master", "scrum-master":
            self = .scrumMaster
        case "productowner", "product_owner", "product-owner":
            self = .productOwner
        case "techlead", "tech_lead", "tech-lead":
            self = .techLead
        case "projectmanager", "project_manager", "project-manager":
            self = .projectManager
        default:
            self = .techLead
        }
    }
}

public enum AgentStatus: String, Codable, Sendable, Hashable, CaseIterable, Identifiable {
    case idle = "Idle"
    case working = "Working"
    case paused = "Paused"
    case error = "Error"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .idle:
            return "Idle"
        case .working:
            return "Working"
        case .paused:
            return "Paused"
        case .error:
            return "Error"
        }
    }

    public var badgeVariant: StatusBadgeVariant {
        switch self {
        case .idle:
            return .neutral
        case .working:
            return .accent
        case .paused:
            return .warning
        case .error:
            return .danger
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self).lowercased()
        switch raw {
        case "idle":
            self = .idle
        case "working":
            self = .working
        case "paused":
            self = .paused
        case "error":
            self = .error
        default:
            self = .idle
        }
    }
}

public struct AgentMetrics: Codable, Sendable, Hashable {
    public var model: String?
    public var provider: String?
    public var maxConcurrentTasks: Int
    public var totalTokensUsed: UInt64
    public var avgTaskDurationMs: UInt64
    public var successRate: Double

    enum CodingKeys: String, CodingKey {
        case model
        case provider
        case maxConcurrentTasks = "max_concurrent_tasks"
        case totalTokensUsed = "total_tokens_used"
        case avgTaskDurationMs = "avg_task_duration_ms"
        case successRate = "success_rate"
    }

    public init(
        model: String? = nil,
        provider: String? = nil,
        maxConcurrentTasks: Int = 3,
        totalTokensUsed: UInt64 = 0,
        avgTaskDurationMs: UInt64 = 0,
        successRate: Double = 1.0
    ) {
        self.model = model
        self.provider = provider
        self.maxConcurrentTasks = maxConcurrentTasks
        self.totalTokensUsed = totalTokensUsed
        self.avgTaskDurationMs = avgTaskDurationMs
        self.successRate = successRate
    }
}

public struct AgentItem: Identifiable, Codable, Sendable, Hashable {
    public let id: String
    public var name: String
    public var role: AgentRole
    public var status: AgentStatus
    public var createdAt: Date?
    public var lastActive: Date?
    public var lastHeartbeat: Date?
    public var activeTasks: [String]
    public var completedTasks: [String]
    public var failedTasks: [String]
    public var totalTimeMs: UInt64
    public var metadata: [String: String]?
    public var metrics: AgentMetrics

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case role
        case status
        case createdAt = "created_at"
        case lastActive = "last_active"
        case lastHeartbeat = "last_heartbeat"
        case activeTasks = "active_tasks"
        case completedTasks = "completed_tasks"
        case failedTasks = "failed_tasks"
        case totalTimeMs = "total_time_ms"
        case metadata
        case metrics
    }

    public init(
        id: String,
        name: String,
        role: AgentRole,
        status: AgentStatus = .idle,
        createdAt: Date? = Date(),
        lastActive: Date? = nil,
        lastHeartbeat: Date? = nil,
        activeTasks: [String] = [],
        completedTasks: [String] = [],
        failedTasks: [String] = [],
        totalTimeMs: UInt64 = 0,
        metrics: AgentMetrics = AgentMetrics()
    ) {
        self.id = id
        self.name = name
        self.role = role
        self.status = status
        self.createdAt = createdAt
        self.lastActive = lastActive
        self.lastHeartbeat = lastHeartbeat
        self.activeTasks = activeTasks
        self.completedTasks = completedTasks
        self.failedTasks = failedTasks
        self.totalTimeMs = totalTimeMs
        self.metrics = metrics
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.name = try container.decode(String.self, forKey: .name)
        self.role = (try? container.decode(AgentRole.self, forKey: .role)) ?? .techLead
        self.status = (try? container.decode(AgentStatus.self, forKey: .status)) ?? .idle

        if let date = try? container.decode(Date.self, forKey: .createdAt) {
            self.createdAt = date
        } else if let dateStr = try? container.decode(String.self, forKey: .createdAt),
                  let parsed = ISO8601DateFormatter().date(from: dateStr) {
            self.createdAt = parsed
        } else {
            self.createdAt = nil
        }

        if let date = try? container.decode(Date.self, forKey: .lastActive) {
            self.lastActive = date
        } else if let dateStr = try? container.decode(String.self, forKey: .lastActive),
                  let parsed = ISO8601DateFormatter().date(from: dateStr) {
            self.lastActive = parsed
        } else {
            self.lastActive = nil
        }

        if let date = try? container.decode(Date.self, forKey: .lastHeartbeat) {
            self.lastHeartbeat = date
        } else if let dateStr = try? container.decode(String.self, forKey: .lastHeartbeat),
                  let parsed = ISO8601DateFormatter().date(from: dateStr) {
            self.lastHeartbeat = parsed
        } else {
            self.lastHeartbeat = nil
        }

        self.activeTasks = try container.decodeIfPresent([String].self, forKey: .activeTasks) ?? []
        self.completedTasks = try container.decodeIfPresent([String].self, forKey: .completedTasks) ?? []
        self.failedTasks = try container.decodeIfPresent([String].self, forKey: .failedTasks) ?? []
        self.totalTimeMs = try container.decodeIfPresent(UInt64.self, forKey: .totalTimeMs) ?? 0

        if let explicitMetrics = try? container.decode(AgentMetrics.self, forKey: .metrics) {
            self.metrics = explicitMetrics
        } else if let meta = try? container.decode(AgentMetrics.self, forKey: .metadata) {
            self.metrics = meta
        } else {
            self.metrics = AgentMetrics()
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(role, forKey: .role)
        try container.encode(status, forKey: .status)
        try container.encodeIfPresent(createdAt, forKey: .createdAt)
        try container.encodeIfPresent(lastActive, forKey: .lastActive)
        try container.encodeIfPresent(lastHeartbeat, forKey: .lastHeartbeat)
        try container.encode(activeTasks, forKey: .activeTasks)
        try container.encode(completedTasks, forKey: .completedTasks)
        try container.encode(failedTasks, forKey: .failedTasks)
        try container.encode(totalTimeMs, forKey: .totalTimeMs)
        try container.encode(metrics, forKey: .metrics)
    }

    public func isAlive(withinMinutes minutes: Int = 5) -> Bool {
        guard let lastHeartbeat else { return false }
        let elapsedSeconds = Date().timeIntervalSince(lastHeartbeat)
        return elapsedSeconds < Double(minutes * 60)
    }
}

public struct LiveSession: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var taskId: String?
    public var agentId: String
    public var backend: String
    public var status: String
    public var branch: String?
    public var worktreePath: String?
    public var pid: UInt32?
    public var startedAt: Date?
    public var lastHeartbeat: Date?
    public var endedAt: Date?
    public var exitCode: Int32?
    public var note: String?
    public var fresh: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case taskId = "task_id"
        case agentId = "agent_id"
        case backend
        case status
        case branch
        case worktreePath = "worktree_path"
        case pid
        case startedAt = "started_at"
        case lastHeartbeat = "last_heartbeat"
        case endedAt = "ended_at"
        case exitCode = "exit_code"
        case note
        case fresh
    }

    public init(
        id: String,
        taskId: String? = nil,
        agentId: String,
        backend: String = "opencode",
        status: String = "running",
        branch: String? = nil,
        worktreePath: String? = nil,
        pid: UInt32? = nil,
        startedAt: Date? = Date(),
        lastHeartbeat: Date? = Date(),
        endedAt: Date? = nil,
        exitCode: Int32? = nil,
        note: String? = nil,
        fresh: Bool = true
    ) {
        self.id = id
        self.taskId = taskId
        self.agentId = agentId
        self.backend = backend
        self.status = status
        self.branch = branch
        self.worktreePath = worktreePath
        self.pid = pid
        self.startedAt = startedAt
        self.lastHeartbeat = lastHeartbeat
        self.endedAt = endedAt
        self.exitCode = exitCode
        self.note = note
        self.fresh = fresh
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.taskId = try container.decodeIfPresent(String.self, forKey: .taskId)
        self.agentId = try container.decodeIfPresent(String.self, forKey: .agentId) ?? "agent"
        self.backend = try container.decodeIfPresent(String.self, forKey: .backend) ?? "opencode"
        self.status = try container.decodeIfPresent(String.self, forKey: .status) ?? "running"
        self.branch = try container.decodeIfPresent(String.self, forKey: .branch)
        self.worktreePath = try container.decodeIfPresent(String.self, forKey: .worktreePath)
        self.pid = try container.decodeIfPresent(UInt32.self, forKey: .pid)

        if let direct = try? container.decode(Date.self, forKey: .startedAt) {
            self.startedAt = direct
        } else if let str = try? container.decode(String.self, forKey: .startedAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.startedAt = parsed
        } else {
            self.startedAt = nil
        }

        if let direct = try? container.decode(Date.self, forKey: .lastHeartbeat) {
            self.lastHeartbeat = direct
        } else if let str = try? container.decode(String.self, forKey: .lastHeartbeat),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.lastHeartbeat = parsed
        } else {
            self.lastHeartbeat = nil
        }

        if let direct = try? container.decode(Date.self, forKey: .endedAt) {
            self.endedAt = direct
        } else if let str = try? container.decode(String.self, forKey: .endedAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.endedAt = parsed
        } else {
            self.endedAt = nil
        }

        self.exitCode = try container.decodeIfPresent(Int32.self, forKey: .exitCode)
        self.note = try container.decodeIfPresent(String.self, forKey: .note)
        self.fresh = try container.decodeIfPresent(Bool.self, forKey: .fresh) ?? true
    }
}

