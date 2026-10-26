import Foundation
import Observation

/// Observable state store for sprints and effort velocity management.
@MainActor
@Observable
public final class SprintStore: @unchecked Sendable {
    public static let shared = SprintStore()

    public var sprints: [SprintDetail]
    public var activeSprint: SprintDetail?
    public var isLoading: Bool
    public var searchQuery: String
    public var lastError: String?

    public var client: any APIClientProtocol

    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.sprints = []
        self.activeSprint = nil
        self.isLoading = false
        self.searchQuery = ""
        self.lastError = nil
    }

    public var totalEffortPlanned: Int {
        sprints.reduce(0) { $0 + $1.totalEffort }
    }

    public var totalEffortCompleted: Int {
        sprints.reduce(0) { $0 + $1.completedEffort }
    }

    public var completionPercentage: Double {
        guard totalEffortPlanned > 0 else { return 0.0 }
        return (Double(totalEffortCompleted) / Double(totalEffortPlanned)) * 100.0
    }

    public var filteredSprints: [SprintDetail] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return sprints }
        return sprints.filter {
            $0.name.lowercased().contains(query) ||
            $0.goal.lowercased().contains(query) ||
            $0.status.lowercased().contains(query)
        }
    }

    public func loadSprints() async {
        isLoading = true
        lastError = nil
        do {
            let fetched = try await client.listSprints()
            self.sprints = fetched
            self.activeSprint = fetched.first(where: { $0.status == "active" }) ?? fetched.first
        } catch {
            self.lastError = error.localizedDescription
        }
        isLoading = false
    }

    public func createSprint(name: String, goal: String, start: String? = nil, end: String? = nil) async throws -> SprintDetail {
        let created = try await client.createSprint(name: name, goal: goal, start: start, end: end)
        self.sprints.insert(created, at: 0)
        return created
    }
}
