import SwiftUI
#if os(iOS)
import UIKit
#endif

/// Central command deck for barkcli — the management layer for AI agents.
/// Surfaces project health indicators, live autopilot phase states, velocity metrics,
/// real-time agent worktree sessions, and critical blocker feeds.
public struct MindDashboardView: View {
    @Environment(MindStore.self) private var mindStore
    @Environment(WorkspaceStore.self) private var workspaceStore
    @State private var showCopiedAlert: Bool = false
    @State private var selectedProposal: PlanProposal?

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    // Header Bar with Workspace Status & Actions
                    headerDeckView

                    // Autopilot Attention Strip
                    AutopilotBanner(
                        phase: mindStore.currentPhase,
                        phaseLabel: mindStore.phaseLabel,
                        counts: mindStore.attentionCounts,
                        proposal: mindStore.activeProposal,
                        onReviewProposal: {
                            selectedProposal = mindStore.activeProposal
                        },
                        onApproveProposal: {
                            Task {
                                try? await mindStore.approveActiveProposal()
                            }
                        },
                        onRejectProposal: {
                            Task {
                                try? await mindStore.rejectActiveProposal()
                            }
                        }
                    )

                    // 4-Tile High-Impact Velocity & Health Grid
                    metricsGridSection

                    // Live Agent Fleet Worktree Sessions Rail
                    liveAgentRailSection

                    // Critical Blockers Attention Feed
                    if !mindStore.blockers.isEmpty {
                        blockersSection
                    }

                    // Stale Cards Warning Section (>7d inactive)
                    if !mindStore.staleCards.isEmpty {
                        staleCardsSection
                    }

