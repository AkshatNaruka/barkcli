import XCTest
import SwiftUI
@testable import Barkcli

final class StoreTests: XCTestCase {

    // MARK: - WorkspaceStore Tests

    func testWorkspaceStoreDemoModeAndSwitching() async {
        let store = WorkspaceStore(initialMode: .demoMode)

        XCTAssertEqual(store.connectionMode, .demoMode)
        XCTAssertEqual(store.currentWorkspace.name, "Demo Workspace")
        XCTAssertEqual(store.availableWorkspaces.count, 3)

        // Health check in demo mode returns true with 0ms latency
        let healthy = await store.checkHealth()
        XCTAssertTrue(healthy)
        XCTAssertEqual(store.lastLatencyMs, 0)
        XCTAssertEqual(store.connectionState, .demoMode)

        // Adding and removing workspace
        store.addWorkspace(name: "Staging Cluster", host: "10.0.0.5", port: 4321, isRemote: true)
        XCTAssertTrue(store.availableWorkspaces.contains(where: { $0.name == "Staging Cluster" }))

        store.removeWorkspace(id: "Staging Cluster")
        XCTAssertFalse(store.availableWorkspaces.contains(where: { $0.name == "Staging Cluster" }))

        // Network scanning in demo mode populates local discovered instances
        await store.scanForInstances()
        XCTAssertFalse(store.discoveredInstances.isEmpty)
        XCTAssertEqual(store.discoveredInstances[0].port, 4321)

        // Switching back to demo mode restores clean demo state
        store.switchToDemo()
        XCTAssertEqual(store.connectionMode, .demoMode)
        XCTAssertFalse(store.needsAutoInit)
    }

    func testWorkspaceStoreAutoInitFlow() async throws {
        let mockClient = MockAPIClient()
        let store = WorkspaceStore(client: mockClient, initialMode: .connected)

        let options = AutoInitOptions(
            boardName: "m3-init-board",
            columns: ["todo", "doing", "review", "done"],
            createSampleCard: true
        )

        let result = try await store.triggerAutoInit(options: options)
        XCTAssertTrue(result.initialized)
        XCTAssertFalse(store.needsAutoInit)
        XCTAssertNil(store.lastError)
    }

    // MARK: - MindStore Tests

    func testMindStoreSnapshotAndDerivedMetrics() async {
        let mockClient = MockAPIClient()
        let store = MindStore(client: mockClient)

        await store.refresh()

        XCTAssertNotNil(store.snapshot)
        XCTAssertGreaterThan(store.healthScore, 0.0)
        XCTAssertGreaterThanOrEqual(store.velocity.totalDone, 0)
        XCTAssertNotNil(store.lastRefreshed)
        XCTAssertNil(store.lastError)

        // Test markdown digest generation
        let digest = store.exportMarkdownDigest()
        XCTAssertTrue(digest.contains("# barkcli Project Mind Digest"))
        XCTAssertTrue(digest.contains("Health Score:"))
        XCTAssertTrue(digest.contains("Velocity:"))
        XCTAssertTrue(digest.contains("Autopilot Phase:"))
    }

    func testMindStoreAutopilotIntentWorkflow() async throws {
        let mockClient = MockAPIClient()
        let store = MindStore(client: mockClient)

        // Submit intent to create card and proposal
        let response = try await store.submitIntent(prompt: "Add biometrics faceID authentication")
        XCTAssertFalse(response.cardId.isEmpty)
        XCTAssertEqual(response.status, "created")

        // Refresh to populate autopilot state
        await store.refresh()
        XCTAssertNotNil(store.autopilotStatus)

        // If there is an active proposal, approve and reject should execute cleanly
        if store.activeProposal != nil {
            try await store.approveActiveProposal()
            XCTAssertNil(store.lastError)
        }
    }

    // MARK: - BoardStore Tests

    func testBoardStoreColumnsAndWIPLimits() async {
        let mockClient = MockAPIClient()
        let store = BoardStore(boardName: "dev", client: mockClient)

        await store.loadBoards()

        XCTAssertNotNil(store.board)
        XCTAssertFalse(store.columns.isEmpty)
        XCTAssertFalse(store.allCards.isEmpty)

        // Check columns contain standard workflow
        let columnIds = store.columns.map { $0.id.lowercased() }
        XCTAssertTrue(columnIds.contains("todo"))
        XCTAssertTrue(columnIds.contains("doing"))
        XCTAssertTrue(columnIds.contains("done"))

        // Count for columns
        let allCount = store.countForColumn("all")
        XCTAssertEqual(allCount, store.allCards.count)

        // WIP limit calculations
        let violations = store.wipViolations
        for (colId, violation) in violations {
            XCTAssertGreaterThan(violation.count, violation.limit)
            XCTAssertTrue(store.isWIPLimitExceeded(for: colId))
        }
    }

