import Foundation

public typealias LiveRunnerSession = LiveSession

private struct AutopilotCodingKey: CodingKey {
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

public enum AutopilotPhase: Codable, Sendable, Hashable {
    case idle
    case needsPlan(cardId: String)
    case awaitingPlanApproval(cardId: String)
    case inProgress(active: Int, pending: Int)
    case awaitingMerge(cardIds: [String])
    case running
    case other(String)

    public var displayName: String {
        switch self {
        case .idle:
            return "Idle"
        case .needsPlan(let cardId):
            return "Needs Plan: \(cardId)"
        case .awaitingPlanApproval(let cardId):
            return "Awaiting Plan Approval: \(cardId)"
        case .inProgress(let active, let pending):
            return "In Progress (\(active) active, \(pending) pending)"
        case .awaitingMerge(let cardIds):
            return "Awaiting Merge (\(cardIds.count) cards)"
        case .running:
            return "Running"
        case .other(let name):
            return name
        }
    }

    public init(from decoder: Decoder) throws {
        if let container = try? decoder.singleValueContainer(), let str = try? container.decode(String.self) {
            switch str.lowercased() {
            case "idle": self = .idle
            case "running": self = .running
            default: self = .other(str)
            }
            return
        }

        let container = try decoder.container(keyedBy: AutopilotCodingKey.self)
        if container.contains(AutopilotCodingKey(stringValue: "NeedsPlan")!) {
            let nested = try container.nestedContainer(keyedBy: AutopilotCodingKey.self, forKey: AutopilotCodingKey(stringValue: "NeedsPlan")!)
            let cardId = try nested.decode(String.self, forKey: AutopilotCodingKey(stringValue: "card_id")!)
            self = .needsPlan(cardId: cardId)
        } else if container.contains(AutopilotCodingKey(stringValue: "AwaitingPlanApproval")!) {
            let nested = try container.nestedContainer(keyedBy: AutopilotCodingKey.self, forKey: AutopilotCodingKey(stringValue: "AwaitingPlanApproval")!)
            let cardId = try nested.decode(String.self, forKey: AutopilotCodingKey(stringValue: "card_id")!)
            self = .awaitingPlanApproval(cardId: cardId)
        } else if container.contains(AutopilotCodingKey(stringValue: "InProgress")!) {
            let nested = try container.nestedContainer(keyedBy: AutopilotCodingKey.self, forKey: AutopilotCodingKey(stringValue: "InProgress")!)
            let active = try nested.decode(Int.self, forKey: AutopilotCodingKey(stringValue: "active")!)
            let pending = try nested.decode(Int.self, forKey: AutopilotCodingKey(stringValue: "pending")!)
            self = .inProgress(active: active, pending: pending)
        } else if container.contains(AutopilotCodingKey(stringValue: "AwaitingMerge")!) {
            let nested = try container.nestedContainer(keyedBy: AutopilotCodingKey.self, forKey: AutopilotCodingKey(stringValue: "AwaitingMerge")!)
            let cardIds = try nested.decode([String].self, forKey: AutopilotCodingKey(stringValue: "card_ids")!)
            self = .awaitingMerge(cardIds: cardIds)
        } else {
            self = .idle
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .idle:
            var container = encoder.singleValueContainer()
            try container.encode("Idle")
        case .running:
            var container = encoder.singleValueContainer()
            try container.encode("Running")
        case .other(let val):
            var container = encoder.singleValueContainer()
            try container.encode(val)
        case .needsPlan(let cardId):
            var container = encoder.container(keyedBy: AutopilotCodingKey.self)
            var nested = container.nestedContainer(keyedBy: AutopilotCodingKey.self, forKey: AutopilotCodingKey(stringValue: "NeedsPlan")!)
            try nested.encode(cardId, forKey: AutopilotCodingKey(stringValue: "card_id")!)
        case .awaitingPlanApproval(let cardId):
            var container = encoder.container(keyedBy: AutopilotCodingKey.self)
            var nested = container.nestedContainer(keyedBy: AutopilotCodingKey.self, forKey: AutopilotCodingKey(stringValue: "AwaitingPlanApproval")!)
            try nested.encode(cardId, forKey: AutopilotCodingKey(stringValue: "card_id")!)
        case .inProgress(let active, let pending):
            var container = encoder.container(keyedBy: AutopilotCodingKey.self)
            var nested = container.nestedContainer(keyedBy: AutopilotCodingKey.self, forKey: AutopilotCodingKey(stringValue: "InProgress")!)
            try nested.encode(active, forKey: AutopilotCodingKey(stringValue: "active")!)
            try nested.encode(pending, forKey: AutopilotCodingKey(stringValue: "pending")!)
        case .awaitingMerge(let cardIds):
            var container = encoder.container(keyedBy: AutopilotCodingKey.self)
            var nested = container.nestedContainer(keyedBy: AutopilotCodingKey.self, forKey: AutopilotCodingKey(stringValue: "AwaitingMerge")!)
            try nested.encode(cardIds, forKey: AutopilotCodingKey(stringValue: "card_ids")!)
        }
    }
}

public struct StatusCounts: Codable, Sendable, Hashable {
    public var todoUnplanned: Int
    public var pendingProposals: Int
    public var queuePending: Int
    public var queueActive: Int
    public var inReview: Int
    public var blocked: Int

