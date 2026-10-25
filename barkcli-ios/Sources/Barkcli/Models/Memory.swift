import Foundation

public enum MemoryTier: String, Codable, Sendable, Hashable, CaseIterable, Identifiable {
    case working = "working"
    case shortTerm = "short_term"
    case longTerm = "long_term"
    case external = "external"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .working:
            return "Working"
        case .shortTerm:
            return "Short Term"
        case .longTerm:
            return "Long Term"
        case .external:
            return "External"
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self).lowercased()
        switch raw {
        case "working":
            self = .working
        case "short_term", "shortterm", "short-term":
            self = .shortTerm
        case "long_term", "longterm", "long-term":
            self = .longTerm
        case "external":
            self = .external
        default:
            self = .working
        }
    }
}

public struct MemoryEntry: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var content: String
    public var tier: MemoryTier
    public var tags: [String]
    public var source: String?
    public var createdAt: Date?
    public var lastAccessed: Date?
    public var accessCount: UInt32
    public var importance: Float

    enum CodingKeys: String, CodingKey {
        case id
        case content
        case tier
        case tags
        case source
        case createdAt = "created_at"
        case lastAccessed = "last_accessed"
        case accessCount = "access_count"
        case importance
    }

    public init(
        id: String,
        content: String,
        tier: MemoryTier = .working,
        tags: [String] = [],
        source: String? = nil,
        createdAt: Date? = Date(),
        lastAccessed: Date? = Date(),
        accessCount: UInt32 = 0,
        importance: Float = 0.5
    ) {
        self.id = id
        self.content = content
        self.tier = tier
        self.tags = tags
        self.source = source
        self.createdAt = createdAt
        self.lastAccessed = lastAccessed
        self.accessCount = accessCount
        self.importance = importance
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.content = try container.decode(String.self, forKey: .content)
        self.tier = (try? container.decode(MemoryTier.self, forKey: .tier)) ?? .working
        self.tags = try container.decodeIfPresent([String].self, forKey: .tags) ?? []
        self.source = try container.decodeIfPresent(String.self, forKey: .source)

        if let direct = try? container.decode(Date.self, forKey: .createdAt) {
            self.createdAt = direct
        } else if let str = try? container.decode(String.self, forKey: .createdAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.createdAt = parsed
        } else {
            self.createdAt = nil
        }

        if let direct = try? container.decode(Date.self, forKey: .lastAccessed) {
            self.lastAccessed = direct
        } else if let str = try? container.decode(String.self, forKey: .lastAccessed),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.lastAccessed = parsed
        } else {
            self.lastAccessed = nil
        }

        self.accessCount = try container.decodeIfPresent(UInt32.self, forKey: .accessCount) ?? 0
        self.importance = try container.decodeIfPresent(Float.self, forKey: .importance) ?? 0.5
    }
}

public struct ProjectFact: Identifiable, Codable, Sendable, Hashable {
    public var id: String { fact }
    public var fact: String
    public var category: String
    public var confidence: Float
    public var sources: [String]
    public var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case fact
        case category
        case confidence
        case sources
        case createdAt = "created_at"
    }

    public init(
        fact: String,
        category: String = "convention",
        confidence: Float = 1.0,
        sources: [String] = [],
        createdAt: Date? = Date()
    ) {
        self.fact = fact
        self.category = category
        self.confidence = confidence
        self.sources = sources
        self.createdAt = createdAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.fact = try container.decode(String.self, forKey: .fact)
        self.category = try container.decodeIfPresent(String.self, forKey: .category) ?? "convention"
        self.confidence = try container.decodeIfPresent(Float.self, forKey: .confidence) ?? 1.0
        self.sources = try container.decodeIfPresent([String].self, forKey: .sources) ?? []

        if let direct = try? container.decode(Date.self, forKey: .createdAt) {
            self.createdAt = direct
        } else if let str = try? container.decode(String.self, forKey: .createdAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.createdAt = parsed
        } else {
            self.createdAt = nil
        }
    }
}

public struct MemoryStats: Codable, Sendable, Hashable {
    public var totalEntries: Int
    public var byTier: [String: Int]
    public var totalFacts: Int

    enum CodingKeys: String, CodingKey {
        case totalEntries = "total_entries"
        case byTier = "by_tier"
        case totalFacts = "total_facts"
    }

    public init(totalEntries: Int = 0, byTier: [String: Int] = [:], totalFacts: Int = 0) {
        self.totalEntries = totalEntries
        self.byTier = byTier
        self.totalFacts = totalFacts
    }
}
