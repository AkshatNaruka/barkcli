import XCTest
@testable import Barkcli

@MainActor
final class SubsystemStoreTests: XCTestCase {

    // MARK: SprintStore Tests

    func testSprintStoreLifecycleAndCalculations() async throws {
        let store = SprintStore(client: MockAPIClient())

        XCTAssertTrue(store.sprints.isEmpty)
        XCTAssertNil(store.activeSprint)

        await store.loadSprints()

        XCTAssertFalse(store.sprints.isEmpty)
        XCTAssertNotNil(store.activeSprint)
        XCTAssertGreaterThan(store.totalEffortPlanned, 0)
        XCTAssertGreaterThanOrEqual(store.totalEffortCompleted, 0)
        XCTAssertGreaterThanOrEqual(store.completionPercentage, 0.0)

        store.searchQuery = "Agent"
        let filtered = store.filteredSprints
        XCTAssertFalse(filtered.isEmpty)

        let initialCount = store.sprints.count
        let created = try await store.createSprint(
            name: "Sprint 4",
            goal: "Verification and acceptance gates",
            start: "2026 11 01",
            end: "2026 11 15"
        )
        XCTAssertEqual(created.name, "Sprint 4")
        XCTAssertEqual(store.sprints.count, initialCount + 1)
        XCTAssertEqual(store.sprints.first?.id, created.id)
    }

    // MARK: CodeStore Tests

    func testCodeStoreSearchAndCardLinking() async throws {
        let store = CodeStore(client: MockAPIClient())

        XCTAssertTrue(store.symbols.isEmpty)

        await store.search(query: "")

        XCTAssertFalse(store.symbols.isEmpty)
        XCTAssertFalse(store.availableLanguages.isEmpty)
        XCTAssertFalse(store.availableKinds.isEmpty)

        store.searchQuery = "gate"
        XCTAssertFalse(store.filteredSymbols.isEmpty)

        if let firstSymbol = store.symbols.first {
            try await store.linkSymbolToCard(symbolId: firstSymbol.id, cardId: "dev_99")
            let updated = store.symbols.first(where: { $0.id == firstSymbol.id })
            XCTAssertEqual(updated?.linkedCardId, "dev_99")
        }
    }

    // MARK: ContextMemoryStore Tests

    func testContextMemoryStoreDigestAndFacts() async throws {
        let store = ContextMemoryStore(client: MockAPIClient())

        XCTAssertTrue(store.facts.isEmpty)
        XCTAssertTrue(store.memories.isEmpty)

        await store.loadAll()

        XCTAssertFalse(store.livingContext.sections.isEmpty)
        XCTAssertFalse(store.facts.isEmpty)
        XCTAssertFalse(store.memories.isEmpty)

        store.searchQuery = "Rust"
        XCTAssertFalse(store.filteredFacts.isEmpty)

        await store.refreshDigest()
        XCTAssertFalse(store.livingContext.rawMarkdown.isEmpty)

        let factsCount = store.facts.count
        try await store.addFact(fact: "Isolated worktrees preserve build hygiene", category: "architecture")
        XCTAssertEqual(store.facts.count, factsCount + 1)

        let memCount = store.memories.count
        try await store.addMemory(content: "Tests must pass acceptance gate", tier: .working)
        XCTAssertEqual(store.memories.count, memCount + 1)
    }

    // MARK: BrainStore Tests

    func testBrainStoreGraphAndDegree() async {
        let store = BrainStore(client: MockAPIClient())

        XCTAssertTrue(store.graph.nodes.isEmpty)
        XCTAssertTrue(store.graph.edges.isEmpty)

        await store.loadGraph()

        XCTAssertFalse(store.graph.nodes.isEmpty)
        XCTAssertFalse(store.graph.edges.isEmpty)
        XCTAssertFalse(store.categories.isEmpty)

        store.selectedCategory = store.categories.first
        XCTAssertFalse(store.filteredNodes.isEmpty)

        if let node = store.graph.nodes.first {
            store.selectedNodeId = node.id
            XCTAssertEqual(store.selectedNode?.id, node.id)

            let edges = store.edgesForNode(node.id)
            XCTAssertGreaterThanOrEqual(edges.count, 0)
        }
    }

    // MARK: SkillsStore Tests

    func testSkillsStoreRegistryAndToggle() async {
        let store = SkillsStore(client: MockAPIClient())

        XCTAssertTrue(store.skills.isEmpty)

        await store.loadSkills()

        XCTAssertFalse(store.skills.isEmpty)
        XCTAssertGreaterThan(store.installedCount, 0)
        XCTAssertFalse(store.availableTags.isEmpty)

        store.showInstalledOnly = true
        let installed = store.filteredSkills
        XCTAssertTrue(installed.allSatisfy(\.installed))

        if let firstSkill = store.skills.first {
            let priorStatus = firstSkill.installed
            await store.toggleInstall(skillId: firstSkill.id)
            let toggled = store.skills.first(where: { $0.id == firstSkill.id })
            XCTAssertEqual(toggled?.installed, !priorStatus)
        }
    }

