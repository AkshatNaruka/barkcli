import SwiftUI

public struct HistoryView: View {
    @Environment(AppState.self) private var appState

    @State private var searchFilter: String = ""
    @State private var selectedCommitForDiff: GitCommit?
    @State private var commitToAssign: GitCommit?

    public init() {}

    private var commits: [GitCommit] {
        let base = appState.gitCommits
        let clean = searchFilter.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if clean.isEmpty {
            return base
        }
        return base.filter {
            $0.subject.lowercased().contains(clean) ||
            $0.author.lowercased().contains(clean) ||
            $0.sha.lowercased().contains(clean)
        }
    }

    public var body: some View {
        VStack(spacing: 0) {
            filterHeaderView

            if commits.isEmpty {
                emptyStateView
            } else {
                commitsListView
            }
        }
        .background(Color.barkcliDarkBackground.ignoresSafeArea())
        .sheet(item: $selectedCommitForDiff) { commit in
            CommitDiffSheet(commit: commit)
        }
        .sheet(item: $commitToAssign) { commit in
            AssignCommitSheet(commit: commit)
        }
    }

    private var filterHeaderView: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                Menu {
                    ForEach(appState.availableBranches, id: \.self) { branch in
                        Button(branch) {
                            appState.activeBranch = branch
                            Task {
                                await appState.refresh()
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.triangle.branch")
                            .font(.system(size: 12))
                            .foregroundColor(.barkcliAccentPurple)

                        Text(appState.activeBranch)
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundColor(.barkcliTextPrimary)

                        Image(systemName: "chevron.down")
                            .font(.system(size: 10))
                            .foregroundColor(.barkcliTextMuted)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.barkcliSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                    )
                }

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextMuted)

                    TextField("Search commits or author", text: $searchFilter)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextPrimary)
                        .textFieldStyle(.plain)

                    if !searchFilter.isEmpty {
                        Button {
                            searchFilter = ""
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
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 10)
        .background(Color.barkcliDarkBackground)
    }