    enum CodingKeys: String, CodingKey {
        case todoUnplanned = "todo_unplanned"
        case pendingProposals = "pending_proposals"
        case queuePending = "queue_pending"
        case queueActive = "queue_active"
        case inReview = "in_review"
        case blocked
    }

    public init(
        todoUnplanned: Int = 0,
        pendingProposals: Int = 0,
        queuePending: Int = 0,
        queueActive: Int = 0,
        inReview: Int = 0,
        blocked: Int = 0
    ) {
        self.todoUnplanned = todoUnplanned
        self.pendingProposals = pendingProposals
        self.queuePending = queuePending
        self.queueActive = queueActive
        self.inReview = inReview
        self.blocked = blocked
    }
}

public struct AutopilotStatus: Codable, Sendable, Hashable {
    public var board: String
    public var phase: AutopilotPhase
    public var phaseLabel: String
    public var needsHuman: Bool
    public var humanPrompt: String?
    public var agentAction: String?
    public var counts: StatusCounts
    public var proposal: PlanProposal?

    enum CodingKeys: String, CodingKey {
        case board
        case phase
        case phaseLabel = "phase_label"
        case needsHuman = "needs_human"
        case humanPrompt = "human_prompt"
        case agentAction = "agent_action"
        case counts
        case proposal
    }

    public init(
        board: String = "dev",
        phase: AutopilotPhase = .idle,
        phaseLabel: String = "Idle",
        needsHuman: Bool = false,
        humanPrompt: String? = nil,
        agentAction: String? = nil,
        counts: StatusCounts = StatusCounts(),
        proposal: PlanProposal? = nil
    ) {
        self.board = board
        self.phase = phase
        self.phaseLabel = phaseLabel
        self.needsHuman = needsHuman
        self.humanPrompt = humanPrompt
        self.agentAction = agentAction
        self.counts = counts
        self.proposal = proposal
    }
}

public typealias ProposedSlice = PlanChildCard

public struct IntentResponse: Codable, Sendable, Hashable {
    public var cardId: String
    public var title: String
    public var board: String
    public var status: String

    enum CodingKeys: String, CodingKey {
        case cardId = "card_id"
        case title
        case board
        case status
    }

    public init(cardId: String, title: String, board: String, status: String = "created") {
        self.cardId = cardId
        self.title = title
        self.board = board
        self.status = status
    }
}


public struct PlanRequirement: Identifiable, Codable, Sendable, Hashable {
    public var id: String { title }
    public var title: String
    public var acceptanceCriteria: [String]
    public var effort: Int

    enum CodingKeys: String, CodingKey {
        case title
        case acceptanceCriteria = "acceptance_criteria"
        case effort
    }

    public init(title: String, acceptanceCriteria: [String] = [], effort: Int = 1) {
        self.title = title
        self.acceptanceCriteria = acceptanceCriteria
        self.effort = effort
    }
}

public struct PlanChildCard: Identifiable, Codable, Sendable, Hashable {
    public var id: String { title }
    public var title: String
    public var description: String
    public var priority: Priority
    public var effort: Int
    public var labels: [String]
    public var acceptanceCriteria: [String]

    enum CodingKeys: String, CodingKey {
        case title
        case description
        case priority
        case effort
        case labels
        case acceptanceCriteria = "acceptance_criteria"
    }

