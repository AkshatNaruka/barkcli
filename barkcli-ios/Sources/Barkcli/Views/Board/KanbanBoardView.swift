import SwiftUI

/// Fluid, interactive multi column Kanban Board view for barkcli.
/// Features text search, priority filtering, column segment tabs,
/// WIP limit tracking, and instant card detail inspection.
public struct KanbanBoardView: View {
    @Environment(BoardStore.self) private var boardStore
    @State private var selectedCardForDetail: Card?
    @State private var showNewCardSheet: Bool = false
    @State private var newCardTitle: String = ""
    @State private var newCardColumn: String = "todo"
    @State private var newCardPriority: Priority = .medium
    @State private var newCardEffort: Int = 2

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            // Filter Header: Search Bar + Priority Filter Bar
                filterHeaderView

                // Column Tab Picker (All, Todo, Doing, Review, Done)
                columnTabBarView

                // Main Board Content
                if boardStore.filteredCards.isEmpty {
                    emptyBoardPlaceholder
                } else {
                    boardColumnsContentView
                }
            }
            .background(Color.barkcliObsidian.ignoresSafeArea())
            .navigationTitle(boardStore.board?.title ?? "Board")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Menu {
                        ForEach(boardStore.availableBoards, id: \.self) { boardName in
                            Button {
                                Task {
                                    await boardStore.switchBoard(name: boardName)
                                }
                            } label: {
                                HStack {
                                    Text(boardName)
                                    if boardName == boardStore.boardName {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Text(boardStore.boardName)
                                .font(BarkcliTypography.codeHash)
                                .foregroundColor(.barkcliTextPrimary)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.barkcliTextMuted)
                        }
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(Color.barkcliSpaceBlack))
                        .overlay(Capsule().strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5))
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showNewCardSheet = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 16))
                            .foregroundColor(.barkcliTextPrimary)
                    }
                }
            }
            .sheet(item: $selectedCardForDetail) { card in
                CardDetailSheet(card: card)
            }
            .sheet(isPresented: $showNewCardSheet) {
                newCardModal
            }
            .task {
                if boardStore.board == nil {
                    await boardStore.loadBoards()
                }
            }
    }

    // MARK: Filter Header
    private var filterHeaderView: some View {
        VStack(spacing: 8) {
            // Search Input Field
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextMuted)

                @Bindable var store = boardStore
                TextField("Search cards, IDs, specs, or labels...", text: $store.searchQuery)
                    .font(BarkcliTypography.bodyText)
                    .foregroundColor(.barkcliTextPrimary)
                    .textFieldStyle(.plain)

                if !boardStore.searchQuery.isEmpty {
                    Button {
                        boardStore.searchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 13))
                            .foregroundColor(.barkcliTextMuted)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 10).fill(Color.barkcliSpaceBlack))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5))

            // Priority Filter Scroll
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    priorityFilterPill(title: "All", priority: nil)
                    ForEach(Priority.allCases) { prio in
                        priorityFilterPill(title: prio.displayName, priority: prio)
                    }
                }
                .padding(.horizontal, 2)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    private func priorityFilterPill(title: String, priority: Priority?) -> some View {
        let isSelected = boardStore.selectedPriorityFilter == priority
        return Button {
            boardStore.selectedPriorityFilter = priority
        } label: {
            Text(title)
                .font(BarkcliTypography.badge)
                .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextMuted)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(isSelected ? Color.barkcliCardSubtle : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .strokeBorder(isSelected ? Color.barkcliBorderFocus : Color.barkcliBorder, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: Column Tab Bar
    private var columnTabBarView: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                columnTabPill(id: "all", name: "All Cards", count: boardStore.allCards.count)

                ForEach(boardStore.columns) { col in
                    let count = boardStore.countForColumn(col.id)
                    columnTabPill(id: col.id, name: col.name, count: count)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
        .background(Color.barkcliCardBackground)
    }

    private func columnTabPill(id: String, name: String, count: Int) -> some View {
        let isSelected = boardStore.selectedColumnTab.lowercased() == id.lowercased()
        return Button {
            boardStore.selectedColumnTab = id
        } label: {
            HStack(spacing: 5) {
                Text(name)
                    .font(BarkcliTypography.sectionHeader)
                Text("\(count)")
                    .font(BarkcliTypography.codeHash)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(RoundedRectangle(cornerRadius: 3, style: .continuous).fill(Color.barkcliCardSubtle))
            }
            .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextMuted)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(isSelected ? Color.barkcliCardSubtle : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .strokeBorder(isSelected ? Color.barkcliBorderFocus : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: Columns Content
    private var boardColumnsContentView: some View {
        ScrollView {
            VStack(spacing: 16) {
                if boardStore.selectedColumnTab == "all" {
                    // Show all columns stacked vertically with rich cards
                    ForEach(boardStore.columns) { col in
                        let cards = boardStore.filteredCardsInColumn(col.id)
                        KanbanColumnView(
                            column: col,
                            cards: cards,
                            onSelectCard: { card in
                                selectedCardForDetail = card
                            },
                            onAdvanceCard: { card in
                                Task {
                                    try? await boardStore.advanceCard(cardId: card.id)
                                }
                            },
                            onDeleteCard: { card in
                                Task {
                                    try? await boardStore.deleteCard(cardId: card.id)
                                }
                            }
                        )
                    }
                } else {
                    // Show single selected column
                    if let col = boardStore.columns.first(where: { $0.id.lowercased() == boardStore.selectedColumnTab.lowercased() }) {
                        let cards = boardStore.filteredCardsInColumn(col.id)
                        KanbanColumnView(
                            column: col,
                            cards: cards,
                            onSelectCard: { card in
                                selectedCardForDetail = card
                            },
                            onAdvanceCard: { card in
                                Task {
                                    try? await boardStore.advanceCard(cardId: card.id)
                                }
                            },
                            onDeleteCard: { card in
                                Task {
                                    try? await boardStore.deleteCard(cardId: card.id)
                                }
                            }
                        )
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }

    private var emptyBoardPlaceholder: some View {
        VStack(spacing: 10) {
            Image(systemName: "tray")
                .font(.system(size: 32))
                .foregroundColor(.barkcliTextMuted)
            Text("No cards matching filters")
                .font(BarkcliTypography.sectionHeader)
                .foregroundColor(.barkcliTextPrimary)
            Text("Try clearing the search query or changing the priority filter.")
                .font(BarkcliTypography.captionMuted)
                .foregroundColor(.barkcliTextMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
    }

    // MARK: New Card Modal
    private var newCardModal: some View {
        NavigationStack {
            Form {
                Section("Card Details") {
                    TextField("Title", text: $newCardTitle)
                        .font(BarkcliTypography.bodyText)

                    Picker("Column", selection: $newCardColumn) {
                        ForEach(boardStore.columns) { col in
                            Text(col.name).tag(col.id)
                        }
                    }

                    Picker("Priority", selection: $newCardPriority) {
                        ForEach(Priority.allCases) { prio in
                            Text(prio.displayName).tag(prio)
                        }
                    }

                    Stepper("Effort: \(newCardEffort) pts", value: $newCardEffort, in: 1...13)
                }
            }
            .navigationTitle("New Card")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showNewCardSheet = false
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            _ = try? await boardStore.addCard(
                                title: newCardTitle,
                                column: newCardColumn,
                                priority: newCardPriority,
                                effort: newCardEffort
                            )
                            newCardTitle = ""
                            showNewCardSheet = false
                        }
                    }
                    .disabled(newCardTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
