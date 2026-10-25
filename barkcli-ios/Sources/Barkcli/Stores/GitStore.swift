import Foundation
import Observation

/// Observable state store powering the Git History and Diff Visualizer.
/// Manages commit DAG graph, additions/deletions, branch switching,
/// diff inspection modals, and commit-to-agent task assignment.
@MainActor
@Observable
public final class GitStore: @unchecked Sendable {
    public static let shared = GitStore()

    // MARK: - Published State
    public var commits: [GitCommit]
    public var availableBranches: [String]
    public var selectedBranch: String
    public var selectedCommit: GitCommit?
    public var selectedDiff: GitDiff?
    public var diffCache: [String: GitDiff]
    public var searchQuery: String
    public var isLoading: Bool
    public var isLoadingDiff: Bool
    public var isAssigningCommit: Bool
    public var lastError: String?

    // MARK: - API Client
    public var client: any APIClientProtocol

    // MARK: - Initializer
    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.commits = []
        self.availableBranches = ["main", "feature/orchestration", "agent/feat-auth", "agent/test-gate"]
        self.selectedBranch = "main"
        self.selectedCommit = nil
        self.selectedDiff = nil
        self.diffCache = [:]
        self.searchQuery = ""
        self.isLoading = false
        self.isLoadingDiff = false
        self.isAssigningCommit = false
        self.lastError = nil
    }

    // MARK: - Filtered Commits & Stats

    public var filteredCommits: [GitCommit] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if query.isEmpty {
            return commits
        }
        return commits.filter { commit in
            commit.subject.lowercased().contains(query) ||
            commit.author.lowercased().contains(query) ||
            commit.sha.lowercased().contains(query) ||
            commit.filesChanged.contains(where: { $0.lowercased().contains(query) })
        }
    }

    public var totalAdditions: UInt64 {
        commits.reduce(0) { $0 + $1.additions }
    }

    public var totalDeletions: UInt64 {
        commits.reduce(0) { $0 + $1.deletions }
    }

    // MARK: - Lifecycle Actions

    public func load() async {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            let fetched = try await client.getGitCommits(branch: selectedBranch, limit: 60)
            self.commits = fetched
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    public func refresh() async {
        await load()
    }

    public func selectBranch(_ branch: String) async {
        self.selectedBranch = branch
        await load()
    }

    public func inspectCommit(_ commit: GitCommit) async {
        self.selectedCommit = commit
        await fetchDiff(for: commit.sha)
    }

    public func fetchDiff(for sha: String) async {
        if let cached = diffCache[sha] {
            self.selectedDiff = cached
            return
        }

        isLoadingDiff = true
        lastError = nil
        defer { isLoadingDiff = false }

        do {
            let diff = try await client.getGitDiff(sha: sha)
            self.diffCache[sha] = diff
            self.selectedDiff = diff
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    public func assignToAgent(sha: String, prompt: String) async throws {
        isAssigningCommit = true
        lastError = nil
        defer { isAssigningCommit = false }

        do {
            try await client.assignCommitToAgent(sha: sha, prompt: prompt)
        } catch {
            self.lastError = error.localizedDescription
            throw error
        }
    }
}