    public init(
        title: String,
        description: String = "",
        priority: Priority = .medium,
        effort: Int = 2,
        labels: [String] = [],
        acceptanceCriteria: [String] = []
    ) {
        self.title = title
        self.description = description
        self.priority = priority
        self.effort = effort
        self.labels = labels
        self.acceptanceCriteria = acceptanceCriteria
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.title = try container.decode(String.self, forKey: .title)
        self.description = try container.decodeIfPresent(String.self, forKey: .description) ?? ""
        if let prio = try? container.decode(Priority.self, forKey: .priority) {
            self.priority = prio
        } else if let str = try? container.decode(String.self, forKey: .priority) {
            self.priority = Priority(rawValue: str.lowercased()) ?? .medium
        } else {
            self.priority = .medium
        }
        self.effort = try container.decodeIfPresent(Int.self, forKey: .effort) ?? 1
        self.labels = try container.decodeIfPresent([String].self, forKey: .labels) ?? []
        self.acceptanceCriteria = try container.decodeIfPresent([String].self, forKey: .acceptanceCriteria) ?? []
    }
}

public struct PlanProposal: Identifiable, Codable, Sendable, Hashable {
    public var id: String { cardId }
    public var cardId: String
    public var cardTitle: String
    public var proposedAt: Date?
    public var proposedBy: String
    public var requirements: [PlanRequirement]
    public var children: [PlanChildCard]
    public var estimatedTotalEffort: Int
    public var riskLevel: String
    public var rationale: String

    enum CodingKeys: String, CodingKey {
        case cardId = "card_id"
        case cardTitle = "card_title"
        case proposedAt = "proposed_at"
        case proposedBy = "proposed_by"
        case requirements
        case children
        case estimatedTotalEffort = "estimated_total_effort"
        case riskLevel = "risk_level"
        case rationale
    }

    public init(
        cardId: String,
        cardTitle: String,
        proposedAt: Date? = Date(),
        proposedBy: String = "agent",
        requirements: [PlanRequirement] = [],
        children: [PlanChildCard] = [],
        estimatedTotalEffort: Int = 0,
        riskLevel: String = "low",
        rationale: String = ""
    ) {
        self.cardId = cardId
        self.cardTitle = cardTitle
        self.proposedAt = proposedAt
        self.proposedBy = proposedBy
        self.requirements = requirements
        self.children = children
        self.estimatedTotalEffort = estimatedTotalEffort
        self.riskLevel = riskLevel
        self.rationale = rationale
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.cardId = try container.decode(String.self, forKey: .cardId)
        self.cardTitle = try container.decodeIfPresent(String.self, forKey: .cardTitle) ?? ""

        if let direct = try? container.decode(Date.self, forKey: .proposedAt) {
            self.proposedAt = direct
        } else if let str = try? container.decode(String.self, forKey: .proposedAt),
                  let parsed = ISO8601DateFormatter().date(from: str) {
            self.proposedAt = parsed
        } else {
            self.proposedAt = nil
        }

        self.proposedBy = try container.decodeIfPresent(String.self, forKey: .proposedBy) ?? "agent"
        self.requirements = try container.decodeIfPresent([PlanRequirement].self, forKey: .requirements) ?? []
        self.children = try container.decodeIfPresent([PlanChildCard].self, forKey: .children) ?? []
        self.estimatedTotalEffort = try container.decodeIfPresent(Int.self, forKey: .estimatedTotalEffort) ?? 0
        self.riskLevel = try container.decodeIfPresent(String.self, forKey: .riskLevel) ?? "low"
        self.rationale = try container.decodeIfPresent(String.self, forKey: .rationale) ?? ""
    }
}

public struct TestGateVerdict: Identifiable, Codable, Sendable, Hashable {
    public var id: String { "\(command):\(timestamp.timeIntervalSince1970)" }
    public var passed: Bool
    public var command: String
    public var output: String
    public var durationSeconds: Double
    public var timestamp: Date

    enum CodingKeys: String, CodingKey {
        case passed
        case command
        case output
        case durationSeconds = "duration_seconds"
        case timestamp
    }

    public init(
        passed: Bool,
        command: String = "cargo test",
        output: String = "",
        durationSeconds: Double = 0.0,
        timestamp: Date = Date()
    ) {
        self.passed = passed
        self.command = command
        self.output = output
        self.durationSeconds = durationSeconds
        self.timestamp = timestamp
    }
}

public struct OrchestrationCycleResult: Codable, Sendable, Hashable {
    public var cycleNumber: Int
    public var tasksCreated: Int
    public var tasksDispatched: Int
    public var tasksCompleted: Int
    public var tasksFailed: Int
    public var insights: [String]

    enum CodingKeys: String, CodingKey {
        case cycleNumber = "cycle_number"
        case tasksCreated = "tasks_created"
        case tasksDispatched = "tasks_dispatched"
        case tasksCompleted = "tasks_completed"
        case tasksFailed = "tasks_failed"
        case insights
    }

    public init(
        cycleNumber: Int = 1,
        tasksCreated: Int = 0,
        tasksDispatched: Int = 0,
        tasksCompleted: Int = 0,
        tasksFailed: Int = 0,
        insights: [String] = []
    ) {
        self.cycleNumber = cycleNumber
        self.tasksCreated = tasksCreated
        self.tasksDispatched = tasksDispatched
        self.tasksCompleted = tasksCompleted
        self.tasksFailed = tasksFailed
        self.insights = insights
    }
}

public struct OrchestrationStatus: Codable, Sendable, Hashable {
    public var status: String
    public var cycleCount: Int
    public var tasksDispatched: Int
    public var tasksCompleted: Int
    public var tasksFailed: Int

