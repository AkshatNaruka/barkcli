import Foundation

public enum ThreadEventKind: String, Codable, Sendable, Hashable, CaseIterable {
    case user = "user"
    case assistant = "assistant"
    case planProposed = "plan_proposed"
    case planApproved = "plan_approved"
    case taskSpawned = "task_spawned"
    case agentOutput = "agent_output"
    case gate = "gate"
    case merge = "merge"
    case steer = "steer"
    case custom = "custom"

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self).lowercased()
        switch raw {
        case "user":
            self = .user
        case "assistant":
            self = .assistant
        case "plan_proposed":
            self = .planProposed
        case "plan_approved":
            self = .planApproved
        case "task_spawned":
            self = .taskSpawned
        case "agent_output":
            self = .agentOutput
        case "gate":
            self = .gate
        case "merge":
            self = .merge
        case "steer":
            self = .steer
        default:
            self = .custom
        }
    }
}

public struct ThreadEventItem: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var cardId: String
    public var kind: ThreadEventKind
    public var author: String
    public var text: String
    public var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case cardId = "card_id"
        case kind
        case author
        case text
        case createdAt = "created_at"
    }

    public init(
        id: String,
        cardId: String,
        kind: ThreadEventKind,
        author: String,
        text: String,
        createdAt: String = ISO8601DateFormatter().string(from: Date())
    ) {
        self.id = id
        self.cardId = cardId
        self.kind = kind
        self.author = author
        self.text = text
        self.createdAt = createdAt
    }
}

public struct ThreadSummaryItem: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var title: String
    public var statusGroup: String
    public var eventCount: Int
    public var updatedAt: String
    public var column: String
    public var backend: String?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case statusGroup = "status_group"
        case eventCount = "event_count"
        case updatedAt = "updated_at"
        case column
        case backend
    }

    public init(
        id: String,
        title: String,
        statusGroup: String,
        eventCount: Int,
        updatedAt: String,
        column: String,
        backend: String? = nil
    ) {
        self.id = id
        self.title = title
        self.statusGroup = statusGroup
        self.eventCount = eventCount
        self.updatedAt = updatedAt
        self.column = column
        self.backend = backend
    }
}

public struct ThreadDetailItem: Identifiable, Codable, Sendable {
    public var id: String
    public var card: Card?
    public var events: [ThreadEventItem]

    public init(id: String, card: Card? = nil, events: [ThreadEventItem] = []) {
        self.id = id
        self.card = card
        self.events = events
    }
}

public struct TaskDiffResult: Codable, Sendable {
    public var taskId: String
    public var diff: String
    public var hasDiff: Bool

    enum CodingKeys: String, CodingKey {
        case taskId = "task_id"
        case diff
        case hasDiff = "has_diff"
    }

    public init(taskId: String, diff: String, hasDiff: Bool) {
        self.taskId = taskId
        self.diff = diff
        self.hasDiff = hasDiff
    }
}

public struct SessionEvalResult: Codable, Sendable, Hashable {
    public var sessionId: String
    public var taskId: String?
    public var backend: String
    public var status: String
    public var durationMs: Int64
    public var testGatePassed: Bool
    public var filesChangedCount: Int
    public var qualityScore: Double

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case taskId = "task_id"
        case backend
        case status
        case durationMs = "duration_ms"
        case testGatePassed = "test_gate_passed"
        case filesChangedCount = "files_changed_count"
        case qualityScore = "quality_score"
    }

    public init(
        sessionId: String,
        taskId: String? = nil,
        backend: String = "opencode",
        status: String = "done",
        durationMs: Int64 = 0,
        testGatePassed: Bool = true,
        filesChangedCount: Int = 0,
        qualityScore: Double = 0.95
    ) {
        self.sessionId = sessionId
        self.taskId = taskId
        self.backend = backend
        self.status = status
        self.durationMs = durationMs
        self.testGatePassed = testGatePassed
        self.filesChangedCount = filesChangedCount
        self.qualityScore = qualityScore
    }
}
