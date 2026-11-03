import Foundation
import Observation

/// Observable state store for global token consumption, cache savings, and estimated cost telemetry.
@MainActor
@Observable
public final class UsageStore: @unchecked Sendable {
    public static let shared = UsageStore()

    public var data: UsageResponseData?
    public var selectedWindow: String = "30d"
    public var metricMode: String = "tokens" // "tokens" or "cost"
    public var searchQuery: String = ""
    public var isLoading: Bool = false
    public var lastError: String?

    public var client: any APIClientProtocol

    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? LiveAPIClient()
        self.data = nil
        self.isLoading = false
        self.lastError = nil
    }

    public func loadUsage() async {
        isLoading = true
        lastError = nil
        do {
            self.data = try await client.getUsage(window: selectedWindow)
        } catch {
            self.lastError = error.localizedDescription
            self.data = try? await MockAPIClient().getUsage(window: selectedWindow)
        }
        isLoading = false
    }

    public func setWindow(_ window: String) async {
        selectedWindow = window
        await loadUsage()
    }
}