                    // Heuristic Next Recommended Actions
                    if !mindStore.nextActions.isEmpty {
                        nextActionsSection
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(Color.barkcliObsidian.ignoresSafeArea())
            .refreshable {
                await mindStore.refresh()
            }
            .navigationTitle("Mind Deck")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    HStack(spacing: 6) {
                        Image(systemName: "cpu.fill")
                            .font(.system(size: 13))
                            .foregroundColor(.barkcliElectricViolet)
                        Text(workspaceStore.currentWorkspace.name)
                            .font(BarkcliTypography.codeHash)
                            .foregroundColor(.barkcliTextPrimary)
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    HStack(spacing: 12) {
                        Button {
                            copyDigestToClipboard()
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .font(.system(size: 14))
                                .foregroundColor(.barkcliTextMuted)
                        }

                        Button {
                            Task {
                                await mindStore.refresh()
                            }
                        } label: {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 14))
                                .foregroundColor(.barkcliElectricViolet)
                        }
                    }
                }
            }
            .overlay(alignment: .bottom) {
                if showCopiedAlert {
                    Text("Digest copied to clipboard")
                        .font(BarkcliTypography.badge)
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(Color.barkcliElectricViolet))
                        .padding(.bottom, 20)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .task {
                if mindStore.snapshot == nil {
                    await mindStore.refresh()
                }
            }
        }
    }

    // MARK: - Header Deck
    private var headerDeckView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("barkcli management layer")
                    .font(BarkcliTypography.captionMuted)
                    .foregroundColor(.barkcliTextMuted)
                Text("Autonomous Mind Stream")
                    .font(BarkcliTypography.sectionHeader)
                    .foregroundColor(.barkcliTextPrimary)
            }

            Spacer()

            // Live Connection Status Beacon
            HStack(spacing: 5) {
                Circle()
                    .fill(workspaceStore.connectionMode == .connected ? Color.barkcliEmeraldGate : (workspaceStore.connectionMode == .demoMode ? Color.barkcliElectricViolet : Color.barkcliAmberPulse))
                    .frame(width: 7, height: 7)

                Text(workspaceStore.connectionMode == .demoMode ? "OFFLINE DEMO" : (workspaceStore.connectionMode == .connected ? "LIVE DAEMON" : "CONNECTING"))
                    .font(BarkcliTypography.codeHash)
                    .foregroundColor(.barkcliTextMuted)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(Color.barkcliSpaceBlack))
            .overlay(Capsule().strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5))
        }
    }

    // MARK: - Metrics Grid
    private var metricsGridSection: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            MetricTile(
                title: "Health Score",
                value: "\(Int(mindStore.healthScore))%",
                subtitle: mindStore.healthScore >= 80 ? "Optimal gates" : "Attention needed",
                systemImage: "heart.fill",
                accentColor: mindStore.healthScore >= 80 ? .barkcliEmeraldGate : .barkcliAmberPulse
            )

            MetricTile(
                title: "Velocity",
                value: "\(mindStore.velocity.totalDone)",
                subtitle: "\(mindStore.velocity.totalPoints) effort pts done",
                systemImage: "bolt.fill",
                accentColor: .barkcliElectricViolet
            )

            MetricTile(
                title: "WIP Violations",
                value: "\(mindStore.snapshot?.healthMetrics.wipViolationsCount ?? 0)",
                subtitle: (mindStore.snapshot?.healthMetrics.wipViolationsCount ?? 0) == 0 ? "Under column limits" : "Limit exceeded",
                systemImage: "exclamationmark.triangle.fill",
                accentColor: (mindStore.snapshot?.healthMetrics.wipViolationsCount ?? 0) == 0 ? .barkcliTextMuted : .barkcliCrimsonBlocker
            )

            MetricTile(
                title: "Blocked Issues",
                value: "\(mindStore.blockers.count)",
                subtitle: mindStore.blockers.isEmpty ? "All tracks clear" : "Active blockers",
                systemImage: "lock.shield.fill",
                accentColor: mindStore.blockers.isEmpty ? .barkcliEmeraldGate : .barkcliCrimsonBlocker
            )
        }
    }

    // MARK: - Live Agent Fleet Rail
    private var liveAgentRailSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                "Live Runner Sessions",
                subtitle: "Active agent worktrees & acceptance gates",
                count: mindStore.liveSessions.count,
                systemImage: "terminal.fill"
            )

            if mindStore.liveSessions.isEmpty {
                HStack {
                    Image(systemName: "sleep")
                        .foregroundColor(.barkcliTextMuted)
                    Text("No agents currently executing in worktrees. Dispatch intent to spawn runs.")
                        .font(BarkcliTypography.captionMuted)
                        .foregroundColor(.barkcliTextMuted)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.barkcliSpaceBlack))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5))
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(mindStore.liveSessions) { session in
                            liveSessionCard(session)
                        }
                    }
                }
            }
        }
    }

    private func liveSessionCard(_ session: LiveSession) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color.barkcliAmberPulse)
                    .frame(width: 7, height: 7)

                Text(session.backend)
                    .font(BarkcliTypography.codeHash)
                    .foregroundColor(.barkcliElectricViolet)

                Spacer()

                Text("run-\(session.id.prefix(4))")
                    .font(BarkcliTypography.codeHash)
                    .foregroundColor(.barkcliTextMuted)
            }

            HStack(spacing: 4) {
                Image(systemName: "arrow.triangle.branch")
                    .font(.system(size: 10))
                    .foregroundColor(.barkcliCyberCyan)
                Text(session.branch ?? "main")
                    .font(BarkcliTypography.branchName)
                    .foregroundColor(.barkcliCyberCyan)
                    .lineLimit(1)
            }

            Text(session.note ?? "Executing isolated worktree pass...")
                .font(BarkcliTypography.captionMuted)
                .foregroundColor(.barkcliTextPrimary)
                .lineLimit(2)
                .frame(height: 32, alignment: .topLeading)

            HStack {
                HStack(spacing: 4) {
                    Image(systemName: session.status == "completed" ? "checkmark.circle.fill" : (session.status == "failed" ? "xmark.circle.fill" : "hourglass"))
                        .font(.system(size: 10))
                    Text(session.status.uppercased())
                        .font(BarkcliTypography.labelSmall)
                }
                .foregroundColor(session.status == "completed" ? .barkcliEmeraldGate : (session.status == "failed" ? .barkcliCrimsonBlocker : .barkcliAmberPulse))

                Spacer()

                Text(session.agentId)
                    .font(BarkcliTypography.codeHash)
                    .foregroundColor(.barkcliTextMuted)
            }
        }
        .padding(12)
        .frame(width: 220)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.barkcliSlateGlass))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5))
    }

    // MARK: - Blockers Section
    private var blockersSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                "Critical Blockers",
                subtitle: "Cards halted waiting on dependencies",
                count: mindStore.blockers.count,
                systemImage: "exclamationmark.octagon.fill"
            )

            VStack(spacing: 8) {
                ForEach(mindStore.blockers, id: \.id) { blocker in
                    HStack(spacing: 12) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.barkcliCrimsonBlocker)

                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(blocker.cardId)
                                    .font(BarkcliTypography.cardId)
                                    .foregroundColor(.barkcliCrimsonBlocker)
                                Text(blocker.title)
                                    .font(BarkcliTypography.cardTitle)
                                    .foregroundColor(.barkcliTextPrimary)
                                    .lineLimit(1)
                            }

                            if !blocker.blockedBy.isEmpty {
                                Text("Waiting on: \(blocker.blockedBy.joined(separator: ", "))")
                                    .font(BarkcliTypography.captionMuted)
                                    .foregroundColor(.barkcliTextMuted)
                            }
                        }

                        Spacer()

                        if let hint = blocker.resolutionHint {
                            Text(hint)
                                .font(BarkcliTypography.captionMuted)
                                .foregroundColor(.barkcliAmberPulse)
                                .lineLimit(1)
                        }
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.barkcliCrimsonBlocker.opacity(0.08)))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.barkcliCrimsonBlocker.opacity(0.3), lineWidth: 0.5))
                }
            }
        }
    }

    // MARK: - Stale Cards Section
    private var staleCardsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                "Stale Cards",
                subtitle: "No agent or human updates for over 7 days",
                count: mindStore.staleCards.count,
                systemImage: "clock.badge.exclamationmark"
            )

            VStack(spacing: 8) {
                ForEach(mindStore.staleCards, id: \.id) { stale in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(stale.id)
                                    .font(BarkcliTypography.cardId)
                                    .foregroundColor(.barkcliAmberPulse)
                                Text(stale.title)
                                    .font(BarkcliTypography.cardTitle)
                                    .foregroundColor(.barkcliTextPrimary)
                                    .lineLimit(1)
                            }
                            Text("In '\(stale.column)' column for \(stale.days) days")
                                .font(BarkcliTypography.captionMuted)
                                .foregroundColor(.barkcliTextMuted)
                        }

                        Spacer()

                        Text("\(stale.days)d")
                            .font(BarkcliTypography.codeHash)
                            .foregroundColor(.barkcliAmberPulse)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Color.barkcliAmberPulse.opacity(0.15)))
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.barkcliSpaceBlack))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5))
                }
            }
        }
    }

    // MARK: - Recommended Actions Section
    private var nextActionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                "Recommended Actions",
                subtitle: "Autopilot management suggestions",
                count: mindStore.nextActions.count,
                systemImage: "lightbulb.fill"
            )

            VStack(spacing: 8) {
                ForEach(mindStore.nextActions, id: \.id) { action in
                    HStack(spacing: 10) {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 13))
                            .foregroundColor(.barkcliElectricViolet)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(action.action)
                                .font(BarkcliTypography.cardTitle)
                                .foregroundColor(.barkcliTextPrimary)
                            Text(action.reason)
                                .font(BarkcliTypography.captionMuted)
                                .foregroundColor(.barkcliTextMuted)
                        }

                        Spacer()

                        StatusBadge("ACTION", variant: .electric)
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.barkcliSpaceBlack))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5))
                }
            }
        }
    }

    // MARK: - Helpers
    private func copyDigestToClipboard() {
        let digest = mindStore.exportMarkdownDigest()
        #if os(iOS)
        UIPasteboard.general.string = digest
        #endif
        withAnimation {
            showCopiedAlert = true
        }
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            withAnimation {
                showCopiedAlert = false
            }
        }
    }
}
