import SwiftUI

public struct SpecsView: View {
    @Environment(AppState.self) private var appState

    @State private var selectedStatusFilter: RequirementStatus?
    @State private var searchQuery: String = ""

    public init() {}

    private var specs: [Spec] {
        appState.specs
    }

    private var coverage: SpecCoverage {
        if let direct = appState.specCoverage {
            return direct
        }
        let allReqs = specs.flatMap(\.requirements)
        let verifiedCount = allReqs.filter { $0.status == .verified }.count
        let implementedCount = allReqs.filter { $0.status == .implemented || $0.status == .verified }.count
        let staleCount = allReqs.filter(\.stale).count
        let pct = allReqs.isEmpty ? 100.0 : (Double(implementedCount) / Double(allReqs.count)) * 100.0
        return SpecCoverage(
            totalRequirements: allReqs.count,
            implemented: implementedCount,
            verified: verifiedCount,
            stale: staleCount,
            coveragePercent: pct
        )
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                traceabilityMatrixCard

                filterSearchBar

                statusFilterPills

                if specs.isEmpty {
                    emptyStateView
                } else {
                    specsListView
                }
            }
            .padding(16)
        }
        .background(Color.barkcliDarkBackground.ignoresSafeArea())
        .refreshable {
            await appState.refresh()
        }
    }

    private var traceabilityMatrixCard: some View {
        GlassCard(padding: 18) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("REQUIREMENTS TRACEABILITY")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliAccentPurple)
                            .tracking(0.6)

                        Text("Acceptance Gate Coverage")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    Spacer()

                    Text("\(Int(coverage.coveragePercent))%")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundColor(.barkcliSuccessEmerald)
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color.barkcliBorderSubtle.opacity(0.5))
                            .frame(height: 8)

                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [.barkcliAccentPurple, .barkcliSuccessEmerald],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(0, min(geo.size.width, geo.size.width * CGFloat(coverage.coveragePercent / 100.0))), height: 8)
                    }
                }
                .frame(height: 8)

                HStack(spacing: 10) {
                    statPill(label: "Total", count: coverage.totalRequirements, color: .barkcliTextPrimary)
                    statPill(label: "Implemented", count: coverage.implemented, color: .barkcliSuccessEmerald)
                    statPill(label: "Verified", count: coverage.verified, color: .barkcliAccentPurple)
                    statPill(label: "Stale", count: coverage.stale, color: .barkcliWarningAmber)
                }
            }
        }
    }

    private func statPill(label: String, count: Int, color: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(count)")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundColor(color)

            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.barkcliTextMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(Color.barkcliSurface.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private var filterSearchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13))
                .foregroundColor(.barkcliTextMuted)

            TextField("Search requirements or code files", text: $searchQuery)
                .font(.system(size: 13))
                .foregroundColor(.barkcliTextPrimary)
                .textFieldStyle(.plain)

            if !searchQuery.isEmpty {
                Button {
                    searchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextMuted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.barkcliSurface)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
        )
    }

    private var statusFilterPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterButton(label: "All Requirements", status: nil)

                ForEach(RequirementStatus.allCases) { st in
                    filterButton(label: st.displayName, status: st)
                }
            }
        }
    }

    private func filterButton(label: String, status: RequirementStatus?) -> some View {
        let isSelected = selectedStatusFilter == status
        return Button {
            selectedStatusFilter = status
        } label: {
            Text(label)
                .font(.system(size: 12, weight: isSelected ? .bold : .medium))
                .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextMuted)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    isSelected ?
                    Color.barkcliAccentPurple.opacity(0.2) :
                    Color.barkcliSurface
                )
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .strokeBorder(
                            isSelected ? Color.barkcliAccentPurple : Color.barkcliBorderSubtle,
                            lineWidth: 1
                        )
                )
        }
        .buttonStyle(.plain)
    }

    private var specsListView: some View {
        LazyVStack(spacing: 16) {
            ForEach(specs) { spec in
                specCard(spec)
            }
        }
    }

    private func specCard(_ spec: Spec) -> some View {
        let matchingReqs = filteredRequirements(spec.requirements)
        return GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    StatusBadge(spec.id, variant: .accent)

                    StatusBadge(spec.status.displayName, variant: specStatusVariant(spec.status))

                    Spacer()

                    StatusBadge(spec.priority.capitalized, variant: .neutral)
                }

                Text(spec.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                if let desc = spec.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextMuted)
                }

                if !spec.tags.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(spec.tags, id: \.self) { tag in
                            Text(tag)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.barkcliAccentPurple)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Color.barkcliAccentPurple.opacity(0.1))
                                .clipShape(Capsule())
                        }
                    }
                }

                Divider()
                    .overlay(Color.barkcliBorderSubtle.opacity(0.5))

                VStack(alignment: .leading, spacing: 10) {
                    Text("REQUIREMENTS (\(matchingReqs.count))")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.barkcliTextMuted)
                        .tracking(0.6)

                    ForEach(matchingReqs) { req in
                        requirementItemView(req)
                    }
                }
            }
        }
    }

    private func requirementItemView(_ req: SpecRequirement) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(req.id)
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)

                        if req.stale {
                            StatusBadge("Stale", systemImage: "clock.badge.exclamationmark", variant: .warning)
                        }
                    }

                    Text(req.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.barkcliTextPrimary)
                }

                Spacer()

                StatusBadge(req.status.displayName, variant: reqStatusVariant(req.status))
            }

            if !req.acceptanceCriteria.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(req.acceptanceCriteria, id: \.self) { rule in
                        HStack(alignment: .top, spacing: 5) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 10))
                                .foregroundColor(.barkcliSuccessEmerald)
                                .padding(.top, 2)
                            Text(rule)
                                .font(.system(size: 11))
                                .foregroundColor(.barkcliTextMuted)
                        }
                    }
                }
            }

            if !req.linkedCode.isEmpty {
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: "chevron.left.forwardslash.chevron.right")
                        .font(.system(size: 9))
                        .foregroundColor(.barkcliAccentPurple)
                        .padding(.top, 2)

                    FlowLayout(spacing: 4) {
                        ForEach(req.linkedCode, id: \.self) { codePath in
                            Text(codePath)
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundColor(.barkcliAccentPurple)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.barkcliAccentPurple.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                        }
                    }
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.barkcliSurface.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func filteredRequirements(_ reqs: [SpecRequirement]) -> [SpecRequirement] {
        reqs.filter { req in
            if let filter = selectedStatusFilter, req.status != filter {
                return false
            }
            if !searchQuery.isEmpty {
                let clean = searchQuery.lowercased()
                let matchTitle = req.title.lowercased().contains(clean)
                let matchId = req.id.lowercased().contains(clean)
                let matchCode = req.linkedCode.contains { $0.lowercased().contains(clean) }
                return matchTitle || matchId || matchCode
            }
            return true
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 14) {
            Spacer()

            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 40))
                .foregroundColor(.barkcliTextMuted)

            Text("No Specifications Found")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.barkcliTextPrimary)

            Text("No specification documents registered in this workspace.")
                .font(.system(size: 13))
                .foregroundColor(.barkcliTextMuted)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func specStatusVariant(_ status: SpecStatus) -> StatusBadgeVariant {
        switch status {
        case .draft:
            return .neutral
        case .inProgress:
            return .accent
        case .implemented:
            return .success
        case .verified:
            return .success
        case .deprecated:
            return .danger
        }
    }

    private func reqStatusVariant(_ status: RequirementStatus) -> StatusBadgeVariant {
        switch status {
        case .pending:
            return .neutral
        case .inProgress:
            return .warning
        case .implemented:
            return .accent
        case .verified:
            return .success
        case .failed:
            return .danger
        }
    }
}
