import SwiftUI

/// Banner displaying real time autopilot state, attention indicators,
/// and actionable plan proposal alerts for human in the loop review.
public struct AutopilotBanner: View {
    public let phase: AutopilotPhase
    public let phaseLabel: String
    public let counts: StatusCounts
    public let proposal: PlanProposal?
    public let onReviewProposal: (() -> Void)?
    public let onApproveProposal: (() -> Void)?
    public let onRejectProposal: (() -> Void)?

    public init(
        phase: AutopilotPhase,
        phaseLabel: String,
        counts: StatusCounts = StatusCounts(),
        proposal: PlanProposal? = nil,
        onReviewProposal: (() -> Void)? = nil,
        onApproveProposal: (() -> Void)? = nil,
        onRejectProposal: (() -> Void)? = nil
    ) {
        self.phase = phase
        self.phaseLabel = phaseLabel
        self.counts = counts
        self.proposal = proposal
        self.onReviewProposal = onReviewProposal
        self.onApproveProposal = onApproveProposal
        self.onRejectProposal = onRejectProposal
    }

    private var phaseColor: Color {
        switch phase {
        case .needsPlan:
            return .barkcliStatusWarning
        case .awaitingPlanApproval:
            return .barkcliStatusWarning
        case .inProgress, .running:
            return .barkcliStatusInfo
        case .awaitingMerge:
            return .barkcliStatusActive
        case .idle, .other:
            return .barkcliTextMuted
        }
    }

    private var phaseIcon: String {
        switch phase {
        case .needsPlan:
            return "pencil.and.outline"
        case .awaitingPlanApproval:
            return "sparkles.rectangle.stack.fill"
        case .inProgress, .running:
            return "gearshape.2.fill"
        case .awaitingMerge:
            return "arrow.triangle.merge"
        case .idle:
            return "checkmark.shield.fill"
        case .other:
            return "waveform.path.ecg"
        }
    }

    private var isAwaitingApproval: Bool {
        if case .awaitingPlanApproval = phase { return true }
        return false
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header Row: Phase Status Pill + Pulse Dot
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(phaseColor)
                        .frame(width: 8, height: 8)

                    Image(systemName: phaseIcon)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(phaseColor)

                    Text(phaseLabel.uppercased())
                        .font(BarkcliTypography.codeHash)
                        .foregroundColor(phaseColor)
                        .tracking(0.8)
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(phaseColor.opacity(0.12))
                )
                .overlay(
                    Capsule()
                        .strokeBorder(phaseColor.opacity(0.3), lineWidth: 0.5)
                )

                Spacer()

                Text("AUTOPILOT")
                    .font(BarkcliTypography.labelSmall)
                    .foregroundColor(.barkcliTextMuted)
                    .tracking(1.2)
            }

            // Attention Indicators Strip
            HStack(spacing: 8) {
                attentionPill(
                    count: counts.todoUnplanned,
                    label: "Unplanned",
                    icon: "tray",
                    highlight: counts.todoUnplanned > 0 ? .barkcliAmberPulse : .barkcliTextMuted
                )

                attentionPill(
                    count: counts.pendingProposals,
                    label: "Proposals",
                    icon: "doc.badge.gearshape",
                    highlight: counts.pendingProposals > 0 ? .barkcliStatusWarning : .barkcliTextMuted
                )

                attentionPill(
                    count: counts.queueActive,
                    label: "Active Work",
                    icon: "cpu",
                    highlight: counts.queueActive > 0 ? .barkcliStatusInfo : .barkcliTextMuted
                )

                attentionPill(
                    count: counts.inReview,
                    label: "In Review",
                    icon: "checkmark.seal",
                    highlight: counts.inReview > 0 ? .barkcliStatusActive : .barkcliTextMuted
                )
            }

            // Active Plan Proposal Card
            if let proposal {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "lightbulb.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.barkcliStatusWarning)
                        Text("Plan Proposal Ready for Review")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                        Spacer()
                        Text("\(proposal.estimatedTotalEffort) pts")
                            .font(BarkcliTypography.codeHash)
                            .foregroundColor(.barkcliTextPrimary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                RoundedRectangle(cornerRadius: 3, style: .continuous)
                                    .fill(Color.barkcliCardSubtle)
                            )
                    }

                    Text(proposal.cardTitle)
                        .font(BarkcliTypography.cardTitle)
                        .foregroundColor(.barkcliTextPrimary)
                        .lineLimit(2)

                    if !proposal.children.isEmpty {
                        Text("Decomposes into \(proposal.children.count) isolated worktree slices")
                            .font(BarkcliTypography.captionMuted)
                            .foregroundColor(.barkcliTextMuted)
                    }

                    HStack(spacing: 8) {
                        if let onReviewProposal {
                            Button(action: onReviewProposal) {
                                HStack(spacing: 5) {
                                    Image(systemName: "eye.fill")
                                        .font(.system(size: 11))
                                    Text("Review Proposal")
                                        .font(.system(size: 12, weight: .bold))
                                }
                                .foregroundColor(Color.barkcliCanvas)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(
                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                                        .fill(Color.barkcliTextPrimary)
                                )
                            }
                        }

                        if let onApproveProposal {
                            Button(action: onApproveProposal) {
                                HStack(spacing: 5) {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 11, weight: .bold))
                                    Text("Approve")
                                        .font(.system(size: 12, weight: .bold))
                                }
                                .foregroundColor(.barkcliStatusActive)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(
                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                                        .fill(Color.barkcliStatusActive.opacity(0.12))
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                                        .strokeBorder(Color.barkcliStatusActive.opacity(0.3), lineWidth: 1)
                                )
                            }
                        }

                        if let onRejectProposal {
                            Button(action: onRejectProposal) {
                                Text("Reject")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(.barkcliTextMuted)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 7)
                            }
                        }
                    }
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color.barkcliCardBackground)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(Color.barkcliBorderFocus, lineWidth: 1)
                )
            }
        }
        .padding(14)
        .liquidGlass(
            cornerRadius: 14,
            borderColor: phaseColor.opacity(0.3),
            tint: phaseColor,
            glowColor: phaseColor,
            glowRadius: isAwaitingApproval ? 6 : 0
        )
    }

    private func attentionPill(count: Int, label: String, icon: String, highlight: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10))
                .foregroundColor(highlight)
            Text("\(count)")
                .font(BarkcliTypography.codeHash)
                .foregroundColor(.barkcliTextPrimary)
            Text(label)
                .font(.system(size: 10, weight: .regular))
                .foregroundColor(.barkcliTextMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 5)
        .padding(.horizontal, 6)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color.barkcliSpaceBlack.opacity(0.6))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .strokeBorder(Color.barkcliBorderHairline.opacity(0.4), lineWidth: 0.5)
        )
    }
}
