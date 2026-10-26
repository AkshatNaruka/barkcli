import SwiftUI

/// Modal sheet displaying a color coded diff inspector with syntax styling,
/// changed files list, additions/deletions, and commit to agent dispatch CTA.
public struct DiffInspectorSheet: View {
    @Environment(\.dismiss) private var dismiss
    public let commit: GitCommit
    public let diff: GitDiff?
    public var onAssignToAgent: ((String) -> Void)? = nil

    @State private var showAssignPrompt: Bool = false
    @State private var assignPromptText: String = ""

    public init(
        commit: GitCommit,
        diff: GitDiff?,
        onAssignToAgent: ((String) -> Void)? = nil
    ) {
        self.commit = commit
        self.diff = diff
        self.onAssignToAgent = onAssignToAgent
        _assignPromptText = State(initialValue: "Review and verify changes in commit \(commit.shortSha): \(commit.subject)")
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Header Card
                    commitHeaderCard

                    // Changed Files Pill Rail
                    if let files = diff?.filesChanged, !files.isEmpty {
                        changedFilesSection(files)
                    }

                    // Unified Color Coded Diff Content
                    diffContentView

                    // Action Button: Assign to Agent
                    ActionButton(
                        "Assign Diff to Agent",
                        systemImage: "wand.and.stars",
                        variant: .primary
                    ) {
                        showAssignPrompt = true
                    }
                }
                .padding(16)
            }
            .background(Color.barkcliDarkBackground.ignoresSafeArea())
            .navigationTitle("Commit \(commit.shortSha)")
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
            .sheet(isPresented: $showAssignPrompt) {
                assignModal
            }
        }
    }

    // MARK: Header Card

    private var commitHeaderCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Text(commit.shortSha)
                        .font(BarkcliTypography.codeHash)
                        .foregroundColor(.barkcliTextPrimary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(Color.barkcliCardSubtle)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))

                    if commit.isMerge {
                        StatusBadge("Merge", variant: .accent)
                    }

                    Spacer()

                    // Additions / Deletions pills
                    HStack(spacing: 6) {
                        Text("+\(diff?.additions ?? commit.additions)")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliEmeraldGate)

                        Text("-\(diff?.deletions ?? commit.deletions)")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliCrimsonBlocker)
                    }
                }

                Text(commit.subject)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                if !commit.body.isEmpty {
                    Text(commit.body)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextMuted)
                }

                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Image(systemName: "person.circle")
                            .font(.system(size: 11))
                        Text(commit.author)
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(.barkcliTextMuted)

                    if let date = commit.date {
                        Text(date.formatted(date: .abbreviated, time: .shortened))
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextMuted)
                    }
                }
            }
        }
    }

    // MARK: Changed Files Section

    private func changedFilesSection(_ files: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("FILES TOUCHED (\(files.count))")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.barkcliTextMuted)
                .tracking(0.6)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(files, id: \.self) { file in
                        HStack(spacing: 4) {
                            Image(systemName: "doc.text")
                                .font(.system(size: 10))
                            Text(file)
                                .font(BarkcliTypography.codePath)
                        }
                        .foregroundColor(.barkcliTextSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.barkcliSpaceBlack)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5)
                        )
                    }
                }
            }
        }
    }

    // MARK: Diff Content View

    private var diffContentView: some View {
        GlassCard(padding: 12) {
            VStack(alignment: .leading, spacing: 2) {
                if let diffText = diff?.diff, !diffText.isEmpty {
                    let lines = diffText.components(separatedBy: "\n")
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                        diffLineView(line)
                    }
                } else {
                    Text("No diff content available for this commit.")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(.barkcliTextMuted)
                        .padding(.vertical, 8)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func diffLineView(_ line: String) -> some View {
        HStack(spacing: 6) {
            Text(line)
                .font(.system(size: 11, weight: lineWeight(line), design: .monospaced))
                .foregroundColor(lineColor(line))
                .lineLimit(nil)
                .multilineTextAlignment(.leading)

            Spacer()
        }
        .padding(.vertical, 1)
        .padding(.horizontal, 4)
        .background(lineBackgroundColor(line))
        .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
    }

    private func lineColor(_ line: String) -> Color {
        if line.hasPrefix("+") && !line.hasPrefix("+++") {
            return .barkcliEmeraldGate
        } else if line.hasPrefix("-") && !line.hasPrefix("---") {
            return .barkcliCrimsonBlocker
        } else if line.hasPrefix("@@") {
            return .barkcliStatusInfo
        } else if line.hasPrefix("diff --git") {
            return .barkcliTextPrimary
        }
        return .barkcliTextMuted
    }

    private func lineBackgroundColor(_ line: String) -> Color {
        if line.hasPrefix("+") && !line.hasPrefix("+++") {
            return Color.barkcliEmeraldGate.opacity(0.1)
        } else if line.hasPrefix("-") && !line.hasPrefix("---") {
            return Color.barkcliCrimsonBlocker.opacity(0.1)
        } else if line.hasPrefix("@@") {
            return Color.barkcliStatusInfo.opacity(0.08)
        }
        return Color.clear
    }

    private func lineWeight(_ line: String) -> Font.Weight {
        if line.hasPrefix("diff --git") || line.hasPrefix("@@") {
            return .bold
        }
        return .regular
    }

    // MARK: Assign Modal

    private var assignModal: some View {
        NavigationStack {
            Form {
                Section("Assign Commit to Agent") {
                    Text("Creates a worktree task referencing the changes in commit \(commit.shortSha).")
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)

                    TextField("Instructions for Agent", text: $assignPromptText, axis: .vertical)
                        .lineLimit(3...6)
                        .foregroundColor(.barkcliTextPrimary)
                }
            }
            .navigationTitle("Assign to Agent")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showAssignPrompt = false
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Dispatch") {
                        onAssignToAgent?(assignPromptText)
                        showAssignPrompt = false
                        dismiss()
                    }
                    .disabled(assignPromptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
