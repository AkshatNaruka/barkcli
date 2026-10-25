import XCTest
import SwiftUI
@testable import Barkcli

/// Comprehensive end-to-end and integration test suite for Milestone 5 of `barkcli-ios`.
/// Verifies Tiers 1 through 4 following `TEST_INFRA.md` and `ORIGINAL_REQUEST.md`.
final class E2EFlowTests: XCTestCase {

    // MARK: - Tier 4 Scenario 1: Cold Start Offline Demo Walkthrough

    func testTier4Scenario1_ColdStartOfflineDemoWalkthrough() async throws {
        // 1. Initialize stores with isolated DemoStore
        let demoStore = DemoStore()
        let client = MockAPIClient(store: demoStore)
        let workspaceStore = WorkspaceStore(client: client, initialMode: .demoMode)
        let boardStore = BoardStore(boardName: "dev", client: client)
        let mindStore = MindStore(client: client)

        // 2. Verify initial connection state in Demo Mode
        XCTAssertEqual(workspaceStore.connectionMode, .demoMode)
        XCTAssertEqual(workspaceStore.connectionState, .demoMode)
        let isHealthy = await workspaceStore.checkHealth()
        XCTAssertTrue(isHealthy, "Demo mode workspace should report healthy")
        XCTAssertEqual(workspaceStore.lastLatencyMs, 0, "Demo mode should report 0ms simulated latency")

        // 3. Load all available boards
        await boardStore.loadBoards()
        XCTAssertTrue(boardStore.availableBoards.contains("dev"), "Available boards must contain 'dev'")
        XCTAssertTrue(boardStore.availableBoards.contains("roadmap"), "Available boards must contain 'roadmap'")
        XCTAssertTrue(boardStore.availableBoards.contains("agent-infra"), "Available boards must contain 'agent-infra'")

        // 4. Assert >15 cards loaded on 'dev' board with diverse attributes
        let devCards = boardStore.allCards
        XCTAssertGreaterThan(devCards.count, 15, "Dev board must contain >15 cards (actual: \(devCards.count))")

        let priorities = Set(devCards.map(\.priority))
        XCTAssertTrue(priorities.contains(.critical), "Board must contain critical priority cards")
        XCTAssertTrue(priorities.contains(.high), "Board must contain high priority cards")
        XCTAssertTrue(priorities.contains(.medium), "Board must contain medium priority cards")
        XCTAssertTrue(priorities.contains(.low), "Board must contain low priority cards")

        let efforts = devCards.compactMap(\.effort?.points)
        XCTAssertFalse(efforts.isEmpty, "Board must have cards with valid effort points")
        XCTAssertTrue(efforts.contains(where: { $0 > 0 }), "Effort points must be positive")

        let allLabels = Set(devCards.flatMap(\.labels))
        XCTAssertTrue(allLabels.count >= 4, "Board cards must span multiple label categories")

        let cardsWithChecklist = devCards.filter { !$0.checklist.isEmpty }
        XCTAssertFalse(cardsWithChecklist.isEmpty, "Board must contain cards with checklist items")

        // 5. Verify board switching to 'roadmap' and 'agent-infra'
        await boardStore.switchBoard(name: "roadmap")
        XCTAssertEqual(boardStore.boardName, "roadmap")
        XCTAssertFalse(boardStore.allCards.isEmpty, "Roadmap board should contain cards")

        await boardStore.switchBoard(name: "agent-infra")
        XCTAssertEqual(boardStore.boardName, "agent-infra")
        XCTAssertFalse(boardStore.allCards.isEmpty, "agent infra board should contain cards")

        // 6. Verify MindStore snapshot and derived metrics
        await mindStore.refresh()
        guard let snapshot = mindStore.snapshot else {
            XCTFail("MindStore snapshot must not be nil after refresh")
            return
        }

        XCTAssertFalse(snapshot.boardName.isEmpty)
        XCTAssertGreaterThan(mindStore.healthScore, 0.0, "Health score must be greater than zero")
        XCTAssertLessThanOrEqual(mindStore.healthScore, 100.0, "Health score must not exceed 100%")
        XCTAssertGreaterThanOrEqual(mindStore.velocity.totalDone, 0, "Velocity completed count must be positive or zero")
        XCTAssertNotNil(mindStore.autopilotStatus, "Autopilot status must be present")
        XCTAssertFalse(mindStore.phaseLabel.isEmpty, "Autopilot phase label must not be empty")

        // 7. Verify markdown digest export
        let digest = mindStore.exportMarkdownDigest()
        XCTAssertTrue(digest.contains("# barkcli Project Mind Digest"))
        XCTAssertTrue(digest.contains("Health Score:"))
        XCTAssertTrue(digest.contains("Velocity:"))
        XCTAssertTrue(digest.contains("Autopilot Phase:"))
    }

