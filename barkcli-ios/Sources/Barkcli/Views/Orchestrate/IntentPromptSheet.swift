import SwiftUI

public struct IntentPromptSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    public let proposal: PlanProposal

    @State private var isApproving: Bool = false
    @State private var isRejecting: Bool = false
    @State private var showRejectReasonInput: Bool = false
    @State private var rejectReasonText: String = ""

    public init(proposal: PlanProposal) {
        self.proposal = proposal
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    summaryHeroCard

                    rationaleCard

                    if !proposal.requirements.isEmpty {
                        requirementsSection
                    }

                    decomposedChildTasksSection

                    actionButtonsSection
                }
                .padding(18)
            }
            .background(Color.barkcliDarkBackground.ignoresSafeArea())
            .navigationTitle("Plan Proposal")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Dismiss") {
                        dismiss()
                    }
                    .foregroundColor(.barkcliTextMuted)
                }
            }
        }
    }

    private var summaryHeroCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    StatusBadge(proposal.cardId, variant: .accent)

                    StatusBadge(
                        "Risk \(proposal.riskLevel.capitalized)",
                        systemImage: "shield.lefthalf.filled",
                        variant: riskBadgeVariant(proposal.riskLevel)
                    )

                    Spacer()

                    HStack(spacing: 4) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 11))
                        Text("\(proposal.estimatedTotalEffort) pts total")
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                    }
                    .foregroundColor(.barkcliAccentPurple)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background(Color.barkcliAccentPurple.opacity(0.12))
                    .clipShape(Capsule())
                }

                Text(proposal.cardTitle)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                HStack(spacing: 6) {
                    Image(systemName: "cpu")
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliAccentPurple)

                    Text("Proposed by \(proposal.proposedBy)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.barkcliTextMuted)

                    if let at = proposal.proposedAt {
                        Text("•")
                            .foregroundColor(.barkcliTextMuted)
                        Text(at.formatted(date: .abbreviated, time: .shortened))
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextMuted)
                    }
                }
            }
        }
    }

    private var rationaleCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliAccentPurple)

                    Text("AUTONOMOUS RATIONALE")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliAccentPurple)
                        .tracking(0.6)
                }

                Text(proposal.rationale.isEmpty ? "The agent synthesized this architectural plan to fulfill the intent safely." : proposal.rationale)
                    .font(.system(size: 14))
                    .foregroundColor(.barkcliTextPrimary)
                    .lineSpacing(3)
            }
        }
    }

    private var requirementsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                "Acceptance Criteria",
                subtitle: "Requirements verified before merging",
                count: proposal.requirements.count,
                systemImage: "checklist"
            )

            ForEach(proposal.requirements) { req in
                GlassCard(padding: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(req.title)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.barkcliTextPrimary)

                            Spacer()

                            Text("\(req.effort) pts")
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                                .foregroundColor(.barkcliTextMuted)
                        }

                        if !req.acceptanceCriteria.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(req.acceptanceCriteria, id: \.self) { criterion in
                                    HStack(alignment: .top, spacing: 6) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.system(size: 11))
                                            .foregroundColor(.barkcliSuccessEmerald)
                                            .padding(.top, 2)

                                        Text(criterion)
                                            .font(.system(size: 12))
                                            .foregroundColor(.barkcliTextMuted)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private var decomposedChildTasksSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                "Decomposed Child Tasks",
                subtitle: "Tasks to execute in isolated git worktrees",
                count: proposal.children.count,
                systemImage: "square.stack.3d.down.right.fill"
            )

            ForEach(proposal.children) { child in
                GlassCard(padding: 14) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(child.title)
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(.barkcliTextPrimary)

                                if !child.description.isEmpty {
                                    Text(child.description)
                                        .font(.system(size: 12))
                                        .foregroundColor(.barkcliTextMuted)
                                        .lineLimit(2)
                                }
                            }

                            Spacer()

                            VStack(alignment: .trailing, spacing: 4) {
                                StatusBadge(child.priority.displayName, variant: priorityBadgeVariant(child.priority))

                                HStack(spacing: 3) {
                                    Image(systemName: "bolt.fill")
                                        .font(.system(size: 9))
                                    Text("\(child.effort) pts")
                                        .font(.system(size: 11, weight: .bold, design: .rounded))
                                }
                                .foregroundColor(.barkcliAccentPurple)
                            }
                        }

                        if !child.acceptanceCriteria.isEmpty {
                            VStack(alignment: .leading, spacing: 3) {
                                ForEach(child.acceptanceCriteria, id: \.self) { rule in
                                    HStack(spacing: 5) {
                                        Image(systemName: "arrow.turn.down.right")
                                            .font(.system(size: 9))
                                            .foregroundColor(.barkcliTextMuted)
                                        Text(rule)
                                            .font(.system(size: 11))
                                            .foregroundColor(.barkcliTextMuted)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private var actionButtonsSection: some View {
        VStack(spacing: 12) {
            if showRejectReasonInput {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Reason for rejecting proposal (optional)", text: $rejectReasonText)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextPrimary)
                        .textFieldStyle(.plain)
                        .padding(10)
                        .background(Color.barkcliSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                        )

                    HStack(spacing: 10) {
                        ActionButton(
                            "Confirm Rejection",
                            systemImage: "xmark.circle.fill",
                            variant: .destructive,
                            isLoading: isRejecting
                        ) {
                            Task {
                                isRejecting = true
                                await appState.rejectPlan(cardId: proposal.cardId, reason: rejectReasonText.isEmpty ? nil : rejectReasonText)
                                isRejecting = false
                                dismiss()
                            }
                        }

                        ActionButton(
                            "Cancel",
                            variant: .secondary
                        ) {
                            showRejectReasonInput = false
                        }
                    }
                }
                .padding(12)
                .background(Color.barkcliSurface.opacity(0.4))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                ActionButton(
                    "Approve and Dispatch Tasks",
                    systemImage: "checkmark.circle.fill",
                    variant: .primary,
                    isLoading: isApproving
                ) {
                    Task {
                        isApproving = true
                        await appState.approvePlan(cardId: proposal.cardId)
                        isApproving = false
                        dismiss()
                    }
                }

                ActionButton(
                    "Reject Proposal",
                    systemImage: "xmark",
                    variant: .secondary,
                    isLoading: isRejecting
                ) {
                    showRejectReasonInput = true
                }
            }
        }
        .padding(.top, 10)
    }

    private func riskBadgeVariant(_ risk: String) -> StatusBadgeVariant {
        switch risk.lowercased() {
        case "low":
            return .success
        case "medium":
            return .warning
        case "high":
            return .danger
        default:
            return .neutral
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
}
