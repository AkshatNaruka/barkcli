import Foundation

public struct GitTrailer: Identifiable, Codable, Sendable, Hashable {
    public var id: String { "\(key):\(value)" }
    public var key: String
    public var value: String

    public init(key: String, value: String) {
        self.key = key
        self.value = value
    }

    public init(from decoder: Decoder) throws {
        if var unkeyed = try? decoder.unkeyedContainer() {
            let k = try unkeyed.decode(String.self)
            let v = try unkeyed.decode(String.self)
            self.key = k
            self.value = v
        } else {
            let container = try decoder.container(keyedBy: DynamicCodingKey.self)
            self.key = try container.decode(String.self, forKey: DynamicCodingKey(stringValue: "key")!)
            self.value = try container.decode(String.self, forKey: DynamicCodingKey(stringValue: "value")!)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var unkeyed = encoder.unkeyedContainer()
        try unkeyed.encode(key)
        try unkeyed.encode(value)
    }
}

private struct DynamicCodingKey: CodingKey {
    var stringValue: String
    var intValue: Int?

    init?(stringValue: String) {
        self.stringValue = stringValue
        self.intValue = nil
    }

    init?(intValue: Int) {
        self.stringValue = "\(intValue)"
        self.intValue = intValue
    }
}

public struct GitCommit: Identifiable, Codable, Sendable, Hashable {
    public var id: String { sha }
    public var sha: String
    public var parents: [String]
    public var subject: String
    public var body: String
    public var author: String
    public var authorEmail: String
    public var date: Date?
    public var trailers: [GitTrailer]
    public var isMerge: Bool
    public var isEmpty: Bool
    public var filesChanged: [String]
    public var additions: UInt64
    public var deletions: UInt64
    public var patchId: String?

    public var shortSha: String {
        String(sha.prefix(7))
    }

    enum CodingKeys: String, CodingKey {
        case sha
        case parents
        case subject
        case body
        case author
        case authorEmail = "author_email"
        case date
        case trailers
        case isMerge = "is_merge"
        case isEmpty = "is_empty"
        case filesChanged = "files_changed"
        case additions
        case deletions
        case patchId = "patch_id"
    }

    public init(
        sha: String,
        parents: [String] = [],
        subject: String,
        body: String = "",
        author: String,
        authorEmail: String = "",
        date: Date? = Date(),
        trailers: [GitTrailer] = [],
        isMerge: Bool = false,
        isEmpty: Bool = false,
        filesChanged: [String] = [],
        additions: UInt64 = 0,
        deletions: UInt64 = 0,
        patchId: String? = nil
    ) {
        self.sha = sha
        self.parents = parents
        self.subject = subject
        self.body = body
        self.author = author
        self.authorEmail = authorEmail
        self.date = date
        self.trailers = trailers
        self.isMerge = isMerge
        self.isEmpty = isEmpty
        self.filesChanged = filesChanged
        self.additions = additions
        self.deletions = deletions
        self.patchId = patchId
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.sha = try container.decode(String.self, forKey: .sha)
        self.parents = try container.decodeIfPresent([String].self, forKey: .parents) ?? []
        self.subject = try container.decodeIfPresent(String.self, forKey: .subject) ?? ""
        self.body = try container.decodeIfPresent(String.self, forKey: .body) ?? ""
        self.author = try container.decodeIfPresent(String.self, forKey: .author) ?? ""
        self.authorEmail = try container.decodeIfPresent(String.self, forKey: .authorEmail) ?? ""

        if let direct = try? container.decode(Date.self, forKey: .date) {
            self.date = direct
        } else if let str = try? container.decode(String.self, forKey: .date),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.date = parsed
        } else {
            self.date = nil
        }

