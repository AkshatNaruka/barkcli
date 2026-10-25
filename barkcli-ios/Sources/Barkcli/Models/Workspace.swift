import Foundation

public struct WorkspaceConfig: Codable, Sendable, Hashable {
    public var defaultBoard: String?
    public var columns: [String]
    public var labels: [String]
    public var priorities: [String]

    enum CodingKeys: String, CodingKey {
        case defaultBoard = "default_board"
        case columns
        case labels
        case priorities
    }

    public init(
        defaultBoard: String? = "dev",
        columns: [String] = ["todo", "doing", "review", "done"],
        labels: [String] = ["bug", "feature", "urgent"],
        priorities: [String] = ["low", "medium", "high", "critical"]
    ) {
        self.defaultBoard = defaultBoard
        self.columns = columns
        self.labels = labels
        self.priorities = priorities
    }
}

public enum ConnectionState: Sendable, Hashable {
    case connected(latencyMs: Int)
    case connecting
    case disconnected(reason: String)
    case demoMode

    public var isConnected: Bool {
        if case .connected = self { return true }
        return false
    }

    public var isDemo: Bool {
        if case .demoMode = self { return true }
        return false
    }
}

public struct HealthStatus: Codable, Sendable, Hashable {
    public var status: String
    public var port: Int
    public var version: String?
    public var uptimeSeconds: UInt64?

    enum CodingKeys: String, CodingKey {
        case status
        case port
        case version
        case uptimeSeconds = "uptime_seconds"
    }

    public init(status: String = "ok", port: Int = 4321, version: String? = nil, uptimeSeconds: UInt64? = nil) {
        self.status = status
        self.port = port
        self.version = version
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct AutoInitResult: Codable, Sendable, Hashable {
    public var created: Bool
    public var boardPath: String?
    public var message: String

    enum CodingKeys: String, CodingKey {
        case created
        case boardPath = "board_path"
        case message
    }

    public init(created: Bool, boardPath: String? = nil, message: String) {
        self.created = created
        self.boardPath = boardPath
        self.message = message
    }
}

public struct WorkspaceInfo: Identifiable, Codable, Sendable, Hashable {
    public var id: String { name }
    public var name: String
    public var host: String
    public var port: Int
    public var isRemote: Bool
    public var lastSeen: Date?

    enum CodingKeys: String, CodingKey {
        case name
        case host
        case port
        case isRemote = "is_remote"
        case lastSeen = "last_seen"
    }

    public init(
        name: String,
        host: String = "127.0.0.1",
        port: Int = 4321,
        isRemote: Bool = false,
        lastSeen: Date? = Date()
    ) {
        self.name = name
        self.host = host
        self.port = port
        self.isRemote = isRemote
        self.lastSeen = lastSeen
    }
}

public enum NetworkInterfaceType: String, Codable, Sendable, Hashable {
    case wifi = "wifi"
    case cellular = "cellular"
    case wiredEthernet = "ethernet"
    case loopback = "loopback"
    case other = "other"
    case offline = "offline"

    public var displayName: String {
        switch self {
        case .wifi: return "Wi-Fi"
        case .cellular: return "Cellular"
        case .wiredEthernet: return "Ethernet"
        case .loopback: return "Loopback"
        case .other: return "Other"
        case .offline: return "Offline"
        }
    }
}

public struct DiscoveredInstance: Identifiable, Codable, Sendable, Hashable {
    public var id: String { "\(host):\(port)" }
    public var name: String
    public var host: String
    public var port: Int
    public var latencyMs: Int?
    public var isLocal: Bool
    public var version: String?
    public var hasMetadata: Bool

    enum CodingKeys: String, CodingKey {
        case name, host, port
        case latencyMs = "latency_ms"
        case isLocal = "is_local"
        case version
        case hasMetadata = "has_metadata"
    }

    public init(
        name: String,
        host: String,
        port: Int = 4321,
        latencyMs: Int? = nil,
        isLocal: Bool = true,
        version: String? = "0.8.0",
        hasMetadata: Bool = true
    ) {
        self.name = name
        self.host = host
        self.port = port
        self.latencyMs = latencyMs
        self.isLocal = isLocal
        self.version = version
        self.hasMetadata = hasMetadata
    }

    public var endpointURL: URL? {
        URL(string: "http://\(host):\(port)")
    }
}

public struct AutoInitOptions: Codable, Sendable, Hashable {
    public var boardName: String
    public var columns: [String]
    public var createSampleCard: Bool

    public init(
        boardName: String = "dev",
        columns: [String] = ["todo", "doing", "review", "done"],
        createSampleCard: Bool = true
    ) {
        self.boardName = boardName
        self.columns = columns
        self.createSampleCard = createSampleCard
    }
}

