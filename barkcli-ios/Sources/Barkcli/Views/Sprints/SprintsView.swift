import SwiftUI

public struct SprintsView: View {
    @Environment(SprintStore.self) private var sprintStore

    @State private var showingNewSprintSheet = false
    @State private var newSprintName = ""
    @State private var newSprintGoal = ""

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            headerBar
            Divider().overlay(Color.barkcliBorder)

            ScrollView {
                VStack(spacing: 16) {
                    if let active = sprintStore.activeSprint {
                        activeSprintCard(active)
                    }

                    sprintMetricsDeck
                    sprintsListSection
                }
                .padding(16)
            }
        }
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .task {
            if sprintStore.sprints.isEmpty {
                await sprintStore.loadSprints()
            }
        }
        .sheet(isPresented: $showingNewSprintSheet) {
            newSprintModal
        }
    }

    private var headerBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text("Sprints")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    StatusBadge(
                        "\(sprintStore.sprints.count) total",
                        variant: .neutral
                    )
                }
                Text("Sprint cadence velocity tracking and card allocations")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            }

            Spacer()

            HStack(spacing: 8) {
                TextField("Filter sprints...", text: Binding(
                    get: { sprintStore.searchQuery },
                    set: { sprintStore.searchQuery = $0 }
                ))
                .textFieldStyle(.plain)
                .font(.system(size: 12, design: .monospaced))
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Color.barkcliCardSubtle)
                .overlay(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                )
                .frame(width: 180)

                ActionButton(
                    "New Sprint",
                    systemImage: "plus",
                    variant: .primary
                ) {
                    showingNewSprintSheet = true
                }
                .frame(width: 120)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.barkcliCardBackground)
    }

    private func activeSprintCard(_ sprint: SprintDetail) -> some View {
        GlassCard(cornerRadius: 8, padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color.barkcliStatusActive)
                            .frame(width: 6, height: 6)
                        Text("Active Sprint")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliStatusActive)
                    }

                    Spacer()

                    if let start = sprint.start, let end = sprint.end {
                        Text("\(start) to \(end)")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)
                    }
                }

                Text(sprint.name)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                Text(sprint.goal)
                    .font(.system(size: 12))
                    .foregroundColor(.barkcliTextSecondary)

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Effort Burn Down")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)
                        Spacer()
                        Text("\(sprint.completedEffort) of \(sprint.totalEffort) points")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    ChecklistProgressBar(
                        completed: sprint.completedEffort,
                        total: sprint.totalEffort
                    )
                }

                if !sprint.cardIds.isEmpty {
                    Divider().overlay(Color.barkcliBorder)
                    HStack(spacing: 6) {
                        Text("Allocated Cards:")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)

                        ForEach(sprint.cardIds, id: \.self) { cardId in
                            Text(cardId)
                                .font(.system(size: 10, weight: .medium, design: .monospaced))
                                .foregroundColor(.barkcliTextSecondary)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.barkcliCardSubtle)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                                        .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                                )
                        }
                    }
                }
            }
        }
    }

    private var sprintMetricsDeck: some View {
        HStack(spacing: 12) {
            MetricTile(
                title: "Total Sprints",
                value: "\(sprintStore.sprints.count)",
                subtitle: "Managed cycles",
                systemImage: "flag.checkered"
            )

            MetricTile(
                title: "Planned Effort",
                value: "\(sprintStore.totalEffortPlanned) pts",
                subtitle: "Across all sprints",
                systemImage: "chart.line.uptrend.xyaxis"
            )

            MetricTile(
                title: "Burned Effort",
                value: "\(sprintStore.totalEffortCompleted) pts",
                subtitle: "\(Int(sprintStore.completionPercentage)) percent complete",
                systemImage: "flame"
            )

            MetricTile(
                title: "Sprint Health",
                value: "96%",
                subtitle: "Velocity nominal",
                systemImage: "gauge.with.needle"
            )
        }
    }

    private var sprintsListSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(
                "All Sprints",
                subtitle: "Chronological sprint history and planned horizons",
                count: sprintStore.filteredSprints.count
            )

            VStack(spacing: 8) {
                ForEach(sprintStore.filteredSprints) { sprint in
                    sprintRow(sprint)
                }
            }
        }
    }

    private func sprintRow(_ sprint: SprintDetail) -> some View {
        GlassCard(cornerRadius: 6, padding: 12) {
            HStack(spacing: 12) {
                Circle()
                    .fill(statusColor(sprint.status))
                    .frame(width: 6, height: 6)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        Text(sprint.name)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)

                        StatusBadge(
                            sprint.status.uppercased(),
                            variant: badgeVariant(sprint.status)
                        )
                    }

                    Text(sprint.goal)
                        .font(.system(size: 11))
                        .foregroundColor(.barkcliTextSecondary)
                        .lineLimit(1)
                }

                Spacer()

                HStack(spacing: 16) {
                    if let start = sprint.start, let end = sprint.end {
                        Text("\(start) to \(end)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)
                    }

                    HStack(spacing: 4) {
                        Text("\(sprint.completedEffort)/\(sprint.totalEffort) pts")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliTextPrimary)
                    }
                }
            }
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "active":
            return .barkcliStatusActive
        case "completed":
            return .barkcliTextSecondary
        case "planned":
            return .barkcliStatusWarning
        default:
            return .barkcliTextMuted
        }
    }

    private func badgeVariant(_ status: String) -> StatusBadgeVariant {
        switch status.lowercased() {
        case "active":
            return .success
        case "completed":
            return .neutral
        case "planned":
            return .warning
        default:
            return .neutral
        }
    }

    private var newSprintModal: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Create New Sprint")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                Spacer()
                Button {
                    showingNewSprintSheet = false
                } label: {
                    Image(systemName: "xmark")
                        .foregroundColor(.barkcliTextMuted)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Sprint Name")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.barkcliTextMuted)
                TextField("e.g. Sprint 44: Autonomy Expansion", text: $newSprintName)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .padding(8)
                    .background(Color.barkcliCardSubtle)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                    )
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Sprint Goal")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.barkcliTextMuted)
                TextField("Objective for this sprint cadence", text: $newSprintGoal)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .padding(8)
                    .background(Color.barkcliCardSubtle)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                    )
            }

            HStack(spacing: 12) {
                ActionButton(
                    "Cancel",
                    variant: .secondary
                ) {
                    showingNewSprintSheet = false
                }

                ActionButton(
                    "Create Sprint",
                    variant: .primary
                ) {
                    Task {
                        _ = try? await sprintStore.createSprint(name: newSprintName, goal: newSprintGoal)
                        showingNewSprintSheet = false
                        newSprintName = ""
                        newSprintGoal = ""
                    }
                }
            }
        }
        .padding(20)
        .frame(width: 400)
        .background(Color.barkcliCardBackground)
    }
}
