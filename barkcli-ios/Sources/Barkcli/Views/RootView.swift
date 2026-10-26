import SwiftUI

public enum AppNavigationTab: String, CaseIterable, Identifiable {
    // Control
    case mind = "Mind"
    case board = "Board"
    case sprints = "Sprints"

    // Autonomy
    case orchestrate = "Orchestrate"
    case specs = "Specs"
    case history = "History"
    case run = "Run"

    // Knowledge
    case context = "Context"
    case memory = "Memory"
    case brain = "Brain"
    case skills = "Skills"
    case docs = "Docs"

    // Operations
    case code = "Code"
    case calendar = "Calendar"
    case reports = "Reports"
    case timeline = "Timeline"
    case workspaces = "Workspaces"

    public var id: String { rawValue }

    public var iconName: String {
        switch self {
        case .mind:
            return "brain.head.profile"
        case .board:
            return "rectangle.split.3x1.fill"
        case .sprints:
            return "flame.fill"
        case .orchestrate:
            return "cpu.fill"
        case .specs:
            return "list.bullet.clipboard.fill"
        case .history:
            return "clock.arrow.circlepath"
        case .run:
            return "play.circle.fill"
        case .context:
            return "doc.text.fill"
        case .memory:
            return "memorychip.fill"
        case .brain:
            return "network"
        case .skills:
            return "wrench.and.screwdriver.fill"
        case .docs:
            return "book.pages.fill"
        case .code:
            return "chevron.left.forwardslash.chevron.right"
        case .calendar:
            return "calendar"
        case .reports:
            return "chart.bar.xaxis"
        case .timeline:
            return "timeline.selection"
        case .workspaces:
            return "macwindow"
        }
    }
}

public enum TabGroup: String, CaseIterable, Identifiable {
    case control = "Control"
    case autonomy = "Autonomy"
    case knowledge = "Knowledge"
    case operations = "Operations"

    public var id: String { rawValue }

    public var tabs: [AppNavigationTab] {
        switch self {
        case .control:
            return [.mind, .board, .sprints]
        case .autonomy:
            return [.orchestrate, .specs, .history, .run]
        case .knowledge:
            return [.context, .memory, .brain, .skills, .docs]
        case .operations:
            return [.code, .calendar, .reports, .timeline, .workspaces]
        }
    }
}

public struct RootView: View {
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #endif

    @State private var selectedTab: AppNavigationTab = .mind
    @State private var workspaceStore = WorkspaceStore.shared
    @State private var mindStore = MindStore.shared
    @State private var boardStore = BoardStore.shared
    @State private var orchestrationStore = OrchestrationStore.shared
    @State private var specsStore = SpecsStore.shared
    @State private var gitStore = GitStore.shared

    @State private var sprintStore = SprintStore.shared
    @State private var codeStore = CodeStore.shared
    @State private var contextMemoryStore = ContextMemoryStore.shared
    @State private var brainStore = BrainStore.shared
    @State private var skillsStore = SkillsStore.shared
    @State private var docsStore = DocsStore.shared
    @State private var calendarStore = CalendarStore.shared
    @State private var reportsStore = ReportsStore.shared
    @State private var timelineStore = TimelineStore.shared

    @State private var activeProposalToReview: PlanProposal? = nil

    private var proposalReviewBinding: Binding<PlanProposal?> {
        Binding(
            get: { activeProposalToReview ?? mindStore.activeProposalToReview },
            set: {
                activeProposalToReview = $0
                mindStore.activeProposalToReview = $0
            }
        )
    }

    public init() {}

