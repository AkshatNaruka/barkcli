import SwiftUI

/// Fleet card presenting a registered agent's status, role, and telemetry metrics.
public struct AgentCardView: View {
    public let agent: AgentItem
    public var onClaimTask: (() -> Void)? = nil
    public var onRemove: (() -> Void)? = nil

    public init(
        agent: AgentItem,
        onClaimTask: (() -> Void)? = nil,
        onRemove: (() -> Void)? = nil
    ) {
        self.agent = agent
        self.onClaimTask = onClaimTask
        self.onRemove = onRemove
    }

    public var body: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                // Header: Role Icon, Name, Status Badge
                HStack(spacing: 10) {
                    Image(systemName: agent.role.iconName)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(roleColor(agent.role))
                        .frame(width: 36, height: 36)
                        .background(roleColor(agent.role).opacity(0.15))
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .strokeBorder(roleColor(agent.role).opacity(0.3), lineWidth: 1)
                        )

                    VStack(alignment: .leading, spacing: 2) {
                        Text(agent.name)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)

                        Text(agent.role.displayName)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.barkcliTextMuted)
                    }

                    Spacer()

                    StatusBadge(
                        agent.status.displayName,
                        variant: agent.status.badgeVariant
                    )
                }

                // Description
                Text(agent.role.description)
                    .font(.system(size: 12))
                    .foregroundColor(.barkcliTextMuted)
                    .lineLimit(2)

                Divider()
                    .overlay(Color.barkcliBorderHairline)

                // Telemetry Metrics Grid
                HStack(spacing: 12) {
                    metricColumn(
                        title: "ACTIVE",
                        value: "\(agent.activeTasks.count)",
                        color: agent.activeTasks.isEmpty ? .barkcliTextMuted : .barkcliAmberPulse
                    )

                    Divider()
                        .frame(height: 24)
                        .overlay(Color.barkcliBorderHairline)

                    metricColumn(
                        title: "COMPLETED",
                        value: "\(agent.completedTasks.count)",
                        color: .barkcliEmeraldGate
                    )

                    Divider()
                        .frame(height: 24)
                        .overlay(Color.barkcliBorderHairline)

                    metricColumn(
                        title: "TOKENS",
                        value: formatTokens(agent.metrics.totalTokensUsed),
                        color: .barkcliTextPrimary
                    )

                    Divider()
                        .frame(height: 24)
                        .overlay(Color.barkcliBorderHairline)

                    metricColumn(
                        title: "SUCCESS",
                        value: String(format: "%.0f%%", agent.metrics.successRate * 100),
                        color: .barkcliStatusActive
                    )
                }

                // Heartbeat / Alive Indicator
                HStack(spacing: 6) {
                    Circle()
                        .fill(agent.isAlive() ? Color.barkcliEmeraldGate : Color.barkcliTextMuted)
                        .frame(width: 6, height: 6)

                    Text(agent.isAlive() ? "Active within 5m" : "Offline / Idle")
                        .font(BarkcliTypography.captionMuted)
                        .foregroundColor(.barkcliTextMuted)

                    Spacer()

                    if let onRemove {
                        Button {
                            onRemove()
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 11))
                                .foregroundColor(.barkcliTextMuted)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func metricColumn(title: String, value: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(title)
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(.barkcliTextMuted)
                .tracking(0.5)

            Text(value)
                .font(.system(size: 13, weight: .bold, design: .monospaced))
                .foregroundColor(color)
        }
        .frame(maxWidth: .infinity)
    }

    private func roleColor(_ role: AgentRole) -> Color {
        switch role {
        case .scrumMaster:
            return .barkcliAmberPulse
        case .productOwner:
            return .barkcliTextPrimary
        case .techLead:
            return .barkcliStatusActive
        case .projectManager:
            return .barkcliEmeraldGate
        }
    }

    private func formatTokens(_ count: UInt64) -> String {
        if count >= 1_000_000 {
            return String(format: "%.1fM", Double(count) / 1_000_000.0)
        } else if count >= 1_000 {
            return String(format: "%.1fk", Double(count) / 1_000.0)
        }
        return "\(count)"
    }
}