    private var commitsListView: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(commits) { commit in
                    commitCard(commit)
                }
            }
            .padding(16)
        }
        .refreshable {
            await appState.refresh()
        }
    }

    private func commitCard(_ commit: GitCommit) -> some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 8) {
                    Text(commit.shortSha)
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundColor(.barkcliAccentPurple)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.barkcliAccentPurple.opacity(0.12))
                        .clipShape(Capsule())

                    Text(commit.author)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.barkcliTextMuted)

                    Spacer()

                    if let date = commit.date {
                        Text(date.formatted(date: .abbreviated, time: .shortened))
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextMuted)
                    }
                }

                Text(commit.subject)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                    .lineLimit(2)

                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.system(size: 10, weight: .bold))
                        Text("\(commit.additions)")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                    }
                    .foregroundColor(.barkcliSuccessEmerald)

                    HStack(spacing: 4) {
                        Image(systemName: "minus")
                            .font(.system(size: 10, weight: .bold))
                        Text("\(commit.deletions)")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                    }
                    .foregroundColor(.barkcliDangerRose)

                    HStack(spacing: 4) {
                        Image(systemName: "doc")
                            .font(.system(size: 10))
                        Text("\(commit.filesChanged.count) files")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(.barkcliTextMuted)

                    Spacer()

                    HStack(spacing: 8) {
                        Button {
                            selectedCommitForDiff = commit
                        } label: {
                            Text("Diff")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.barkcliTextPrimary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Color.barkcliSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                                        .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)

                        Button {
                            commitToAssign = commit
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "person.badge.plus")
                                    .font(.system(size: 11))
                                Text("Assign to Agent")
                                    .font(.system(size: 12, weight: .bold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color.barkcliAccentPurple)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 14) {
            Spacer()

            Image(systemName: "arrow.triangle.branch")
                .font(.system(size: 40))
                .foregroundColor(.barkcliTextMuted)

            Text("No Commits Found")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.barkcliTextPrimary)

            Text("No git commits match the current search filter.")
                .font(.system(size: 13))
                .foregroundColor(.barkcliTextMuted)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

public struct AssignCommitSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    public let commit: GitCommit

    @State private var selectedAgentId: String = ""
    @State private var taskTitle: String = ""
    @State private var taskDescription: String = ""
    @State private var selectedColumn: String = "todo"
    @State private var selectedPriority: String = "high"
    @State private var isAssigning: Bool = false

    public init(commit: GitCommit) {
        self.commit = commit
        _taskTitle = State(initialValue: "Investigate commit \(commit.shortSha): \(commit.subject)")
        _taskDescription = State(initialValue: commit.body.isEmpty ? "Review changes across \(commit.filesChanged.count) touched files." : commit.body)
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    GlassCard(padding: 16) {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 8) {
                                Text(commit.shortSha)
                                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                                    .foregroundColor(.barkcliAccentPurple)

                                Text(commit.author)
                                    .font(.system(size: 12))
                                    .foregroundColor(.barkcliTextMuted)
                            }

                            Text(commit.subject)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.barkcliTextPrimary)
                        }
                    }

                    GlassCard(padding: 16) {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("SELECT AGENT")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliTextMuted)
                                .tracking(0.6)

                            Picker("Agent", selection: $selectedAgentId) {
                                ForEach(appState.agents) { agent in
                                    Text("\(agent.name) (\(agent.role.displayName))").tag(agent.id)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(.barkcliTextPrimary)

                            Text("TASK TITLE")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliTextMuted)
                                .tracking(0.6)

                            TextField("Task Title", text: $taskTitle)
                                .font(.system(size: 14))
                                .foregroundColor(.barkcliTextPrimary)
                                .textFieldStyle(.plain)
                                .padding(10)
                                .background(Color.barkcliSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                            Text("DESCRIPTION")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliTextMuted)
                                .tracking(0.6)

                            TextField("Instructions", text: $taskDescription, axis: .vertical)
                                .lineLimit(3...5)
                                .font(.system(size: 14))
                                .foregroundColor(.barkcliTextPrimary)
                                .textFieldStyle(.plain)
                                .padding(10)
                                .background(Color.barkcliSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                            HStack(spacing: 16) {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("COLUMN")
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundColor(.barkcliTextMuted)

                                    Picker("Column", selection: $selectedColumn) {
                                        Text("Todo").tag("todo")
                                        Text("Doing").tag("doing")
                                    }
                                    .pickerStyle(.menu)
                                    .tint(.barkcliTextPrimary)
                                }

                                VStack(alignment: .leading, spacing: 6) {
                                    Text("PRIORITY")
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundColor(.barkcliTextMuted)

                                    Picker("Priority", selection: $selectedPriority) {
                                        Text("Critical").tag("critical")
                                        Text("High").tag("high")
                                        Text("Medium").tag("medium")
                                    }
                                    .pickerStyle(.menu)
                                    .tint(.barkcliTextPrimary)
                                }
                            }
                        }
                    }
                }
                .padding(18)
            }
            .background(Color.barkcliDarkBackground.ignoresSafeArea())
            .navigationTitle("Assign Commit Task")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(.barkcliTextMuted)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Assign") {
                        Task {
                            await confirmAssignment()
                        }
                    }
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.barkcliAccentPurple)
                    .disabled(isAssigning || taskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear {
                if selectedAgentId.isEmpty, let firstAgent = appState.agents.first {
                    selectedAgentId = firstAgent.id
                }
            }
        }
    }

    private func confirmAssignment() async {
        isAssigning = true
        defer { isAssigning = false }

        let req = AssignCommitRequest(
            boardName: appState.currentBoardName,
            commitSha: commit.sha,
            title: taskTitle.trimmingCharacters(in: .whitespacesAndNewlines),
            description: taskDescription.isEmpty ? nil : taskDescription,
            column: selectedColumn,
            priority: selectedPriority,
            agentId: selectedAgentId.isEmpty ? nil : selectedAgentId
        )

        await appState.assignCommit(request: req)
        dismiss()
    }
}
