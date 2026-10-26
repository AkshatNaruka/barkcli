import SwiftUI

public struct BoardView: View {
    @Environment(AppState.self) private var appState

    @State private var selectedColumnTab: String = "all"
    @State private var selectedCardForDetail: Card?
    @State private var showNewCardSheet: Bool = false

    public init() {}

    private var board: Board? {
        appState.currentBoard
    }

    private var allCards: [Card] {
        appState.cards
    }

    private var filteredCards: [Card] {
        let base = appState.filteredCards
        if selectedColumnTab == "all" {
            return base
        }
        return base.filter { $0.column.lowercased() == selectedColumnTab.lowercased() }
    }

    private func countForColumn(_ colId: String) -> Int {
        if colId == "all" {
            return allCards.count
        }
        return allCards.filter { $0.column.lowercased() == colId.lowercased() }.count
    }

    public var body: some View {
        VStack(spacing: 0) {
            filterHeaderView

            if filteredCards.isEmpty {
                emptyStateView
            } else {
                cardsScrollView
            }
        }
        .background(Color.barkcliDarkBackground.ignoresSafeArea())
        .sheet(item: $selectedCardForDetail) { card in
            CardDetailSheet(card: card)
        }
        .sheet(isPresented: $showNewCardSheet) {
            NewCardSheet()
        }
    }

    private var filterHeaderView: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundColor(.barkcliTextMuted)

                    @Bindable var state = appState
                    TextField("Search cards or identifiers", text: $state.searchQuery)
                        .font(.system(size: 14))
                        .foregroundColor(.barkcliTextPrimary)
                        .textFieldStyle(.plain)

