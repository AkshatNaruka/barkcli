import Foundation

public enum TaskPriority: String, Codable, Sendable, Hashable, CaseIterable, Comparable, Identifiable {
    case critical = "critical"
    case high = "high"
    case medium = "medium"
    case low = "low"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .critical:
            return "Critical"
        case .high:
            return "High"
        case .medium:
            return "Medium"
        case .low:
            return "Low"
        }
    }

    public var rank: Int {
        switch self {
        case .critical:
            return 0
        case .high:
            return 1
        case .medium:
            return 2
        case .low:
            return 3
        }
    }

    public static func < (lhs: TaskPriority, rhs: TaskPriority) -> Bool {
        lhs.rank < rhs.rank
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self).lowercased()
        switch raw {
        case "critical":
            self = .critical
        case "high":
            self = .high
        case "low":
            self = .low
        default:
            self = .medium
        }
    }
}

public enum TaskStatus: String, Codable, Sendable, Hashable, CaseIterable, Identifiable {
    case pending = "Pending"
    case assigned = "Assigned"
    case inProgress = "InProgress"
    case blocked = "Blocked"
    case needsInput = "NeedsInput"
    case completed = "Completed"
    case failed = "Failed"
    case cancelled = "Cancelled"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .pending:
            return "Pending"
        case .assigned:
            return "Assigned"
        case .inProgress:
            return "In Progress"
        case .blocked:
            return "Blocked"
        case .needsInput:
            return "Needs Input"
        case .completed:
            return "Completed"
        case .failed:
            return "Failed"
        case .cancelled:
            return "Cancelled"
        }
    }

    public var isTerminal: Bool {
        self == .completed || self == .failed || self == .cancelled
    }

    public var isActive: Bool {
        self == .assigned || self == .inProgress
    }

    public var badgeVariant: StatusBadgeVariant {
        switch self {
        case .pending:
            return .neutral
        case .assigned, .inProgress:
            return .accent
        case .blocked, .needsInput:
            return .warning
        case .completed:
            return .success
        case .failed, .cancelled:
            return .danger
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self).lowercased()
        switch raw {
        case "pending":
            self = .pending
        case "assigned":
            self = .assigned
        case "inprogress", "in_progress", "in-progress":
            self = .inProgress
        case "blocked":
            self = .blocked
        case "needsinput", "needs_input", "needs-input":
            self = .needsInput
        case "completed":
            self = .completed
        case "failed":
            self = .failed
        case "cancelled", "canceled":
            self = .cancelled
        default:
            self = .pending
        }
    }
}

public struct TaskLease: Codable, Sendable, Hashable {
    public var agentId: String
    public var sessionId: String?
    public var acquiredAt: Date?
    public var expiresAt: Date?
    public var lastHeartbeat: Date?

    enum CodingKeys: String, CodingKey {
        case agentId = "agent_id"
        case sessionId = "session_id"
        case acquiredAt = "acquired_at"
        case expiresAt = "expires_at"
        case lastHeartbeat = "last_heartbeat"
    }

    public init(
        agentId: String,
        sessionId: String? = nil,
        acquiredAt: Date? = Date(),
        expiresAt: Date? = nil,
        lastHeartbeat: Date? = Date()
    ) {
        self.agentId = agentId
        self.sessionId = sessionId
        self.acquiredAt = acquiredAt
        self.expiresAt = expiresAt
        self.lastHeartbeat = lastHeartbeat
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.agentId = try container.decode(String.self, forKey: .agentId)
        self.sessionId = try container.decodeIfPresent(String.self, forKey: .sessionId)

        if let date = try? container.decode(Date.self, forKey: .acquiredAt) {
            self.acquiredAt = date
        } else if let str = try? container.decode(String.self, forKey: .acquiredAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.acquiredAt = parsed
        } else {
            self.acquiredAt = nil
        }

        if let date = try? container.decode(Date.self, forKey: .expiresAt) {
            self.expiresAt = date
        } else if let str = try? container.decode(String.self, forKey: .expiresAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.expiresAt = parsed
        } else {
            self.expiresAt = nil
        }

        if let date = try? container.decode(Date.self, forKey: .lastHeartbeat) {
            self.lastHeartbeat = date
        } else if let str = try? container.decode(String.self, forKey: .lastHeartbeat),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.lastHeartbeat = parsed
        } else {
            self.lastHeartbeat = nil
        }
    }
}

public struct ProgressNote: Identifiable, Codable, Sendable, Hashable {
    public var id: String { "\(author):\(at.timeIntervalSince1970)" }
    public var at: Date
    public var author: String
    public var text: String