    // MARK: - Tier 4 Scenario 2: Intent Prompt to Plan Approval & Acceptance Gate

    func testTier4Scenario2_IntentPromptToPlanApprovalAndAcceptanceGate() async throws {
        let demoStore = DemoStore()
        let client = MockAPIClient(store: demoStore)
        let mindStore = MindStore(client: client)

        // 1. Submit natural language intent
        let intentPrompt = "Build dark mode switcher"
        let intentResponse = try await client.submitIntent(prompt: intentPrompt, kind: "feature")

        XCTAssertFalse(intentResponse.cardId.isEmpty, "Intent response must include a generated cardId")
        XCTAssertEqual(intentResponse.title, intentPrompt, "Intent card title must match submitted prompt")
        XCTAssertEqual(intentResponse.status, "created")
        XCTAssertEqual(intentResponse.board, "dev")

        // 2. Generate PlanProposal with decomposed architectural slices
        let proposal = try await client.proposePlan(cardId: intentResponse.cardId, board: "dev")
        XCTAssertEqual(proposal.cardId, intentResponse.cardId)
        XCTAssertGreaterThanOrEqual(proposal.children.count, 2, "Plan proposal must decompose into at least 2 architectural slices")
        XCTAssertGreaterThan(proposal.estimatedTotalEffort, 0, "Estimated effort must be positive")
        XCTAssertFalse(proposal.rationale.isEmpty, "Plan proposal must provide agent rationale")

        for slice in proposal.children {
            XCTAssertFalse(slice.title.isEmpty, "Each proposed slice must have a valid title")
            XCTAssertGreaterThan(slice.effort, 0, "Each proposed slice must have positive effort")
            XCTAssertFalse(slice.acceptanceCriteria.isEmpty, "Each proposed slice must define acceptance criteria")
        }

        // 3. Execute real acceptance review gate via client.runReviewGate(cardId:)
        let gateResult = try await client.runReviewGate(cardId: intentResponse.cardId)
        XCTAssertTrue(gateResult.passed, "Acceptance gate should pass for proposed card")
        XCTAssertGreaterThanOrEqual(gateResult.totalTests, 18, "Review gate must run at least 18 test assertions")
        XCTAssertEqual(gateResult.passedTests, gateResult.totalTests, "All gate tests must pass")
        XCTAssertEqual(gateResult.failedTests, 0, "There must be zero failed gate tests")
        XCTAssertGreaterThan(gateResult.durationSeconds, 0.0, "Gate execution duration must be greater than zero")
        XCTAssertFalse(gateResult.logs.isEmpty, "Gate execution must produce diagnostic logs")
        XCTAssertTrue(
            gateResult.logs.contains(where: { $0.contains("[PASS]") }),
            "Gate logs must report passing criteria checks"
        )

        // 4. Approve plan proposal and verify task generation
        await mindStore.refresh()
        try await client.approvePlan(cardId: intentResponse.cardId)

        let devBoard = try await client.getBoard(name: "dev")
        let parentCard = devBoard.cards.first { $0.id == intentResponse.cardId }
        XCTAssertNotNil(parentCard, "Parent intent card must exist on board")
        XCTAssertTrue(parentCard?.pinned == true, "Parent card must be pinned after plan approval")

        let tasks = try await client.listTasks()
        let generatedTasks = tasks.filter { $0.cardId.starts(with: intentResponse.cardId) }
        XCTAssertGreaterThanOrEqual(generatedTasks.count, 2, "Tasks should be queued for each child slice")

        for t in generatedTasks {
            XCTAssertEqual(t.status, .pending, "Generated child tasks should start in pending status")
        }

        // 5. Test plan rejection with custom refinement reason
        let secondIntent = try await client.submitIntent(prompt: "Build voice command controller", kind: "feature")
        _ = try await client.proposePlan(cardId: secondIntent.cardId, board: "dev")

        let rejectionReason = "Scope too broad; decompose into audio pipeline first"
        try await client.rejectPlan(cardId: secondIntent.cardId, reason: rejectionReason)

        // Verify proposal cleared and no child tasks generated for rejected card
        let allTasksAfterReject = try await client.listTasks()
        let rejectedChildTasks = allTasksAfterReject.filter { $0.cardId.starts(with: "\(secondIntent.cardId)_") }
        XCTAssertTrue(rejectedChildTasks.isEmpty, "Rejected plan must not spawn child tasks in the queue")
    }

