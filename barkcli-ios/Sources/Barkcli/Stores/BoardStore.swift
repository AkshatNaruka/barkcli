import Foundation
import Observation

/// Observable state store powering the Kanban Board view and card operations.
/// Manages columns, cards, interactive drag-and-drop transitions, WIP limits,
/// text/priority/label filtering, and card metadata editing.
@Observable
public final class BoardStore: @unchecked Sendable {
    public static let shared = BoardStore()

    // MARK: - Published State
    public var boardName: String
    public var board: Board?
    public var availableBoards: [String]
    public var isLoading: Bool
    public var isMovingCard: Bool
    public var searchQuery: String
    public var selectedPriorityFilter: Priority?
    public var selectedLabelFilter: String?
    public var selectedColumnTab: String
    public var lastError: String?

    // MARK: - Active API Client
    public var client: any APIClientProtocol

    // MARK: - Initializer
    public init(
        boardName: String = "dev",
        client: (any APIClientProtocol)? = nil
    ) {
        self.boardName = boardName
        self.client = client ?? MockAPIClient()
        self.board = nil
        self.availableBoards = []
        self.isLoading = false
        self.isMovingCard = false
        self.searchQuery = ""
        self.selectedPriorityFilter = nil
        self.selectedLabelFilter = nil
        self.selectedColumnTab = "all"
        self.lastError = nil
    }

    // MARK: - Computed Properties
    public var columns: [Column] {
        if let cols = board?.columns, !cols.isEmpty {
            return cols
        }
        return [
            Column(id: "todo", name: "Todo", wipLimit: 10),
            Column(id: "doing", name: "Doing", wipLimit: 3),
            Column(id: "review", name: "Review", wipLimit: 5),
            Column(id: "done", name: "Done", wipLimit: nil)
        ]
    }

    public var allCards: [Card] {
        board?.cards ?? []
    }

    public var filteredCards: [Card] {
        allCards.filter { card in
            // Search query filter (title, ID, description)
            if !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                let query = searchQuery.lowercased()
                let titleMatch = card.title.lowercased().contains(query)
                let idMatch = card.id.lowercased().contains(query)
                let descMatch = card.description?.lowercased().contains(query) ?? false
                let labelMatch = card.labels.contains { $0.lowercased().contains(query) }
                if !(titleMatch || idMatch || descMatch || labelMatch) {
                    return false
                }
            }

            // Priority filter
            if let filter = selectedPriorityFilter, card.priority != filter {
                return false
            }

            // Label filter
            if let label = selectedLabelFilter, !card.labels.contains(label) {
                return false
            }

            // Column tab filter
            if selectedColumnTab != "all" && card.column.lowercased() != selectedColumnTab.lowercased() {
                return false
            }

            return true
        }
    }

    public func cardsInColumn(_ colId: String) -> [Card] {
        allCards.filter { $0.column.lowercased() == colId.lowercased() }
    }

    public func filteredCardsInColumn(_ colId: String) -> [Card] {
        filteredCards.filter { $0.column.lowercased() == colId.lowercased() }
    }

    public func countForColumn(_ colId: String) -> Int {
        if colId == "all" {
            return allCards.count
        }
        return cardsInColumn(colId).count
    }

    public func isWIPLimitExceeded(for colId: String) -> Bool {
        guard let col = columns.first(where: { $0.id.lowercased() == colId.lowercased() }),
              let limit = col.wipLimit else {
            return false
        }
        return countForColumn(colId) > limit
    }

    public var wipViolations: [String: (count: Int, limit: Int)] {
        var violations: [String: (count: Int, limit: Int)] = [:]
        for col in columns {
            if let limit = col.wipLimit {
                let count = countForColumn(col.id)
                if count > limit {
                    violations[col.id] = (count: count, limit: limit)
                }
            }
        }
        return violations
    }

    // MARK: - Board Operations
    public func loadBoards() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let boards = try await client.listBoards()
            self.availableBoards = boards
            if !boards.isEmpty && !boards.contains(boardName) {
                self.boardName = boards[0]
            }
            await loadBoard(name: boardName)
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    public func loadBoard(name: String) async {
        self.boardName = name
        do {
            let loaded = try await client.getBoard(name: name)
            self.board = loaded
            self.lastError = nil
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    public func switchBoard(name: String) async {
        await loadBoard(name: name)
    }

    // MARK: - Card Mutations
    public func moveCard(cardId: String, toColumn: String) async throws {
        isMovingCard = true
        defer { isMovingCard = false }

        // Optimistic local update
        if var b = board, let idx = b.cards.firstIndex(where: { $0.id == cardId }) {
            b.cards[idx].column = toColumn
            self.board = b
        }

        do {
            try await client.moveCard(boardName: boardName, cardId: cardId, toColumn: toColumn)
            // Reload to confirm authoritative server state
            await loadBoard(name: boardName)
        } catch {
            self.lastError = error.localizedDescription
            await loadBoard(name: boardName)
            throw error
        }
    }

    public func advanceCard(cardId: String) async throws {
        guard let card = allCards.first(where: { $0.id == cardId }) else { return }
        let currentColId = card.column.lowercased()
        guard let currentIndex = columns.firstIndex(where: { $0.id.lowercased() == currentColId }) else { return }

        let nextIndex = currentIndex + 1
        if nextIndex < columns.count {
            let nextCol = columns[nextIndex].id
            try await moveCard(cardId: cardId, toColumn: nextCol)
        }
    }

    public func saveCard(_ card: Card) async throws {
        // Optimistic local update
        if var b = board {
            if let idx = b.cards.firstIndex(where: { $0.id == card.id }) {
                b.cards[idx] = card
            } else {
                b.cards.append(card)
            }
            self.board = b
        }

        do {
            try await client.saveCard(boardName: boardName, card: card)
            await loadBoard(name: boardName)
        } catch {
            self.lastError = error.localizedDescription
            await loadBoard(name: boardName)
            throw error
        }
    }

    public func deleteCard(cardId: String) async throws {
        guard var b = board else { return }
        b.cards.removeAll { $0.id == cardId }
        self.board = b

        do {
            try await client.saveBoard(b, name: boardName)
        } catch {
            self.lastError = error.localizedDescription
            await loadBoard(name: boardName)
            throw error
        }
    }

    public func toggleChecklistItem(cardId: String, itemIndex: Int) async throws {
        guard var card = allCards.first(where: { $0.id == cardId }) else { return }
        guard itemIndex >= 0 && itemIndex < card.checklist.count else { return }

        card.checklist[itemIndex].done.toggle()
        try await saveCard(card)
    }

    public func addComment(cardId: String, text: String, author: String = "human") async throws {
        guard var card = allCards.first(where: { $0.id == cardId }) else { return }
        let comment = CardComment(author: author, text: text, at: Date())
        card.comments.append(comment)
        try await saveCard(card)
    }

    @discardableResult
    public func addCard(
        title: String,
        column: String = "todo",
        priority: Priority = .medium,
        description: String? = nil,
        effort: Int? = 1,
        labels: [String] = []
    ) async throws -> Card {
        let newId = "card-\(UUID().uuidString.prefix(8).lowercased())"
        let newCard = Card(
            id: newId,
            title: title,
            column: column,
            description: description,
            priority: priority,
            labels: labels,
            effort: effort != nil ? Effort(effort!) : nil
        )

        try await saveCard(newCard)
        return newCard
    }
}