    enum CodingKeys: String, CodingKey {
        case at
        case author
        case text
    }

    public init(author: String, text: String, at: Date = Date()) {
        self.author = author
        self.text = text
        self.at = at
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.author = try container.decode(String.self, forKey: .author)
        self.text = try container.decode(String.self, forKey: .text)

        if let direct = try? container.decode(Date.self, forKey: .at) {
            self.at = direct
        } else if let str = try? container.decode(String.self, forKey: .at),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.at = parsed
        } else {
            self.at = Date()
        }
    }
}

public struct TaskFileContext: Identifiable, Codable, Sendable, Hashable {
    public var id: String { path }
    public var path: String
    public var content: String?
    public var symbols: [String]
    public var callGraph: String?
    public var testCoverage: String?

    enum CodingKeys: String, CodingKey {
        case path
        case content
        case symbols
        case callGraph = "call_graph"
        case testCoverage = "test_coverage"
    }

    public init(
        path: String,
        content: String? = nil,
        symbols: [String] = [],
        callGraph: String? = nil,
        testCoverage: String? = nil
    ) {
        self.path = path
        self.content = content
        self.symbols = symbols
        self.callGraph = callGraph
        self.testCoverage = testCoverage
    }
}

public enum TaskCompletionStatus: String, Codable, Sendable, Hashable, CaseIterable {
    case success = "Success"
    case partialSuccess = "PartialSuccess"
    case failed = "Failed"
    case needsReview = "NeedsReview"

    public var displayName: String {
        switch self {
        case .success:
            return "Success"
        case .partialSuccess:
            return "Partial Success"
        case .failed:
            return "Failed"
        case .needsReview:
            return "Needs Review"
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self).lowercased()
        switch raw {
        case "success":
            self = .success
        case "partialsuccess", "partial_success", "partial-success":
            self = .partialSuccess
        case "failed":
            self = .failed
        case "needsreview", "needs_review", "needs-review":
            self = .needsReview
        default:
            self = .success
        }
    }
}

public enum TaskArtifactType: String, Codable, Sendable, Hashable, CaseIterable {
    case code = "Code"
    case test = "Test"
    case documentation = "Documentation"
    case config = "Config"
    case other = "Other"
}

public struct TaskArtifact: Identifiable, Codable, Sendable, Hashable {
    public var id: String { "\(name):\(path)" }
    public var name: String
    public var path: String
    public var artifactType: TaskArtifactType

    enum CodingKeys: String, CodingKey {
        case name
        case path
        case artifactType = "artifact_type"
    }

    public init(name: String, path: String, artifactType: TaskArtifactType = .code) {
        self.name = name
        self.path = path
        self.artifactType = artifactType
    }
}

