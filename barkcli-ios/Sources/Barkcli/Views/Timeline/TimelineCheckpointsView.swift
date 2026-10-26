import SwiftUI

public struct TimelineCheckpointsView: View {
    @Environment(TimelineStore.self) private var timelineStore

    @State private var showingNewCheckpointSheet: Bool = false
    @State private var newCheckpointDesc: String = ""

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            headerBar
            Divider().overlay(Color.barkcliBorder)

            ScrollView {
                VStack(spacing: 16) {
                    doctorDiagnosticCard
                    checkpointsSection
                }
                .padding(16)
            }
        }
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .task {
            if timelineStore.checkpoints.isEmpty {
                await timelineStore.loadTimeline()
            }
        }
        .sheet(isPresented: $showingNewCheckpointSheet) {
            newCheckpointModal
        }
    }

    private var headerBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text("Timeline and Checkpoints")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    StatusBadge("\(timelineStore.checkpoints.count) checkpoints", variant: .accent)
                }

                Text("State rollback points undo diff inspection and doctor diagnostics")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            }

            Spacer()

            HStack(spacing: 8) {
                ActionButton(
                    "Run Doctor",
                    systemImage: "stethoscope",
                    variant: .secondary
                ) {
                    Task {
                        await timelineStore.runDoctor()
                    }
                }
                .frame(width: 120)

                ActionButton(
                    "New Checkpoint",
                    systemImage: "plus",
                    variant: .primary
                ) {
                    showingNewCheckpointSheet = true
                }
                .frame(width: 140)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.barkcliCardBackground)
    }

    private var doctorDiagnosticCard: some View {
        GlassCard(cornerRadius: 6, padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: "cross.case.fill")
                            .font(.system(size: 12))
                            .foregroundColor(timelineStore.unfixedIssuesCount > 0 ? .barkcliStatusWarning : .barkcliStatusActive)

                        Text("Doctor System Diagnostics")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    Spacer()

                    if timelineStore.unfixedIssuesCount > 0 {
                        ActionButton(
                            "Auto Fix All",
                            systemImage: "wrench.fill",
                            variant: .primary
                        ) {
                            Task {
                                await timelineStore.fixDoctorIssues()
                            }
                        }
                        .frame(width: 120)
                    } else {
                        StatusBadge("healthy", variant: .success)
                    }
                }

                if timelineStore.doctorIssues.isEmpty {
                    Text("No structural anomalies or broken linkages detected across boards")
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)
                } else {
                    VStack(spacing: 6) {
                        ForEach(timelineStore.doctorIssues) { issue in
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(issue.fixed ? Color.barkcliStatusActive : severityColor(issue.severity))
                                    .frame(width: 6, height: 6)

                                Text(issue.description)
                                    .font(.system(size: 12))
                                    .foregroundColor(issue.fixed ? .barkcliTextMuted : .barkcliTextPrimary)

                                Spacer()

                                if issue.fixed {
                                    StatusBadge("FIXED", variant: .success)
                                } else {
                                    StatusBadge(issue.severity.uppercased(), variant: severityBadge(issue.severity))
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
        }
    }

    private var checkpointsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(
                "Checkpoints History",
                subtitle: "Named state snapshots with file inventory",
                count: timelineStore.checkpoints.count
            )

            VStack(spacing: 8) {
                ForEach(timelineStore.checkpoints) { cp in
                    checkpointRow(cp)
                }
            }
        }
    }

    private func checkpointRow(_ cp: Checkpoint) -> some View {
        GlassCard(cornerRadius: 6, padding: 12) {
            HStack(spacing: 12) {
                Circle()
                    .fill(Color.barkcliBorderFocus)
                    .frame(width: 6, height: 6)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(cp.id)
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliTextPrimary)

                        StatusBadge("by \(cp.author)", variant: .neutral)

                        Spacer()

                        Text(formattedTime(cp.timestamp))
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)
                    }

                    Text(cp.description)
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextSecondary)

                    HStack(spacing: 6) {
                        Image(systemName: "doc")
                            .font(.system(size: 10))
                            .foregroundColor(.barkcliTextMuted)

                        Text("\(cp.fileCount) files captured in snapshot")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)
                    }
                }

                Spacer()

                ActionButton("Restore", variant: .secondary) {
                    Task {
                        try? await timelineStore.restoreCheckpoint(id: cp.id)
                    }
                }
                .frame(width: 80)
            }
        }
    }

    private func severityColor(_ sev: String) -> Color {
        switch sev.lowercased() {
        case "error":
            return .barkcliStatusError
        case "warning":
            return .barkcliStatusWarning
        default:
            return .barkcliStatusInfo
        }
    }

    private func severityBadge(_ sev: String) -> StatusBadgeVariant {
        switch sev.lowercased() {
        case "error":
            return .danger
        case "warning":
            return .warning
        default:
            return .neutral
        }
    }

    private func formattedTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy MM dd HH:mm"
        return formatter.string(from: date)
    }

    private var newCheckpointModal: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Create New Checkpoint")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                Spacer()
                Button {
                    showingNewCheckpointSheet = false
                } label: {
                    Image(systemName: "xmark")
                        .foregroundColor(.barkcliTextMuted)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Snapshot Description")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.barkcliTextMuted)
                TextField("e.g. Pre migration stable baseline", text: $newCheckpointDesc)
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
                ActionButton("Cancel", variant: .secondary) {
                    showingNewCheckpointSheet = false
                }

                ActionButton("Save Snapshot", variant: .primary) {
                    Task {
                        _ = try? await timelineStore.createCheckpoint(description: newCheckpointDesc)
                        showingNewCheckpointSheet = false
                        newCheckpointDesc = ""
                    }
                }
            }
        }
        .padding(20)
        .frame(width: 400)
        .background(Color.barkcliCardBackground)
    }
}
