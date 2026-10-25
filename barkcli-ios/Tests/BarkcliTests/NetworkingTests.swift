import XCTest
@testable import Barkcli

final class NetworkingTests: XCTestCase {
    // MARK: - MockAPIClient Health & AutoInit

    func testMockAPIClientHealthAndAutoInit() async throws {
        let client: any APIClientProtocol = MockAPIClient()

        let health = try await client.checkHealth()
        XCTAssertEqual(health.status, "ok")
        XCTAssertEqual(health.port, 4321)
        XCTAssertEqual(health.version, "0.8.0")

        let initResult = try await client.autoInit()
        XCTAssertTrue(initResult.created)
        XCTAssertTrue(initResult.boardPath?.contains(".board") == true)
        XCTAssertFalse(initResult.message.isEmpty)
    }

    // MARK: - MockAPIClient Board & Card CRUD

    func testMockAPIClientBoardAndCardOperations() async throws {
        let client: any APIClientProtocol = MockAPIClient()

        let boards = try await client.listBoards()
        XCTAssertTrue(boards.contains("dev"), "Boards should contain 'dev'")

        let board = try await client.getBoard(name: "dev")
        XCTAssertEqual(board.title, "dev")
        XCTAssertFalse(board.cards.isEmpty)

        // Save a new card
        let testCardId = "test-net-card-\(UUID().uuidString.prefix(6))"
        let newCard = Card(
            id: testCardId,
            title: "Networking Integration Test Card",
            column: "todo",
            description: "Testing APIClientProtocol card save",
            priority: .high
        )
        try await client.saveCard(boardName: "dev", card: newCard)

        let updatedBoard = try await client.getBoard(name: "dev")
        let found = updatedBoard.cards.first { $0.id == testCardId }
        XCTAssertNotNil(found)
        XCTAssertEqual(found?.title, "Networking Integration Test Card")
        XCTAssertEqual(found?.column, "todo")

        // Move card to 'doing'
        try await client.moveCard(boardName: "dev", cardId: testCardId, toColumn: "doing")
        let movedBoard = try await client.getBoard(name: "dev")
        let movedCard = movedBoard.cards.first { $0.id == testCardId }
        XCTAssertEqual(movedCard?.column, "doing")
    }

    // MARK: - MockAPIClient Mind & Autopilot Loop

    func testMockAPIClientMindAndAutopilot() async throws {
        let client: any APIClientProtocol = MockAPIClient()

        let mind = try await client.getMindSnapshot()
        XCTAssertFalse(mind.boardName.isEmpty)
        XCTAssertGreaterThan(mind.stats.total, 0)


        let autopilot = try await client.getAutopilotStatus()
        XCTAssertFalse(autopilot.board.isEmpty)
        XCTAssertFalse(autopilot.phaseLabel.isEmpty)

        // Submit intent
        let intentResponse = try await client.submitIntent(prompt: "Add biometrics authentication", kind: "feature")
        XCTAssertFalse(intentResponse.cardId.isEmpty)
        XCTAssertEqual(intentResponse.title, "Add biometrics authentication")

        // Propose plan for the new card
        let proposal = try await client.proposePlan(cardId: intentResponse.cardId, board: "dev")
        XCTAssertEqual(proposal.cardId, intentResponse.cardId)
        XCTAssertFalse(proposal.children.isEmpty)
        XCTAssertGreaterThan(proposal.estimatedTotalEffort, 0)

        // Approve plan
        try await client.approvePlan(cardId: intentResponse.cardId)

        // Reject plan workflow
        try await client.rejectPlan(cardId: "fake-card", reason: "Scope too broad")
    }

    // MARK: - MockAPIClient Fleet Orchestration

    func testMockAPIClientFleetOrchestration() async throws {
        let client: any APIClientProtocol = MockAPIClient()

        let agents = try await client.listAgents()
        XCTAssertGreaterThanOrEqual(agents.count, 3)
        XCTAssertTrue(agents.contains(where: { $0.role == .techLead }))

        let tasks = try await client.listTasks()
        XCTAssertFalse(tasks.isEmpty)

        let liveSessions = try await client.getLiveSessions()
        XCTAssertFalse(liveSessions.isEmpty)
        XCTAssertNotNil(liveSessions.first?.agentId)

        let cycleResult = try await client.triggerOrchestrationCycle()
        XCTAssertGreaterThan(cycleResult.cycleNumber, 0)
    }

    // MARK: - MockAPIClient Specs & Git