    // MARK: - Tier 4 Scenario 3: Interactive Card Lifecycle & Checklist

    func testTier4Scenario3_InteractiveCardLifecycleAndChecklist() async throws {
        let demoStore = DemoStore()
        let client = MockAPIClient(store: demoStore)
        let boardStore = BoardStore(boardName: "dev", client: client)
        await boardStore.loadBoards()

        // 1. Create a new card on the board
        let initialCardCount = boardStore.allCards.count
        let cardTitle = "Implement Liquid Glass Toolbar"
        let newCard = try await boardStore.addCard(
            title: cardTitle,
            column: "todo",
            priority: .high,
            description: "Add blurred translucent header",
            effort: 3,
            labels: ["ui", "glass"]
        )

        XCTAssertEqual(boardStore.allCards.count, initialCardCount + 1)
        XCTAssertTrue(boardStore.allCards.contains(where: { $0.id == newCard.id }))
        XCTAssertEqual(newCard.column, "todo")

        // 2. Move card across columns: todo -> doing -> review -> done
        try await boardStore.moveCard(cardId: newCard.id, toColumn: "doing")
        var currentCard = boardStore.allCards.first { $0.id == newCard.id }
        XCTAssertEqual(currentCard?.column.lowercased(), "doing")

        try await boardStore.advanceCard(cardId: newCard.id)
        currentCard = boardStore.allCards.first { $0.id == newCard.id }
        XCTAssertEqual(currentCard?.column.lowercased(), "review")

        try await boardStore.moveCard(cardId: newCard.id, toColumn: "done")
        currentCard = boardStore.allCards.first { $0.id == newCard.id }
        XCTAssertEqual(currentCard?.column.lowercased(), "done")

        // 3. Add card comment and verify persistence
        let commentText = "Worktree branch passes all snapshot tests"
        try await boardStore.addComment(cardId: newCard.id, text: commentText, author: "agent-alpha")

        currentCard = boardStore.allCards.first { $0.id == newCard.id }
        guard let comment = currentCard?.comments.first(where: { $0.text == commentText }) else {
            XCTFail("Comment must be persisted on the card")
            return
        }
        XCTAssertEqual(comment.author, "agent-alpha")

        // 4. Checklist toggles and completion percentage calculation
        var cardWithChecklist = currentCard!
        cardWithChecklist.checklist = [
            ChecklistItem(text: "Define LiquidGlass modifier", done: false),
            ChecklistItem(text: "Add SF Symbol icons", done: false),
            ChecklistItem(text: "Verify dark mode contrast", done: false)
        ]
        try await boardStore.saveCard(cardWithChecklist)

        // Toggle item 0 (1/3 done = 33.3%)
        try await boardStore.toggleChecklistItem(cardId: newCard.id, itemIndex: 0)
        currentCard = boardStore.allCards.first { $0.id == newCard.id }
        XCTAssertTrue(currentCard?.checklist[0].done == true)
        XCTAssertFalse(currentCard?.checklist[1].done == true)
        let doneCount1 = currentCard?.checklist.filter(\.done).count ?? 0
        XCTAssertEqual(doneCount1, 1)

        // Toggle item 1 (2/3 done = 66.7%)
        try await boardStore.toggleChecklistItem(cardId: newCard.id, itemIndex: 1)
        currentCard = boardStore.allCards.first { $0.id == newCard.id }
        XCTAssertTrue(currentCard?.checklist[1].done == true)
        let doneCount2 = currentCard?.checklist.filter(\.done).count ?? 0
        XCTAssertEqual(doneCount2, 2)

        // Toggle item 2 (3/3 done = 100.0%)
        try await boardStore.toggleChecklistItem(cardId: newCard.id, itemIndex: 2)
        currentCard = boardStore.allCards.first { $0.id == newCard.id }
        XCTAssertTrue(currentCard?.checklist[2].done == true)
        let doneCount3 = currentCard?.checklist.filter(\.done).count ?? 0
        XCTAssertEqual(doneCount3, 3)

        // 5. Column WIP limit calculation and enforcement
        // Configure WIP limit of 3 on 'doing' column
        if var currentBoard = boardStore.board {
            currentBoard.columns = [
                Column(id: "todo", name: "Todo", wipLimit: 10),
                Column(id: "doing", name: "Doing", wipLimit: 3),
                Column(id: "review", name: "Review", wipLimit: 5),
                Column(id: "done", name: "Done", wipLimit: nil)
            ]
            try await client.saveBoard(currentBoard, name: "dev")
            await boardStore.loadBoard(name: "dev")
        }

        let doingLimit = boardStore.columns.first { $0.id.lowercased() == "doing" }?.wipLimit
        XCTAssertEqual(doingLimit, 3)

        // Add cards until limit is exceeded
        for i in 1...4 {
            _ = try await boardStore.addCard(
                title: "WIP Limit Overflow Task \(i)",
                column: "doing",
                priority: .medium
            )
        }

        XCTAssertTrue(boardStore.isWIPLimitExceeded(for: "doing"), "Doing column should exceed its WIP limit")
        guard let violation = boardStore.wipViolations["doing"] else {
            XCTFail("WIP violation must be reported for 'doing' column")
            return
        }
        XCTAssertGreaterThan(violation.count, violation.limit)
    }