public struct TaskRequest: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var cardId: String
    public var title: String
    public var description: String
    public var acceptanceCriteria: [String]
    public var contextFiles: [TaskFileContext]
    public var branch: String?
    public var priority: TaskPriority
    public var assignedAgent: String?
    public var createdAt: Date?
    public var status: TaskStatus
    public var attempts: UInt32
    public var maxAttempts: UInt32
    public var deadline: Date?
    public var dependencies: [String]
    public var lease: TaskLease?
    public var notes: [ProgressNote]
    public var blockedReason: String?

    enum CodingKeys: String, CodingKey {
        case id
        case cardId = "card_id"
        case title
        case description
        case acceptanceCriteria = "acceptance_criteria"
        case contextFiles = "context_files"
        case branch
        case priority
        case assignedAgent = "assigned_agent"
        case createdAt = "created_at"
        case status
        case attempts
        case maxAttempts = "max_attempts"
        case deadline
        case dependencies
        case lease
        case notes
        case blockedReason = "blocked_reason"
    }

    public init(
        id: String,
        cardId: String,
        title: String,
        description: String,
        acceptanceCriteria: [String] = [],
        contextFiles: [TaskFileContext] = [],
        branch: String? = nil,
        priority: TaskPriority = .medium,
        assignedAgent: String? = nil,
        createdAt: Date? = Date(),
        status: TaskStatus = .pending,
        attempts: UInt32 = 0,
        maxAttempts: UInt32 = 3,
        deadline: Date? = nil,
        dependencies: [String] = [],
        lease: TaskLease? = nil,
        notes: [ProgressNote] = [],
        blockedReason: String? = nil
    ) {
        self.id = id
        self.cardId = cardId
        self.title = title
        self.description = description
        self.acceptanceCriteria = acceptanceCriteria
        self.contextFiles = contextFiles
        self.branch = branch
        self.priority = priority
        self.assignedAgent = assignedAgent
        self.createdAt = createdAt
        self.status = status
        self.attempts = attempts
        self.maxAttempts = maxAttempts
        self.deadline = deadline
        self.dependencies = dependencies
        self.lease = lease
        self.notes = notes
        self.blockedReason = blockedReason
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.cardId = try container.decodeIfPresent(String.self, forKey: .cardId) ?? ""
        self.title = try container.decode(String.self, forKey: .title)
        self.description = try container.decodeIfPresent(String.self, forKey: .description) ?? ""
        self.acceptanceCriteria = try container.decodeIfPresent([String].self, forKey: .acceptanceCriteria) ?? []
        self.contextFiles = try container.decodeIfPresent([TaskFileContext].self, forKey: .contextFiles) ?? []
        self.branch = try container.decodeIfPresent(String.self, forKey: .branch)

        if let prio = try? container.decode(TaskPriority.self, forKey: .priority) {
            self.priority = prio
        } else if let prioStr = try? container.decode(String.self, forKey: .priority) {
            self.priority = TaskPriority(rawValue: prioStr.lowercased()) ?? .medium
        } else {
            self.priority = .medium
        }

        self.assignedAgent = try container.decodeIfPresent(String.self, forKey: .assignedAgent)

        if let date = try? container.decode(Date.self, forKey: .createdAt) {
            self.createdAt = date
        } else if let str = try? container.decode(String.self, forKey: .createdAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.createdAt = parsed
        } else {
            self.createdAt = nil
        }

        self.status = (try? container.decode(TaskStatus.self, forKey: .status)) ?? .pending
        self.attempts = try container.decodeIfPresent(UInt32.self, forKey: .attempts) ?? 0
        self.maxAttempts = try container.decodeIfPresent(UInt32.self, forKey: .maxAttempts) ?? 3

        if let date = try? container.decode(Date.self, forKey: .deadline) {
            self.deadline = date
        } else if let str = try? container.decode(String.self, forKey: .deadline),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.deadline = parsed
        } else {
            self.deadline = nil
        }

        self.dependencies = try container.decodeIfPresent([String].self, forKey: .dependencies) ?? []
        self.lease = try container.decodeIfPresent(TaskLease.self, forKey: .lease)
        self.notes = try container.decodeIfPresent([ProgressNote].self, forKey: .notes) ?? []
        self.blockedReason = try container.decodeIfPresent(String.self, forKey: .blockedReason)
    }
}

public struct TaskResult: Identifiable, Codable, Sendable, Hashable {
    public var id: String { taskId }
    public var taskId: String
    public var status: TaskCompletionStatus
    public var filesChanged: [String]
    public var commitSha: String?
    public var summary: String
    public var testsPassed: Bool?
    public var durationMs: UInt64
    public var errorMessage: String?
    public var artifacts: [TaskArtifact]

    enum CodingKeys: String, CodingKey {
        case taskId = "task_id"
        case status
        case filesChanged = "files_changed"
        case commitSha = "commit_sha"
        case summary
        case testsPassed = "tests_passed"
        case durationMs = "duration_ms"
        case errorMessage = "error_message"
        case artifacts
    }

    public init(
        taskId: String,
        status: TaskCompletionStatus,
        filesChanged: [String] = [],
        commitSha: String? = nil,
        summary: String = "",
        testsPassed: Bool? = nil,
        durationMs: UInt64 = 0,
        errorMessage: String? = nil,
        artifacts: [TaskArtifact] = []
    ) {
        self.taskId = taskId
        self.status = status
        self.filesChanged = filesChanged
        self.commitSha = commitSha
        self.summary = summary
        self.testsPassed = testsPassed
        self.durationMs = durationMs
        self.errorMessage = errorMessage
        self.artifacts = artifacts
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.taskId = try container.decode(String.self, forKey: .taskId)
        self.status = (try? container.decode(TaskCompletionStatus.self, forKey: .status)) ?? .success
        self.filesChanged = try container.decodeIfPresent([String].self, forKey: .filesChanged) ?? []
        self.commitSha = try container.decodeIfPresent(String.self, forKey: .commitSha)
        self.summary = try container.decodeIfPresent(String.self, forKey: .summary) ?? ""
        self.testsPassed = try container.decodeIfPresent(Bool.self, forKey: .testsPassed)
        self.durationMs = try container.decodeIfPresent(UInt64.self, forKey: .durationMs) ?? 0
        self.errorMessage = try container.decodeIfPresent(String.self, forKey: .errorMessage)
        self.artifacts = try container.decodeIfPresent([TaskArtifact].self, forKey: .artifacts) ?? []
    }
}

public typealias CycleResult = OrchestrationCycleResult