        self.trailers = try container.decodeIfPresent([GitTrailer].self, forKey: .trailers) ?? []
        self.isMerge = try container.decodeIfPresent(Bool.self, forKey: .isMerge) ?? false
        self.isEmpty = try container.decodeIfPresent(Bool.self, forKey: .isEmpty) ?? false
        self.filesChanged = try container.decodeIfPresent([String].self, forKey: .filesChanged) ?? []
        self.additions = try container.decodeIfPresent(UInt64.self, forKey: .additions) ?? 0
        self.deletions = try container.decodeIfPresent(UInt64.self, forKey: .deletions) ?? 0
        self.patchId = try container.decodeIfPresent(String.self, forKey: .patchId)
    }
}

public enum BundleKind: String, Codable, Sendable, Hashable, CaseIterable {
    case feat = "feat"
    case fix = "fix"
    case refactor = "refactor"
    case docs = "docs"
    case chore = "chore"
    case test = "test"
    case mixed = "mixed"

    public var displayName: String {
        switch self {
        case .feat:
            return "Feature"
        case .fix:
            return "Fix"
        case .refactor:
            return "Refactor"
        case .docs:
            return "Docs"
        case .chore:
            return "Chore"
        case .test:
            return "Test"
        case .mixed:
            return "Mixed"
        }
    }
}

public enum BundleStatus: String, Codable, Sendable, Hashable, CaseIterable {
    case open = "open"
    case sealed = "sealed"

    public var displayName: String {
        switch self {
        case .open:
            return "Open"
        case .sealed:
            return "Sealed"
        }
    }
}

public enum BundleSource: String, Codable, Sendable, Hashable, CaseIterable {
    case heuristic = "heuristic"
    case llm = "llm"
    case human = "human"

    public var displayName: String {
        switch self {
        case .heuristic:
            return "Heuristic"
        case .llm:
            return "LLM"
        case .human:
            return "Human"
        }
    }
}

public struct BundleCommitRef: Identifiable, Codable, Sendable, Hashable {
    public var id: String { sha }
    public var sha: String
    public var patchId: String?
    public var subject: String
    public var author: String
    public var date: Date?

    enum CodingKeys: String, CodingKey {
        case sha
        case patchId = "patch_id"
        case subject
        case author
        case date
    }

    public init(
        sha: String,
        patchId: String? = nil,
        subject: String,
        author: String,
        date: Date? = nil
    ) {
        self.sha = sha
        self.patchId = patchId
        self.subject = subject
        self.author = author
        self.date = date
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.sha = try container.decode(String.self, forKey: .sha)
        self.patchId = try container.decodeIfPresent(String.self, forKey: .patchId)
        self.subject = try container.decodeIfPresent(String.self, forKey: .subject) ?? ""
        self.author = try container.decodeIfPresent(String.self, forKey: .author) ?? ""

        if let direct = try? container.decode(Date.self, forKey: .date) {
            self.date = direct
        } else if let str = try? container.decode(String.self, forKey: .date),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.date = parsed
        } else {
            self.date = nil
        }
    }
}

public struct BundleStats: Codable, Sendable, Hashable {
    public var commits: Int
    public var additions: UInt64
    public var deletions: UInt64

    public init(commits: Int = 0, additions: UInt64 = 0, deletions: UInt64 = 0) {
        self.commits = commits
        self.additions = additions
        self.deletions = deletions
    }
}

