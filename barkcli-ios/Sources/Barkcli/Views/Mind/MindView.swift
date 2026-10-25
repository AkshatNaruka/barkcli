import SwiftUI

public struct CircularHealthMeter: View {
    public let score: Double

    public init(score: Double) {
        self.score = max(0, min(100, score))
    }

    private var meterColor: Color {
        if score >= 85 {
            return .barkcliSuccessEmerald
        } else if score >= 60 {
            return .barkcliWarningAmber
        } else {
            return .barkcliDangerRose
        }
    }

    public var body: some View {
        ZStack {
            Circle()
                .stroke(Color.barkcliBorderSubtle.opacity(0.4), lineWidth: 10)

            Circle()
                .trim(from: 0.0, to: CGFloat(score / 100.0))
                .stroke(
                    meterColor,
                    style: StrokeStyle(lineWidth: 10, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.easeInOut(duration: 0.6), value: score)

            VStack(spacing: 2) {
                Text("\(Int(score))%")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(.barkcliTextPrimary)

                Text("HEALTH")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.barkcliTextMuted)
                    .tracking(1.0)
            }
        }
        .frame(width: 105, height: 105)
    }
}

public struct MindView: View {
    @Environment(AppState.self) private var appState

    public init() {}

    private var mind: MindSnapshot? {
        appState.mindSnapshot
    }

    private var healthMetrics: HealthMetrics {
        mind?.healthMetrics ?? HealthMetrics()
    }

    private var blockers: [BlockerItem] {
        mind?.blockers ?? []
    }

    private var staleCards: [StaleCardSummary] {
        mind?.staleCards ?? []
    }

    private var nextActions: [NextActionSummary] {
        mind?.nextActions ?? []
    }

