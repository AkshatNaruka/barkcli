import SwiftUI

/// View representing a single Kanban column with WIP limit enforcement,
/// interactive card list, swipe to advance actions, and visual status chips.
public struct KanbanColumnView: View {
    public let column: Column
    public let cards: [Card]
    public let onSelectCard: (Card) -> Void
    public let onAdvanceCard: (Card) -> Void
    public let onDeleteCard: (Card) -> Void

    public init(
        column: Column,
        cards: [Card],
        onSelectCard: @escaping (Card) -> Void,
        onAdvanceCard: @escaping (Card) -> Void,
        onDeleteCard: @escaping (Card) -> Void
    ) {
        self.column = column
        self.cards = cards
        self.onSelectCard = onSelectCard
        self.onAdvanceCard = onAdvanceCard
        self.onDeleteCard = onDeleteCard
    }

    private var isOverWIPLimit: Bool {
        guard let limit = column.wipLimit else { return false }
        return cards.count > limit
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Column Header
            HStack(spacing: 8) {
                Text(column.name.uppercased())
                    .font(BarkcliTypography.sectionHeader)
                    .foregroundColor(.barkcliTextPrimary)
                    .tracking(0.6)

                Spacer()

                WIPLimitBadge(count: cards.count, limit: column.wipLimit)
            }
            .padding(.horizontal, 4)
            .padding(.bottom, 2)

            // Cards Scroll List
            if cards.isEmpty {
                emptyColumnPlaceholder
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(cards) { card in
                        kanbanCardView(card)
                    }
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.barkcliSpaceBlack.opacity(0.7))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(isOverWIPLimit ? Color.barkcliCrimsonBlocker.opacity(0.5) : Color.barkcliBorderHairline.opacity(0.4), lineWidth: 1)
        )
    }

    // MARK: Card Component
    private func kanbanCardView(_ card: Card) -> some View {
        Button {
            onSelectCard(card)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                // Top Meta Row: ID + Priority + Effort
                HStack(spacing: 6) {
                    Text(card.id)
                        .font(BarkcliTypography.cardId)
                        .foregroundColor(.barkcliTextMuted)

                    if card.pinned == true {
                        Image(systemName: "pin.fill")
                            .font(.system(size: 9))
                            .foregroundColor(.barkcliAmberPulse)
                    }

                    Spacer()

                    if let effort = card.effort {
                        Text("\(effort.points) pts")
                            .font(BarkcliTypography.codeHash)
                            .foregroundColor(.barkcliTextMuted)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(Color.barkcliBorderHairline.opacity(0.5))
                            )
                    }

                    priorityBadge(for: card.priority)
                }

                // Card Title
                Text(card.title)
                    .font(BarkcliTypography.cardTitle)
                    .foregroundColor(.barkcliTextPrimary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)

                // Blocked Banner if blocked
                if let blocked = card.blockedBy, !blocked.isEmpty {
                    BlockedIndicatorBanner(blockerId: blocked)
                }

                // Spec Link Chip if linked
                if let spec = card.specId, !spec.isEmpty {
                    SpecLinkChip(spec)
                }

                // Checklist Progress Bar
                if !card.checklist.isEmpty {
                    let completed = card.checklist.filter { $0.done }.count
                    ChecklistProgressBar(completed: completed, total: card.checklist.count)
                }

                // Bottom Labels & Assignee Row
                if !card.labels.isEmpty || card.assignee != nil {
                    HStack(spacing: 5) {
                        ForEach(card.labels.prefix(3), id: \.self) { label in
                            Text("#\(label)")
                                .font(BarkcliTypography.codeHash)
                                .foregroundColor(.barkcliTextSecondary)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(Color.barkcliCardSubtle))
                        }

                        Spacer()

                        if let assignee = card.assignee {
                            HStack(spacing: 3) {
                                Image(systemName: "person.circle.fill")
                                    .font(.system(size: 11))
                                Text(assignee)
                                    .font(BarkcliTypography.codeHash)
                            }
                            .foregroundColor(.barkcliTextMuted)
                        }
                    }
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.barkcliSlateGlass)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(card.blockedBy != nil && !(card.blockedBy!.isEmpty) ? Color.barkcliCrimsonBlocker.opacity(0.4) : Color.barkcliBorderHairline.opacity(0.6), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                onAdvanceCard(card)
            } label: {
                Label("Advance to Next Column", systemImage: "arrow.right.circle")
            }

            Button(role: .destructive) {
                onDeleteCard(card)
            } label: {
                Label("Delete Card", systemImage: "trash")
            }
        }
    }

    private func priorityBadge(for priority: Priority) -> some View {
        let variant: StatusBadgeVariant
        switch priority {
        case .critical:
            variant = .crimson
        case .high:
            variant = .amber
        case .medium:
            variant = .electric
        case .low:
            variant = .neutral
        }
        return StatusBadge(priority.displayName.uppercased(), variant: variant)
    }

    private var emptyColumnPlaceholder: some View {
        VStack(spacing: 6) {
            Image(systemName: "tray")
                .font(.system(size: 20))
                .foregroundColor(.barkcliTextMuted.opacity(0.6))
            Text("No cards in \(column.name)")
                .font(BarkcliTypography.captionMuted)
                .foregroundColor(.barkcliTextMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }
}