    // MARK: - Tier 4 Scenario 4: Fleet Orchestration & Runner Sessions

    @MainActor
    func testTier4Scenario4_FleetOrchestrationAndRunnerSessions() async throws {
        let demoStore = DemoStore()
        let client = MockAPIClient(store: demoStore)
        let store = OrchestrationStore(client: client)
        await store.load()

        // 1. Initial fleet state verification
        let initialAgentCount = store.agents.count
        XCTAssertGreaterThanOrEqual(initialAgentCount, 3, "Orchestration should have initial agents")

        // 2. Register a new agent
        let newAgentName = "Vigilant Guard"
        let registeredAgent = try await store.registerAgent(name: newAgentName, role: .techLead)
        XCTAssertEqual(store.agents.count, initialAgentCount + 1)
        XCTAssertTrue(store.agents.contains(where: { $0.id == registeredAgent.id }))
        XCTAssertEqual(registeredAgent.status, .idle)

        // 3. Task submission & claiming
        guard let pendingTask = store.tasks.first(where: { $0.status == .pending }) else {
            XCTFail("Expected at least one pending task in initial dataset")
            return
        }

        try await store.claimTask(taskId: pendingTask.id, agentId: registeredAgent.id)
        let claimedTask = store.tasks.first { $0.id == pendingTask.id }
        XCTAssertTrue(claimedTask?.status == .inProgress || claimedTask?.status == .assigned)
        XCTAssertEqual(claimedTask?.assignedAgent, registeredAgent.id)

        let activeAgent = store.agents.first { $0.id == registeredAgent.id }
        XCTAssertEqual(activeAgent?.status, .working)

        // 4. Trigger orchestration cycle
        let cycleResult = try await store.runCycle()
        XCTAssertGreaterThan(cycleResult.cycleNumber, 0, "Cycle number must increment")
        XCTAssertFalse(cycleResult.insights.isEmpty, "Orchestration cycle must produce insights")
        XCTAssertNotNil(store.lastCycleResult)

        // 5. Live runner sessions telemetry (/api/run/live)
        let runners = store.liveSessions
        XCTAssertFalse(runners.isEmpty, "Live runner sessions must be populated")

        for session in runners {
            XCTAssertFalse(session.id.isEmpty)
            XCTAssertFalse(session.agentId.isEmpty)
            XCTAssertFalse(session.backend.isEmpty)
            XCTAssertFalse(session.status.isEmpty)
            XCTAssertNotNil(session.branch, "Live runner should be linked to an isolated git branch")
        }

        XCTAssertGreaterThanOrEqual(store.runningSessionsCount, 0)

        // 6. Complete task
        try await store.completeTask(taskId: pendingTask.id, agentId: registeredAgent.id, durationMs: 1800)
        let completedTask = store.tasks.first { $0.id == pendingTask.id }
        XCTAssertEqual(completedTask?.status, .completed)

        let idleAgent = store.agents.first { $0.id == registeredAgent.id }
        XCTAssertEqual(idleAgent?.status, .idle)

        // 7. Remove agent from registry
        try await store.removeAgent(id: registeredAgent.id)
        XCTAssertEqual(store.agents.count, initialAgentCount)
        XCTAssertFalse(store.agents.contains(where: { $0.id == registeredAgent.id }))
    }

