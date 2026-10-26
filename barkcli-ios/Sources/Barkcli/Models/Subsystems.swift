import Foundation

// MARK: Code Search Domain Models

public struct CodeSymbol: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var name: String
    public var kind: String
    public var filePath: String
    public var line: Int
    public var language: String
    public var documentation: String?
    public var linkedCardId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case kind
        case filePath = "file_path"
        case line
        case language
        case documentation
        case linkedCardId = "linked_card_id"
    }

    public init(
        id: String,
        name: String,
        kind: String,
        filePath: String,
        line: Int,
        language: String,
        documentation: String? = nil,
        linkedCardId: String? = nil
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.filePath = filePath
        self.line = line
        self.language = language
        self.documentation = documentation
        self.linkedCardId = linkedCardId
    }
}

// MARK: Living Context Domain Models

public struct ContextSection: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var title: String
    public var content: String
    public var isManual: Bool
    public var staleness: String?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case content
        case isManual = "is_manual"
        case staleness
    }

    public init(
        id: String,
        title: String,
        content: String,
        isManual: Bool = false,
        staleness: String? = nil
    ) {
        self.id = id
        self.title = title
        self.content = content
        self.isManual = isManual
        self.staleness = staleness
    }
}

public struct LivingContext: Codable, Sendable, Hashable {
    public var rawMarkdown: String
    public var tokenBudget: Int
    public var tokensUsed: Int
    public var stalenessSeconds: Int
    public var sections: [ContextSection]

    enum CodingKeys: String, CodingKey {
        case rawMarkdown = "raw_markdown"
        case tokenBudget = "token_budget"
        case tokensUsed = "tokens_used"
        case stalenessSeconds = "staleness_seconds"
        case sections
    }

    public init(
        rawMarkdown: String = "",
        tokenBudget: Int = 8000,
        tokensUsed: Int = 1840,
        stalenessSeconds: Int = 120,
        sections: [ContextSection] = []
    ) {
        self.rawMarkdown = rawMarkdown
        self.tokenBudget = tokenBudget
        self.tokensUsed = tokensUsed
        self.stalenessSeconds = stalenessSeconds
        self.sections = sections
    }
}

// MARK: Brain Knowledge Graph Models

public struct BrainNode: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var label: String
    public var category: String
    public var degree: Int
    public var importance: Double

    public init(
        id: String,
        label: String,
        category: String,
        degree: Int = 1,
        importance: Double = 0.5
    ) {
        self.id = id
        self.label = label
        self.category = category
        self.degree = degree
        self.importance = importance
    }
}

public struct BrainEdge: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var sourceId: String
    public var targetId: String
    public var relation: String
    public var weight: Double

    enum CodingKeys: String, CodingKey {
        case id
        case sourceId = "source_id"
        case targetId = "target_id"
        case relation
        case weight
    }

    public init(
        id: String,
        sourceId: String,
        targetId: String,
        relation: String,
        weight: Double = 1.0
    ) {
        self.id = id
        self.sourceId = sourceId
        self.targetId = targetId
        self.relation = relation
        self.weight = weight
    }
}

public struct BrainGraph: Codable, Sendable, Hashable {
    public var nodes: [BrainNode]
    public var edges: [BrainEdge]

    public init(nodes: [BrainNode] = [], edges: [BrainEdge] = []) {
        self.nodes = nodes
        self.edges = edges
    }
}

// MARK: Skills Registry Domain Models

public struct Skill: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var name: String
    public var description: String
    public var author: String
    public var installed: Bool
    public var tags: [String]
    public var entrypoint: String

    public init(
        id: String,
        name: String,
        description: String,
        author: String = "core",
        installed: Bool = false,
        tags: [String] = [],
        entrypoint: String = ""
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.author = author
        self.installed = installed
        self.tags = tags
        self.entrypoint = entrypoint
    }
}

// MARK: Documentation Domain Models

public struct DocItem: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var title: String
    public var category: String
    public var path: String
    public var summary: String
    public var content: String

    public init(
        id: String,
        title: String,
        category: String,
        path: String,
        summary: String,
        content: String
    ) {
        self.id = id
        self.title = title
        self.category = category
        self.path = path
        self.summary = summary
        self.content = content
    }
}

// MARK: Calendar Agenda Domain Models

public struct AgendaItem: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var cardId: String
    public var title: String
    public var dueDate: Date
    public var column: String
    public var priority: Priority
    public var isOverdue: Bool
    public var isToday: Bool

    public init(
        id: String,
        cardId: String,
        title: String,
        dueDate: Date,
        column: String,
        priority: Priority = .medium,
        isOverdue: Bool = false,
        isToday: Bool = false
    ) {
        self.id = id
        self.cardId = cardId
        self.title = title
        self.dueDate = dueDate
        self.column = column
        self.priority = priority
        self.isOverdue = isOverdue
        self.isToday = isToday
    }
}

// MARK: Reports Domain Models

public struct ReportMetrics: Codable, Sendable, Hashable {
    public var effortByColumn: [String: Int]
    public var cardsByPriority: [String: Int]
    public var completionVelocity: Double
    public var cycleTimeDays: Double
    public var throughputPerWeek: Double

    public init(
        effortByColumn: [String: Int] = [:],
        cardsByPriority: [String: Int] = [:],
        completionVelocity: Double = 0.0,
        cycleTimeDays: Double = 0.0,
        throughputPerWeek: Double = 0.0
    ) {
        self.effortByColumn = effortByColumn
        self.cardsByPriority = cardsByPriority
        self.completionVelocity = completionVelocity
        self.cycleTimeDays = cycleTimeDays
        self.throughputPerWeek = throughputPerWeek
    }
}

// MARK: Timeline Checkpoints and Doctor Domain Models

public struct Checkpoint: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var timestamp: Date
    public var description: String
    public var author: String
    public var fileCount: Int

    public init(
        id: String,
        timestamp: Date = Date(),
        description: String,
        author: String = "operator",
        fileCount: Int = 1
    ) {
        self.id = id
        self.timestamp = timestamp
        self.description = description
        self.author = author
        self.fileCount = fileCount
    }
}

public struct DoctorIssue: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var severity: String
    public var description: String
    public var fixable: Bool
    public var fixed: Bool

    public init(
        id: String,
        severity: String,
        description: String,
        fixable: Bool = true,
        fixed: Bool = false
    ) {
        self.id = id
        self.severity = severity
        self.description = description
        self.fixable = fixable
        self.fixed = fixed
    }
}

// MARK: Sprint Detail Domain Model

public struct SprintDetail: Identifiable, Codable, Sendable, Hashable {
    public var id: String { name }
    public var name: String
    public var goal: String
    public var start: String?
    public var end: String?
    public var status: String
    public var cardIds: [String]
    public var totalEffort: Int
    public var completedEffort: Int

    public init(
        name: String,
        goal: String = "",
        start: String? = nil,
        end: String? = nil,
        status: String = "active",
        cardIds: [String] = [],
        totalEffort: Int = 0,
        completedEffort: Int = 0
    ) {
        self.name = name
        self.goal = goal
        self.start = start
        self.end = end
        self.status = status
        self.cardIds = cardIds
        self.totalEffort = totalEffort
        self.completedEffort = completedEffort
    }
}