    func testMockAPIClientSpecsAndGit() async throws {
        let client: any APIClientProtocol = MockAPIClient()

        let specs = try await client.listSpecs()
        XCTAssertFalse(specs.isEmpty)
        XCTAssertTrue(specs.contains(where: { $0.id == "sso" || $0.id == "bundles" }))

        let coverage = try await client.getSpecsCoverage()
        XCTAssertGreaterThan(coverage.totalRequirements, 0)
        XCTAssertGreaterThanOrEqual(coverage.coveragePercent, 0.0)

        let commits = try await client.getGitCommits()
        XCTAssertFalse(commits.isEmpty)
        let firstCommit = commits[0]
        XCTAssertFalse(firstCommit.sha.isEmpty)
        XCTAssertFalse(firstCommit.subject.isEmpty)

        let diff = try await client.getGitDiff(sha: firstCommit.sha)
        XCTAssertEqual(diff.sha, firstCommit.sha)
        XCTAssertFalse(diff.diff.isEmpty)

        try await client.assignCommitToAgent(sha: firstCommit.sha, prompt: "Investigate regression")
    }

    // MARK: - LiveAPIClient Configuration & Typealias Compatibility

    func testLiveAPIClientConfiguration() {
        let url = URL(string: "http://192.168.1.100:4321")!
        let token = "test-secret-token"
        let client = LiveAPIClient(baseURL: url, authToken: token, timeoutInterval: 3.0)

        XCTAssertEqual(client.baseURL, url)
        XCTAssertEqual(client.authToken, token)
        XCTAssertFalse(client.isBusy)

        // Verify APIClient typealias maps cleanly
        let aliased: APIClient = client
        XCTAssertEqual(aliased.baseURL, url)
    }

    // MARK: - BarkcliError Localization

    func testBarkcliErrorDescriptions() {
        let errors: [BarkcliError] = [
            .invalidURL("bad://url"),
            .networkUnavailable,
            .timeout,
            .unauthorized("Bearer token rejected"),
            .serverError(statusCode: 500, message: "Internal server crash"),
            .decodingError("Missing key 'title'"),
            .encodingError("Failed to convert UTF8"),
            .notFound("Board 'missing'"),
            .workspaceUninitialized("Directory lacks .board/"),
            .invalidState("Autopilot not running"),
            .cancelled,
            .unknown("Unexpected error")
        ]

        for err in errors {
            XCTAssertNotNil(err.errorDescription)
            XCTAssertFalse(err.errorDescription!.isEmpty)
        }
    }

    // MARK: - NetworkMonitor Interface Detection

    func testNetworkMonitorInitialState() {
        let monitor = NetworkMonitor.shared
        XCTAssertTrue(monitor.isMonitoring)
        XCTAssertFalse(monitor.statusDescription.isEmpty)

        // Starting and stopping monitor is safe and idempotent
        monitor.start()
        XCTAssertTrue(monitor.isMonitoring)
        monitor.stop()
        XCTAssertFalse(monitor.isMonitoring)
        monitor.start()
        XCTAssertTrue(monitor.isMonitoring)
    }

    // MARK: - NetworkDiscoveryService Probing & Instance Modeling

    func testNetworkDiscoveryServiceInstance() {
        let service = NetworkDiscoveryService(probeTimeout: 0.5)
        XCTAssertEqual(NetworkDiscoveryService.defaultPort, 4321)
        XCTAssertEqual(NetworkDiscoveryService.serviceType, "_barkcli._tcp")
        XCTAssertFalse(service.isBrowsing)

        let instance = DiscoveredInstance(
            name: "Local Test Server",
            host: "127.0.0.1",
            port: 4321,
            latencyMs: 14,
            isLocal: true,
            version: "0.8.0",
            hasMetadata: true
        )

        XCTAssertEqual(instance.id, "127.0.0.1:4321")
        XCTAssertEqual(instance.endpointURL, URL(string: "http://127.0.0.1:4321"))
        XCTAssertEqual(instance.latencyMs, 14)
        XCTAssertTrue(instance.isLocal)

        service.discoveredInstances.append(instance)
        XCTAssertEqual(service.discoveredInstances.count, 1)

        service.removeInstance(id: instance.id)
        XCTAssertEqual(service.discoveredInstances.count, 0)
    }

    // MARK: - WorkspaceAutoInitService Flow

    func testWorkspaceAutoInitFlow() async throws {
        let client = MockAPIClient()
        let autoInitService = WorkspaceAutoInitService.shared

        // Already populated demo store should not require re-init
        let needsInit = try await autoInitService.needsInitialization(client: client)
        XCTAssertFalse(needsInit)

        // Explicitly running verifyOrAutoInit succeeds and returns valid status
        let status = try await autoInitService.verifyOrAutoInit(client: client)
        XCTAssertTrue(status.initialized)
        XCTAssertGreaterThan(status.boardsCount, 0)
    }
}
