import Foundation
import Observation

/// Observable state store powering the central Mind Dashboard.
/// Coordinates project health indicators, derived velocity metrics, critical blockers,
/// stale cards, real-time runner sessions, and autopilot plan proposal workflows.
@Observable
public final class MindStore: @unchecked Sendable {
    public static let shared = MindStore()

    // MARK: - Published State
    public var snapshot: MindSnapshot?
    public var autopilotStatus: AutopilotStatus?
    public var liveSessions: [LiveSession]
    public var isLoading: Bool
    public var lastRefreshed: Date?
    public var lastError: String?
    public var activeProposalToReview: PlanProposal?

    // MARK: - Active API Client
    public var client: any APIClientProtocol

    // MARK: - Initializer
    public init(
        client: (any APIClientProtocol)? = nil
    ) {
        self.client = client ?? MockAPIClient()
        self.snapshot = nil
        self.autopilotStatus = nil
        self.liveSessions = []
        self.isLoading = false
        self.lastRefreshed = nil
        self.lastError = nil
    }

    // MARK: - Derived Metrics & Heuristics
    public var healthScore: Double {
        snapshot?.healthMetrics.healthScore ?? 100.0
    }

    public var blockers: [BlockerItem] {
        snapshot?.blockers ?? []
    }

    public var staleCards: [StaleCardSummary] {
        snapshot?.staleCards ?? []
    }

    public var nextActions: [NextActionSummary] {
        snapshot?.nextActions ?? []
    }

    public var velocity: VelocitySummary {
        snapshot?.velocity ?? VelocitySummary()
    }

    public var currentPhase: AutopilotPhase {
        autopilotStatus?.phase ?? .idle
    }

    public var phaseLabel: String {
        autopilotStatus?.phaseLabel ?? currentPhase.displayName
    }

    public var needsHumanAttention: Bool {
        autopilotStatus?.needsHuman ?? false
    }

    public var attentionCounts: StatusCounts {
        autopilotStatus?.counts ?? StatusCounts()
    }

    public var activeProposal: PlanProposal? {
        autopilotStatus?.proposal
    }

    // MARK: - Refresh & Sync Operations
    public func refresh(board: String? = nil) async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let snapTask = client.getMindSnapshot(board: board)
            async let autoTask = client.getAutopilotStatus(board: board)
            async let sessionsTask = client.getLiveSessions()

            let (snap, auto, sessions) = try await (snapTask, autoTask, sessionsTask)

            self.snapshot = snap
            self.autopilotStatus = auto
            self.liveSessions = sessions
            self.lastRefreshed = Date()
            self.lastError = nil
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    public func refreshLiveSessions() async {
        do {
            self.liveSessions = try await client.getLiveSessions()
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    // MARK: - Intent & Autopilot Operations
    public func submitIntent(prompt: String, kind: String? = "feature") async throws -> IntentResponse {
        do {
            let response = try await client.submitIntent(prompt: prompt, kind: kind)
            await refresh()
            return response
        } catch {
            self.lastError = error.localizedDescription
            throw error
        }
    }

    public func approveActiveProposal() async throws {
        guard let proposal = activeProposal else { return }
        do {
            try await client.approvePlan(cardId: proposal.cardId)
            await refresh()
        } catch {
            self.lastError = error.localizedDescription
            throw error
        }
    }

    public func rejectActiveProposal(reason: String? = nil) async throws {
        guard let proposal = activeProposal else { return }
        do {
            try await client.rejectPlan(cardId: proposal.cardId, reason: reason)
            await refresh()
        } catch {
            self.lastError = error.localizedDescription
            throw error
        }
    }

    // MARK: - Digest Export
    public func exportMarkdownDigest() -> String {
        let score = Int(healthScore)
        let done = velocity.totalDone
        let points = velocity.totalPoints
        let blockCount = blockers.count
        let staleCount = staleCards.count

        var md = """
        # barkcli Project Mind Digest
        Generated: \(Date().ISO8601Format())
        Health Score: \(score)% | Velocity: \(done) cards done (\(points) pts)
        Blockers: \(blockCount) | Stale Cards: \(staleCount)
        Autopilot Phase: \(phaseLabel)

        """

        if !blockers.isEmpty {
            md += "\n## Blockers\n"
            for b in blockers {
                md += "- **\(b.cardId)**: \(b.title) (Blocked by: \(b.blockedBy.joined(separator: ", ")))\n"
            }
        }

        if !nextActions.isEmpty {
            md += "\n## Recommended Actions\n"
            for a in nextActions {
                md += "- \(a.action): \(a.reason)\n"
            }
        }

        return md
    }
}
