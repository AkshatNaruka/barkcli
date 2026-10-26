import XCTest
@testable import Barkcli

final class ThreadStoreTests: XCTestCase {

    func testThreadModelCodableRoundtrip() throws {
        let event = ThreadEventItem(
            id: "evt_123",
            cardId: "card_abc",
            kind: .planProposed,
            author: "barkcli",
            text: "Proposed plan with child tasks",
            createdAt: "2026-10-26T12:00:00Z"
        )

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        let eventData = try encoder.encode(event)
        let decodedEvent = try decoder.decode(ThreadEventItem.self, from: eventData)
        XCTAssertEqual(decodedEvent.id, "evt_123")
        XCTAssertEqual(decodedEvent.kind, .planProposed)
        XCTAssertEqual(decodedEvent.author, "barkcli")

        let summary = ThreadSummaryItem(
            id: "card_abc",
            title: "Build user auth",
            statusGroup: "needs_you",
            eventCount: 4,
            updatedAt: "2026-10-26T12:05:00Z",
            column: "todo",
            backend: "opencode"
        )

        let summaryData = try encoder.encode(summary)
        let decodedSummary = try decoder.decode(ThreadSummaryItem.self, from: summaryData)
        XCTAssertEqual(decodedSummary.id, "card_abc")
        XCTAssertEqual(decodedSummary.statusGroup, "needs_you")
        XCTAssertEqual(decodedSummary.backend, "opencode")
    }

    func testThreadEventKindDecoding() throws {
        let json = """
        [
            "user",
            "assistant",
            "plan_proposed",
            "plan_approved",
            "task_spawned",
            "agent_output",
            "gate",
            "merge",
            "steer",
            "custom_kind"
        ]
        """
        let data = json.data(using: .utf8)!
        let kinds = try JSONDecoder().decode([ThreadEventKind].self, from: data)
        XCTAssertEqual(kinds.count, 10)
        XCTAssertEqual(kinds[0], .user)
        XCTAssertEqual(kinds[1], .assistant)
        XCTAssertEqual(kinds[2], .planProposed)
        XCTAssertEqual(kinds[3], .planApproved)
        XCTAssertEqual(kinds[4], .taskSpawned)
        XCTAssertEqual(kinds[5], .agentOutput)
        XCTAssertEqual(kinds[6], .gate)
        XCTAssertEqual(kinds[7], .merge)
        XCTAssertEqual(kinds[8], .steer)
        XCTAssertEqual(kinds[9], .custom)
    }

    func testThreadStoreStatusPartitions() async {
        let store = ThreadStore(client: MockAPIClient())
        store.threads = [
            ThreadSummaryItem(
                id: "c1",
                title: "Needs Review",
                statusGroup: "needs_you",
                eventCount: 1,
                updatedAt: "now",
                column: "review"
            ),
            ThreadSummaryItem(
                id: "c2",
                title: "Worker Active",
                statusGroup: "running",
                eventCount: 2,
                updatedAt: "now",
                column: "doing"
            ),
            ThreadSummaryItem(
                id: "c3",
                title: "Queued Feature",
                statusGroup: "features",
                eventCount: 1,
                updatedAt: "now",
                column: "todo"
            ),
            ThreadSummaryItem(
                id: "c4",
                title: "Settled Code",
                statusGroup: "settled",
                eventCount: 5,
                updatedAt: "now",
                column: "done"
            )
        ]

        XCTAssertEqual(store.needsYou.count, 1)
        XCTAssertEqual(store.needsYou.first?.id, "c1")

        XCTAssertEqual(store.running.count, 1)
        XCTAssertEqual(store.running.first?.id, "c2")

        XCTAssertEqual(store.features.count, 1)
        XCTAssertEqual(store.features.first?.id, "c3")

        XCTAssertEqual(store.settled.count, 1)
        XCTAssertEqual(store.settled.first?.id, "c4")
    }

    func testThreadStoreLoadAndSelect() async {
        let mock = MockAPIClient()
        let store = ThreadStore(client: mock)

        await store.loadThreads(board: "dev")
        XCTAssertFalse(store.threads.isEmpty)
        XCTAssertNotNil(store.selectedThreadId)
        XCTAssertNotNil(store.activeThreadDetail)
    }

    func testThreadStoreSendMessageAndDiff() async {
        let mock = MockAPIClient()
        let store = ThreadStore(client: mock)

        await store.loadThreads(board: "dev")
        guard let firstId = store.selectedThreadId else {
            XCTFail("Expected at least one thread")
            return
        }

        let initialEventCount = store.activeThreadDetail?.events.count ?? 0
        await store.sendMessage(id: firstId, text: "Clarify test criteria")
        let updatedCount = store.activeThreadDetail?.events.count ?? 0
        XCTAssertGreaterThanOrEqual(updatedCount, initialEventCount)

        let diff = await store.fetchDiff(taskId: firstId)
        XCTAssertNotNil(diff)
        XCTAssertTrue(diff?.hasDiff ?? false)
    }
}
