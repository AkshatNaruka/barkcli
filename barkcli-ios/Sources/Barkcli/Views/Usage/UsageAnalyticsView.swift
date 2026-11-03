import SwiftUI

public struct UsageAnalyticsView: View {
    @Environment(UsageStore.self) private var usageStore
    @State private var hoveredDay: DailyUsage? = nil

    public init() {}

    private var summary: UsageSummary {
        usageStore.data?.summary ?? UsageSummary()
    }

    private var models: [ModelUsage] {
        let list = usageStore.data?.models ?? []
        let q = usageStore.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if q.isEmpty { return list }
        return list.filter { $0.model.lowercased().contains(q) || $0.provider.lowercased().contains(q) }
    }

    private var daily: [DailyUsage] {
        usageStore.data?.daily ?? []
    }

    private var limits: [ProviderLimit] {
        usageStore.data?.limits ?? []
    }

    private var maxDailyTokens: Int {
        let maxVal = daily.map { usageStore.metricMode == "tokens" ? $0.tokens : Int($0.costUsd * 100) }.max() ?? 1
        return max(maxVal, 1)
    }

    public var body: some View {
        VStack(spacing: 0) {
            headerBar
            Divider().overlay(Color.barkcliBorder)

            ScrollView {
                VStack(spacing: 16) {
                    summaryMetricsDeck
                    shareDistributionSection
                    timelineChartSection
                    modelsBreakdownSection
                    providerLimitsSection
                }
                .padding(16)
            }
        }
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .task {
            if usageStore.data == nil {
                await usageStore.loadUsage()
            }
        }
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text("Usage & Limits")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    StatusBadge("global telemetry", variant: .accent)
                }

