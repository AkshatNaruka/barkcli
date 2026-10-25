import XCTest
import SwiftUI
@testable import Barkcli

final class OrchestrationTests: XCTestCase {

    // MARK: - OrchestrationStore Tests

    @MainActor
    func testOrchestrationStoreLoadAndDerivedMetrics() async {
        let mockClient = MockAPIClient()
        let store = OrchestrationStore(client: mockClient)

        await store.load()

        XCTAssertFalse(store.agents.isEmpty, "Agents should be populated from mock client")
        XCTAssertFalse(store.tasks.isEmpty, "Tasks should be populated from mock client")
        XCTAssertFalse(store.liveSessions.isEmpty, "Live runner sessions should be populated")

        // Active / Idle agents
        let activeCount = store.activeAgentsCount
        let idleCount = store.idleAgentsCount
        XCTAssertEqual(activeCount + idleCount, store.agents.count, "Active + Idle should account for all registered agents")

        // Token usage aggregation
        let expectedTokens = store.agents.reduce(0) { $0 + $1.metrics.totalTokensUsed }
        XCTAssertEqual(store.totalTokensUsed, expectedTokens)

        // Overall success rate
        let rate = store.overallSuccessRate
        XCTAssertGreaterThanOrEqual(rate, 0.0)
        XCTAssertLessThanOrEqual(rate, 1.0)

        // Running runner sessions count
        let runningCount = store.runningSessionsCount
        XCTAssertGreaterThanOrEqual(runningCount, 0)
    }

    @MainActor
    func testOrchestrationStoreTaskFilteringAndSearch() async {
        let mockClient = MockAPIClient()
        let store = OrchestrationStore(client: mockClient)
        await store.load()

        let total = store.tasks.count
        XCTAssertGreaterThan(total, 0)

        // Status filtering: Pending
        store.selectedStatusFilter = .pending
        for task in store.filteredTasks {
            XCTAssertEqual(task.status, .pending)
        }

        // Status filtering: Completed
        store.selectedStatusFilter = .completed
        for task in store.filteredTasks {
            XCTAssertEqual(task.status, .completed)
        }
        store.selectedStatusFilter = nil

        // Search query matching
        if let first = store.tasks.first {
            store.searchQuery = first.cardId
            XCTAssertTrue(store.filteredTasks.contains(where: { $0.id == first.id }))
        }

        // Search query nonexistent
        store.searchQuery = "nonexistent_query_xyz_999"
        XCTAssertTrue(store.filteredTasks.isEmpty)
        store.searchQuery = ""
    }

    @MainActor
    func testOrchestrationStoreAgentRegistrationAndRemoval() async throws {
        let mockClient = MockAPIClient()
        let store = OrchestrationStore(client: mockClient)
        await store.load()

        let initialCount = store.agents.count

        // Register new agent
        let newAgent = try await store.registerAgent(name: "Atlas Pilot", role: .scrumMaster)
        XCTAssertTrue(store.agents.contains(where: { $0.id == newAgent.id }))
        XCTAssertEqual(store.agents.count, initialCount + 1)

        // Remove the agent
        try await store.removeAgent(id: newAgent.id)
        XCTAssertFalse(store.agents.contains(where: { $0.id == newAgent.id }))
        XCTAssertEqual(store.agents.count, initialCount)
    }

    @MainActor
    func testOrchestrationStoreTaskLifecycleMutations() async throws {
        let mockClient = MockAPIClient()
        let store = OrchestrationStore(client: mockClient)
        await store.load()

        // Find or create a pending task
        guard let pendingTask = store.tasks.first(where: { $0.status == .pending }) else {
            XCTFail("Expected at least one pending task in mock dataset")
            return
        }

        // 1. Claim task
        try await store.claimTask(taskId: pendingTask.id, agentId: "tech-lead")
        let claimed = store.tasks.first(where: { $0.id == pendingTask.id })
        XCTAssertTrue(claimed?.status == .assigned || claimed?.status == .inProgress)
        XCTAssertEqual(claimed?.assignedAgent, "tech-lead")

        // 2. Complete task
        try await store.completeTask(taskId: pendingTask.id, agentId: "tech-lead", durationMs: 1200)
        let completed = store.tasks.first(where: { $0.id == pendingTask.id })
        XCTAssertEqual(completed?.status, .completed)

        // 3. Fail task
        if let anotherTask = store.tasks.first(where: { $0.status != .failed && $0.status != .completed }) {
            try await store.failTask(taskId: anotherTask.id, agentId: "agent-1", error: "Test timeout")
            let failed = store.tasks.first(where: { $0.id == anotherTask.id })
            XCTAssertEqual(failed?.status, .failed)
        }
    }

    @MainActor
    func testOrchestrationStoreCycleExecution() async throws {
        let mockClient = MockAPIClient()
        let store = OrchestrationStore(client: mockClient)
        await store.load()

        let initialAgentCount = store.agents.count
        XCTAssertGreaterThan(initialAgentCount, 0)

        let cycleResult = try await store.runCycle()
        XCTAssertNotNil(store.lastCycleResult)
        XCTAssertEqual(store.lastCycleResult?.cycleNumber, cycleResult.cycleNumber)
        XCTAssertGreaterThanOrEqual(cycleResult.tasksDispatched, 0)
        XCTAssertFalse(store.agents.isEmpty, "Agents must be refreshed after running cycle")
        XCTAssertEqual(store.agents.count, initialAgentCount)
    }

