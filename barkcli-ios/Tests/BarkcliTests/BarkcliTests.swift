import XCTest
@testable import Barkcli

final class BarkcliTests: XCTestCase {
    func testBoardCalculations() throws {
        let card1 = Card(
            id: "card_1",
            title: "First Task",
            column: "done",
            priority: .high,
            effort: Effort(3)
        )
        let card2 = Card(
            id: "card_2",
            title: "Second Task",
            column: "todo",
            priority: .medium,
            effort: Effort(5)
        )
        let board = Board(
            title: "Engine Sprint",
            cards: [card1, card2]
        )

        XCTAssertEqual(board.totalEffort, 8)
        XCTAssertEqual(board.completedEffort, 3)
        XCTAssertEqual(board.completionRate, 50.0)
        XCTAssertEqual(board.cardsInColumn("done").count, 1)
        XCTAssertEqual(board.cardsByPriority(.high).count, 1)
    }

    func testPriorityOrdering() {
        XCTAssertTrue(Priority.critical < Priority.high)
        XCTAssertTrue(Priority.high < Priority.medium)
        XCTAssertTrue(Priority.medium < Priority.low)
    }

    func testCardCodableRoundtrip() throws {
        let card = Card(
            id: "dev_10",
            title: "Implement Foundation",
            column: "doing",
            priority: .critical,
            labels: ["foundation", "ios"],
            assignee: "agent_alpha",
            effort: Effort(8),
            specId: "spec_foundation"
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(card)

        let decoder = JSONDecoder()
        let decoded = try decoder.decode(Card.self, from: data)

        XCTAssertEqual(decoded.id, "dev_10")
        XCTAssertEqual(decoded.title, "Implement Foundation")
        XCTAssertEqual(decoded.priority, .critical)
        XCTAssertEqual(decoded.effort?.points, 8)
        XCTAssertEqual(decoded.specId, "spec_foundation")
    }

    func testAgentItemCodable() throws {
        let agent = AgentItem(
            id: "agent_orchestrator",
            name: "Lead Orchestrator",
            role: .techLead,
            status: .working,
            activeTasks: ["task_100"]
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(agent)

        let decoder = JSONDecoder()
        let decoded = try decoder.decode(AgentItem.self, from: data)

        XCTAssertEqual(decoded.id, "agent_orchestrator")
        XCTAssertEqual(decoded.role, .techLead)
        XCTAssertEqual(decoded.status, .working)
        XCTAssertEqual(decoded.activeTasks, ["task_100"])
    }

    func testTaskRequestAndResult() throws {
        let task = TaskRequest(
            id: "task_42",
            cardId: "card_10",
            title: "Synthesize Models",
            description: "Produce robust models for iOS client",
            priority: .high,
            status: .inProgress
        )

        let result = TaskResult(
            taskId: "task_42",
            status: .success,
            filesChanged: ["Board.swift", "Card.swift"],
            summary: "Completed foundation layer successfully"
        )

        XCTAssertEqual(task.id, "task_42")
        XCTAssertTrue(task.status.isActive)
        XCTAssertFalse(task.status.isTerminal)

        XCTAssertEqual(result.taskId, "task_42")
        XCTAssertEqual(result.status, .success)
        XCTAssertEqual(result.filesChanged.count, 2)
    }

    func testGitCommitAndBundle() throws {
        let commit = GitCommit(
            sha: "a1b2c3d4e5f67890",
            subject: "Add Foundation layer",
            author: "Barkcli Agent"
        )
        XCTAssertEqual(commit.shortSha, "a1b2c3d")

        let bundle = GitBundle(
            id: "bundle_1",
            title: "Foundation Feature",
            kind: .feat,
            status: .open
        )
        XCTAssertEqual(bundle.kind, .feat)
        XCTAssertEqual(bundle.status, .open)

        let diff = GitDiffFile(
            path: "Sources/Barkcli/Theme/Colors.swift",
            status: .added,
            additions: 50,
            deletions: 0
        )
        XCTAssertEqual(diff.path, "Sources/Barkcli/Theme/Colors.swift")
        XCTAssertEqual(diff.status, .added)
    }

    func testMindSnapshot() throws {
        let blocker = BlockerItem(
            cardId: "card_99",
            title: "Wait for review",
            blockedBy: ["card_98"]
        )
        let snapshot = MindSnapshot(
            boardName: "main_board",
            blockers: [blocker]
        )

        XCTAssertEqual(snapshot.boardName, "main_board")
        XCTAssertEqual(snapshot.blockers.count, 1)
        XCTAssertEqual(snapshot.blockers.first?.cardId, "card_99")
    }

    func testDemoStoreInitializationAndMutation() {
        let demo = DemoStore()
        XCTAssertTrue(demo.boardNames.contains("dev"))
        XCTAssertTrue(demo.boardNames.contains("agent-infra"))

        let devBoard = demo.getBoard(name: "dev")
        XCTAssertFalse(devBoard.cards.isEmpty)

        demo.moveCard(id: "add-oauth", toColumn: "done", boardName: "dev")
        let updatedBoard = demo.getBoard(name: "dev")
        let card = updatedBoard.cards.first { $0.id == "add-oauth" }
        XCTAssertEqual(card?.column, "done")
    }

    func testDemoStoreAutopilotPlanAndGate() {
        let demo = DemoStore()
        let proposal = demo.proposePlan(cardId: "add-oauth", boardName: "dev")
        XCTAssertEqual(proposal.cardId, "add-oauth")
        XCTAssertFalse(proposal.children.isEmpty)

        let childCards = demo.approvePlan(cardId: "add-oauth", boardName: "dev")
        XCTAssertFalse(childCards.isEmpty)

        let verdict = demo.runSimulatedTestGate(cardId: "add-oauth")
        XCTAssertTrue(verdict.passed)
    }

    func testAppStateInitializationAndFiltering() async {
        let appState = AppState(startInDemo: true)
        XCTAssertEqual(appState.connectionMode, .demoMode)
        XCTAssertTrue(appState.isDemoMode)
        XCTAssertFalse(appState.availableBoards.isEmpty)

        appState.searchQuery = "OAuth"
        XCTAssertFalse(appState.filteredCards.isEmpty)

        appState.searchQuery = "nonexistent_query_xyz"
        XCTAssertTrue(appState.filteredCards.isEmpty)
    }

    func testAppStateCardMoveAndIntent() async {
        let appState = AppState(startInDemo: true)
        let initialCount = appState.cards.count

        await appState.submitIntent(text: "Build agent telemetry monitor")
        XCTAssertEqual(appState.cards.count, initialCount + 1)

        let newCard = appState.cards.first!
        await appState.moveCard(cardId: newCard.id, toColumn: "doing")
        XCTAssertEqual(appState.cards.first?.column, "doing")
    }

    func testSpecAndCoverageCodable() throws {
        let req = SpecRequirement(
            id: "req_1",
            title: "Zero timeout verification",
            status: .implemented
        )
        let spec = Spec(
            id: "spec_1",
            title: "Fleet Reliability",
            requirements: [req]
        )
        let coverage = SpecCoverage(
            totalRequirements: 10,
            implemented: 8,
            verified: 7,
            stale: 1,
            coveragePercent: 80.0
        )

        let encoder = JSONEncoder()
        let specData = try encoder.encode(spec)
        let covData = try encoder.encode(coverage)

        let decoder = JSONDecoder()
        let decodedSpec = try decoder.decode(Spec.self, from: specData)
        let decodedCov = try decoder.decode(SpecCoverage.self, from: covData)

        XCTAssertEqual(decodedSpec.id, "spec_1")
        XCTAssertEqual(decodedSpec.requirements.count, 1)
        XCTAssertEqual(decodedCov.coveragePercent, 80.0)
    }

    func testLiveRunnerSessionCodable() throws {
        let runner = LiveRunnerSession(
            id: "run_test_1",
            taskId: "task_1",
            agentId: "opencode-1",
            backend: "opencode",
            status: "running",
            branch: "feat/telemetry"
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(runner)

        let decoder = JSONDecoder()
        let decoded = try decoder.decode(LiveRunnerSession.self, from: data)

        XCTAssertEqual(decoded.id, "run_test_1")
        XCTAssertEqual(decoded.agentId, "opencode-1")
        XCTAssertEqual(decoded.status, "running")
    }
}
