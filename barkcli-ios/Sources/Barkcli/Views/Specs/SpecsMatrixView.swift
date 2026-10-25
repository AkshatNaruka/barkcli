import SwiftUI

/// Central view for the human-to-agent Specifications Traceability Matrix.
/// Displays total requirement coverage progress, verification status dots,
/// linked code/test files, and staleness detection across specs.
public struct SpecsMatrixView: View {
    @Environment(SpecsStore.self) private var envStore: SpecsStore?
    @State private var fallbackStore = SpecsStore.shared

    public init() {}

    private var store: SpecsStore {
        envStore ?? fallbackStore
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Coverage Progress Header
                coverageProgressCard

                // Filter & Search Controls
                filterHeaderView

                // Specifications List
                if store.filteredSpecs.isEmpty {
                    emptyStateCard
                } else {
                    specsList
                }
            }
            .padding(16)
        }
        .background(Color.barkcliDarkBackground.ignoresSafeArea())
        .navigationTitle("Specs Matrix")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .refreshable {
            await store.refresh()
        }
        .task {
            if store.specs.isEmpty {
                await store.load()
            }
        }
    }

    // MARK: - Coverage Progress Header Card

    private var coverageProgressCard: some View {
        GlassCard(padding: 18) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("REQUIREMENT TRACEABILITY")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                            .tracking(0.6)

                        Text("Acceptance Verification")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    Spacer()

                    // Coverage percentage pill
                    Text(String(format: "Implementation: %.0f%%", store.coveragePercent))
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundColor(.barkcliEmeraldGate)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color.barkcliEmeraldGate.opacity(0.15))
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .strokeBorder(Color.barkcliEmeraldGate.opacity(0.3), lineWidth: 0.5)
                        )
                }

                // High-precision Progress Bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color.barkcliSpaceBlack)
                            .frame(height: 8)

                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [.barkcliCyberCyan, .barkcliEmeraldGate],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(0, min(geo.size.width, geo.size.width * CGFloat(store.coveragePercent / 100.0))), height: 8)
                    }
                }
                .frame(height: 8)

                // 4-Tile Metric Breakdown
                HStack(spacing: 8) {
                    MetricTile(
                        title: "TOTAL REQS",
                        value: "\(store.totalRequirementsCount)",
                        subtitle: "\(store.specs.count) specs",
                        systemImage: "list.clipboard.fill"
                    )

                    MetricTile(
                        title: "IMPLEMENTED",
                        value: "\(store.implementedCount)",
                        subtitle: "Code attached",
                        systemImage: "chevron.left.forwardslash.chevron.right"
                    )

                    MetricTile(
                        title: "VERIFIED",
                        value: "\(store.verifiedCount)",
                        subtitle: "Gate passed",
                        systemImage: "checkmark.seal.fill"
                    )

                    MetricTile(
                        title: "STALE",
                        value: "\(store.staleCount)",
                        subtitle: "Needs refresh",
                        systemImage: "exclamationmark.triangle.fill"
                    )
                }
            }
        }
    }

    // MARK: - Filters & Search

    private var filterHeaderView: some View {
        @Bindable var bindableStore = store
        return VStack(spacing: 10) {
            // Search field
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.barkcliTextMuted)
                    .font(.system(size: 13))

                TextField("Search specs, requirements, code paths", text: $bindableStore.searchQuery)
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextPrimary)
                    .textFieldStyle(.plain)

                if !store.searchQuery.isEmpty {
                    Button {
                        store.searchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.barkcliTextMuted)
                            .font(.system(size: 13))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(Color.barkcliSpaceBlack)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5)
            )

            // Status filter pills and Stale toggle
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    filterPill(title: "All", isSelected: store.selectedStatusFilter == nil && !store.showStaleOnly) {
                        store.selectedStatusFilter = nil
                        store.showStaleOnly = false
                    }

                    ForEach(RequirementStatus.allCases) { status in
                        filterPill(
                            title: status.displayName,
                            isSelected: store.selectedStatusFilter == status
                        ) {
                            store.selectedStatusFilter = status
                            store.showStaleOnly = false
                        }
                    }

                    // Stale toggle
                    Button {
                        store.showStaleOnly.toggle()
                        if store.showStaleOnly {
                            store.selectedStatusFilter = nil
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 10))
                            Text("Stale Only")
                        }
                        .font(.system(size: 11, weight: store.showStaleOnly ? .bold : .medium))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .foregroundColor(store.showStaleOnly ? .black : .barkcliAmberPulse)
                        .background(store.showStaleOnly ? Color.barkcliAmberPulse : Color.barkcliSpaceBlack)
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .strokeBorder(Color.barkcliAmberPulse, lineWidth: 0.5)
                        )
                    }
                    .buttonStyle(.plain)
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func filterPill(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .foregroundColor(isSelected ? .white : .barkcliTextMuted)
                .background(isSelected ? Color.barkcliCyberCyan : Color.barkcliSpaceBlack)
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .strokeBorder(isSelected ? Color.barkcliCyberCyan : Color.barkcliBorderHairline, lineWidth: 0.5)
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Specs List

    private var specsList: some View {
        VStack(spacing: 12) {
            ForEach(store.filteredSpecs) { spec in
                SpecDetailRow(spec: spec)
            }
        }
    }

    private var emptyStateCard: some View {
        GlassCard(padding: 24) {
            VStack(spacing: 8) {
                Image(systemName: "list.clipboard")
                    .font(.system(size: 28))
                    .foregroundColor(.barkcliTextMuted)

                Text("No specifications found")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.barkcliTextPrimary)

                Text("Try adjusting your filters or adding specs to this workspace.")
                    .font(.system(size: 12))
                    .foregroundColor(.barkcliTextMuted)
            }
            .frame(maxWidth: .infinity)
        }
    }
}