                Text("Global token consumption, cache savings, model breakdowns, and estimated API-equivalent cost")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            }

            Spacer()

            // Window filter buttons
            HStack(spacing: 2) {
                ForEach(["24h", "7d", "30d", "all"], id: \.self) { win in
                    let isSelected = usageStore.selectedWindow == win
                    Button {
                        Task { await usageStore.setWindow(win) }
                    } label: {
                        Text(win == "all" ? "All time" : win)
                            .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                            .foregroundColor(isSelected ? .white : .barkcliTextMuted)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(isSelected ? Color.barkcliAccent : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(2)
            .background(Color.barkcliCardSubtle)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

            // Metric Toggle
            HStack(spacing: 2) {
                Button {
                    usageStore.metricMode = "tokens"
                } label: {
                    Text("Tokens")
                        .font(.system(size: 11, weight: usageStore.metricMode == "tokens" ? .bold : .medium))
                        .foregroundColor(usageStore.metricMode == "tokens" ? .barkcliTextPrimary : .barkcliTextMuted)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(usageStore.metricMode == "tokens" ? Color.barkcliCardBackground : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                }
                .buttonStyle(.plain)

                Button {
                    usageStore.metricMode = "cost"
                } label: {
                    Text("Cost ($)")
                        .font(.system(size: 11, weight: usageStore.metricMode == "cost" ? .bold : .medium))
                        .foregroundColor(usageStore.metricMode == "cost" ? .barkcliTextPrimary : .barkcliTextMuted)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(usageStore.metricMode == "cost" ? Color.barkcliCardBackground : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(2)
            .background(Color.barkcliCardSubtle)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

            ActionButton(
                "Refresh",
                systemImage: "arrow.clockwise",
                variant: .secondary
            ) {
                Task {
                    await usageStore.loadUsage()
                }
            }
            .frame(width: 90)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.barkcliCardBackground)
    }

    // MARK: - 4 Core KPI Tiles

    private var summaryMetricsDeck: some View {
        HStack(spacing: 12) {
            MetricTile(
                title: "Total Tokens",
                value: formatNumber(summary.totalTokens),
                subtitle: "In: \(formatNumber(summary.inputTokens)) · Out: \(formatNumber(summary.outputTokens))",
                systemImage: "sparkles",
                accentColor: .barkcliTextPrimary
            )

            MetricTile(
                title: "Cache Savings",
                value: String(format: "%.1f%%", summary.cacheHitRate * 100),
                subtitle: "\(formatNumber(summary.cachedInputTokens)) cached tokens read",
                systemImage: "bolt.badge.clock.fill",
                accentColor: .barkcliStatusActive
            )

            MetricTile(
                title: "Estimated Cost",
                value: String(format: "$%.2f", summary.totalCostUsd),
                subtitle: String(format: "Std: $%.2f · Prem: $%.2f", summary.standardCostUsd, summary.premiumCostUsd),
                systemImage: "dollarsign.circle.fill",
                accentColor: .barkcliTextPrimary
            )

            MetricTile(
                title: "Agent Activity",
                value: "\(summary.totalRuns) runs",
                subtitle: "\(summary.activeModels) models · \(summary.activeProviders) providers",
                systemImage: "cpu.fill",
                accentColor: .barkcliTextMuted
            )
        }
    }

    // MARK: - Distribution Bar

    private var shareDistributionSection: some View {
        GlassCard(cornerRadius: 6, padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(usageStore.metricMode == "tokens" ? "TOKEN DISTRIBUTION" : "COST DISTRIBUTION")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliTextMuted)
                    Spacer()
                    Text(usageStore.metricMode == "tokens" ? "\(formatNumber(summary.totalTokens)) total" : String(format: "$%.2f estimated", summary.totalCostUsd))
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.barkcliTextMuted)
                }

                // Multi-segment progress bar
                GeometryReader { geo in
                    HStack(spacing: 2) {
                        if usageStore.metricMode == "tokens" {
                            let total = max(summary.totalTokens, 1)
                            let inWidth = geo.size.width * CGFloat(summary.inputTokens) / CGFloat(total)
                            let cacheWidth = geo.size.width * CGFloat(summary.cachedInputTokens) / CGFloat(total)
                            let outWidth = geo.size.width * CGFloat(summary.outputTokens) / CGFloat(total)

                            RoundedRectangle(cornerRadius: 3)
                                .fill(Color.blue)
                                .frame(width: max(4, inWidth))
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Color.green)
                                .frame(width: max(4, cacheWidth))
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Color.purple)
                                .frame(width: max(4, outWidth))
                        } else {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Color.indigo)
                                .frame(width: geo.size.width * 0.90)
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Color.orange)
                                .frame(width: geo.size.width * 0.10)
                        }
                    }
                }
                .frame(height: 8)

                // Legend
                HStack(spacing: 16) {
                    if usageStore.metricMode == "tokens" {
                        legendItem(color: .blue, label: "Input: \(formatNumber(summary.inputTokens))")
                        legendItem(color: .green, label: "Cache Read: \(formatNumber(summary.cachedInputTokens))")
                        legendItem(color: .purple, label: "Output: \(formatNumber(summary.outputTokens))")
                    } else {
                        legendItem(color: .indigo, label: String(format: "Standard: $%.2f (90%%)", summary.standardCostUsd))
                        legendItem(color: .orange, label: String(format: "Premium/Fast: $%.2f (10%%)", summary.premiumCostUsd))
                    }
                    Spacer()
                }
                .font(.system(size: 11, design: .monospaced))
            }
        }
    }

    private func legendItem(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(label).foregroundColor(.barkcliTextMuted)
        }
    }

    // MARK: - Activity Timeline Chart

    private var timelineChartSection: some View {
        GlassCard(cornerRadius: 6, padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("ACTIVITY TIMELINE")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                        Text(usageStore.metricMode == "tokens" ? "Tokens consumed per day" : "Estimated cost per day")
                            .font(.system(size: 10))
                            .foregroundColor(.barkcliTextMuted)
                    }

                    Spacer()

                    if let hovered = hoveredDay {
                        Text("\(hovered.date): \(usageStore.metricMode == "tokens" ? formatNumber(hovered.tokens) + " tokens" : String(format: "$%.2f", hovered.costUsd))")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundColor(.barkcliTextPrimary)
                    }
                }

                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(daily) { day in
                        let val = usageStore.metricMode == "tokens" ? day.tokens : Int(day.costUsd * 100)
                        let heightPct = CGFloat(val) / CGFloat(maxDailyTokens)
                        let isHovered = hoveredDay?.date == day.date

                        VStack(spacing: 4) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(isHovered ? Color.barkcliAccent : Color.barkcliAccent.opacity(0.75))
                                .frame(height: max(10, 80 * heightPct))

                            Text(day.date.suffix(5))
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(.barkcliTextMuted)
                        }
                        .frame(maxWidth: .infinity)
                        .onHover { over in
                            hoveredDay = over ? day : nil
                        }
                    }
                }
                .frame(height: 100)
            }
        }
    }

    // MARK: - Models Breakdown Table

    private var modelsBreakdownSection: some View {
        GlassCard(cornerRadius: 6, padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("MODEL BREAKDOWN")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                        Text("Unit rates, prompt cache savings, and cost distribution")
                            .font(.system(size: 10))
                            .foregroundColor(.barkcliTextMuted)
                    }

                    Spacer()

                    // Search field
                    TextField("Filter models…", text: Bindable(usageStore).searchQuery)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 11))
                        .frame(width: 150)
                }

                VStack(spacing: 0) {
                    // Header Row
                    HStack {
                        Text("Model & Provider").frame(minWidth: 160, alignment: .leading)
                        Text("Total Tokens").frame(width: 90, alignment: .trailing)
                        Text("Input").frame(width: 70, alignment: .trailing)
                        Text("Output").frame(width: 70, alignment: .trailing)
                        Text("Cache Hit %").frame(width: 80, alignment: .trailing)
                        Text("Rate ($/M)").frame(width: 90, alignment: .trailing)
                        Text("Est. Cost").frame(width: 80, alignment: .trailing)
                        Text("Runs").frame(width: 50, alignment: .trailing)
                    }
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
                    .padding(.vertical, 6)

                    Divider().overlay(Color.barkcliBorder)

                    ForEach(models) { m in
                        let totalM = m.inputTokens + m.outputTokens + m.cachedInputTokens
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(m.model).font(.system(size: 11, weight: .semibold))
                                Text(m.provider).font(.system(size: 9)).foregroundColor(.barkcliTextMuted)
                            }
                            .frame(minWidth: 160, alignment: .leading)

                            Text(formatNumber(totalM))
                                .frame(width: 90, alignment: .trailing)
                                .foregroundColor(.barkcliTextPrimary)

                            Text(formatNumber(m.inputTokens))
                                .frame(width: 70, alignment: .trailing)
                                .foregroundColor(.barkcliTextMuted)

                            Text(formatNumber(m.outputTokens))
                                .frame(width: 70, alignment: .trailing)
                                .foregroundColor(.barkcliTextMuted)

                            Text(String(format: "%.1f%%", m.cacheHitRate * 100))
                                .frame(width: 80, alignment: .trailing)
                                .foregroundColor(m.cacheHitRate > 0.2 ? .green : .barkcliTextMuted)

                            Text(String(format: "$%.1f/$%.1f", m.costPerMillionInput, m.costPerMillionOutput))
                                .frame(width: 90, alignment: .trailing)
                                .foregroundColor(.barkcliTextMuted)

                            Text(String(format: "$%.2f", m.costUsd))
                                .frame(width: 80, alignment: .trailing)
                                .fontWeight(.bold)
                                .foregroundColor(.barkcliTextPrimary)

                            Text("\(m.runsCount)")
                                .frame(width: 50, alignment: .trailing)
                                .foregroundColor(.barkcliTextMuted)
                        }
                        .font(.system(size: 11, design: .monospaced))
                        .padding(.vertical, 6)

                        Divider().overlay(Color.barkcliBorder.opacity(0.4))
                    }
                }
            }
        }
    }

    // MARK: - Provider Limits & Headroom

    private var providerLimitsSection: some View {
        GlassCard(cornerRadius: 6, padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("PROVIDER LIMITS & HEADROOM")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                        Text("Live rate limits, allowances, and pacing for active agent backends")
                            .font(.system(size: 10))
                            .foregroundColor(.barkcliTextMuted)
                    }
                    Spacer()
                }

                HStack(spacing: 12) {
                    ForEach(limits) { lim in
                        let pct = lim.limit > 0 ? min(1.0, Double(lim.used) / Double(lim.limit)) : 0.0
                        GlassCard(cornerRadius: 6, padding: 10) {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(lim.label)
                                        .font(.system(size: 11, weight: .bold))
                                    Spacer()
                                    Text(lim.status.uppercased())
                                        .font(.system(size: 8, weight: .bold, design: .monospaced))
                                        .foregroundColor(lim.status == "ready" ? .green : .barkcliTextMuted)
                                }

                                HStack {
                                    Text(lim.limitType)
                                        .font(.system(size: 9))
                                        .foregroundColor(.barkcliTextMuted)
                                    Spacer()
                                    Text("\(lim.pace) pace")
                                        .font(.system(size: 9, weight: .semibold))
                                        .foregroundColor(lim.pace == "under" ? .green : .orange)
                                }

                                GeometryReader { barGeo in
                                    ZStack(alignment: .leading) {
                                        RoundedRectangle(cornerRadius: 2)
                                            .fill(Color.barkcliCardSubtle)
                                        RoundedRectangle(cornerRadius: 2)
                                            .fill(lim.pace == "under" ? Color.green : Color.orange)
                                            .frame(width: max(4, barGeo.size.width * CGFloat(pct)))
                                    }
                                }
                                .frame(height: 5)

                                HStack {
                                    Text("\(formatNumber(lim.used)) / \(formatNumber(lim.limit))")
                                    Spacer()
                                    Text(lim.resetsIn)
                                }
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(.barkcliTextMuted)
                            }
                        }
                    }
                }
            }
        }
    }

    private func formatNumber(_ n: Int) -> String {
        if n >= 1_000_000 {
            return String(format: "%.1fM", Double(n) / 1_000_000.0)
        }
        if n >= 1_000 {
            return String(format: "%.1fk", Double(n) / 1_000.0)
        }
        return "\(n)"
    }
}
