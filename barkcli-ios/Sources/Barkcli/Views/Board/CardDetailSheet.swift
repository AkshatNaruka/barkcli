import SwiftUI

public struct CardDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(BoardStore.self) private var boardStore: BoardStore?
    @Environment(AppState.self) private var appState: AppState?

    public let card: Card

    @State private var title: String
    @State private var descriptionText: String
    @State private var selectedColumn: String
    @State private var selectedPriority: Priority
    @State private var effortPoints: Int
    @State private var assignee: String
    @State private var labels: [String]
    @State private var checklist: [ChecklistItem]
    @State private var links: [CardLink]
    @State private var comments: [CardComment]

    @State private var newLabelText: String = ""
    @State private var newChecklistText: String = ""
    @State private var newCommentText: String = ""
    @State private var newLinkTarget: String = ""
    @State private var newLinkType: LinkType = .related

    @State private var isSaving: Bool = false
    @State private var isRequestingPlan: Bool = false
    @State private var showDeleteConfirmation: Bool = false

    public init(card: Card) {
        self.card = card
        _title = State(initialValue: card.title)
        _descriptionText = State(initialValue: card.description ?? "")
        _selectedColumn = State(initialValue: card.column)
        _selectedPriority = State(initialValue: card.priority)
        _effortPoints = State(initialValue: card.effort?.points ?? 1)
        _assignee = State(initialValue: card.assignee ?? "agent")
        _labels = State(initialValue: card.labels)
        _checklist = State(initialValue: card.checklist)
        _links = State(initialValue: card.links)
        _comments = State(initialValue: card.comments)
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    headerIdentitySection

                    titleAndDescriptionSection

                    columnAndPrioritySection

                    effortAndAssigneeSection

                    checklistSection

                    labelsSection

                    linksSection

                    commentsSection

                    actionsSection
                }
                .padding(18)
            }
            .background(Color.barkcliDarkBackground.ignoresSafeArea())
            .navigationTitle(card.id)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                    .foregroundColor(.barkcliTextMuted)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await saveChanges()
                        }
                    }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                    .disabled(isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .confirmationDialog(
            "Delete this card from the board?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete Card", role: .destructive) {
                Task {
                    if let boardStore {
                        try? await boardStore.deleteCard(cardId: card.id)
                    } else if let appState {
                        await appState.deleteCard(cardId: card.id)
                    } else {
                        try? await BoardStore.shared.deleteCard(cardId: card.id)
                    }
                    dismiss()
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private var headerIdentitySection: some View {
        HStack(spacing: 8) {
            StatusBadge(card.id, variant: .accent)

            StatusBadge(selectedColumn.capitalized, variant: .neutral)

            StatusBadge(selectedPriority.displayName, variant: priorityBadgeVariant(selectedPriority))

            Spacer()

            if let updated = card.updatedAt {
                Text(updated.formatted(date: .abbreviated, time: .shortened))
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            }
        }
    }

    private var titleAndDescriptionSection: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                Text("CARD TITLE")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
                    .tracking(0.6)

                TextField("Enter card title", text: $title)
                    .font(.system(size: 17, weight: .semibold))
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

                TextField("Detailed instructions or context", text: $descriptionText, axis: .vertical)
                    .lineLimit(4...8)
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
    }

    private var columnAndPrioritySection: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("COLUMN STATUS")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliTextMuted)
                        .tracking(0.6)

                    HStack(spacing: 8) {
                        ForEach(["todo", "doing", "review", "done"], id: \.self) { colId in
                            let isSelected = selectedColumn == colId
                            Button {
                                selectedColumn = colId
                            } label: {
                                Text(colId.capitalized)
                                    .font(.system(size: 12, weight: isSelected ? .bold : .medium, design: .monospaced))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 7)
                                    .foregroundColor(isSelected ? .barkcliCanvas : .barkcliTextMuted)
                                    .background(
                                        isSelected ?
                                        Color.barkcliTextPrimary :
                                        Color.barkcliCardSubtle
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                                            .strokeBorder(
                                                isSelected ?
                                                Color.barkcliTextPrimary :
                                                Color.barkcliBorder,
                                                lineWidth: 1
                                            )
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("PRIORITY LEVEL")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliTextMuted)
                        .tracking(0.6)

                    HStack(spacing: 8) {
                        ForEach(Priority.allCases) { prio in
                            Button {
                                selectedPriority = prio
                            } label: {
                                Text(prio.displayName)
                                    .font(.system(size: 12, weight: selectedPriority == prio ? .bold : .medium))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 8)
                                    .foregroundColor(priorityTextColor(prio, isSelected: selectedPriority == prio))
                                    .background(
                                        selectedPriority == prio ?
                                        priorityBackgroundColor(prio) :
                                        Color.barkcliSurface
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .strokeBorder(
                                                selectedPriority == prio ?
                                                priorityBorderColor(prio) :
                                                Color.barkcliBorderSubtle,
                                                lineWidth: 1
                                            )
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private var effortAndAssigneeSection: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("EFFORT POINTS")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                            .tracking(0.6)

                        HStack(spacing: 10) {
                            Button {
                                if effortPoints > 0 { effortPoints -= 1 }
                            } label: {
                                Image(systemName: "minus.circle.fill")
                                    .font(.system(size: 22))
                                    .foregroundColor(.barkcliTextMuted)
                            }
                            .buttonStyle(.plain)

                            Text("\(effortPoints) pts")
                                .font(.system(size: 17, weight: .bold, design: .rounded))
                                .foregroundColor(.barkcliTextPrimary)
                                .frame(minWidth: 55)

                            Button {
                                effortPoints += 1
                            } label: {
                                Image(systemName: "plus.circle.fill")
                                    .font(.system(size: 22))
                                    .foregroundColor(.barkcliTextPrimary)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    Spacer()

                    VStack(alignment: .leading, spacing: 6) {
                        Text("AGENT BACKEND")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                            .tracking(0.6)

                        Menu {
                            ForEach(["opencode", "board", "codex", "claude"], id: \.self) { b in
                                Button {
                                    assignee = b
                                    labels.removeAll { $0.hasPrefix("agent:") }
                                    labels.append("agent:\(b)")
                                } label: {
                                    HStack {
                                        Text(b.capitalized)
                                        if assignee.lowercased() == b {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                }
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(Color.barkcliTextPrimary)
                                    .frame(width: 6, height: 6)
                                Text(assignee.isEmpty ? "opencode" : assignee)
                                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                    .foregroundColor(.barkcliTextPrimary)
                                Spacer()
                                Image(systemName: "chevron.up.chevron.down")
                                    .font(.system(size: 9))
                                    .foregroundColor(.barkcliTextMuted)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(Color.barkcliSurface)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                            )
                        }
                    }
                }
            }
        }
    }

    private var checklistSection: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("CHECKLIST ITEMS")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliTextMuted)
                        .tracking(0.6)

                    Spacer()

                    let doneCount = checklist.filter(\.done).count
                    Text("\(doneCount)/\(checklist.count) done")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.barkcliTextMuted)
                }

                ForEach(checklist.indices, id: \.self) { index in
                    HStack(spacing: 10) {
                        Button {
                            checklist[index].done.toggle()
                        } label: {
                            Image(systemName: checklist[index].done ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 17))
                                .foregroundColor(checklist[index].done ? .barkcliSuccessEmerald : .barkcliTextMuted)
                        }
                        .buttonStyle(.plain)

                        Text(checklist[index].text)
                            .font(.system(size: 14))
                            .foregroundColor(checklist[index].done ? .barkcliTextMuted : .barkcliTextPrimary)
                            .strikethrough(checklist[index].done, color: .barkcliTextMuted)

                        Spacer()

                        Button {
                            checklist.remove(at: index)
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 12))
                                .foregroundColor(.barkcliTextMuted)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.vertical, 3)
                }

                HStack(spacing: 8) {
                    TextField("Add checklist item", text: $newChecklistText)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextPrimary)
                        .textFieldStyle(.plain)
                        .padding(8)
                        .background(Color.barkcliSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

                    Button {
                        let clean = newChecklistText.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !clean.isEmpty else { return }
                        checklist.append(ChecklistItem(text: clean, done: false))
                        newChecklistText = ""
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                            .frame(width: 32, height: 32)
                            .background(Color.barkcliCardSubtle)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(newChecklistText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(.top, 4)
            }
        }
    }

    private var labelsSection: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text("LABELS")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
                    .tracking(0.6)

                if !labels.isEmpty {
                    FlowLayout(spacing: 8) {
                        ForEach(labels, id: \.self) { label in
                            HStack(spacing: 6) {
                                Text(label)
                                    .font(.system(size: 11, weight: .medium, design: .monospaced))

                                Button {
                                    labels.removeAll { $0 == label }
                                } label: {
                                    Image(systemName: "xmark")
                                        .font(.system(size: 8, weight: .bold))
                                }
                                .buttonStyle(.plain)
                            }
                            .foregroundColor(.barkcliTextSecondary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.barkcliCardSubtle)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                        }
                    }
                }

                HStack(spacing: 8) {
                    TextField("New label name", text: $newLabelText)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextPrimary)
                        .textFieldStyle(.plain)
                        .padding(8)
                        .background(Color.barkcliSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

                    Button {
                        let clean = newLabelText.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !clean.isEmpty, !labels.contains(clean) else { return }
                        labels.append(clean)
                        newLabelText = ""
                    } label: {
                        Text("Add")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliCanvas)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.barkcliTextPrimary)
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(newLabelText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private var linksSection: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text("LINKED CARDS")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
                    .tracking(0.6)

                ForEach(links) { link in
                    HStack(spacing: 8) {
                        StatusBadge(link.type.displayName, variant: link.type == .blockedBy ? .danger : .neutral)

                        Text(link.target)
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundColor(.barkcliTextPrimary)

                        Spacer()

                        Button {
                            links.removeAll { $0.id == link.id }
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 11))
                                .foregroundColor(.barkcliTextMuted)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(8)
                    .background(Color.barkcliSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }

                HStack(spacing: 8) {
                    Picker("Type", selection: $newLinkType) {
                        ForEach(LinkType.allCases, id: \.self) { type in
                            Text(type.displayName).tag(type)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(.barkcliTextPrimary)

                    TextField("Target card id", text: $newLinkTarget)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextPrimary)
                        .textFieldStyle(.plain)
                        .padding(8)
                        .background(Color.barkcliSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

                    Button {
                        let clean = newLinkTarget.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !clean.isEmpty else { return }
                        links.append(CardLink(type: newLinkType, target: clean))
                        newLinkTarget = ""
                    } label: {
                        Text("Link")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliCanvas)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.barkcliTextPrimary)
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(newLinkTarget.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private var commentsSection: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text("COMMENTS ACTIVITY")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
                    .tracking(0.6)

                if comments.isEmpty {
                    Text("No comments recorded yet.")
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextMuted)
                        .padding(.vertical, 4)
                } else {
                    ForEach(comments) { comment in
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(comment.author)
                                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                                    .foregroundColor(.barkcliTextPrimary)

                                Spacer()

                                Text(comment.at.formatted(date: .abbreviated, time: .shortened))
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundColor(.barkcliTextMuted)
                            }

                            Text(comment.text)
                                .font(.system(size: 13))
                                .foregroundColor(.barkcliTextPrimary)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.barkcliCardSubtle)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                    }
                }

                HStack(spacing: 8) {
                    TextField("Write a comment", text: $newCommentText)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextPrimary)
                        .textFieldStyle(.plain)
                        .padding(8)
                        .background(Color.barkcliSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

                    Button {
                        let clean = newCommentText.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !clean.isEmpty else { return }
                        Task {
                            if let boardStore {
                                try? await boardStore.addComment(cardId: card.id, text: clean, author: "human")
                            } else if let appState {
                                await appState.addComment(cardId: card.id, text: clean, author: "human")
                            } else {
                                try? await BoardStore.shared.addComment(cardId: card.id, text: clean, author: "human")
                            }
                            comments.append(CardComment(author: "human", text: clean, at: Date()))
                            newCommentText = ""
                        }
                    } label: {
                        Text("Post")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliCanvas)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.barkcliTextPrimary)
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(newCommentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private var actionsSection: some View {
        VStack(spacing: 12) {
            ActionButton(
                "Plan & Implement",
                systemImage: "bolt.fill",
                variant: .primary,
                isLoading: isRequestingPlan
            ) {
                Task {
                    isRequestingPlan = true
                    selectedColumn = "doing"
                    await saveChanges()
                    if let appState {
                        await appState.proposePlan(cardId: card.id)
                    } else {
                        _ = try? await (boardStore?.client ?? MockAPIClient()).proposePlan(cardId: card.id)
                    }
                    isRequestingPlan = false
                    dismiss()
                }
            }

            ActionButton(
                "Propose Agent Plan",
                systemImage: "wand.and.stars",
                variant: .secondary,
                isLoading: isRequestingPlan
            ) {
                Task {
                    isRequestingPlan = true
                    if let appState {
                        await appState.proposePlan(cardId: card.id)
                    } else {
                        _ = try? await (boardStore?.client ?? MockAPIClient()).proposePlan(cardId: card.id)
                    }
                    isRequestingPlan = false
                    dismiss()
                }
            }

            Button {
                showDeleteConfirmation = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "trash")
                    Text("Delete Card")
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.barkcliDangerRose)
                .padding(.vertical, 6)
            }
            .buttonStyle(.plain)
        }
    }

    private func saveChanges() async {
        isSaving = true
        defer { isSaving = false }

        var updated = card
        updated.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.description = descriptionText.isEmpty ? nil : descriptionText
        updated.column = selectedColumn
        updated.priority = selectedPriority
        updated.effort = Effort(effortPoints)
        updated.assignee = assignee.isEmpty ? nil : assignee
        updated.labels = labels
        updated.checklist = checklist
        updated.links = links
        updated.comments = comments
        updated.updatedAt = Date()

        if let boardStore {
            try? await boardStore.saveCard(updated)
        } else if let appState {
            await appState.saveCard(updated)
        } else {
            try? await BoardStore.shared.saveCard(updated)
        }
        dismiss()
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

    private func priorityTextColor(_ priority: Priority, isSelected: Bool) -> Color {
        guard isSelected else { return .barkcliTextMuted }
        switch priority {
        case .critical:
            return .white
        case .high:
            return .white
        case .medium:
            return .white
        case .low:
            return .white
        }
    }

    private func priorityBackgroundColor(_ priority: Priority) -> Color {
        switch priority {
        case .critical:
            return .barkcliDangerRose
        case .high:
            return .barkcliWarningAmber
        case .medium:
            return .barkcliStatusInfo
        case .low:
            return .barkcliBorderSubtle
        }
    }

    private func priorityBorderColor(_ priority: Priority) -> Color {
        priorityBackgroundColor(priority)
    }
}

public struct FlowLayout: Layout {
    public var spacing: CGFloat

    public init(spacing: CGFloat = 8) {
        self.spacing = spacing
    }

    public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        var height: CGFloat = 0
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > width && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }
        height = y + rowHeight
        return CGSize(width: width, height: height)
    }

    public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX && x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }
    }
}