public struct GitBundle: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var title: String
    public var summary: String
    public var kind: BundleKind
    public var status: BundleStatus
    public var parentId: String?
    public var cardId: String?
    public var specId: String?
    public var branch: String
    public var commits: [BundleCommitRef]
    public var filesTouched: [String]
    public var stats: BundleStats
    public var confidence: Double
    public var createdAt: Date?
    public var sealedAt: Date?
    public var source: BundleSource

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case summary
        case kind
        case status
        case parentId = "parent_id"
        case cardId = "card_id"
        case specId = "spec_id"
        case branch
        case commits
        case filesTouched = "files_touched"
        case stats
        case confidence
        case createdAt = "created_at"
        case sealedAt = "sealed_at"
        case source
    }

    public init(
        id: String,
        title: String,
        summary: String = "",
        kind: BundleKind = .mixed,
        status: BundleStatus = .open,
        parentId: String? = nil,
        cardId: String? = nil,
        specId: String? = nil,
        branch: String = "main",
        commits: [BundleCommitRef] = [],
        filesTouched: [String] = [],
        stats: BundleStats = BundleStats(),
        confidence: Double = 1.0,
        createdAt: Date? = Date(),
        sealedAt: Date? = nil,
        source: BundleSource = .heuristic
    ) {
        self.id = id
        self.title = title
        self.summary = summary
        self.kind = kind
        self.status = status
        self.parentId = parentId
        self.cardId = cardId
        self.specId = specId
        self.branch = branch
        self.commits = commits
        self.filesTouched = filesTouched
        self.stats = stats
        self.confidence = confidence
        self.createdAt = createdAt
        self.sealedAt = sealedAt
        self.source = source
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.title = try container.decode(String.self, forKey: .title)
        self.summary = try container.decodeIfPresent(String.self, forKey: .summary) ?? ""
        self.kind = (try? container.decode(BundleKind.self, forKey: .kind)) ?? .mixed
        self.status = (try? container.decode(BundleStatus.self, forKey: .status)) ?? .open
        self.parentId = try container.decodeIfPresent(String.self, forKey: .parentId)
        self.cardId = try container.decodeIfPresent(String.self, forKey: .cardId)
        self.specId = try container.decodeIfPresent(String.self, forKey: .specId)
        self.branch = try container.decodeIfPresent(String.self, forKey: .branch) ?? ""
        self.commits = try container.decodeIfPresent([BundleCommitRef].self, forKey: .commits) ?? []
        self.filesTouched = try container.decodeIfPresent([String].self, forKey: .filesTouched) ?? []
        self.stats = try container.decodeIfPresent(BundleStats.self, forKey: .stats) ?? BundleStats()
        self.confidence = try container.decodeIfPresent(Double.self, forKey: .confidence) ?? 1.0

        if let direct = try? container.decode(Date.self, forKey: .createdAt) {
            self.createdAt = direct
        } else if let str = try? container.decode(String.self, forKey: .createdAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.createdAt = parsed
        } else {
            self.createdAt = nil
        }

        if let direct = try? container.decode(Date.self, forKey: .sealedAt) {
            self.sealedAt = direct
        } else if let str = try? container.decode(String.self, forKey: .sealedAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.sealedAt = parsed
        } else {
            self.sealedAt = nil
        }

        self.source = (try? container.decode(BundleSource.self, forKey: .source)) ?? .heuristic
    }
}

public enum DiffFileStatus: String, Codable, Sendable, Hashable, CaseIterable {
    case modified = "modified"
    case added = "added"
    case deleted = "deleted"
    case renamed = "renamed"
    case untracked = "untracked"

    public var displayName: String {
        switch self {
        case .modified:
            return "Modified"
        case .added:
            return "Added"
        case .deleted:
            return "Deleted"
        case .renamed:
            return "Renamed"
        case .untracked:
            return "Untracked"
        }
    }
}

public struct GitDiffFile: Identifiable, Codable, Sendable, Hashable {
    public var id: String { path }
    public var path: String
    public var oldPath: String?
    public var status: DiffFileStatus
    public var additions: Int
    public var deletions: Int
    public var patch: String?
    public var binary: Bool

    enum CodingKeys: String, CodingKey {
        case path
        case oldPath = "old_path"
        case status
        case additions
        case deletions
        case patch
        case binary
    }

    public init(
        path: String,
        oldPath: String? = nil,
        status: DiffFileStatus = .modified,
        additions: Int = 0,
        deletions: Int = 0,
        patch: String? = nil,
        binary: Bool = false
    ) {
        self.path = path
        self.oldPath = oldPath
        self.status = status
        self.additions = additions
        self.deletions = deletions
        self.patch = patch
        self.binary = binary
    }
}

public typealias CommitBundle = GitBundle
public typealias FileDiff = GitDiffFile
public typealias GitDiff = GitDiffResponse