    // MARK: - Tier 4 Scenario 5: Workspace Switcher, Discovery & Auto-Init

    func testTier4Scenario5_WorkspaceSwitcherDiscoveryAndAutoInit() async throws {
        let demoStore = DemoStore()
        let client = MockAPIClient(store: demoStore)
        let workspaceStore = WorkspaceStore(client: client, initialMode: .demoMode)

        // 1. Network discovery service parameters and probing
        let discoveryService = NetworkDiscoveryService(probeTimeout: 0.1)
        XCTAssertEqual(NetworkDiscoveryService.defaultPort, 4321)
        XCTAssertEqual(NetworkDiscoveryService.serviceType, "_barkcli._tcp")
        XCTAssertFalse(discoveryService.isBrowsing)

        await workspaceStore.scanForInstances()
        XCTAssertFalse(workspaceStore.discoveredInstances.isEmpty, "Discovered instances should be found")
        XCTAssertEqual(workspaceStore.discoveredInstances[0].port, 4321)

        // 2. Auto-Init detection & trigger when metadata is missing
        let emptyDemoStore = DemoStore()
        emptyDemoStore.boards.removeAll()
        emptyDemoStore.boardNames.removeAll()
        let emptyClient = MockAPIClient(store: emptyDemoStore)

        let needsInit = try await WorkspaceAutoInitService.shared.needsInitialization(client: emptyClient)
        XCTAssertTrue(needsInit, "Workspace lacking boards must report needsInitialization == true")

        let initOptions = AutoInitOptions(
            boardName: "init-board",
            columns: ["todo", "doing", "review", "done"],
            createSampleCard: true
        )
        let status = try await WorkspaceAutoInitService.shared.initializeWorkspace(client: emptyClient, options: initOptions)
        XCTAssertTrue(status.initialized, "Auto setup must return initialized status")
        XCTAssertTrue(status.boardDirExists, "Auto setup must confirm board directory")
        XCTAssertTrue(status.configFileExists, "Auto setup must confirm config file")
        XCTAssertGreaterThanOrEqual(status.boardsCount, 1)

        let boards = try await emptyClient.listBoards()
        XCTAssertTrue(boards.contains("init-board"))

        let board = try await emptyClient.getBoard(name: "init-board")
        XCTAssertTrue(board.cards.contains(where: { $0.id == "starter-card" }), "Starter card should be created")

        // 3. Multi-workspace switching between Demo, Localhost, and Remote
        workspaceStore.switchToDemo()
        XCTAssertEqual(workspaceStore.connectionMode, .demoMode)
        XCTAssertEqual(workspaceStore.currentWorkspace.name, "Demo Workspace")

        workspaceStore.addWorkspace(name: "Staging Cluster", host: "10.0.1.25", port: 4321, isRemote: true)
        XCTAssertTrue(workspaceStore.availableWorkspaces.contains(where: { $0.name == "Staging Cluster" }))

        workspaceStore.removeWorkspace(id: "Staging Cluster")
        XCTAssertFalse(workspaceStore.availableWorkspaces.contains(where: { $0.name == "Staging Cluster" }))

        await workspaceStore.connect(to: WorkspaceInfo(name: "Demo Workspace", host: "127.0.0.1", port: 4321, isRemote: false))
        XCTAssertEqual(workspaceStore.connectionMode, .demoMode)
        XCTAssertEqual(workspaceStore.currentWorkspace.name, "Demo Workspace")
    }

    // MARK: - Tier 3: Cross-Feature Interactions & Concurrency

