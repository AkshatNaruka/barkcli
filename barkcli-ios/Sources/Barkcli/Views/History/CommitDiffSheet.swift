import SwiftUI

public struct CommitDiffSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    public let commit: GitCommit

    @State private var diffResponse: GitDiffResponse?
    @State private var isLoading: Bool = true
    @State private var copiedSha: Bool = false

    public init(commit: GitCommit) {
        self.commit = commit
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    commitHeaderCard

                    metricsRow

                    if !commit.filesChanged.isEmpty {
                        changedFilesSection
                    }

                    diffPatchSection
                }
                .padding(18)
            }
            .background(Color.barkcliDarkBackground.ignoresSafeArea())
            .navigationTitle("Commit Diff")
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
            .task {
                await loadDiff()
            }
        }
    }

    private var commitHeaderCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Text(commit.shortSha)
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundColor(.barkcliTextPrimary)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4)
                        .background(Color.barkcliCardSubtle)
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                        )

                    Button {
                        #if os(iOS)
                        UIPasteboard.general.string = commit.sha
                        #elseif os(macOS)
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(commit.sha, forType: .string)
                        #endif
                        copiedSha = true
                        Task {
                            try? await Task.sleep(nanoseconds: 1_500_000_000)
                            copiedSha = false
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: copiedSha ? "checkmark" : "doc.on.doc")
                                .font(.system(size: 11))
                            Text(copiedSha ? "Copied" : "Copy SHA")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundColor(.barkcliTextMuted)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.barkcliSurface)
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    if let date = commit.date {
                        Text(date.formatted(date: .abbreviated, time: .shortened))
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextMuted)
                    }
                }

                Text(commit.subject)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                if !commit.body.isEmpty {
                    Text(commit.body)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextMuted)
                        .lineSpacing(2)
                }

                HStack(spacing: 6) {
                    Image(systemName: "person.circle.fill")
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)
                    Text("Author: \(commit.author)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.barkcliTextMuted)
                }
            }
        }
    }

    private var metricsRow: some View {
        HStack(spacing: 12) {
            let additions = diffResponse?.additions ?? commit.additions
            let deletions = diffResponse?.deletions ?? commit.deletions

            metricBox(
                label: "Additions",
                value: "+\(additions)",
                color: .barkcliSuccessEmerald,
                icon: "plus.circle.fill"
            )

            metricBox(
                label: "Deletions",
                value: "\(deletions)",
                color: .barkcliDangerRose,
                icon: "minus.circle.fill"
            )

            metricBox(
                label: "Files Changed",
                value: "\(commit.filesChanged.count)",
                color: .barkcliTextPrimary,
                icon: "doc.fill"
            )
        }
    }

    private func metricBox(label: String, value: String, color: Color, icon: String) -> some View {
        GlassCard(padding: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Image(systemName: icon)
                        .font(.system(size: 10))
                        .foregroundColor(color)
                    Text(label)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.barkcliTextMuted)
                }

                Text(value)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(color)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var changedFilesSection: some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                Text("TOUCHED FILES")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
                    .tracking(0.6)

                ForEach(commit.filesChanged, id: \.self) { file in
                    HStack(spacing: 6) {
                        Image(systemName: "doc.text")
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextSecondary)
                        Text(file)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(.barkcliTextPrimary)
                            .lineLimit(1)
                    }
                    .padding(.vertical, 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var diffPatchSection: some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("DIFF PATCH")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliTextMuted)
                        .tracking(0.6)

                    Spacer()

                    if isLoading {
                        ProgressView()
                            .scaleEffect(0.7)
                    }
                }

                if let diffText = diffResponse?.diff, !diffText.isEmpty {
                    VStack(alignment: .leading, spacing: 1) {
                        let lines = diffText.components(separatedBy: "\n")
                        ForEach(Array(lines.prefix(120).enumerated()), id: \.offset) { _, line in
                            Text(line)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(diffLineTextColor(line))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 1)
                                .background(diffLineBackground(line))
                        }
                    }
                    .padding(8)
                    .background(Color.barkcliDarkBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                } else if !isLoading {
                    Text("No code diff patch available for this commit.")
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextMuted)
                        .padding(.vertical, 8)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func diffLineTextColor(_ line: String) -> Color {
        if line.hasPrefix("+") && !line.hasPrefix("+++") {
            return .barkcliSuccessEmerald
        } else if line.hasPrefix("-") && !line.hasPrefix("---") {
            return .barkcliDangerRose
        } else if line.hasPrefix("@@") {
            return .barkcliStatusInfo
        }
        return .barkcliTextMuted
    }

    private func diffLineBackground(_ line: String) -> Color {
        if line.hasPrefix("+") && !line.hasPrefix("+++") {
            return Color.barkcliSuccessEmerald.opacity(0.12)
        } else if line.hasPrefix("-") && !line.hasPrefix("---") {
            return Color.barkcliDangerRose.opacity(0.12)
        }
        return Color.clear
    }

    private func loadDiff() async {
        isLoading = true
        defer { isLoading = false }

        if appState.isDemoMode {
            diffResponse = appState.demoStore.getCommitDiff(sha: commit.sha)
            return
        }

        do {
            diffResponse = try await appState.apiClient.fetchCommitDiff(sha: commit.sha)
        } catch {
            diffResponse = nil
        }
    }
}
