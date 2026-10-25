import Foundation

public enum RequirementStatus: String, Codable, Sendable, Hashable, CaseIterable, Identifiable {
    case pending = "pending"
    case inProgress = "in-progress"
    case implemented = "implemented"
    case verified = "verified"
    case failed = "failed"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .pending:
            return "Pending"
        case .inProgress:
            return "In Progress"
        case .implemented:
            return "Implemented"
        case .verified:
            return "Verified"
        case .failed:
            return "Failed"
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self).lowercased()
        switch raw {
        case "pending":
            self = .pending
        case "inprogress", "in_progress", "in-progress":
            self = .inProgress
        case "implemented":
            self = .implemented
        case "verified":
            self = .verified
        case "failed":
            self = .failed
        default:
            self = .pending
        }
    }
}

public struct SpecRequirement: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var title: String
    public var description: String?
    public var status: RequirementStatus
    public var acceptanceCriteria: [String]
    public var linkedCode: [String]
    public var linkedTests: [String]
    public var linkedTasks: [String]
    public var stale: Bool
    public var staleReason: String?
    public var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case description
        case status
        case acceptanceCriteria = "acceptance_criteria"
        case linkedCode = "linked_code"
        case linkedTests = "linked_tests"
        case linkedTasks = "linked_tasks"
        case stale
        case staleReason = "stale_reason"
        case updatedAt = "updated_at"
    }

    public init(
        id: String,
        title: String,
        description: String? = nil,
        status: RequirementStatus = .pending,
        acceptanceCriteria: [String] = [],
        linkedCode: [String] = [],
        linkedTests: [String] = [],
        linkedTasks: [String] = [],
        stale: Bool = false,
        staleReason: String? = nil,
        updatedAt: Date? = Date()
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.status = status
        self.acceptanceCriteria = acceptanceCriteria
        self.linkedCode = linkedCode
        self.linkedTests = linkedTests
        self.linkedTasks = linkedTasks
        self.stale = stale
        self.staleReason = staleReason
        self.updatedAt = updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.title = try container.decode(String.self, forKey: .title)
        self.description = try container.decodeIfPresent(String.self, forKey: .description)
        self.status = (try? container.decode(RequirementStatus.self, forKey: .status)) ?? .pending
        self.acceptanceCriteria = try container.decodeIfPresent([String].self, forKey: .acceptanceCriteria) ?? []
        self.linkedCode = try container.decodeIfPresent([String].self, forKey: .linkedCode) ?? []
        self.linkedTests = try container.decodeIfPresent([String].self, forKey: .linkedTests) ?? []
        self.linkedTasks = try container.decodeIfPresent([String].self, forKey: .linkedTasks) ?? []
        self.stale = try container.decodeIfPresent(Bool.self, forKey: .stale) ?? false
        self.staleReason = try container.decodeIfPresent(String.self, forKey: .staleReason)

        if let direct = try? container.decode(Date.self, forKey: .updatedAt) {
            self.updatedAt = direct
        } else if let str = try? container.decode(String.self, forKey: .updatedAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.updatedAt = parsed
        } else {
            self.updatedAt = nil
        }
    }
}

public enum SpecStatus: String, Codable, Sendable, Hashable, CaseIterable, Identifiable {
    case draft = "draft"
    case inProgress = "in-progress"
    case implemented = "implemented"
    case verified = "verified"
    case deprecated = "deprecated"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .draft:
            return "Draft"
        case .inProgress:
            return "In Progress"
        case .implemented:
            return "Implemented"
        case .verified:
            return "Verified"
        case .deprecated:
            return "Deprecated"
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self).lowercased()
        switch raw {
        case "draft":
            self = .draft
        case "inprogress", "in_progress", "in-progress":
            self = .inProgress
        case "implemented":
            self = .implemented
        case "verified":
            self = .verified
        case "deprecated":
            self = .deprecated
        default:
            self = .draft
        }
    }
}

public struct Spec: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var title: String
    public var description: String?
    public var status: SpecStatus
    public var priority: String
    public var requirements: [SpecRequirement]
    public var tags: [String]
    public var createdAt: Date?
    public var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case description
        case status
        case priority
        case requirements
        case tags
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(
        id: String,
        title: String,
        description: String? = nil,
        status: SpecStatus = .draft,
        priority: String = "medium",
        requirements: [SpecRequirement] = [],
        tags: [String] = [],
        createdAt: Date? = Date(),
        updatedAt: Date? = Date()
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.status = status
        self.priority = priority
        self.requirements = requirements
        self.tags = tags
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.title = try container.decode(String.self, forKey: .title)
        self.description = try container.decodeIfPresent(String.self, forKey: .description)
        self.status = (try? container.decode(SpecStatus.self, forKey: .status)) ?? .draft
        self.priority = try container.decodeIfPresent(String.self, forKey: .priority) ?? "medium"
        self.requirements = try container.decodeIfPresent([SpecRequirement].self, forKey: .requirements) ?? []
        self.tags = try container.decodeIfPresent([String].self, forKey: .tags) ?? []

        if let direct = try? container.decode(Date.self, forKey: .createdAt) {
            self.createdAt = direct
        } else if let str = try? container.decode(String.self, forKey: .createdAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.createdAt = parsed
        } else {
            self.createdAt = nil
        }

        if let direct = try? container.decode(Date.self, forKey: .updatedAt) {
            self.updatedAt = direct
        } else if let str = try? container.decode(String.self, forKey: .updatedAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.updatedAt = parsed
        } else {
            self.updatedAt = nil
        }
    }
}

public struct SpecCoverage: Codable, Sendable, Hashable {
    public var totalRequirements: Int
    public var implemented: Int
    public var verified: Int
    public var stale: Int
    public var coveragePercent: Double

    enum CodingKeys: String, CodingKey {
        case totalRequirements = "total_requirements"
        case implemented
        case verified
        case stale
        case coveragePercent = "coverage_percent"
    }

    public init(
        totalRequirements: Int = 0,
        implemented: Int = 0,
        verified: Int = 0,
        stale: Int = 0,
        coveragePercent: Double = 0.0
    ) {
        self.totalRequirements = totalRequirements
        self.implemented = implemented
        self.verified = verified
        self.stale = stale
        self.coveragePercent = coveragePercent
    }
}

public typealias SpecItem = Spec
public typealias Requirement = SpecRequirement
public typealias ReqStatus = RequirementStatus
public typealias CoverageReport = SpecCoverage

