import XCTest
@testable import Barkcli

final class NavigationTests: XCTestCase {
    func testNavigationGroupingIncludesCoreLoop() {
        let coreTabs = TabGroup.coreLoop.tabs
        XCTAssertEqual(coreTabs, [.run, .review, .board, .mind])
        XCTAssertTrue(coreTabs.contains(.review), "Review Queue must be in the Core Loop")
    }

    func testAppNavigationTabReviewProperties() {
        let reviewTab = AppNavigationTab.review
        XCTAssertEqual(reviewTab.rawValue, "Review")
        XCTAssertEqual(reviewTab.iconName, "checkmark.shield.fill")
    }

    func testBoardStoreCardsInReview() async {
        let store = BoardStore.shared
        // Ensure cardsInReview property exists and returns cards with column == 'review'
        let inReview = store.cardsInReview
        for card in inReview {
            XCTAssertEqual(card.column.lowercased(), "review")
        }
    }
}
