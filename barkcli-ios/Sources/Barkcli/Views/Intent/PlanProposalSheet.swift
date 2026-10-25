import SwiftUI

/// Plan Proposal Review & Approval modal sheet.
/// Surfaces the agent's proposed architectural slices, acceptance criteria,
/// effort estimation, rationale, and one-tap human approval or review gate execution.
public struct PlanProposalSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(MindStore.self) private var envMindStore: MindStore?
    @State private var fallbackMindStore = MindStore.shared

    public let proposal: PlanProposal
    public var onApproved: (() -> Void)? = nil
    public var onRejected: ((String?) -> Void)? = nil

    @State private var isApproving: Bool = false
    @State private var isRejecting: Bool = false
    @State private var isRunningGate: Bool = false
    @State private var showRejectReasonInput: Bool = false
    @State private var rejectReasonText: String = ""
    @State private var gateVerdictMessage: String?
    @State private var gatePassed: Bool = false

    public init(
        proposal: PlanProposal,
        onApproved: (() -> Void)? = nil,
        onRejected: ((String?) -> Void)? = nil
    ) {
        self.proposal = proposal
        self.onApproved = onApproved
        self.onRejected = onRejected
    }

    private var mindStore: MindStore {
        envMindStore ?? fallbackMindStore
    }

    private var client: any APIClientProtocol {
        mindStore.client
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Header Summary Hero Card
                    heroCard

                    // Agent Rationale
                    if !proposal.rationale.isEmpty {
                        rationaleCard
                    }

                    // Acceptance Requirements
                    if !proposal.requirements.isEmpty {
                        requirementsSection
                    }

                    // Decomposed Slices Section
                    decomposedSlicesSection

                    // Test Gate Status if triggered
                    if let message = gateVerdictMessage {
                        gateVerdictCard(message)
                    }

                    // Action Controls
                    actionsSection
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
                    Button("Close") {
                        dismiss()
                    }
                    .foregroundColor(.barkcliTextMuted)
                }
            }
        }
    }

    // MARK: - Hero Card

    private var heroCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    StatusBadge(proposal.cardId, variant: .accent)

                    StatusBadge(
                        "Risk \(proposal.riskLevel.capitalized)",
                        systemImage: "shield.lefthalf.filled",
                        variant: riskVariant(proposal.riskLevel)
                    )

                    Spacer()

                    Text("\(proposal.estimatedTotalEffort) pts")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundColor(.barkcliElectricViolet)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.barkcliElectricViolet.opacity(0.12))
                        .clipShape(Capsule())
                }

                Text(proposal.cardTitle)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Image(systemName: "cpu")
                            .font(.system(size: 11))
                        Text("Proposed by \(proposal.proposedBy)")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(.barkcliTextMuted)

                    if let date = proposal.proposedAt {
                        Text(date.formatted(date: .abbreviated, time: .shortened))
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextMuted)
                    }
                }
            }
        }
    }

    // MARK: - Rationale Card

    private var rationaleCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "brain.head.profile")
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliElectricViolet)

                    Text("AGENT RATIONALE")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliTextMuted)
                        .tracking(0.6)
                }

                Text(proposal.rationale)
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextPrimary)
                    .lineSpacing(3)
            }
        }
    }

    // MARK: - Requirements Section

    private var requirementsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                "Requirements Matrix",
                count: proposal.requirements.count,
                systemImage: "list.bullet.clipboard"
            )

            ForEach(proposal.requirements) { req in
                GlassCard(padding: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(req.title)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.barkcliTextPrimary)

                            Spacer()

                            Text("\(req.effort) pts")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.barkcliTextMuted)
                        }

                        if !req.acceptanceCriteria.isEmpty {
                            VStack(alignment: .leading, spacing: 3) {
                                ForEach(req.acceptanceCriteria, id: \.self) { criterion in
                                    HStack(alignment: .top, spacing: 5) {
                                        Text("•")
                                            .foregroundColor(.barkcliElectricViolet)
                                        Text(criterion)
                                            .font(.system(size: 11))
                                            .foregroundColor(.barkcliTextMuted)
                                    }
                                }
                            }
                            .padding(.leading, 8)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Decomposed Slices Section

    private var decomposedSlicesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                "Decomposed Worktree Slices",
                count: proposal.children.count,
                systemImage: "arrow.triangle.branch"
            )

            ForEach(Array(proposal.children.enumerated()), id: \.offset) { index, slice in
                sliceCard(slice, index: index + 1)
            }
        }
    }

    private func sliceCard(_ slice: ProposedSlice, index: Int) -> some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text("Slice #\(index)")
                        .font(BarkcliTypography.codeHash)
                        .foregroundColor(.barkcliCyberCyan)

                    StatusBadge(slice.priority.displayName, variant: slice.priority == .critical ? .danger : .neutral)

                    Spacer()

                    Text("\(slice.effort) pts")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(.barkcliElectricViolet)
                }

                Text(slice.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.barkcliTextPrimary)

                if !slice.description.isEmpty {
                    Text(slice.description)
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)
                }

                if !slice.acceptanceCriteria.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("ACCEPTANCE CRITERIA")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                            .tracking(0.5)

                        ForEach(slice.acceptanceCriteria, id: \.self) { criterion in
                            HStack(alignment: .top, spacing: 6) {
                                Image(systemName: "checkmark.circle")
                                    .font(.system(size: 10))
                                    .foregroundColor(.barkcliEmeraldGate)

                                Text(criterion)
                                    .font(.system(size: 11))
                                    .foregroundColor(.barkcliTextPrimary)
                            }
                        }
                    }
                    .padding(8)
                    .background(Color.barkcliSpaceBlack)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
            }
        }
    }

    private func gateVerdictCard(_ message: String) -> some View {
        GlassCard(padding: 12) {
            HStack(spacing: 8) {
                Image(systemName: gatePassed ? "checkmark.seal.fill" : "xmark.octagon.fill")
                    .foregroundColor(gatePassed ? .barkcliEmeraldGate : .barkcliCrimsonBlocker)

                Text(message)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(gatePassed ? .barkcliEmeraldGate : .barkcliCrimsonBlocker)
            }
        }
    }

    // MARK: - Action Controls

    private var actionsSection: some View {
        VStack(spacing: 12) {
            // Approve Plan
            ActionButton(
                isApproving ? "Approving Plan..." : "Approve Plan",
                systemImage: "checkmark.circle.fill",
                variant: .primary,
                isLoading: isApproving
            ) {
                Task {
                    isApproving = true
                    defer { isApproving = false }
                    do {
                        try await mindStore.approveActiveProposal()
                        onApproved?()
                        #if os(iOS)
                        let generator = UINotificationFeedbackGenerator()
                        generator.notificationOccurred(.success)
                        #endif
                        dismiss()
                    } catch {
                        #if os(iOS)
                        let generator = UINotificationFeedbackGenerator()
                        generator.notificationOccurred(.error)
                        #endif
                    }
                }
            }

            // Run Review Gate
            ActionButton(
                isRunningGate ? "Running Acceptance Gate..." : "Run Review Gate",
                systemImage: "play.circle.fill",
                variant: .secondary,
                isLoading: isRunningGate
            ) {
                Task {
                    isRunningGate = true
                    defer { isRunningGate = false }
                    do {
                        let result = try await client.runReviewGate(cardId: proposal.cardId)
                        gatePassed = result.passed
                        gateVerdictMessage = "\(result.passedTests)/\(result.totalTests) project acceptance gate tests passed (\(String(format: "%.2f", result.durationSeconds))s)"
                    } catch {
                        gatePassed = false
                        gateVerdictMessage = "Acceptance gate execution failed: \(error.localizedDescription)"
                    }
                }
            }

            // Reject / Request Revision
            if showRejectReasonInput {
                VStack(spacing: 8) {
                    TextField("Enter reason or revision guidance", text: $rejectReasonText)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextPrimary)
                        .textFieldStyle(.plain)
                        .padding(10)
                        .background(Color.barkcliSpaceBlack)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5)
                        )

                    HStack(spacing: 10) {
                        Button("Cancel") {
                            showRejectReasonInput = false
                        }
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextMuted)

                        Spacer()

                        Button("Confirm Rejection") {
                            Task {
                                isRejecting = true
                                defer { isRejecting = false }
                                let reason = rejectReasonText.isEmpty ? nil : rejectReasonText
                                try? await mindStore.rejectActiveProposal(reason: reason)
                                onRejected?(reason)
                                dismiss()
                            }
                        }
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.barkcliDangerRose)
                    }
                }
                .padding(12)
                .background(Color.barkcliSpaceBlack.opacity(0.8))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                Button {
                    showRejectReasonInput = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "xmark.circle")
                        Text("Reject / Request Revision")
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.barkcliDangerRose)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func riskVariant(_ risk: String) -> StatusBadgeVariant {
        switch risk.lowercased() {
        case "low":
            return .success
        case "medium":
            return .warning
        case "high", "critical":
            return .danger
        default:
            return .neutral
        }
    }
}
