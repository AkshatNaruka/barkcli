import Foundation
import Observation

/// Observable state store for developer reports effort distributions and velocity.
@MainActor
@Observable
public final class ReportsStore: @unchecked Sendable {
    public static let shared = ReportsStore()

    public var metrics: ReportMetrics
    public var isLoading: Bool
    public var lastError: String?

    public var client: any APIClientProtocol

    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.metrics = ReportMetrics()
        self.isLoading = false
        self.lastError = nil
    }

    public var totalEffort: Int {
        metrics.effortByColumn.values.reduce(0, +)
    }

    public var totalCards: Int {
        metrics.cardsByPriority.values.reduce(0, +)
    }

    public func loadReports() async {
        isLoading = true
        lastError = nil
        do {
            self.metrics = try await client.getReportMetrics()
        } catch {
            self.lastError = error.localizedDescription
        }
        isLoading = false
    }
}
