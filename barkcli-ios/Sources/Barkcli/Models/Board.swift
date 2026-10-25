import Foundation

public enum Priority: String, Codable, Sendable, Hashable, CaseIterable, Comparable, Identifiable {
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

    public static func < (lhs: Priority, rhs: Priority) -> Bool {
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

public struct Effort: Codable, Sendable, Hashable, Comparable, Identifiable, ExpressibleByIntegerLiteral {
    public let points: Int

    public var id: Int { points }

    public init(_ points: Int) {
        self.points = max(0, points)
    }

    public init(integerLiteral value: Int) {
        self.points = max(0, value)
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intVal = try? container.decode(Int.self) {
            self.points = intVal
        } else if let strVal = try? container.decode(String.self), let intVal = Int(strVal) {
            self.points = intVal
        } else {
            self.points = 0
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(points)
    }

    public static func < (lhs: Effort, rhs: Effort) -> Bool {
        lhs.points < rhs.points
    }
}

public struct Column: Identifiable, Codable, Sendable, Hashable {
    public let id: String
    public var name: String
    public var wipLimit: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case wipLimit = "wip_limit"
    }

    public init(id: String, name: String, wipLimit: Int? = nil) {
        self.id = id
        self.name = name
        self.wipLimit = wipLimit
    }
}

public typealias BoardColumn = Column


public struct ColumnVelocity: Identifiable, Codable, Sendable, Hashable {
    public var id: String { columnId }
    public let columnId: String
    public let columnName: String
    public var throughputCards: Int
    public var effortPoints: Int
    public var averageCycleTimeDays: Double

    enum CodingKeys: String, CodingKey {
        case columnId = "column_id"
        case columnName = "column_name"
        case throughputCards = "throughput_cards"
        case effortPoints = "effort_points"
        case averageCycleTimeDays = "average_cycle_time_days"
    }

    public init(
        columnId: String,
        columnName: String,
        throughputCards: Int,
        effortPoints: Int,
        averageCycleTimeDays: Double
    ) {
        self.columnId = columnId
        self.columnName = columnName
        self.throughputCards = throughputCards
        self.effortPoints = effortPoints
        self.averageCycleTimeDays = averageCycleTimeDays
    }
}

public struct Board: Identifiable, Codable, Sendable, Hashable {
    public var id: String { title }
    public var title: String
    public var description: String?
    public var columns: [Column]
    public var cards: [Card]

    public init(
        title: String,
        description: String? = nil,
        columns: [Column] = [
            Column(id: "todo", name: "Todo"),
            Column(id: "doing", name: "Doing"),
            Column(id: "review", name: "Review"),
            Column(id: "done", name: "Done")
        ],
        cards: [Card] = []
    ) {
        self.title = title
        self.description = description
        self.columns = columns
        self.cards = cards
    }

    public func findCard(id: String) -> Card? {
        cards.first { $0.id == id }
    }

    public func cardsInColumn(_ columnId: String) -> [Card] {
        cards.filter { $0.column == columnId }
    }

    public func cardsByPriority(_ priority: Priority) -> [Card] {
        cards.filter { $0.priority == priority }
    }

    public func unblockedReadyCards() -> [Card] {
        let doneCardIds = Set(cards.filter { $0.column == "done" }.map(\.id))
        return cards.filter { card in
            guard card.column == "todo" else { return false }
            let hasUnfinishedBlockedLink = card.links.contains { link in
                link.type == .blockedBy && !doneCardIds.contains(link.target)
            }
            if hasUnfinishedBlockedLink {
                return false
            }
            if let legacy = card.blockedBy, !legacy.isEmpty && !doneCardIds.contains(legacy) {
                return false
            }
            return true
        }
    }

    public var completionRate: Double {
        guard !cards.isEmpty else { return 100.0 }
        let doneCount = cards.filter { $0.column == "done" }.count
        return (Double(doneCount) / Double(cards.count)) * 100.0
    }

    public var totalEffort: Int {
        cards.compactMap { $0.effort?.points }.reduce(0, +)
    }

    public var completedEffort: Int {
        cards.filter { $0.column == "done" }
            .compactMap { $0.effort?.points }
            .reduce(0, +)
    }

    public func validateWipLimits() -> [String] {
        var violations: [String] = []
        for column in columns {
            if let limit = column.wipLimit {
                let count = cards.filter { $0.column == column.id }.count
                if count > limit {
                    violations.append("Column '\(column.name)' exceeds WIP limit: \(count)/\(limit)")
                }
            }
        }
        return violations
    }
}