    // MARK: - SpecsStore Tests

    @MainActor
    func testSpecsStoreLoadAndCoverageCalculations() async {
        let mockClient = MockAPIClient()
        let store = SpecsStore(client: mockClient)

        await store.load()

        XCTAssertFalse(store.specs.isEmpty, "Specs should be populated from mock client")
        XCTAssertNotNil(store.coverageReport, "Coverage report should be populated")

        let totalReqs = store.totalRequirementsCount
        let implemented = store.implementedCount
        let verified = store.verifiedCount
        let stale = store.staleCount
        let pct = store.coveragePercent

        XCTAssertGreaterThan(totalReqs, 0)
        XCTAssertGreaterThanOrEqual(implemented, 0)
        XCTAssertGreaterThanOrEqual(verified, 0)
        XCTAssertGreaterThanOrEqual(stale, 0)
        XCTAssertGreaterThanOrEqual(pct, 0.0)
        XCTAssertLessThanOrEqual(pct, 100.0)
    }

    @MainActor
    func testSpecsStoreFilteringAndStaleness() async {
        let mockClient = MockAPIClient()
        let store = SpecsStore(client: mockClient)
        await store.load()

        // Filter by Verified
        store.selectedStatusFilter = .verified
        for spec in store.filteredSpecs {
            for req in spec.requirements {
                XCTAssertEqual(req.status, .verified)
            }
        }

        // Filter by Stale Only
        store.selectedStatusFilter = nil
        store.showStaleOnly = true
        for spec in store.filteredSpecs {
            for req in spec.requirements {
                XCTAssertTrue(req.stale)
            }
        }
        store.showStaleOnly = false

        // Search by Code Path
        store.searchQuery = "auth"
        XCTAssertFalse(store.filteredSpecs.isEmpty)

        store.searchQuery = "nonexistent_code_path_999"
        XCTAssertTrue(store.filteredSpecs.isEmpty)
        store.searchQuery = ""
    }

    // MARK: - GitStore Tests

    @MainActor
    func testGitStoreCommitsAndAdditionsDeletions() async {
        let mockClient = MockAPIClient()
        let store = GitStore(client: mockClient)

        await store.load()

        XCTAssertFalse(store.commits.isEmpty, "Commits should be populated from mock client")
        XCTAssertFalse(store.availableBranches.isEmpty)
        XCTAssertEqual(store.selectedBranch, "main")

        // Additions / Deletions
        let adds = store.totalAdditions
        let dels = store.totalDeletions
        XCTAssertGreaterThan(adds, 0)
        XCTAssertGreaterThanOrEqual(dels, 0)

        // Filter by Author or SHA
        if let first = store.commits.first {
            store.searchQuery = first.shortSha
            XCTAssertTrue(store.filteredCommits.contains(where: { $0.sha == first.sha }))
        }
        store.searchQuery = ""
    }

    @MainActor
    func testGitStoreBranchSelectionAndDiffInspection() async {
        let mockClient = MockAPIClient()
        let store = GitStore(client: mockClient)
        await store.load()

        // Switch branch
        await store.selectBranch("feature/orchestration")
        XCTAssertEqual(store.selectedBranch, "feature/orchestration")

        // Inspect diff
        if let first = store.commits.first {
            await store.inspectCommit(first)
            XCTAssertEqual(store.selectedCommit?.sha, first.sha)
            XCTAssertNotNil(store.selectedDiff)
            XCTAssertEqual(store.selectedDiff?.sha, first.sha)
            XCTAssertNotNil(store.diffCache[first.sha], "Diff should be cached")
        }
    }

    @MainActor
    func testGitStoreAssignCommitToAgent() async throws {
        let mockClient = MockAPIClient()
        let store = GitStore(client: mockClient)
        await store.load()

        guard let first = store.commits.first else {
            XCTFail("No commits found")
            return
        }

        try await store.assignToAgent(sha: first.sha, prompt: "Verify unit test coverage for changes in commit")
        XCTAssertNil(store.lastError)
    }

    // MARK: - Intent and Plan Proposal Sheet Workflow

    @MainActor
    func testIntentBarAndPlanProposalApprovalCycle() async throws {
        let mockClient = MockAPIClient()
        let mindStore = MindStore(client: mockClient)

        // Submit natural language intent
        let response = try await mindStore.submitIntent(prompt: "Add JWT token refresh rotation", kind: "feature")
        XCTAssertFalse(response.cardId.isEmpty)

        // Propose plan for card
        let proposal = try await mockClient.proposePlan(cardId: response.cardId)
        XCTAssertEqual(proposal.cardId, response.cardId)
        XCTAssertFalse(proposal.children.isEmpty, "Plan proposal should decompose into child slices")

        // Refresh mind store so active proposal and autopilot state are loaded
        await mindStore.refresh()
        XCTAssertNotNil(mindStore.activeProposal, "Active proposal must be populated on mindStore")
        XCTAssertEqual(mindStore.activeProposal?.cardId, response.cardId)

        // Approve plan through mind store
        try await mindStore.approveActiveProposal()
        XCTAssertNil(mindStore.lastError)

        // Verify child tasks were created in task queue
        let tasks = try await mockClient.listTasks()
        let createdChildTasks = tasks.filter { $0.cardId.starts(with: "\(response.cardId)_") }
        XCTAssertFalse(createdChildTasks.isEmpty, "Approving active proposal must generate child tasks in queue")
    }
}