    func testBoardStoreFilteringAndSearch() async {
        let mockClient = MockAPIClient()
        let store = BoardStore(boardName: "dev", client: mockClient)

        await store.loadBoards()
        let totalCount = store.allCards.count
        XCTAssertGreaterThan(totalCount, 0)

        // Search by card ID or keyword
        if let firstCard = store.allCards.first {
            store.searchQuery = firstCard.id
            XCTAssertTrue(store.filteredCards.contains(where: { $0.id == firstCard.id }))
        }

        // Search by nonexistent term yields empty
        store.searchQuery = "nonexistent_query_term_12345"
        XCTAssertEqual(store.filteredCards.count, 0)

        // Clear search
        store.searchQuery = ""
        XCTAssertEqual(store.filteredCards.count, totalCount)

        // Filter by Priority
        store.selectedPriorityFilter = .critical
        for card in store.filteredCards {
            XCTAssertEqual(card.priority, .critical)
        }
        store.selectedPriorityFilter = nil

        // Filter by Column Tab
        store.selectedColumnTab = "doing"
        for card in store.filteredCards {
            XCTAssertEqual(card.column.lowercased(), "doing")
        }
    }

    func testBoardStoreCardMutations() async throws {
        let mockClient = MockAPIClient()
        let store = BoardStore(boardName: "dev", client: mockClient)
        await store.loadBoards()

        // 1. Add a new card
        let newCard = try await store.addCard(
            title: "Worker M3 Comprehensive Test Card",
            column: "todo",
            priority: .high,
            description: "Testing end to end card mutations in BoardStore",
            effort: 5,
            labels: ["m3", "ios-test"]
        )

        XCTAssertTrue(store.allCards.contains(where: { $0.id == newCard.id }))

        // 2. Move card from todo to doing
        try await store.moveCard(cardId: newCard.id, toColumn: "doing")
        let movedCard = store.allCards.first(where: { $0.id == newCard.id })
        XCTAssertEqual(movedCard?.column.lowercased(), "doing")

        // 3. Advance card to next column (review)
        try await store.advanceCard(cardId: newCard.id)
        let advancedCard = store.allCards.first(where: { $0.id == newCard.id })
        XCTAssertEqual(advancedCard?.column.lowercased(), "review")

        // 4. Add a comment
        try await store.addComment(cardId: newCard.id, text: "Verification comment added by M3", author: "worker_m3")
        let commentedCard = store.allCards.first(where: { $0.id == newCard.id })
        XCTAssertTrue(commentedCard?.comments.contains(where: { $0.text == "Verification comment added by M3" }) ?? false)

        // 5. Delete card
        try await store.deleteCard(cardId: newCard.id)
        XCTAssertFalse(store.allCards.contains(where: { $0.id == newCard.id }))
    }

    // MARK: Theme and Design System Tokens Tests

    func testThemeTokensAndTypography() {
        // Pitch zinc developer tokens
        XCTAssertEqual(BarkcliColors.canvas, Color(hex: 0x09090B))
        XCTAssertEqual(BarkcliColors.cardBackground, Color(hex: 0x121215))
        XCTAssertEqual(BarkcliColors.cardSubtle, Color(hex: 0x18181B))
        XCTAssertEqual(BarkcliColors.border, Color(hex: 0x27272A))
        XCTAssertEqual(BarkcliColors.borderFocus, Color(hex: 0x3F3F46))

        // High contrast typography tokens
        XCTAssertEqual(BarkcliColors.textPrimary, Color(hex: 0xFAFAFA))
        XCTAssertEqual(BarkcliColors.textSecondary, Color(hex: 0xA1A1AA))
        XCTAssertEqual(BarkcliColors.textMuted, Color(hex: 0x71717A))

        // Discrete status indicators
        XCTAssertEqual(BarkcliColors.statusActive, Color(hex: 0x22C55E))
        XCTAssertEqual(BarkcliColors.statusWarning, Color(hex: 0xF59E0B))
        XCTAssertEqual(BarkcliColors.statusError, Color(hex: 0xEF4444))
        XCTAssertEqual(BarkcliColors.statusInfo, Color(hex: 0x0284C7))

        // Semantic aliases ensure purple elimination
        XCTAssertEqual(BarkcliColors.accentPurple, BarkcliColors.statusInfo)

        // Legacy compatibility tokens
        XCTAssertEqual(BarkcliColors.obsidianDark, Color(hex: 0x0A0A0E))
        XCTAssertEqual(BarkcliColors.spaceBlack, Color(hex: 0x12131A))
        XCTAssertEqual(BarkcliColors.slateGlass, Color(hex: 0x181924))
        XCTAssertEqual(BarkcliColors.borderHairline, Color(hex: 0x2E3142))

        // Color extensions
        XCTAssertEqual(Color.barkcliCanvas, BarkcliColors.canvas)
        XCTAssertEqual(Color.barkcliBorder, BarkcliColors.border)
        XCTAssertEqual(Color.barkcliTextPrimary, BarkcliColors.textPrimary)
        XCTAssertEqual(Color.barkcliStatusInfo, BarkcliColors.statusInfo)

        // StatusBadgeVariant tokens
        XCTAssertEqual(StatusBadgeVariant.emerald.foregroundColor, BarkcliColors.emeraldGate)
        XCTAssertEqual(StatusBadgeVariant.amber.foregroundColor, BarkcliColors.amberPulse)
        XCTAssertEqual(StatusBadgeVariant.crimson.foregroundColor, BarkcliColors.crimsonBlocker)
    }
}
