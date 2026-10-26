import SwiftUI

public enum InspectorTab: String, CaseIterable, Identifiable {
    case plan = "Plan"
    case diff = "Diff"
    case gate = "Gate"
    case context = "Context"

    public var id: String { rawValue }
}

public struct ThreadInspectorView: View {
    @Bindable var store: ThreadStore
    var onClose: () -> Void

    @State private var selectedTab: InspectorTab = .plan
    @State private var diffResult: TaskDiffResult?
    @State private var isLoadingDiff: Bool = false

    public init(store: ThreadStore, onClose: @escaping () -> Void) {
        self.store = store
        self.onClose = onClose
    }

    public var body: some View {
        VStack(spacing: 0) {
            topTabBar
            contentView
        }
        .frame(width: 320)
        .background(Color.barkcliCardBackground)
        .overlay(
            Rectangle()
                .frame(width: 1)
                .foregroundColor(Color.barkcliBorder),
            alignment: .leading
        )
        .task(id: store.selectedThreadId) {
            await loadDiffIfActive()
        }
        .onChange(of: selectedTab) { _, _ in
            Task {
                await loadDiffIfActive()
            }
        }
    }

    private var topTabBar: some View {
        HStack(spacing: 4) {
            ForEach(InspectorTab.allCases) { tab in
                let isSelected = selectedTab == tab
                Button {
                    selectedTab = tab
                } label: {
                    Text(tab.rawValue)
                        .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                        .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextMuted)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(isSelected ? Color.barkcliCardSubtle : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)
            }

            Spacer()

            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
                    .padding(5)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.barkcliCardBackground)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.barkcliBorder),
            alignment: .bottom
        )
    }

    @ViewBuilder
    private var contentView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                switch selectedTab {
                case .plan:
                    planView
                case .diff:
                    diffView
                case .gate:
                    gateView
                case .context:
                    contextView
                }
            }
            .padding(14)
        }
    }

    private var planView: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PLAN DECOMPOSITION")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.barkcliTextMuted)
                .tracking(0.6)

            if let card = store.activeThreadDetail?.card {
                VStack(alignment: .leading, spacing: 4) {
                    Text(card.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.barkcliTextPrimary)

                    if let desc = card.description {
                        Text(desc)
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextSecondary)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.barkcliCardSubtle)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            Text("CHILD TASKS")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.barkcliTextMuted)
                .tracking(0.6)
                .padding(.top, 4)

            let planEvents = (store.activeThreadDetail?.events ?? []).filter {
                $0.kind == .planProposed || $0.kind == .planApproved
            }

            if planEvents.isEmpty {
                Text("No plan decomposition records found yet.")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            } else {
                ForEach(planEvents) { ev in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(ev.kind == .planApproved ? "Approved Plan" : "Proposed Plan")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliTextPrimary)
                            Spacer()
                            Text(ev.createdAt)
                                .font(.system(size: 9))
                                .foregroundColor(.barkcliTextMuted)
                        }

                        Text(ev.text)
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextSecondary)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.barkcliCardSubtle)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
        }
    }

    private var diffView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("GIT WORKTREE DIFF")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.barkcliTextMuted)
                .tracking(0.6)

            if isLoadingDiff {
                ProgressView()
                    .tint(.barkcliTextMuted)
            } else if let diff = diffResult, diff.hasDiff {
                Text(diff.diff)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.barkcliTextPrimary)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.barkcliCanvas)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            } else {
                Text("No unmerged diff in worktree.")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            }
        }
    }

    private var gateView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TEST GATE VERIFICATION")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.barkcliTextMuted)
                .tracking(0.6)

            let gateEvents = (store.activeThreadDetail?.events ?? []).filter { $0.kind == .gate }

            if gateEvents.isEmpty {
                Text("Tests have not executed for this intent yet.")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            } else {
                ForEach(gateEvents) { ev in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            Image(systemName: "shield.checkerboard")
                                .foregroundColor(.barkcliStatusActive)
                            Text("Gate Verdict")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.barkcliTextPrimary)
                        }
                        Text(ev.text)
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextSecondary)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.barkcliCardSubtle)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
        }
    }

    private var contextView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("LIVING PROJECT CONTEXT")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.barkcliTextMuted)
                .tracking(0.6)

            Text("Auto maintained project context from project_context.md provided to all agents in this thread.")
                .font(.system(size: 11))
                .foregroundColor(.barkcliTextSecondary)
                .lineSpacing(2)

            VStack(alignment: .leading, spacing: 6) {
                Text("barkcli architecture")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.barkcliTextPrimary)

                Text("Intent in, plans out, isolated worktrees, tests as the gate, and a merge train for whatever passes.")
                    .font(.system(size: 10))
                    .foregroundColor(.barkcliTextMuted)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.barkcliCardSubtle)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    private func loadDiffIfActive() async {
        guard selectedTab == .diff, let id = store.selectedThreadId else { return }
        isLoadingDiff = true
        diffResult = await store.fetchDiff(taskId: id)
        isLoadingDiff = false
    }
}
