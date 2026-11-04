import XCTest
@testable import Barkcli

final class ReviewQueueTests: XCTestCase {
    func testReviewQueueFiltersCardsInReview() async throws {
        let store = BoardStore(client: MockAPIClient(store: DemoStore()))
        await store.loadBoard(name: "dev")

        let reviewCards = store.cardsInReview
        XCTAssertFalse(reviewCards.isEmpty, "Mock/demo board dev should have cards in review column")
        for card in reviewCards {
            XCTAssertEqual(card.column.lowercased(), "review")
        }
    }

    func testApproveReviewCardMovesToDone() async throws {
        let store = BoardStore(client: MockAPIClient(store: DemoStore()))
        await store.loadBoard(name: "dev")

        guard let firstReview = store.cardsInReview.first else {
            XCTFail("Expected at least one card in review column")
            return
        }

        let cardId = firstReview.id
        await store.approveReviewCard(cardId)

        // After approval, card should not be in review
        let stillInReview = store.cardsInReview.contains(where: { $0.id == cardId })
        XCTAssertFalse(stillInReview, "Approved card should be moved out of review column")
    }

    func testRequestChangesMovesCardBackToDoing() async throws {
        let store = BoardStore(client: MockAPIClient(store: DemoStore()))
        await store.loadBoard(name: "dev")

        guard let firstReview = store.cardsInReview.first else {
            XCTFail("Expected at least one card in review column")
            return
        }

        let cardId = firstReview.id
        await store.requestChangesForCard(cardId, reason: "Please add unit tests for error boundary")

        // Card should be moved back to doing
        let cardAfter = store.allCards.first(where: { $0.id == cardId })
        XCTAssertEqual(cardAfter?.column, "doing")
    }
}