    public var body: some View {
        #if os(iOS)
        if horizontalSizeClass == .regular {
            regularSplitLayout
                .preferredColorScheme(.dark)
                .tint(Color.barkcliTextPrimary)
                .accentColor(Color.barkcliTextPrimary)
                .injectStores(
                    workspace: workspaceStore,
                    mind: mindStore,
                    board: boardStore,
                    orchestrate: orchestrationStore,
                    specs: specsStore,
                    git: gitStore,
                    sprint: sprintStore,
                    code: codeStore,
                    contextMemory: contextMemoryStore,
                    brain: brainStore,
                    skills: skillsStore,
                    docs: docsStore,
                    calendar: calendarStore,
                    reports: reportsStore,
                    timeline: timelineStore
                )
        } else {
            compactPhoneLayout
                .preferredColorScheme(.dark)
                .tint(Color.barkcliTextPrimary)
                .accentColor(Color.barkcliTextPrimary)
                .injectStores(
                    workspace: workspaceStore,
                    mind: mindStore,
                    board: boardStore,
                    orchestrate: orchestrationStore,
                    specs: specsStore,
                    git: gitStore,
                    sprint: sprintStore,
                    code: codeStore,
                    contextMemory: contextMemoryStore,
                    brain: brainStore,
                    skills: skillsStore,
                    docs: docsStore,
                    calendar: calendarStore,
                    reports: reportsStore,
                    timeline: timelineStore
                )
        }
        #else
        regularSplitLayout
            .preferredColorScheme(.dark)
            .tint(Color.barkcliTextPrimary)
            .accentColor(Color.barkcliTextPrimary)
            .injectStores(
                workspace: workspaceStore,
                mind: mindStore,
                board: boardStore,
                orchestrate: orchestrationStore,
                specs: specsStore,
                git: gitStore,
                sprint: sprintStore,
                code: codeStore,
                contextMemory: contextMemoryStore,
                brain: brainStore,
                skills: skillsStore,
                docs: docsStore,
                calendar: calendarStore,
                reports: reportsStore,
                timeline: timelineStore
            )
        #endif
    }

    // MARK: Split View Layout for iPadOS and macOS

    private var regularSplitLayout: some View {
        NavigationSplitView {
            sidebarView
        } detail: {
            VStack(spacing: 0) {
                tabContentView(for: selectedTab)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                // Persistent Intent Input Bar
                IntentBar(onSubmit: handleIntentSubmit)

                // Minimalist bottom telemetry status bar
                bottomTelemetryBar
            }
            .background(Color.barkcliCanvas.ignoresSafeArea())
        }
        .sheet(item: proposalReviewBinding) { proposal in
            PlanProposalSheet(proposal: proposal)
        }
    }

    // MARK: Sidebar View

    private var sidebarView: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(Color.barkcliTextPrimary)
                    .frame(width: 8, height: 8)

                Text("barkcli")
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundColor(.barkcliTextPrimary)

                Spacer()