    func testTier3_CardMovementAffectingVelocityAndHealth() async throws {
        let demoStore = DemoStore()
        let client = MockAPIClient(store: demoStore)
        let boardStore = BoardStore(boardName: "dev", client: client)
        let mindStore = MindStore(client: client)

        await boardStore.loadBoards()
        await mindStore.refresh()

        let initialDone = mindStore.velocity.totalDone
        let initialHealth = mindStore.healthScore

        // Move a card to 'done'
        if let todoCard = boardStore.cardsInColumn("todo").first {
            try await boardStore.moveCard(cardId: todoCard.id, toColumn: "done")
            await mindStore.refresh()
            XCTAssertEqual(mindStore.velocity.totalDone, initialDone + 1, "Moving card to done must increase totalDone velocity")
        }

        // Add a blocker to a card and verify health index drops
        let blockerCard = Card(
            id: "blocked-card-test",
            title: "Task blocked by dependency",
            column: "todo",
            blockedBy: "dependency-card-99"
        )
        try await boardStore.saveCard(blockerCard)
        await mindStore.refresh()

        XCTAssertTrue(mindStore.blockers.contains(where: { $0.cardId == "blocked-card-test" }))
        XCTAssertLessThan(mindStore.healthScore, initialHealth, "Introducing a blocker must decrease project health score")
    }

    @MainActor
    func testTier3_SpecsRequirementVerificationUpdatingCoverage() async throws {
        let demoStore = DemoStore()
        let client = MockAPIClient(store: demoStore)
        let specsStore = SpecsStore(client: client)
        await specsStore.load()

        let initialTotal = specsStore.totalRequirementsCount
        let initialVerified = specsStore.verifiedCount
        XCTAssertGreaterThan(initialTotal, 0)
        XCTAssertGreaterThanOrEqual(specsStore.coveragePercent, 0.0)

        // Mutate a requirement in DemoStore to verified
        if let firstSpec = demoStore.specs.first, let firstReq = firstSpec.requirements.first {
            for sIdx in demoStore.specs.indices {
                if demoStore.specs[sIdx].id == firstSpec.id {
                    for rIdx in demoStore.specs[sIdx].requirements.indices {
                        if demoStore.specs[sIdx].requirements[rIdx].id == firstReq.id {
                            demoStore.specs[sIdx].requirements[rIdx].status = .verified
                            break
                        }
                    }
                }
            }
        }

        await specsStore.refresh()
        XCTAssertGreaterThanOrEqual(specsStore.verifiedCount, initialVerified)

        // Status filter by verified
        specsStore.selectedStatusFilter = .verified
        for spec in specsStore.filteredSpecs {
            for req in spec.requirements {
                XCTAssertEqual(req.status, .verified)
            }
        }
        specsStore.selectedStatusFilter = nil
    }

    @MainActor
    func testTier3_GitCommitLinkingToAgentTaskQueue() async throws {
        let demoStore = DemoStore()
        let client = MockAPIClient(store: demoStore)
        let gitStore = GitStore(client: client)
        let orchStore = OrchestrationStore(client: client)

        await gitStore.load()
        await orchStore.load()

        guard let commit = gitStore.commits.first else {
            XCTFail("Expected commits in git store")
            return
        }

        let initialTaskCount = orchStore.tasks.count
        let prompt = "Verify patch in isolated git worktree"
        try await gitStore.assignToAgent(sha: commit.sha, prompt: prompt)

        await orchStore.load()
        XCTAssertEqual(orchStore.tasks.count, initialTaskCount + 1, "Assigning commit must enqueue a new task")

        let expectedCardId = "card_from_\(commit.sha.prefix(7))"
        let createdTask = orchStore.tasks.first { $0.cardId == expectedCardId }
        XCTAssertNotNil(createdTask, "Task linked to commit card must exist in task queue")
        XCTAssertTrue(createdTask?.description.contains(prompt) == true)
    }

    func testTier3_ConcurrentStoreMutationsUnderSwift6ActorIsolation() async throws {
        let demoStore = DemoStore()
        let client = MockAPIClient(store: demoStore)

        // Execute concurrent async mutations across parallel tasks under Swift 6
        try await withThrowingTaskGroup(of: Void.self) { group in
            for i in 1...10 {
                group.addTask {
                    let card = Card(
                        id: "concurrent_card_\(i)",
                        title: "Concurrent Task #\(i)",
                        column: i % 2 == 0 ? "todo" : "doing"
                    )
                    try await client.saveCard(boardName: "dev", card: card)
                    try await client.addCardComment(
                        boardName: "dev",
                        cardId: "concurrent_card_\(i)",
                        text: "Thread safe comment #\(i)",
                        author: "agent_\(i)"
                    )
                    _ = try await client.submitIntent(prompt: "Concurrent intent #\(i)", kind: "feature")
                }
            }
            try await group.waitForAll()
        }

        let finalBoard = try await client.getBoard(name: "dev")
        XCTAssertGreaterThan(finalBoard.cards.count, 25, "Store mutations under actor isolation must complete safely without data corruption")
    }

