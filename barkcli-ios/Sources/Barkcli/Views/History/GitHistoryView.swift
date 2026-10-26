import SwiftUI

/// Git commit DAG topology browser and diff inspector view.
/// Surfaces branch switching, commit additions/deletions stats,
/// visual commit timeline, and commit to agent task assignment actions.
public struct GitHistoryView: View {
    @Environment(GitStore.self) private var envStore: GitStore?
    @State private var fallbackStore = GitStore.shared

    @State private var inspectedCommit: GitCommit?
    @State private var commitToAssign: GitCommit?
    @State private var assignPromptText: String = ""
    @State private var showAssignSheet: Bool = false

    public init() {}

    private var store: GitStore {
        envStore ?? fallbackStore
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Header: Branch Selector & Additions/Deletions Stats
                headerStatsCard

                // Search Filter
                searchBar

                // Commit Stream
                if store.filteredCommits.isEmpty {
                    emptyStateCard
                } else {
                    commitStreamList
                }
            }
            .padding(16)
        }
        .background(Color.barkcliDarkBackground.ignoresSafeArea())
        .navigationTitle("Git History")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                branchSelectorMenu
            }
        }
        .refreshable {
            await store.refresh()
        }
        .task {
            if store.commits.isEmpty {
                await store.load()
            }
        }
        .sheet(item: $inspectedCommit) { commit in
            DiffInspectorSheet(
                commit: commit,
                diff: store.diffCache[commit.sha] ?? store.selectedDiff
            ) { prompt in
                Task {
                    try? await store.assignToAgent(sha: commit.sha, prompt: prompt)
                }
            }
        }
        .sheet(isPresented: $showAssignSheet) {
            if let commit = commitToAssign {
                assignModal(for: commit)
            }
        }
    }

    // MARK: Header Stats Card

    private var headerStatsCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.triangle.branch")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.barkcliTextSecondary)

                        Text(store.selectedBranch)
                            .font(BarkcliTypography.branchName)
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    Spacer()

                    StatusBadge("\(store.commits.count) Commits", variant: .neutral)
                }

                // Additions & Deletions Counter Bar
                HStack(spacing: 12) {
                    MetricTile(
                        title: "ADDITIONS",
                        value: "+\(store.totalAdditions)",
                        subtitle: "Across branch",
                        systemImage: "plus.circle.fill"
                    )

                    MetricTile(
                        title: "DELETIONS",
                        value: "-\(store.totalDeletions)",
                        subtitle: "Across branch",
                        systemImage: "minus.circle.fill"
                    )
                }
            }
        }
    }

    // MARK: Branch Selector Menu

    private var branchSelectorMenu: some View {
        Menu {
            Section("Branches") {
                ForEach(store.availableBranches, id: \.self) { branch in
                    Button {
                        Task {
                            await store.selectBranch(branch)
                        }
                    } label: {
                        HStack {
                            Text(branch)
                            if branch == store.selectedBranch {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "arrow.triangle.branch")
                    .font(.system(size: 12))
                Text(store.selectedBranch)
                    .font(.system(size: 12, weight: .semibold))
                Image(systemName: "chevron.down")
                    .font(.system(size: 10))
            }
            .foregroundColor(.barkcliTextPrimary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color.barkcliSpaceBlack)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5)
            )
        }
    }

    // MARK: Search Bar

    private var searchBar: some View {
        @Bindable var bindableStore = store
        return HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.barkcliTextMuted)
                .font(.system(size: 13))

            TextField("Search by commit message, SHA, author", text: $bindableStore.searchQuery)
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
    }

    // MARK: Commit Stream List

    private var commitStreamList: some View {
        VStack(spacing: 0) {
            ForEach(Array(store.filteredCommits.enumerated()), id: \.element.id) { index, commit in
                HStack(alignment: .top, spacing: 12) {
                    // Vertical Timeline Node
                    VStack(spacing: 0) {
                        Circle()
                            .fill(commit.isMerge ? Color.barkcliStatusActive : Color.barkcliTextSecondary)
                            .frame(width: 10, height: 10)
                            .padding(.top, 16)

                        if index < store.filteredCommits.count - 1 {
                            Rectangle()
                                .fill(Color.barkcliBorderHairline)
                                .frame(width: 1)
                                .frame(maxHeight: .infinity)
                        }
                    }
                    .frame(width: 16)

                    // Commit Card
                    Button {
                        Task {
                            await store.inspectCommit(commit)
                            inspectedCommit = commit
                        }
                    } label: {
                        commitCard(commit)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button {
                            Task {
                                await store.inspectCommit(commit)
                                inspectedCommit = commit
                            }
                        } label: {
                            Label("Inspect Diff", systemImage: "chevron.left.forwardslash.chevron.right")
                        }

                        Button {
                            commitToAssign = commit
                            assignPromptText = "Review and test changes in commit \(commit.shortSha): \(commit.subject)"
                            showAssignSheet = true
                        } label: {
                            Label("Assign to Agent", systemImage: "wand.and.stars")
                        }
                    }
                }
                .padding(.bottom, 10)
            }
        }
    }

    private func commitCard(_ commit: GitCommit) -> some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                // Top line: SHA chip, Merge badge, Additions/Deletions
                HStack(spacing: 8) {
                    Text(commit.shortSha)
                        .font(BarkcliTypography.codeHash)
                        .foregroundColor(.barkcliTextPrimary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.barkcliCardSubtle)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))

                    if commit.isMerge {
                        StatusBadge("Merge", variant: .accent)
                    }

                    Spacer()

                    HStack(spacing: 6) {
                        Text("+\(commit.additions)")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliEmeraldGate)

                        Text("-\(commit.deletions)")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliCrimsonBlocker)
                    }
                }

                // Subject
                Text(commit.subject)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.barkcliTextPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                // Author & Date & Files
                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Image(systemName: "person.circle")
                            .font(.system(size: 10))
                        Text(commit.author)
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(.barkcliTextMuted)

                    if let date = commit.date {
                        Text(date.formatted(date: .abbreviated, time: .shortened))
                            .font(.system(size: 10))
                            .foregroundColor(.barkcliTextMuted)
                    }

                    Spacer()

                    if !commit.filesChanged.isEmpty {
                        HStack(spacing: 3) {
                            Image(systemName: "doc")
                                .font(.system(size: 9))
                            Text("\(commit.filesChanged.count) files")
                                .font(.system(size: 10, design: .monospaced))
                        }
                        .foregroundColor(.barkcliTextMuted)
                    }
                }
            }
        }
    }

    private var emptyStateCard: some View {
        GlassCard(padding: 24) {
            VStack(spacing: 8) {
                Image(systemName: "clock.arrow.circlepath")
                    .font(.system(size: 28))
                    .foregroundColor(.barkcliTextMuted)

                Text("No commits found")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.barkcliTextPrimary)

                Text("Try switching branches or clearing your search filter.")
                    .font(.system(size: 12))
                    .foregroundColor(.barkcliTextMuted)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func assignModal(for commit: GitCommit) -> some View {
        NavigationStack {
            Form {
                Section("Assign Commit to Agent") {
                    Text("Spawns an autonomous worktree run to inspect and verify commit \(commit.shortSha).")
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)

                    TextField("Instructions", text: $assignPromptText, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("Assign to Agent")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showAssignSheet = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Dispatch") {
                        Task {
                            try? await store.assignToAgent(sha: commit.sha, prompt: assignPromptText)
                            showAssignSheet = false
                        }
                    }
                    .disabled(assignPromptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