                StatusBadge("v0.8.0", variant: .neutral)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.barkcliCardBackground)

            Divider().overlay(Color.barkcliBorder)

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(TabGroup.allCases) { group in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(group.rawValue.uppercased())
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundColor(.barkcliTextMuted)
                                .padding(.horizontal, 12)
                                .padding(.bottom, 2)

                            ForEach(group.tabs) { tab in
                                let isSelected = selectedTab == tab
                                Button {
                                    selectedTab = tab
                                } label: {
                                    HStack(spacing: 8) {
                                        Image(systemName: tab.iconName)
                                            .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                                            .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextMuted)
                                            .frame(width: 16)

                                        Text(tab.rawValue)
                                            .font(.system(size: 12, weight: isSelected ? .bold : .medium))
                                            .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextSecondary)

                                        Spacer()

                                        if isSelected {
                                            Circle()
                                                .fill(Color.barkcliTextPrimary)
                                                .frame(width: 4, height: 4)
                                        }
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(isSelected ? Color.barkcliCardSubtle : Color.clear)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                                            .strokeBorder(isSelected ? Color.barkcliBorder : Color.clear, lineWidth: 1)
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(10)
            }

            Divider().overlay(Color.barkcliBorder)

            HStack(spacing: 6) {
                Circle()
                    .fill(Color.barkcliStatusActive)
                    .frame(width: 5, height: 5)
                Text("Autonomous Fleet Nominal")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.barkcliTextMuted)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color.barkcliCardBackground)
        }
        .frame(minWidth: 200, idealWidth: 220, maxWidth: 260)
        .background(Color.barkcliCanvas)
    }

    // MARK: Minimalist Bottom Telemetry Status Bar

    private var bottomTelemetryBar: some View {
        HStack(spacing: 16) {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color.barkcliStatusActive)
                    .frame(width: 5, height: 5)
                Text("daemon: 4321 (12ms)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.barkcliTextSecondary)
            }

            Divider().frame(height: 12).overlay(Color.barkcliBorder)

            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.branch")
                    .font(.system(size: 9))
                    .foregroundColor(.barkcliTextMuted)
                Text("branch: main (clean)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.barkcliTextSecondary)
            }

            Divider().frame(height: 12).overlay(Color.barkcliBorder)

            HStack(spacing: 6) {
                Image(systemName: "square.split.diagonal.2x2")
                    .font(.system(size: 9))
                    .foregroundColor(.barkcliTextMuted)
                Text("worktrees: 3 active")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.barkcliTextSecondary)
            }

            Spacer()

            HStack(spacing: 6) {
                Image(systemName: "checkmark.shield")
                    .font(.system(size: 9))
                    .foregroundColor(.barkcliStatusActive)
                Text("acceptance gate: passing (cargo test)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.barkcliStatusActive)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .background(Color.barkcliCardBackground)
        .overlay(
            Rectangle()
                .fill(Color.barkcliBorder)
                .frame(height: 1),
            alignment: .top
        )
    }

    // MARK: Compact Phone Layout for iPhone

    private var compactPhoneLayout: some View {
        ZStack(alignment: .bottom) {
            tabContentView(for: selectedTab)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.bottom, 120)

            VStack(spacing: 6) {
                if let proposal = mindStore.activeProposal, selectedTab != .mind {
                    proposalBannerPill(proposal)
                }

                IntentBar(onSubmit: handleIntentSubmit)

                phoneTabBar
            }
        }
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .sheet(item: proposalReviewBinding) { proposal in
            PlanProposalSheet(proposal: proposal)
        }
    }

    private func handleIntentSubmit(prompt: String, kind: IntentKind) async {
        do {
            _ = try await mindStore.submitIntent(prompt: prompt, kind: kind.apiValue)
            if let proposal = mindStore.activeProposal {
                activeProposalToReview = proposal
            }
        } catch {
            // Handled in store
        }
    }

    private func proposalBannerPill(_ proposal: PlanProposal) -> some View {
        Button {
            activeProposalToReview = proposal
        } label: {
            HStack(spacing: 8) {
                Circle()
                    .fill(Color.barkcliStatusWarning)
                    .frame(width: 5, height: 5)
                Text("Review Plan: \(proposal.cardTitle)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.barkcliTextPrimary)
                    .lineLimit(1)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color.barkcliCardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(Color.barkcliStatusWarning.opacity(0.4), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
    }

    // MARK: Tab Content Router

    @ViewBuilder
    private func tabContentView(for tab: AppNavigationTab) -> some View {
        NavigationStack {
            switch tab {
            case .mind:
                MindDashboardView()
            case .board:
                KanbanBoardView()
            case .sprints:
                SprintsView()
            case .orchestrate:
                AgentsOrchestrationView()
            case .specs:
                SpecsMatrixView()
            case .history:
                GitHistoryView()
            case .run:
                CodeSearchView()
            case .context, .memory:
                ContextMemoryView()
            case .brain:
                BrainGraphView()
            case .skills:
                SkillsRegistryView()
            case .docs:
                DocsBrowserView()
            case .code:
                CodeSearchView()
            case .calendar:
                CalendarAgendaView()
            case .reports:
                ReportsView()
            case .timeline:
                TimelineCheckpointsView()
            case .workspaces:
                WorkspaceSwitcherView()
            }
        }
    }

    // MARK: Phone Tab Bar

    private var phoneTabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(AppNavigationTab.allCases) { tab in
                    let isSelected = selectedTab == tab
                    Button {
                        selectedTab = tab
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: tab.iconName)
                                .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                            Text(tab.rawValue)
                                .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                        }
                        .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextMuted)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(isSelected ? Color.barkcliCardSubtle : Color.clear)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .strokeBorder(isSelected ? Color.barkcliBorder : Color.clear, lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 8)
        }
        .padding(.vertical, 6)
        .background(Color.barkcliCardBackground)
        .overlay(
            Rectangle()
                .fill(Color.barkcliBorder)
                .frame(height: 1),
            alignment: .top
        )
    }
}

// MARK: Store Injection Extension

private extension View {
    func injectStores(
        workspace: WorkspaceStore,
        mind: MindStore,
        board: BoardStore,
        orchestrate: OrchestrationStore,
        specs: SpecsStore,
        git: GitStore,
        sprint: SprintStore,
        code: CodeStore,
        contextMemory: ContextMemoryStore,
        brain: BrainStore,
        skills: SkillsStore,
        docs: DocsStore,
        calendar: CalendarStore,
        reports: ReportsStore,
        timeline: TimelineStore
    ) -> some View {
        self
            .environment(workspace)
            .environment(mind)
            .environment(board)
            .environment(orchestrate)
            .environment(specs)
            .environment(git)
            .environment(sprint)
            .environment(code)
            .environment(contextMemory)
            .environment(brain)
            .environment(skills)
            .environment(docs)
            .environment(calendar)
            .environment(reports)
            .environment(timeline)
            .environment(AppState.shared)
    }
}
