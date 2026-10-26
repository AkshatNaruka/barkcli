import Foundation
import Observation

/// Observable state store powering the native Threads harness.
/// Coordinates thread lists, conversational timelines, plan approvals, and inspector data.
@Observable
public final class ThreadStore: @unchecked Sendable {
    public static let shared = ThreadStore()

    // MARK: Published State
    public var threads: [ThreadSummaryItem]
    public var selectedThreadId: String?
    public var activeThreadDetail: ThreadDetailItem?
    public var taskDiffs: [String: TaskDiffResult]
    public var isLoading: Bool
    public var isSending: Bool
    public var lastError: String?
    public var lastRefreshed: Date?

    // MARK: Client
    public var client: any APIClientProtocol

    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.threads = []
        self.selectedThreadId = nil
        self.activeThreadDetail = nil
        self.taskDiffs = [:]
        self.isLoading = false
        self.isSending = false
        self.lastError = nil
        self.lastRefreshed = nil
    }

    // MARK: Status Partitions
    public var needsYou: [ThreadSummaryItem] {
        threads.filter {
            $0.statusGroup == "needs_you" ||
            $0.statusGroup == "blocked" ||
            $0.column.lowercased() == "review"
        }
    }

    public var running: [ThreadSummaryItem] {
        threads.filter {
            $0.statusGroup == "running" ||
            $0.column.lowercased() == "doing"
        }
    }

    public var features: [ThreadSummaryItem] {
        threads.filter {
            $0.statusGroup == "features" ||
            $0.column.lowercased() == "todo" ||
            (!["needs_you", "blocked", "running", "settled"].contains($0.statusGroup) &&
             !["doing", "review", "done"].contains($0.column.lowercased()))
        }
    }

    public var settled: [ThreadSummaryItem] {
        threads.filter {
            $0.statusGroup == "settled" ||
            $0.column.lowercased() == "done"
        }
    }

    // MARK: Actions
    public func loadThreads(board: String? = nil) async {
        isLoading = true
        lastError = nil
        do {
            let list = try await client.listThreads(board: board)
            self.threads = list
            self.lastRefreshed = Date()
            if selectedThreadId == nil, let first = list.first {
                await selectThread(id: first.id, board: board)
            }
        } catch {
            self.lastError = error.localizedDescription
        }
        isLoading = false
    }

    public func selectThread(id: String, board: String? = nil) async {
        self.selectedThreadId = id
        do {
            let detail = try await client.getThread(id: id, board: board)
            self.activeThreadDetail = detail
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    public func createThread(
        text: String,
        kind: String? = "feature",
        backend: String? = "opencode",
        mode: String? = "plan_first",
        board: String? = nil
    ) async -> String? {
        isSending = true
        lastError = nil
        defer { isSending = false }
        do {
            let newId = try await client.createThread(
                text: text,
                kind: kind,
                backend: backend,
                mode: mode,
                board: board
            )
            await loadThreads(board: board)
            await selectThread(id: newId, board: board)
            return newId
        } catch {
            self.lastError = error.localizedDescription
            return nil
        }
    }

    public func sendMessage(
        id: String,
        text: String,
        backend: String? = nil,
        board: String? = nil
    ) async {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        isSending = true
        do {
            let userEvent = try await client.postThreadMessage(
                id: id,
                text: text,
                author: "you",
                board: board,
                backend: backend
            )
            if activeThreadDetail?.id == id {
                activeThreadDetail?.events.append(userEvent)
            }
            await selectThread(id: id, board: board)
            await loadThreads(board: board)
        } catch {
            self.lastError = error.localizedDescription
        }
        isSending = false
    }

    public func approvePlan(cardId: String, board: String? = nil) async {
        do {
            try await client.approvePlan(cardId: cardId, board: board)
            await selectThread(id: cardId, board: board)
            await loadThreads(board: board)
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    public func rejectPlan(cardId: String, reason: String? = nil, board: String? = nil) async {
        do {
            try await client.rejectPlan(cardId: cardId, reason: reason, board: board)
            await selectThread(id: cardId, board: board)
            await loadThreads(board: board)
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    public func fetchDiff(taskId: String) async -> TaskDiffResult? {
        if let cached = taskDiffs[taskId] {
            return cached
        }
        do {
            let res = try await client.getTaskDiff(taskId: taskId)
            taskDiffs[taskId] = res
            return res
        } catch {
            return nil
        }
    }
}
