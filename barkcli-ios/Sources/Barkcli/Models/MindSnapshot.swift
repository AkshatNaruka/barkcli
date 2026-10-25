import Foundation

public struct BlockerItem: Identifiable, Codable, Sendable, Hashable {
    public var id: String { cardId }
    public var cardId: String
    public var title: String
    public var blockedBy: [String]
    public var column: String
    public var resolutionHint: String?

    enum CodingKeys: String, CodingKey {
        case cardId = "card_id"
        case title
        case blockedBy = "blocked_by"
        case column
        case resolutionHint = "resolution_hint"
    }

    public init(
        cardId: String,
        title: String,
        blockedBy: [String] = [],
        column: String = "todo",
        resolutionHint: String? = nil
    ) {
        self.cardId = cardId
        self.title = title
        self.blockedBy = blockedBy
        self.column = column
        self.resolutionHint = resolutionHint
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.cardId = try container.decode(String.self, forKey: .cardId)
        self.title = try container.decode(String.self, forKey: .title)
        self.blockedBy = try container.decodeIfPresent([String].self, forKey: .blockedBy) ?? []
        self.column = try container.decodeIfPresent(String.self, forKey: .column) ?? "todo"
        self.resolutionHint = try container.decodeIfPresent(String.self, forKey: .resolutionHint)
    }
}

public struct HealthMetrics: Codable, Sendable, Hashable {
    public var healthScore: Double
    public var wipViolationsCount: Int
    public var blockedCardsCount: Int
    public var staleCardsCount: Int
    public var completionRate: Double

    enum CodingKeys: String, CodingKey {
        case healthScore = "health_score"
        case wipViolationsCount = "wip_violations_count"
        case blockedCardsCount = "blocked_cards_count"
        case staleCardsCount = "stale_cards_count"
        case completionRate = "completion_rate"
    }

    public init(
        healthScore: Double = 100.0,
        wipViolationsCount: Int = 0,
        blockedCardsCount: Int = 0,
        staleCardsCount: Int = 0,
        completionRate: Double = 100.0
    ) {
        self.healthScore = healthScore
        self.wipViolationsCount = wipViolationsCount
        self.blockedCardsCount = blockedCardsCount
        self.staleCardsCount = staleCardsCount
        self.completionRate = completionRate
    }
}

public struct VelocitySummary: Codable, Sendable, Hashable {
    public var totalDone: Int
    public var totalPoints: Int
    public var avgEffort: Double
    public var cycleTimeDays: Double?

    enum CodingKeys: String, CodingKey {
        case totalDone = "total_done"
        case totalPoints = "total_points"
        case avgEffort = "avg_effort"
        case cycleTimeDays = "cycle_time_days"
    }

    public init(
        totalDone: Int = 0,
        totalPoints: Int = 0,
        avgEffort: Double = 0.0,
        cycleTimeDays: Double? = nil
    ) {
        self.totalDone = totalDone
        self.totalPoints = totalPoints
        self.avgEffort = avgEffort
        self.cycleTimeDays = cycleTimeDays
    }
}

public struct BoardStatsSummary: Codable, Sendable, Hashable {
    public var total: Int
    public var byColumn: [String: Int]
    public var byPriority: [String: Int]
    public var byLabel: [String: Int]

    enum CodingKeys: String, CodingKey {
        case total
        case byColumn = "by_column"
        case byPriority = "by_priority"
        case byLabel = "by_label"
    }

    public init(
        total: Int = 0,
        byColumn: [String: Int] = [:],
        byPriority: [String: Int] = [:],
        byLabel: [String: Int] = [:]
    ) {
        self.total = total
        self.byColumn = byColumn
        self.byPriority = byPriority
        self.byLabel = byLabel
    }
}

public struct StaleCardSummary: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var title: String
    public var column: String
    public var days: Int

    public init(id: String, title: String, column: String, days: Int) {
        self.id = id
        self.title = title
        self.column = column
        self.days = days
    }
}

public struct NextActionSummary: Identifiable, Codable, Sendable, Hashable {
    public var id: String { "\(action):\(reason)" }
    public var action: String
    public var reason: String