    private var velocity: VelocitySummary {
        mind?.velocity ?? VelocitySummary()
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                healthHeroCard

                velocityMetricsSection

                blockersSection

                if !staleCards.isEmpty {
                    staleCardsSection
                }

                if !nextActions.isEmpty {
                    recommendedActionsSection
                }
            }
            .padding(16)
        }
        .background(Color.barkcliDarkBackground.ignoresSafeArea())
        .refreshable {
            await appState.refresh()
        }
    }

    private var healthHeroCard: some View {
        GlassCard(padding: 20) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .center, spacing: 20) {
                    CircularHealthMeter(score: healthMetrics.healthScore)

                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            Text("AUTONOMOUS HEALTH")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliAccentPurple)
                                .tracking(0.8)

                            Spacer()

                            StatusBadge(
                                healthMetrics.healthScore >= 80 ? "Healthy" : "Needs Review",
                                systemImage: healthMetrics.healthScore >= 80 ? "checkmark.shield.fill" : "exclamationmark.triangle.fill",
                                variant: healthMetrics.healthScore >= 80 ? .success : .warning
                            )
                        }

                        Text("Management layer stability")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)

                        Text("Continuous assessment of agent flow and delivery readiness.")
                            .font(.system(size: 13))
                            .foregroundColor(.barkcliTextMuted)
                            .lineLimit(2)
                    }
                }

                Divider()
                    .overlay(Color.barkcliBorderSubtle)

                HStack(spacing: 12) {
                    summaryPill(
                        label: "WIP Violations",
                        value: "\(healthMetrics.wipViolationsCount)",
                        icon: "gauge.with.needle",
                        variant: healthMetrics.wipViolationsCount == 0 ? .success : .warning
                    )

                    summaryPill(
                        label: "Blocked Cards",
                        value: "\(healthMetrics.blockedCardsCount)",
                        icon: "lock.shield",
                        variant: healthMetrics.blockedCardsCount == 0 ? .success : .danger
                    )

                    summaryPill(
                        label: "Stale Cards",
                        value: "\(healthMetrics.staleCardsCount)",
                        icon: "clock.badge.exclamationmark",
                        variant: healthMetrics.staleCardsCount == 0 ? .neutral : .warning
                    )
                }
            }
        }
    }

    private func summaryPill(label: String, value: String, icon: String, variant: StatusBadgeVariant) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 11))
                    .foregroundColor(variant.foregroundColor)
                Text(label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.barkcliTextMuted)
            }

            Text(value)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(variant.foregroundColor)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.barkcliSurface.opacity(0.6))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
        )
    }

    private var velocityMetricsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                "Sprint Velocity",
                subtitle: "Delivery throughput across passing gates",
                systemImage: "bolt.horizontal.fill"
            )

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                MetricTile(
                    title: "Completed Cards",
                    value: "\(velocity.totalDone)",
                    subtitle: "Finished and verified",
                    systemImage: "checkmark.circle.fill",
                    trend: .up("\(velocity.totalDone) cards"),
                    accentColor: .barkcliSuccessEmerald
                )

                MetricTile(
                    title: "Effort Points",
                    value: "\(velocity.totalPoints)",
                    subtitle: "Points earned",
                    systemImage: "chart.line.uptrend.xyaxis",
                    accentColor: .barkcliAccentPurple
                )

                MetricTile(
                    title: "Average Velocity",
                    value: String(format: "%.1f", velocity.avgEffort),
                    subtitle: "Effort points per card",
                    systemImage: "speedometer",
                    accentColor: .barkcliWarningAmber
                )

                MetricTile(
                    title: "Cycle Duration",
                    value: String(format: "%.1f d", velocity.cycleTimeDays ?? 0.0),
                    subtitle: "Average turnaround",
                    systemImage: "timer",
                    accentColor: .barkcliTextMuted
                )
            }
        }
    }

    private var blockersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                "Active Blockers",
                subtitle: "Prerequisites requiring human or agent resolution",
                count: blockers.count,
                systemImage: "exclamationmark.octagon.fill"
            )

            if blockers.isEmpty {
                GlassCard {
                    HStack(spacing: 14) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 28))
                            .foregroundColor(.barkcliSuccessEmerald)

                        VStack(alignment: .leading, spacing: 3) {
                            Text("Zero Active Blockers")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.barkcliTextPrimary)

                            Text("All planned agent work is cleared for autonomous execution.")
                                .font(.system(size: 13))
                                .foregroundColor(.barkcliTextMuted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                ForEach(blockers) { blocker in
                    blockerCard(blocker)
                }
            }
        }
    }

    private func blockerCard(_ blocker: BlockerItem) -> some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            StatusBadge(blocker.cardId, variant: .accent)
                            StatusBadge(blocker.column.capitalized, variant: .neutral)
                        }

                        Text(blocker.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    Spacer()

                    StatusBadge("Blocked", systemImage: "lock.fill", variant: .danger)
                }

                if !blocker.blockedBy.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("WAITING ON PREREQUISITES")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                            .tracking(0.5)

                        HStack(spacing: 6) {
                            ForEach(blocker.blockedBy, id: \.self) { prereqId in
                                HStack(spacing: 4) {
                                    Image(systemName: "arrow.turn.down.right")
                                        .font(.system(size: 10))
                                    Text(prereqId)
                                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                                }
                                .foregroundColor(.barkcliWarningAmber)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Color.barkcliWarningAmber.opacity(0.12))
                                .clipShape(Capsule())
                            }
                        }
                    }
                }

                if let hint = blocker.resolutionHint, !hint.isEmpty {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "lightbulb.fill")
                            .font(.system(size: 12))
                            .foregroundColor(.barkcliAccentPurple)
                            .padding(.top, 2)

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Resolution Strategy")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliAccentPurple)

                            Text(hint)
                                .font(.system(size: 12))
                                .foregroundColor(.barkcliTextMuted)
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.barkcliAccentPurple.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
        }
    }

    private var staleCardsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                "Stale Cards Warnings",
                subtitle: "Tasks untouched past normal freshness limits",
                count: staleCards.count,
                systemImage: "clock.arrow.circlepath"
            )

            ForEach(staleCards) { card in
                GlassCard(padding: 12) {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(card.id)
                                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                    .foregroundColor(.barkcliAccentPurple)

                                StatusBadge(card.column.capitalized, variant: .neutral)
                            }

                            Text(card.title)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.barkcliTextPrimary)
                        }

                        Spacer()

                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(card.days) days")
                                .font(.system(size: 14, weight: .bold, design: .rounded))
                                .foregroundColor(.barkcliWarningAmber)

                            Text("inactive")
                                .font(.system(size: 10))
                                .foregroundColor(.barkcliTextMuted)
                        }
                    }
                }
            }
        }
    }

    private var recommendedActionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                "Recommended Actions",
                subtitle: "Strategic steps to unblock autonomous flow",
                systemImage: "sparkles"
            )

            ForEach(nextActions) { actionItem in
                GlassCard(padding: 14) {
                    HStack(alignment: .top, spacing: 12) {
                        Circle()
                            .fill(Color.barkcliAccentPurple.opacity(0.18))
                            .frame(width: 32, height: 32)
                            .overlay(
                                Image(systemName: "arrow.forward")
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundColor(.barkcliAccentPurple)
                            )

                        VStack(alignment: .leading, spacing: 4) {
                            Text(actionItem.action)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.barkcliTextPrimary)

                            Text(actionItem.reason)
                                .font(.system(size: 12))
                                .foregroundColor(.barkcliTextMuted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}
