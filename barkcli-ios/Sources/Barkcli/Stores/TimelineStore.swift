import Foundation
import Observation

/// Observable state store for timeline checkpoints rollback and doctor diagnosis.
@MainActor
@Observable
public final class TimelineStore: @unchecked Sendable {
    public static let shared = TimelineStore()

    public var checkpoints: [Checkpoint]
    public var doctorIssues: [DoctorIssue]
    public var isDoctorRunning: Bool
    public var isLoading: Bool
    public var lastError: String?

    public var client: any APIClientProtocol

    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.checkpoints = []
        self.doctorIssues = []
        self.isDoctorRunning = false
        self.isLoading = false
        self.lastError = nil
    }

    public var unfixedIssuesCount: Int {
        doctorIssues.filter { !$0.fixed }.count
    }

    public func loadTimeline() async {
        isLoading = true
        lastError = nil
        do {
            async let cp = client.listCheckpoints()
            async let doc = client.runDoctor()
            let (fetchedCp, fetchedDoc) = try await (cp, doc)
            self.checkpoints = fetchedCp
            self.doctorIssues = fetchedDoc
        } catch {
            self.lastError = error.localizedDescription
        }
        isLoading = false
    }

    public func createCheckpoint(description: String) async throws -> Checkpoint {
        let cp = try await client.createCheckpoint(description: description)
        self.checkpoints.insert(cp, at: 0)
        return cp
    }

    public func restoreCheckpoint(id: String) async throws {
        try await client.restoreCheckpoint(id: id)
    }

    public func runDoctor() async {
        isDoctorRunning = true
        do {
            self.doctorIssues = try await client.runDoctor()
        } catch {
            self.lastError = error.localizedDescription
        }
        isDoctorRunning = false
    }

    public func fixDoctorIssues() async {
        isDoctorRunning = true
        do {
            self.doctorIssues = try await client.fixDoctorIssues()
        } catch {
            self.lastError = error.localizedDescription
        }
        isDoctorRunning = false
    }
}