    public init(action: String, reason: String) {
        self.action = action
        self.reason = reason
    }
}

public typealias Blocker = BlockerItem
public typealias StaleCard = StaleCardSummary
public typealias NextAction = NextActionSummary
public typealias BoardStats = BoardStatsSummary
public typealias VelocityReport = VelocitySummary

public struct Sprint: Identifiable, Codable, Sendable, Hashable {
    public var id: String { name }
    public var name: String
    public var start: String?
    public var end: String?
    public var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case name
        case start
        case end
        case createdAt = "created_at"
    }

    public init(name: String, start: String? = nil, end: String? = nil, createdAt: Date? = Date()) {
        self.name = name
        self.start = start
        self.end = end
        self.createdAt = createdAt
    }
}

public struct HistoryEntry: Identifiable, Codable, Sendable, Hashable {
    public var id: String { "\(op):\(card ?? ""):\(at ?? "")" }
    public var op: String
    public var board: String?
    public var card: String?
    public var oldValue: String?
    public var newValue: String?
    public var field: String?
    public var at: String?

    enum CodingKeys: String, CodingKey {
        case op
        case board
        case card
        case oldValue = "old_value"
        case newValue = "new_value"
        case field
        case at
    }

    public init(
        op: String,
        board: String? = nil,
        card: String? = nil,
        oldValue: String? = nil,
        newValue: String? = nil,
        field: String? = nil,
        at: String? = nil
    ) {
        self.op = op
        self.board = board
        self.card = card
        self.oldValue = oldValue
        self.newValue = newValue
        self.field = field
        self.at = at
    }
}

public struct SessionEntry: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var agent: String?
    public var model: String?
    public var board: String?
    public var prompt: String?
    public var commitSha: String?
    public var filesTouched: [String]
    public var summary: String?
    public var at: String?
    public var durationMs: UInt64?

    enum CodingKeys: String, CodingKey {
        case id
        case agent
        case model
        case board
        case prompt
        case commitSha = "commit_sha"
        case filesTouched = "files_touched"
        case summary
        case at
        case durationMs = "duration_ms"
    }

    public init(
        id: String,
        agent: String? = nil,
        model: String? = nil,
        board: String? = nil,
        prompt: String? = nil,
        commitSha: String? = nil,
        filesTouched: [String] = [],
        summary: String? = nil,
        at: String? = nil,
        durationMs: UInt64? = nil
    ) {
        self.id = id
        self.agent = agent
        self.model = model
        self.board = board
        self.prompt = prompt
        self.commitSha = commitSha
        self.filesTouched = filesTouched
        self.summary = summary
        self.at = at
        self.durationMs = durationMs
    }
}

public struct MindSnapshot: Identifiable, Codable, Sendable, Hashable {
    public var id: String { boardName }
    public var boardName: String
    public var generatedAt: Date?
    public var healthMetrics: HealthMetrics
    public var blockers: [BlockerItem]
    public var velocity: VelocitySummary?
    public var staleCards: [StaleCardSummary]
    public var nextActions: [NextActionSummary]
    public var stats: BoardStatsSummary
    public var activeSprint: Sprint?
    public var recentHistory: [HistoryEntry]
    public var recentSessions: [SessionEntry]
    public var topMemories: [MemoryEntry]
    public var bundleStats: BundleStats?

    public var healthScore: Double {
        healthMetrics.healthScore
    }

    enum CodingKeys: String, CodingKey {
        case boardName = "board_name"
        case generatedAt = "generated_at"
        case healthScore = "health_score"
        case healthMetrics = "health_metrics"
        case blockers
        case velocity
        case staleCards = "stale_cards"
        case nextActions = "next_actions"
        case stats
        case activeSprint = "active_sprint"
        case recentHistory = "recent_history"
        case recentSessions = "recent_sessions"
        case topMemories = "top_memories"
        case bundleStats = "bundle_stats"
    }

