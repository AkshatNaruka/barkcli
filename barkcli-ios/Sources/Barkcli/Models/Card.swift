import Foundation

public enum LinkType: String, Codable, Sendable, Hashable, CaseIterable {
    case parent = "parent"
    case child = "child"
    case related = "related"
    case blockedBy = "blocked-by"

    public var displayName: String {
        switch self {
        case .parent:
            return "Parent"
        case .child:
            return "Child"
        case .related:
            return "Related"
        case .blockedBy:
            return "Blocked By"
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self).lowercased()
        switch raw {
        case "parent":
            self = .parent
        case "child":
            self = .child
        case "related", "relates", "relates-to":
            self = .related
        case "blocked-by", "blocked_by", "block":
            self = .blockedBy
        default:
            self = .related
        }
    }
}

public struct CardLink: Codable, Sendable, Hashable, Identifiable {
    public var id: String { "\(type.rawValue):\(target)" }
    public var type: LinkType
    public var target: String

    enum CodingKeys: String, CodingKey {
        case type = "ty"
        case target
    }

    public init(type: LinkType, target: String) {
        self.type = type
        self.target = target
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let directType = try? container.decode(LinkType.self, forKey: .type) {
            self.type = directType
        } else {
            self.type = .related
        }
        self.target = try container.decode(String.self, forKey: .target)
    }
}

public struct ChecklistItem: Identifiable, Codable, Sendable, Hashable {
    public var id: String { text }
    public var text: String
    public var done: Bool

    public init(text: String, done: Bool = false) {
        self.text = text
        self.done = done
    }
}

public struct CardComment: Identifiable, Codable, Sendable, Hashable {
    public var id: String { "\(author):\(at.timeIntervalSince1970)" }
    public var author: String
    public var text: String
    public var at: Date

    enum CodingKeys: String, CodingKey {
        case author
        case text
        case at
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
        if let directDate = try? container.decode(Date.self, forKey: .at) {
            self.at = directDate
        } else if let dateStr = try? container.decode(String.self, forKey: .at),
                  let parsed = ISO8601DateFormatter().date(from: dateStr) {
            self.at = parsed
        } else {
            self.at = Date()
        }
    }
}

public struct Card: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var title: String
    public var description: String?
    public var column: String
    public var priority: Priority
    public var labels: [String]
    public var assignee: String?
    public var checklist: [ChecklistItem]
    public var dueDate: String?
    public var remindAt: String?
    public var comments: [CardComment]
    public var blockedBy: String?
    public var attachments: [String]
    public var links: [CardLink]
    public var acceptanceCriteria: [String]
    public var effort: Effort?
    public var area: String?
    public var specId: String?
    public var pinned: Bool
    public var version: UInt64
    public var createdAt: Date?
    public var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case description
        case column
        case priority
        case labels
        case assignee
        case checklist
        case dueDate = "due_date"
        case remindAt = "remind_at"
        case comments
        case blockedBy = "blocked_by"
        case attachments
        case links
        case acceptanceCriteria = "acceptance_criteria"
        case effort
        case area
        case specId = "spec_id"
        case pinned
        case version
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(
        id: String,
        title: String,
        column: String = "todo",
        description: String? = nil,
        priority: Priority = .medium,
        labels: [String] = [],
        assignee: String? = nil,
        checklist: [ChecklistItem] = [],
        dueDate: String? = nil,
        remindAt: String? = nil,
        comments: [CardComment] = [],
        blockedBy: String? = nil,
        attachments: [String] = [],
        links: [CardLink] = [],
        acceptanceCriteria: [String] = [],
        effort: Effort? = nil,
        area: String? = nil,
        specId: String? = nil,
        pinned: Bool = false,
        version: UInt64 = 1,
        createdAt: Date? = Date(),
        updatedAt: Date? = Date()
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.column = column
        self.priority = priority
        self.labels = labels
        self.assignee = assignee
        self.checklist = checklist
        self.dueDate = dueDate
        self.remindAt = remindAt
        self.comments = comments
        self.blockedBy = blockedBy
        self.attachments = attachments
        self.links = links
        self.acceptanceCriteria = acceptanceCriteria
        self.effort = effort
        self.area = area
        self.specId = specId
        self.pinned = pinned
        self.version = version
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.title = try container.decode(String.self, forKey: .title)
        self.description = try container.decodeIfPresent(String.self, forKey: .description)
        self.column = try container.decodeIfPresent(String.self, forKey: .column) ?? "todo"

        if let prio = try? container.decode(Priority.self, forKey: .priority) {
            self.priority = prio
        } else if let prioStr = try? container.decode(String.self, forKey: .priority) {
            self.priority = Priority(rawValue: prioStr.lowercased()) ?? .medium
        } else {
            self.priority = .medium
        }

        self.labels = try container.decodeIfPresent([String].self, forKey: .labels) ?? []
        self.assignee = try container.decodeIfPresent(String.self, forKey: .assignee)
        self.checklist = try container.decodeIfPresent([ChecklistItem].self, forKey: .checklist) ?? []
        self.dueDate = try container.decodeIfPresent(String.self, forKey: .dueDate)
        self.remindAt = try container.decodeIfPresent(String.self, forKey: .remindAt)
        self.comments = try container.decodeIfPresent([CardComment].self, forKey: .comments) ?? []
        self.blockedBy = try container.decodeIfPresent(String.self, forKey: .blockedBy)
        self.attachments = try container.decodeIfPresent([String].self, forKey: .attachments) ?? []
        self.links = try container.decodeIfPresent([CardLink].self, forKey: .links) ?? []
        self.acceptanceCriteria = try container.decodeIfPresent([String].self, forKey: .acceptanceCriteria) ?? []

        if let eff = try? container.decode(Effort.self, forKey: .effort) {
            self.effort = eff
        } else if let effInt = try? container.decode(Int.self, forKey: .effort) {
            self.effort = Effort(effInt)
        } else {
            self.effort = nil
        }

        self.area = try container.decodeIfPresent(String.self, forKey: .area)
        self.specId = try container.decodeIfPresent(String.self, forKey: .specId)
        self.pinned = try container.decodeIfPresent(Bool.self, forKey: .pinned) ?? false
        self.version = try container.decodeIfPresent(UInt64.self, forKey: .version) ?? 1

        if let date = try? container.decode(Date.self, forKey: .createdAt) {
            self.createdAt = date
        } else if let dateStr = try? container.decode(String.self, forKey: .createdAt),
                  let parsed = ISO8601DateFormatter().date(from: dateStr) {
            self.createdAt = parsed
        } else {
            self.createdAt = nil
        }

        if let date = try? container.decode(Date.self, forKey: .updatedAt) {
            self.updatedAt = date
        } else if let dateStr = try? container.decode(String.self, forKey: .updatedAt),
                  let parsed = ISO8601DateFormatter().date(from: dateStr) {
            self.updatedAt = parsed
        } else {
            self.updatedAt = nil
        }
    }

    public mutating func addLink(type: LinkType, target: String) -> Bool {
        guard target != id else { return false }
        if links.contains(where: { $0.type == type && $0.target == target }) {
            return false
        }
        links.append(CardLink(type: type, target: target))
        return true
    }

    public mutating func removeLink(type: LinkType, target: String) -> Bool {
        let initialCount = links.count
        links.removeAll { $0.type == type && $0.target == target }
        return links.count != initialCount
    }
}
