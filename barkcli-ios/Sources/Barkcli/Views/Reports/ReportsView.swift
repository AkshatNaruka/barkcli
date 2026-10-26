import SwiftUI

public struct ReportsView: View {
    @Environment(ReportsStore.self) private var reportsStore

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            headerBar
            Divider().overlay(Color.barkcliBorder)

            ScrollView {
                VStack(spacing: 16) {
                    summaryMetricsDeck
                    effortDistributionSection
                    priorityRollupSection
                }
                .padding(16)
            }
        }
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .task {
            if reportsStore.totalEffort == 0 {
                await reportsStore.loadReports()
            }
        }
    }

    private var headerBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text("Reports and Analytics")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    StatusBadge("workspace telemetry", variant: .accent)
                }

                Text("Effort rollups completion velocity and throughput distributions")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            }

            Spacer()

            ActionButton(
                "Refresh",
                systemImage: "arrow.clockwise",
                variant: .secondary
            ) {
                Task {
                    await reportsStore.loadReports()
                }
            }
            .frame(width: 100)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.barkcliCardBackground)
    }

    private var summaryMetricsDeck: some View {
        HStack(spacing: 12) {
            MetricTile(
                title: "Total Effort",
                value: "\(reportsStore.totalEffort) pts",
                subtitle: "Across all columns",
                systemImage: "chart.bar.xaxis"
            )

            MetricTile(
                title: "Velocity",
                value: "\(String(format: "%.1f", reportsStore.metrics.completionVelocity)) pts/wk",
                subtitle: "Nominal trend",
                systemImage: "bolt.fill",
                accentColor: .barkcliStatusActive
            )

            MetricTile(
                title: "Cycle Time",
                value: "\(String(format: "%.1f", reportsStore.metrics.cycleTimeDays)) days",
                subtitle: "Intent to gate merge",
                systemImage: "timer"
            )

            MetricTile(
                title: "Throughput",
                value: "\(String(format: "%.1f", reportsStore.metrics.throughputPerWeek)) cards/wk",
                subtitle: "Acceptance gate volume",
                systemImage: "checkmark.seal"
            )
        }
    }

    private var effortDistributionSection: some View {
        GlassCard(cornerRadius: 6, padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Effort by Column")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    Spacer()

                    Text("\(reportsStore.totalEffort) total points")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(.barkcliTextMuted)
                }

                VStack(spacing: 8) {
                    ForEach(Array(reportsStore.metrics.effortByColumn.keys.sorted()), id: \.self) { col in
                        let pts = reportsStore.metrics.effortByColumn[col] ?? 0
                        let total = max(1, reportsStore.totalEffort)
                        let fraction = Double(pts) / Double(total)

                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(col.uppercased())
                                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                                    .foregroundColor(.barkcliTextPrimary)

                                Spacer()

                                Text("\(pts) pts (\(Int(fraction * 100))%)")
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundColor(.barkcliTextSecondary)
                            }

                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                                        .fill(Color.barkcliBorder)
                                        .frame(height: 6)

                                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                                        .fill(columnColor(col))
                                        .frame(width: max(0, geo.size.width * fraction), height: 6)
                                }
                            }
                            .frame(height: 6)
                        }
                    }
                }
            }
        }
    }

    private var priorityRollupSection: some View {
        GlassCard(cornerRadius: 6, padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Cards by Priority")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    Spacer()

                    Text("\(reportsStore.totalCards) total cards")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(.barkcliTextMuted)
                }

                VStack(spacing: 8) {
                    ForEach(Array(reportsStore.metrics.cardsByPriority.keys.sorted()), id: \.self) { prio in
                        let count = reportsStore.metrics.cardsByPriority[prio] ?? 0
                        let total = max(1, reportsStore.totalCards)
                        let fraction = Double(count) / Double(total)

                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(prio.uppercased())
                                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                                    .foregroundColor(.barkcliTextPrimary)

                                Spacer()

                                Text("\(count) cards (\(Int(fraction * 100))%)")
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundColor(.barkcliTextSecondary)
                            }

                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                                        .fill(Color.barkcliBorder)
                                        .frame(height: 6)

                                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                                        .fill(priorityColor(prio))
                                        .frame(width: max(0, geo.size.width * fraction), height: 6)
                                }
                            }
                            .frame(height: 6)
                        }
                    }
                }
            }
        }
    }

    private func columnColor(_ col: String) -> Color {
        switch col.lowercased() {
        case "todo":
            return .barkcliTextMuted
        case "doing":
            return .barkcliStatusWarning
        case "review":
            return .barkcliStatusInfo
        case "done":
            return .barkcliStatusActive
        default:
            return .barkcliTextSecondary
        }
    }

    private func priorityColor(_ prio: String) -> Color {
        switch prio.lowercased() {
        case "critical":
            return .barkcliStatusError
        case "high":
            return .barkcliStatusWarning
        case "medium":
            return .barkcliStatusInfo
        case "low":
            return .barkcliTextMuted
        default:
            return .barkcliTextSecondary
        }
    }
}