    public init(
        boardName: String,
        generatedAt: Date? = Date(),
        healthMetrics: HealthMetrics = HealthMetrics(),
        blockers: [BlockerItem] = [],
        velocity: VelocitySummary? = nil,
        staleCards: [StaleCardSummary] = [],
        nextActions: [NextActionSummary] = [],
        stats: BoardStatsSummary = BoardStatsSummary(),
        activeSprint: Sprint? = nil,
        recentHistory: [HistoryEntry] = [],
        recentSessions: [SessionEntry] = [],
        topMemories: [MemoryEntry] = [],
        bundleStats: BundleStats? = nil
    ) {
        self.boardName = boardName
        self.generatedAt = generatedAt
        self.healthMetrics = healthMetrics
        self.blockers = blockers
        self.velocity = velocity
        self.staleCards = staleCards
        self.nextActions = nextActions
        self.stats = stats
        self.activeSprint = activeSprint
        self.recentHistory = recentHistory
        self.recentSessions = recentSessions
        self.topMemories = topMemories
        self.bundleStats = bundleStats
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.boardName = try container.decode(String.self, forKey: .boardName)

        if let direct = try? container.decode(Date.self, forKey: .generatedAt) {
            self.generatedAt = direct
        } else if let str = try? container.decode(String.self, forKey: .generatedAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.generatedAt = parsed
        } else {
            self.generatedAt = nil
        }

        self.blockers = try container.decodeIfPresent([BlockerItem].self, forKey: .blockers) ?? []
        self.velocity = try container.decodeIfPresent(VelocitySummary.self, forKey: .velocity)
        self.staleCards = try container.decodeIfPresent([StaleCardSummary].self, forKey: .staleCards) ?? []
        self.nextActions = try container.decodeIfPresent([NextActionSummary].self, forKey: .nextActions) ?? []
        self.stats = try container.decodeIfPresent(BoardStatsSummary.self, forKey: .stats) ?? BoardStatsSummary()
        self.activeSprint = try container.decodeIfPresent(Sprint.self, forKey: .activeSprint)
        self.recentHistory = try container.decodeIfPresent([HistoryEntry].self, forKey: .recentHistory) ?? []
        self.recentSessions = try container.decodeIfPresent([SessionEntry].self, forKey: .recentSessions) ?? []
        self.topMemories = try container.decodeIfPresent([MemoryEntry].self, forKey: .topMemories) ?? []
        self.bundleStats = try container.decodeIfPresent(BundleStats.self, forKey: .bundleStats)

        if let fullHealth = try? container.decode(HealthMetrics.self, forKey: .healthMetrics) {
            self.healthMetrics = fullHealth
        } else if let score = try? container.decode(Double.self, forKey: .healthScore) {
            self.healthMetrics = HealthMetrics(
                healthScore: score,
                wipViolationsCount: 0,
                blockedCardsCount: self.blockers.count,
                staleCardsCount: self.staleCards.count,
                completionRate: 100.0
            )
        } else {
            self.healthMetrics = HealthMetrics(
                healthScore: 100.0,
                wipViolationsCount: 0,
                blockedCardsCount: self.blockers.count,
                staleCardsCount: self.staleCards.count,
                completionRate: 100.0
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(boardName, forKey: .boardName)
        try container.encodeIfPresent(generatedAt, forKey: .generatedAt)
        try container.encode(healthMetrics.healthScore, forKey: .healthScore)
        try container.encode(healthMetrics, forKey: .healthMetrics)
        try container.encode(blockers, forKey: .blockers)
        try container.encodeIfPresent(velocity, forKey: .velocity)
        try container.encode(staleCards, forKey: .staleCards)
        try container.encode(nextActions, forKey: .nextActions)
        try container.encode(stats, forKey: .stats)
        try container.encodeIfPresent(activeSprint, forKey: .activeSprint)
        try container.encode(recentHistory, forKey: .recentHistory)
        try container.encode(recentSessions, forKey: .recentSessions)
        try container.encode(topMemories, forKey: .topMemories)
        try container.encodeIfPresent(bundleStats, forKey: .bundleStats)
    }
}