                    if !appState.searchQuery.isEmpty {
                        Button {
                            appState.searchQuery = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundColor(.barkcliTextMuted)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(Color.barkcliSurface)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                )

                Button {
                    showNewCardSheet = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus")
                            .font(.system(size: 13, weight: .bold))
                        Text("New Card")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .foregroundColor(Color.barkcliCanvas)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(Color.barkcliTextPrimary)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
            }

            priorityFilterPills

            columnNavigationTabs
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 10)
        .background(Color.barkcliDarkBackground)
    }

    private var priorityFilterPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                priorityPill(label: "All Priorities", priority: nil)

                ForEach(Priority.allCases) { prio in
                    priorityPill(label: prio.displayName, priority: prio)
                }
            }
        }
    }

    private func priorityPill(label: String, priority: Priority?) -> some View {
        let isSelected = appState.selectedPriorityFilter == priority
        return Button {
            appState.selectedPriorityFilter = priority
        } label: {
            HStack(spacing: 5) {
                if let priority {
                    Circle()
                        .fill(priorityBadgeColor(priority))
                        .frame(width: 6, height: 6)
                }
                Text(label)
                    .font(.system(size: 12, weight: isSelected ? .bold : .medium))
            }
            .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextMuted)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                isSelected ?
                Color.barkcliCardSubtle :
                Color.barkcliSurface.opacity(0.8)
            )
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .strokeBorder(
                        isSelected ? Color.barkcliTextPrimary : Color.barkcliBorderSubtle,
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private var columnNavigationTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                columnTabButton(id: "all", label: "All Columns")

                ForEach(["todo", "doing", "review", "done"], id: \.self) { col in
                    columnTabButton(id: col, label: col.capitalized)
                }
            }
        }
    }

    private func columnTabButton(id: String, label: String) -> some View {
        let isSelected = selectedColumnTab == id
        let count = countForColumn(id)
        return Button {
            selectedColumnTab = id
        } label: {
            HStack(spacing: 6) {
                Text(label)
                    .font(.system(size: 13, weight: isSelected ? .bold : .medium))

                Text("\(count)")
                    .font(.system(size: 11, weight: .bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule()
                            .fill(isSelected ? Color.barkcliCanvas.opacity(0.2) : Color.barkcliBorderSubtle)
                    )
            }
            .foregroundColor(isSelected ? Color.barkcliCanvas : .barkcliTextMuted)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                isSelected ? Color.barkcliTextPrimary : Color.barkcliSurface
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(
                        isSelected ? Color.barkcliTextPrimary : Color.barkcliBorderSubtle,
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private var cardsScrollView: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(filteredCards) { card in
                    cardRowView(card)
                        .onTapGesture {
                            selectedCardForDetail = card
                        }
                }
            }
            .padding(16)
        }
        .refreshable {
            await appState.refresh()
        }
    }

    private func cardRowView(_ card: Card) -> some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 8) {
                    Text(card.id)
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundColor(.barkcliTextPrimary)

                    StatusBadge(card.column.capitalized, variant: columnBadgeVariant(card.column))

                    StatusBadge(card.priority.displayName, variant: priorityBadgeVariant(card.priority))

                    Spacer()

                    if let effort = card.effort {
                        HStack(spacing: 4) {
                            Image(systemName: "bolt.fill")
                                .font(.system(size: 10))
                            Text("\(effort.points) pts")
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                        }
                        .foregroundColor(.barkcliTextSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.barkcliCardSubtle)
                        .clipShape(Capsule())
                    }
                }

                Text(card.title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                    .lineLimit(2)

                if let desc = card.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextMuted)
                        .lineLimit(2)
                }

                if !card.labels.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(card.labels.prefix(4), id: \.self) { label in
                            Text(label)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.barkcliTextMuted)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(Color.barkcliSurface)
                                .clipShape(Capsule())
                        }
                    }
                }

                Divider()
                    .overlay(Color.barkcliBorderSubtle.opacity(0.6))

                HStack(alignment: .center, spacing: 12) {
                    HStack(spacing: 5) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 13))
                            .foregroundColor(.barkcliTextSecondary)
                        Text(card.assignee ?? "unassigned")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.barkcliTextMuted)
                    }

                    if !card.checklist.isEmpty {
                        let done = card.checklist.filter(\.done).count
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark.circle")
                                .font(.system(size: 11))
                            Text("\(done)/\(card.checklist.count)")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundColor(.barkcliTextMuted)
                    }

                    Spacer()

                    Menu {
                        Section("Move to Column") {
                            Button("Move to Todo") {
                                Task { await appState.moveCard(cardId: card.id, toColumn: "todo") }
                            }
                            Button("Move to Doing") {
                                Task { await appState.moveCard(cardId: card.id, toColumn: "doing") }
                            }
                            Button("Move to Review") {
                                Task { await appState.moveCard(cardId: card.id, toColumn: "review") }
                            }
                            Button("Move to Done") {
                                Task { await appState.moveCard(cardId: card.id, toColumn: "done") }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text("Move")
                                .font(.system(size: 12, weight: .semibold))
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.system(size: 10))
                        }
                        .foregroundColor(.barkcliTextPrimary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color.barkcliSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                        )
                    }
                }
            }
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 14) {
            Spacer()

            Image(systemName: "tray")
                .font(.system(size: 42))
                .foregroundColor(.barkcliTextMuted)

            Text("No Cards Found")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(.barkcliTextPrimary)

            Text("No cards match the active filters or search query.")
                .font(.system(size: 13))
                .foregroundColor(.barkcliTextMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button {
                appState.searchQuery = ""
                appState.selectedPriorityFilter = nil
                selectedColumnTab = "all"
            } label: {
                Text("Reset Filters")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.barkcliTextPrimary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.barkcliCardSubtle)
                    .clipShape(Capsule())
                    .overlay(
                        Capsule()
                            .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func priorityBadgeColor(_ priority: Priority) -> Color {
        switch priority {
        case .critical:
            return .barkcliDangerRose
        case .high:
            return .barkcliWarningAmber
        case .medium:
            return .barkcliTextPrimary
        case .low:
            return .barkcliTextMuted
        }
    }

    private func priorityBadgeVariant(_ priority: Priority) -> StatusBadgeVariant {
        switch priority {
        case .critical:
            return .danger
        case .high:
            return .warning
        case .medium:
            return .accent
        case .low:
            return .neutral
        }
    }

    private func columnBadgeVariant(_ column: String) -> StatusBadgeVariant {
        switch column.lowercased() {
        case "todo":
            return .neutral
        case "doing":
            return .accent
        case "review":
            return .warning
        case "done":
            return .success
        default:
            return .neutral
        }
    }
}

public struct NewCardSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    @State private var title: String = ""
    @State private var descriptionText: String = ""
    @State private var column: String = "todo"
    @State private var priority: Priority = .medium
    @State private var effortPoints: Int = 2
    @State private var assignee: String = "agent"
    @State private var labelsText: String = ""
    @State private var isCreating: Bool = false

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    GlassCard(padding: 16) {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("TITLE")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliTextMuted)
                                .tracking(0.6)

                            TextField("What needs to be done", text: $title)
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.barkcliTextPrimary)
                                .textFieldStyle(.plain)
                                .padding(10)
                                .background(Color.barkcliSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                                )

                            Text("DESCRIPTION")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliTextMuted)
                                .tracking(0.6)

                            TextField("Context or acceptance details", text: $descriptionText, axis: .vertical)
                                .lineLimit(3...6)
                                .font(.system(size: 14))
                                .foregroundColor(.barkcliTextPrimary)
                                .textFieldStyle(.plain)
                                .padding(10)
                                .background(Color.barkcliSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                                )
                        }
                    }

                    GlassCard(padding: 16) {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("COLUMN")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliTextMuted)
                                .tracking(0.6)

                            HStack(spacing: 8) {
                                ForEach(["todo", "doing", "review", "done"], id: \.self) { col in
                                    Button {
                                        column = col
                                    } label: {
                                        Text(col.capitalized)
                                            .font(.system(size: 12, weight: column == col ? .bold : .medium))
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 8)
                                            .foregroundColor(column == col ? Color.barkcliCanvas : .barkcliTextMuted)
                                            .background(column == col ? Color.barkcliTextPrimary : Color.barkcliSurface)
                                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }

                            Text("PRIORITY")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliTextMuted)
                                .tracking(0.6)

                            HStack(spacing: 8) {
                                ForEach(Priority.allCases) { prio in
                                    Button {
                                        priority = prio
                                    } label: {
                                        Text(prio.displayName)
                                            .font(.system(size: 12, weight: priority == prio ? .bold : .medium))
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 8)
                                            .foregroundColor(priority == prio ? Color.barkcliCanvas : .barkcliTextMuted)
                                            .background(priority == prio ? Color.barkcliTextPrimary : Color.barkcliSurface)
                                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    GlassCard(padding: 16) {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                Text("EFFORT POINTS")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(.barkcliTextMuted)
                                    .tracking(0.6)

                                Spacer()

                                HStack(spacing: 8) {
                                    Button {
                                        if effortPoints > 0 { effortPoints -= 1 }
                                    } label: {
                                        Image(systemName: "minus.circle.fill")
                                            .font(.system(size: 20))
                                            .foregroundColor(.barkcliTextMuted)
                                    }
                                    .buttonStyle(.plain)

                                    Text("\(effortPoints) pts")
                                        .font(.system(size: 15, weight: .bold, design: .rounded))
                                        .foregroundColor(.barkcliTextPrimary)

                                    Button {
                                        effortPoints += 1
                                    } label: {
                                        Image(systemName: "plus.circle.fill")
                                            .font(.system(size: 20))
                                            .foregroundColor(.barkcliTextPrimary)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }

                            Text("ASSIGNEE")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliTextMuted)
                                .tracking(0.6)

                            TextField("Assignee identifier", text: $assignee)
                                .font(.system(size: 14))
                                .foregroundColor(.barkcliTextPrimary)
                                .textFieldStyle(.plain)
                                .padding(10)
                                .background(Color.barkcliSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                            Text("LABELS")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliTextMuted)
                                .tracking(0.6)

                            TextField("Comma separated labels", text: $labelsText)
                                .font(.system(size: 14))
                                .foregroundColor(.barkcliTextPrimary)
                                .textFieldStyle(.plain)
                                .padding(10)
                                .background(Color.barkcliSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                    }
                }
                .padding(18)
            }
            .background(Color.barkcliDarkBackground.ignoresSafeArea())
            .navigationTitle("New Card")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(.barkcliTextMuted)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            await createCard()
                        }
                    }
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                    .disabled(isCreating || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func createCard() async {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty else { return }

        isCreating = true
        defer { isCreating = false }

        let cleanLabels = labelsText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        let cardId = "card" + String(Int.random(in: 100...999))
        let newCard = Card(
            id: cardId,
            title: cleanTitle,
            column: column,
            description: descriptionText.isEmpty ? nil : descriptionText,
            priority: priority,
            labels: cleanLabels,
            assignee: assignee.isEmpty ? nil : assignee,
            checklist: [],
            dueDate: nil,
            remindAt: nil,
            comments: [],
            blockedBy: nil,
            attachments: [],
            links: [],
            acceptanceCriteria: [],
            effort: Effort(effortPoints),
            area: nil,
            specId: nil,
            pinned: false,
            version: 1,
            createdAt: Date(),
            updatedAt: Date()
        )

        await appState.saveCard(newCard)
        dismiss()
    }
}