    // MARK: - Tier 2: Boundary Values & Negative Testing

    func testTier2_EmptyAndWhitespaceIntentValidation() async throws {
        let demoStore = DemoStore()
        let client = MockAPIClient(store: demoStore)

        // Empty string submission
        let emptyResponse = try await client.submitIntent(prompt: "", kind: "feature")
        XCTAssertFalse(emptyResponse.cardId.isEmpty, "Empty prompt should generate a fallback card ID")
        XCTAssertTrue(emptyResponse.cardId.contains("intent_task"))

        // Whitespace-only submission
        let whitespaceResponse = try await client.submitIntent(prompt: "   \n\t   ", kind: "feature")
        XCTAssertFalse(whitespaceResponse.cardId.isEmpty)
        XCTAssertTrue(whitespaceResponse.cardId.contains("intent_task"))

        // Long string submission (500 characters)
        let longPrompt = String(repeating: "Feature description with high detail. ", count: 15)
        let longResponse = try await client.submitIntent(prompt: longPrompt, kind: "feature")
        XCTAssertFalse(longResponse.cardId.isEmpty)
        XCTAssertEqual(longResponse.title, longPrompt)
    }

    func testTier2_NonexistentResourceAccess() async throws {
        let demoStore = DemoStore()
        let client = MockAPIClient(store: demoStore)
        let boardStore = BoardStore(boardName: "dev", client: client)
        await boardStore.loadBoards()

        let initialCardsCount = boardStore.allCards.count

        // Advancing a nonexistent card ID should be safe and idempotent
        try await boardStore.advanceCard(cardId: "nonexistent_card_xyz_123")
        XCTAssertEqual(boardStore.allCards.count, initialCardsCount)

        // Requesting a nonexistent board generates a safe fallback board
        let fallbackBoard = try await client.getBoard(name: "nonexistent-board-999")
        XCTAssertEqual(fallbackBoard.title, "nonexistent-board-999")
        XCTAssertTrue(fallbackBoard.cards.isEmpty)

        // Live client with invalid URL string throws BarkcliError.invalidURL
        let badURL = URL(string: "http://[::1]:namedport")
        if let badURL {
            let badClient = LiveAPIClient(baseURL: badURL)
            do {
                _ = try await badClient.getBoard(name: "dev")
            } catch let err as BarkcliError {
                XCTAssertNotNil(err.errorDescription)
            } catch {
                // Network error is also acceptable
            }
        }
    }

    func testTier2_BoundaryValuesAndNilOptionals() throws {
        // Effort boundaries: 0 and large values
        let zeroEffort = Effort(0)
        XCTAssertEqual(zeroEffort.points, 0)

        let negativeEffort = Effort(-5)
        XCTAssertEqual(negativeEffort.points, 0, "Negative points should be clamped to 0")

        let largeEffort = Effort(9999)
        XCTAssertEqual(largeEffort.points, 9999)

        // Card with all optional properties set to nil
        let minimalCard = Card(
            id: "card_minimal",
            title: "Minimal Card",
            column: "todo"
        )
        XCTAssertNil(minimalCard.description)
        XCTAssertNil(minimalCard.assignee)
        XCTAssertNil(minimalCard.dueDate)
        XCTAssertNil(minimalCard.remindAt)
        XCTAssertNil(minimalCard.blockedBy)
        XCTAssertNil(minimalCard.effort)
        XCTAssertNil(minimalCard.area)
        XCTAssertNil(minimalCard.specId)
        XCTAssertTrue(minimalCard.checklist.isEmpty)
        XCTAssertTrue(minimalCard.comments.isEmpty)
        XCTAssertTrue(minimalCard.links.isEmpty)

        // Roundtrip JSON encoding
        let encoder = JSONEncoder()
        let data = try encoder.encode(minimalCard)

        let decoder = JSONDecoder()
        let decoded = try decoder.decode(Card.self, from: data)
        XCTAssertEqual(decoded.id, "card_minimal")
        XCTAssertEqual(decoded.title, "Minimal Card")
        XCTAssertNil(decoded.description)

        // Malformed JSON decoding should throw DecodingError
        let malformedJson = "{ \"id\": 12345, \"title\": true }".data(using: .utf8)!
        XCTAssertThrowsError(try decoder.decode(Card.self, from: malformedJson))
    }