    // MARK: DocsStore Tests

    func testDocsStoreCategoriesAndSelection() async {
        let store = DocsStore(client: MockAPIClient())

        XCTAssertTrue(store.docs.isEmpty)

        await store.loadDocs()

        XCTAssertFalse(store.docs.isEmpty)
        XCTAssertNotNil(store.selectedDoc)
        XCTAssertFalse(store.categories.isEmpty)

        store.selectedCategory = store.categories.first
        XCTAssertFalse(store.filteredDocs.isEmpty)

        store.selectedCategory = nil
        store.searchQuery = "Architecture"
        XCTAssertFalse(store.filteredDocs.isEmpty)
    }

    // MARK: CalendarStore Tests

    func testCalendarStoreAgendaPartitions() async {
        let store = CalendarStore(client: MockAPIClient())

        XCTAssertTrue(store.agendaItems.isEmpty)

        await store.loadAgenda()

        XCTAssertFalse(store.agendaItems.isEmpty)
        XCTAssertFalse(store.overdueItems.isEmpty)
        XCTAssertFalse(store.todayItems.isEmpty)
        XCTAssertFalse(store.upcomingItems.isEmpty)

        store.selectedFilter = "overdue"
        XCTAssertTrue(store.filteredItems.allSatisfy(\.isOverdue))

        store.selectedFilter = "today"
        XCTAssertTrue(store.filteredItems.allSatisfy(\.isToday))

        store.selectedFilter = "upcoming"
        XCTAssertTrue(store.filteredItems.allSatisfy { !$0.isOverdue && !$0.isToday })
    }

    // MARK: ReportsStore Tests

    func testReportsStoreMetricsAndBreakdowns() async {
        let store = ReportsStore(client: MockAPIClient())

        await store.loadReports()

        XCTAssertGreaterThan(store.totalEffort, 0)
        XCTAssertGreaterThan(store.totalCards, 0)
        XCTAssertGreaterThan(store.metrics.completionVelocity, 0.0)
        XCTAssertGreaterThan(store.metrics.cycleTimeDays, 0.0)
        XCTAssertGreaterThan(store.metrics.throughputPerWeek, 0.0)
    }

    // MARK: TimelineStore Tests

    func testTimelineStoreCheckpointsAndDoctorDiagnostics() async throws {
        let store = TimelineStore(client: MockAPIClient())

        XCTAssertTrue(store.checkpoints.isEmpty)
        XCTAssertTrue(store.doctorIssues.isEmpty)

        await store.loadTimeline()

        XCTAssertFalse(store.checkpoints.isEmpty)
        XCTAssertFalse(store.doctorIssues.isEmpty)
        XCTAssertGreaterThan(store.unfixedIssuesCount, 0)

        let initialCount = store.checkpoints.count
        let created = try await store.createCheckpoint(description: "Pre deploy snapshot")
        XCTAssertEqual(store.checkpoints.count, initialCount + 1)
        XCTAssertEqual(store.checkpoints.first?.id, created.id)

        try await store.restoreCheckpoint(id: created.id)

        await store.fixDoctorIssues()
        XCTAssertEqual(store.unfixedIssuesCount, 0)
        XCTAssertTrue(store.doctorIssues.allSatisfy(\.fixed))
    }

    // MARK: LiveAPIClient Subsystem Contract Tests

    func testLiveAPIClientSubsystemsCoverage() async throws {
        let client = LiveAPIClient(baseURL: URL(string: "http://127.0.0.1:4321")!)

        let sprints = try await client.listSprints()
        XCTAssertFalse(sprints.isEmpty)

        let symbols = try await client.searchCode(query: "gate")
        XCTAssertFalse(symbols.isEmpty)

        let context = try await client.getLivingContext()
        XCTAssertFalse(context.sections.isEmpty)

        let facts = try await client.listProjectFacts()
        XCTAssertFalse(facts.isEmpty)

        let graph = try await client.getBrainGraph()
        XCTAssertFalse(graph.nodes.isEmpty)

        let skills = try await client.listSkills()
        XCTAssertFalse(skills.isEmpty)

        let docs = try await client.listDocs()
        XCTAssertFalse(docs.isEmpty)

        let agenda = try await client.getAgenda()
        XCTAssertFalse(agenda.isEmpty)

        let reports = try await client.getReportMetrics()
        XCTAssertGreaterThan(reports.completionVelocity, 0.0)

        let checkpoints = try await client.listCheckpoints()
        XCTAssertFalse(checkpoints.isEmpty)

        let doctor = try await client.runDoctor()
        XCTAssertFalse(doctor.isEmpty)
    }
}