    enum CodingKeys: String, CodingKey {
        case status
        case cycleCount = "cycle_count"
        case tasksDispatched = "tasks_dispatched"
        case tasksCompleted = "tasks_completed"
        case tasksFailed = "tasks_failed"
    }

    public init(
        status: String = "idle",
        cycleCount: Int = 0,
        tasksDispatched: Int = 0,
        tasksCompleted: Int = 0,
        tasksFailed: Int = 0
    ) {
        self.status = status
        self.cycleCount = cycleCount
        self.tasksDispatched = tasksDispatched
        self.tasksCompleted = tasksCompleted
        self.tasksFailed = tasksFailed
    }
}

public struct WorkspaceStatus: Codable, Sendable, Hashable {
    public var initialized: Bool
    public var boardDirExists: Bool
    public var configFileExists: Bool
    public var boardsCount: Int
    public var message: String

    enum CodingKeys: String, CodingKey {
        case initialized
        case boardDirExists = "board_dir_exists"
        case configFileExists = "config_file_exists"
        case boardsCount = "boards_count"
        case message
    }

    public init(
        initialized: Bool = true,
        boardDirExists: Bool = true,
        configFileExists: Bool = true,
        boardsCount: Int = 1,
        message: String = "Workspace active"
    ) {
        self.initialized = initialized
        self.boardDirExists = boardDirExists
        self.configFileExists = configFileExists
        self.boardsCount = boardsCount
        self.message = message
    }
}

public struct GitCommitsResponse: Codable, Sendable, Hashable {
    public var branch: String
    public var branches: [String]
    public var commits: [GitCommit]

    public init(branch: String = "main", branches: [String] = ["main"], commits: [GitCommit] = []) {
        self.branch = branch
        self.branches = branches
        self.commits = commits
    }
}

public struct GitDiffResponse: Codable, Sendable, Hashable {
    public var sha: String
    public var message: String
    public var diff: String
    public var filesChanged: [String]
    public var additions: UInt64
    public var deletions: UInt64

    enum CodingKeys: String, CodingKey {
        case sha
        case message
        case diff
        case filesChanged = "files_changed"
        case additions
        case deletions
    }

    public init(
        sha: String,
        message: String = "",
        diff: String = "",
        filesChanged: [String] = [],
        additions: UInt64 = 0,
        deletions: UInt64 = 0
    ) {
        self.sha = sha
        self.message = message
        self.diff = diff
        self.filesChanged = filesChanged
        self.additions = additions
        self.deletions = deletions
    }
}

public struct AssignCommitRequest: Codable, Sendable, Hashable {
    public var boardName: String?
    public var commitSha: String?
    public var title: String
    public var description: String?
    public var column: String?
    public var priority: String?
    public var agentId: String?
    public var filesContext: [String]?
    public var acceptanceCriteria: [String]?

    enum CodingKeys: String, CodingKey {
        case boardName = "board_name"
        case commitSha = "commit_sha"
        case title
        case description
        case column
        case priority
        case agentId = "agent_id"
        case filesContext = "files_context"
        case acceptanceCriteria = "acceptance_criteria"
    }

    public init(
        boardName: String? = nil,
        commitSha: String? = nil,
        title: String,
        description: String? = nil,
        column: String? = nil,
        priority: String? = nil,
        agentId: String? = nil,
        filesContext: [String]? = nil,
        acceptanceCriteria: [String]? = nil
    ) {
        self.boardName = boardName
        self.commitSha = commitSha
        self.title = title
        self.description = description
        self.column = column
        self.priority = priority
        self.agentId = agentId
        self.filesContext = filesContext
        self.acceptanceCriteria = acceptanceCriteria
    }
}

public struct AssignCommitResponse: Codable, Sendable, Hashable {
    public var cardId: String
    public var taskId: String?
    public var boardName: String
    public var agentId: String?
    public var title: String
    public var status: String

    enum CodingKeys: String, CodingKey {
        case cardId = "card_id"
        case taskId = "task_id"
        case boardName = "board_name"
        case agentId = "agent_id"
        case title
        case status
    }

    public init(
        cardId: String,
        taskId: String? = nil,
        boardName: String,
        agentId: String? = nil,
        title: String,
        status: String
    ) {
        self.cardId = cardId
        self.taskId = taskId
        self.boardName = boardName
        self.agentId = agentId
        self.title = title
        self.status = status
    }
}