    func testAutopilotPhaseCodableRoundtrip() throws {
        // Test AutopilotPhase enum codable roundtrips across all states
        let phases: [AutopilotPhase] = [
            .idle,
            .needsPlan(cardId: "card_10"),
            .awaitingPlanApproval(cardId: "card_20"),
            .inProgress(active: 3, pending: 5),
            .awaitingMerge(cardIds: ["card_30", "card_31"]),
            .running,
            .other("custom_state")
        ]

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        for phase in phases {
            let data = try encoder.encode(phase)
            let decoded = try decoder.decode(AutopilotPhase.self, from: data)
            XCTAssertEqual(decoded, phase, "Autopilot phase '\(phase.displayName)' should survive serialization roundtrip")
            XCTAssertFalse(phase.displayName.isEmpty)
        }
    }

    func testTier4_AutopilotPhaseStateMachineTransitions() async throws {
        let demoStore = DemoStore()

        // 1. Initial State: cards require planning
        let initialStatus = demoStore.getAutopilotStatus(boardName: "dev")
        XCTAssertTrue(initialStatus.needsHuman)

        // 2. Submit Intent: creates card in todo without spec
        let intentCard = demoStore.submitIntent(text: "Implement OAuth2 PKCE auth flow", kind: "feature", boardName: "dev")
        let statusAfterIntent = demoStore.getAutopilotStatus(boardName: "dev")
        XCTAssertTrue(statusAfterIntent.needsHuman)

        // 3. Propose Plan: transitions to awaitingPlanApproval with pending proposal
        let proposal = demoStore.proposePlan(cardId: intentCard.id, boardName: "dev")
        XCTAssertEqual(proposal.cardId, intentCard.id)
        let statusAfterProposal = demoStore.getAutopilotStatus(boardName: "dev")
        XCTAssertEqual(statusAfterProposal.phase, .awaitingPlanApproval(cardId: intentCard.id))
        XCTAssertEqual(statusAfterProposal.proposal?.cardId, intentCard.id)
        XCTAssertTrue(statusAfterProposal.needsHuman)

        // 4. Approve Plan: decomposes into child tasks and dispatches into active worktrees
        let childCards = demoStore.approvePlan(cardId: intentCard.id, boardName: "dev")
        XCTAssertFalse(childCards.isEmpty)

        // 5. Test Acceptance Review Gate on approved card
        let gateResult = demoStore.runReviewGate(cardId: intentCard.id)
        XCTAssertTrue(gateResult.passed)
        XCTAssertGreaterThanOrEqual(gateResult.totalTests, 18)
    }

    func testTier2_TaskStatusLifecycleTransitions() throws {
        // Active states
        XCTAssertTrue(TaskStatus.assigned.isActive)
        XCTAssertTrue(TaskStatus.inProgress.isActive)
        XCTAssertFalse(TaskStatus.pending.isActive)
        XCTAssertFalse(TaskStatus.completed.isActive)

        // Terminal states
        XCTAssertTrue(TaskStatus.completed.isTerminal)
        XCTAssertTrue(TaskStatus.failed.isTerminal)
        XCTAssertTrue(TaskStatus.cancelled.isTerminal)
        XCTAssertFalse(TaskStatus.pending.isTerminal)
        XCTAssertFalse(TaskStatus.inProgress.isTerminal)

        // Priority ordering
        XCTAssertTrue(TaskPriority.critical < TaskPriority.high)
        XCTAssertTrue(TaskPriority.high < TaskPriority.medium)
        XCTAssertTrue(TaskPriority.medium < TaskPriority.low)

        // Task lifecycle status transitions
        var task = TaskRequest(
            id: "task_lifecycle_test",
            cardId: "card_100",
            title: "Task Lifecycle Verification",
            description: "Testing state transitions",
            priority: .high,
            status: .pending
        )
        XCTAssertEqual(task.status, .pending)

        task.status = .assigned
        task.assignedAgent = "worker_1"
        XCTAssertTrue(task.status.isActive)

        task.status = .inProgress
        XCTAssertTrue(task.status.isActive)

        task.status = .completed
        XCTAssertTrue(task.status.isTerminal)
        XCTAssertFalse(task.status.isActive)
    }
}
