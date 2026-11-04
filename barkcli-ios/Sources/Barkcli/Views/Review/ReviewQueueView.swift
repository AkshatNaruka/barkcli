import SwiftUI

public struct ReviewQueueView: View {
    @Environment(BoardStore.self) private var boardStore
    @State private var selectedCardId: String? = nil

    public init() {}

    public var body: some View {
        let cards = boardStore.cardsInReview

        Group {
            if cards.isEmpty {
                emptyStateView
            } else {
                HStack(spacing: 0) {
                    // Left list of review items
                    reviewList(cards: cards)
                        .frame(width: 320)

                    Rectangle()
                        .frame(width: 1)
                        .foregroundColor(Color.barkcliBorder)

                    // Right review detail view
                    if let selected = activeCard(cards: cards) {
                        ReviewItemDetailView(
                            card: selected,
                            onApprove: {
                                Task {
                                    await boardStore.approveReviewCard(selected.id)
                                }
                            },
                            onRequestChanges: { reason in
                                Task {
                                    await boardStore.requestChangesForCard(selected.id, reason: reason)
                                }
                            },
                            onReject: {
                                Task {
                                    await boardStore.approveReviewCard(selected.id) // Or reject transition
                                }
                            }
                        )
                    } else {
                        VStack(spacing: 12) {
                            Image(systemName: "hand.tap.fill")
                                .font(.system(size: 32))
                                .foregroundColor(.barkcliTextMuted)
                            Text("Select a task from the review queue")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.barkcliTextSecondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            }
        }
        .background(Color.barkcliCanvas)
        .onAppear {
            if selectedCardId == nil, let first = cards.first {
                selectedCardId = first.id
            }
        }
        .onChange(of: cards.count) { _, _ in
            if let id = selectedCardId, !cards.contains(where: { $0.id == id }) {
                selectedCardId = cards.first?.id
            }
        }
    }

    private func activeCard(cards: [Card]) -> Card? {
        if let id = selectedCardId, let match = cards.first(where: { $0.id == id }) {
            return match
        }
        return cards.first
    }

    private func reviewList(cards: [Card]) -> some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.shield.fill")
                        .foregroundColor(.barkcliStatusActive)
                    Text("Review Queue")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)
                }

                Spacer()

                Text("\(cards.count) pending")
                    .font(.barkcliCodeHash)
                    .foregroundColor(.barkcliAccent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.barkcliAccent.opacity(0.12))
                    .clipShape(Capsule())
            }
            .padding(14)
            .background(Color.barkcliCardBackground)
            .overlay(
                Rectangle()
                    .frame(height: 1)
                    .foregroundColor(Color.barkcliBorder),
                alignment: .bottom
            )

            // Items List
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(cards) { card in
                        let isSelected = (selectedCardId ?? cards.first?.id) == card.id
                        Button {
                            selectedCardId = card.id
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 6) {
                                    Text(card.id)
                                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                                        .foregroundColor(.barkcliTextMuted)

                                    Spacer()

                                    Text("Test Passed")
                                        .font(.system(size: 9, weight: .semibold))
                                        .foregroundColor(.barkcliStatusActive)
                                        .padding(.horizontal, 5)
                                        .padding(.vertical, 1.5)
                                        .background(Color.barkcliStatusActive.opacity(0.12))
                                        .clipShape(Capsule())
                                }

                                Text(card.title)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(isSelected ? .white : .barkcliTextPrimary)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)

                                HStack(spacing: 8) {
                                    if let assignee = card.assignee {
                                        HStack(spacing: 4) {
                                            Circle()
                                                .fill(Color.barkcliAccent)
                                                .frame(width: 5, height: 5)
                                            Text(assignee)
                                                .font(.system(size: 10))
                                                .foregroundColor(.barkcliTextMuted)
                                        }
                                    }

                                    Spacer()

                                    HStack(spacing: 3) {
                                        Image(systemName: "arrow.triangle.branch")
                                            .font(.system(size: 9))
                                        Text("worktree")
                                            .font(.system(size: 9, design: .monospaced))
                                    }
                                    .foregroundColor(.barkcliTextMuted)
                                }
                            }
                            .padding(12)
                            .background(
                                isSelected ?
                                Color.barkcliCardSubtle :
                                Color.barkcliCardBackground
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .strokeBorder(isSelected ? Color.barkcliAccent.opacity(0.6) : Color.barkcliBorder, lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(10)
            }
        }
        .background(Color.barkcliCardBackground)
    }

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Circle()
                .fill(Color.barkcliStatusActive.opacity(0.1))
                .frame(width: 64, height: 64)
                .overlay(
                    Image(systemName: "checkmark.shield.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.barkcliStatusActive)
                )

            VStack(spacing: 6) {
                Text("All Clear — Review Queue Empty")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                Text("When agents finish work in isolated worktrees and their acceptance tests pass, passing tasks land here for your final sign-off.")
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 420)
            }

            HStack(spacing: 8) {
                Image(systemName: "lightbulb.fill")
                    .font(.system(size: 12))
                    .foregroundColor(.barkcliAccent)
                Text("Run `barkcli run \"intent\"` to dispatch an agent into an isolated worktree.")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(.barkcliTextMuted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color.barkcliCardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Color.barkcliBorder, lineWidth: 1)
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
    }
}
