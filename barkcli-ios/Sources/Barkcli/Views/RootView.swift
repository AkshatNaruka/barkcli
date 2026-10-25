import SwiftUI

/// Top-level navigation tab enum for the barkcli mobile client.
public enum AppNavigationTab: String, CaseIterable, Identifiable {
    case mind = "Mind"
    case board = "Board"
    case orchestrate = "Orchestrate"
    case specs = "Specs"
    case history = "History"
    case workspaces = "Workspaces"

    public var id: String { rawValue }

    public var iconName: String {
        switch self {
        case .mind:
            return "brain.head.profile"
        case .board:
            return "rectangle.split.3x1.fill"
        case .orchestrate:
            return "cpu.fill"
        case .specs:
            return "list.bullet.clipboard.fill"
        case .history:
            return "clock.arrow.circlepath"
        case .workspaces:
            return "network"
        }
    }
}

/// Unified navigation container providing adaptive NavigationSplitView on iPadOS/macOS
/// and floating liquid glass TabView on iPhone, with the persistent IntentBar.
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

    @State private var showPlanProposalSheet: Bool = false
    @State private var activeProposalToReview: PlanProposal? = nil

    public init() {}

    public var body: some View {
        #if os(iOS)
        if horizontalSizeClass == .regular {
            regularSplitLayout
                .preferredColorScheme(.dark)
                .injectStores(
                    workspace: workspaceStore,
                    mind: mindStore,
                    board: boardStore,
                    orchestrate: orchestrationStore,
                    specs: specsStore,
                    git: gitStore
                )
        } else {
            compactPhoneLayout
                .preferredColorScheme(.dark)
                .injectStores(
                    workspace: workspaceStore,
                    mind: mindStore,
                    board: boardStore,
                    orchestrate: orchestrationStore,
                    specs: specsStore,
                    git: gitStore
                )
        }
        #else
        regularSplitLayout
            .preferredColorScheme(.dark)
            .injectStores(
                workspace: workspaceStore,
                mind: mindStore,
                board: boardStore,
                orchestrate: orchestrationStore,
                specs: specsStore,
                git: gitStore
            )
        #endif
    }

    // MARK: - Regular Split View Layout (iPadOS & macOS)

    private var regularSplitLayout: some View {
        NavigationSplitView {
            List(selection: Binding(
                get: { selectedTab },
                set: { if let tab = $0 { selectedTab = tab } }
            )) {
                ForEach(AppNavigationTab.allCases) { tab in
                    NavigationLink(value: tab) {
                        Label(tab.rawValue, systemImage: tab.iconName)
                            .foregroundColor(selectedTab == tab ? .barkcliElectricViolet : .barkcliTextPrimary)
                    }
                }
            }
            .listStyle(.sidebar)
            .navigationTitle("barkcli")
            .background(Color.barkcliSpaceBlack)
        } detail: {
            VStack(spacing: 0) {
                tabContentView(for: selectedTab)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                // Persistent Intent Input Bar
                IntentBar()
            }
            .background(Color.barkcliDarkBackground.ignoresSafeArea())
        }
        .sheet(item: $activeProposalToReview) { proposal in
            PlanProposalSheet(proposal: proposal)
        }
    }

    // MARK: - Compact Phone Layout (iPhone)

    private var compactPhoneLayout: some View {
        ZStack(alignment: .bottom) {
            // Main Tab Content Area
            tabContentView(for: selectedTab)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.bottom, 120) // Clearance for floating IntentBar and TabBar

            // Pinned Floating Controls Deck: IntentBar + Custom Liquid Glass TabBar
            VStack(spacing: 6) {
                // Persistent Floating Intent Capsule
                IntentBar()

                // Custom Liquid Glass Bottom Tab Bar
                liquidGlassTabBar
            }
        }
        .background(Color.barkcliDarkBackground.ignoresSafeArea())
        .sheet(item: $activeProposalToReview) { proposal in
            PlanProposalSheet(proposal: proposal)
        }
    }

    // MARK: - Tab Content View Router

    @ViewBuilder
    private func tabContentView(for tab: AppNavigationTab) -> some View {
        NavigationStack {
            switch tab {
            case .mind:
                MindDashboardView()
            case .board:
                KanbanBoardView()
            case .orchestrate:
                AgentsOrchestrationView()
            case .specs:
                SpecsMatrixView()
            case .history:
                GitHistoryView()
            case .workspaces:
                WorkspaceSwitcherView()
            }
        }
    }

    // MARK: - Custom Liquid Glass Bottom Tab Bar

    private var liquidGlassTabBar: some View {
        HStack(spacing: 4) {
            ForEach(AppNavigationTab.allCases) { tab in
                let isSelected = selectedTab == tab
                Button {
                    selectedTab = tab
                    #if os(iOS)
                    let generator = UISelectionFeedbackGenerator()
                    generator.selectionChanged()
                    #endif
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: tab.iconName)
                            .font(.system(size: 16, weight: isSelected ? .bold : .medium))
                            .foregroundColor(isSelected ? .barkcliElectricViolet : .barkcliTextMuted)
                            .frame(height: 20)

                        Text(tab.rawValue)
                            .font(.system(size: 10, weight: isSelected ? .bold : .medium))
                            .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextMuted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(
                        isSelected ?
                        Color.barkcliElectricViolet.opacity(0.12) :
                        Color.clear
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color.barkcliSpaceBlack.opacity(0.85))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5)
        )
        .liquidGlass(cornerRadius: 24, interactive: true, borderColor: Color.white.opacity(0.1))
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
        .shadow(color: Color.black.opacity(0.4), radius: 12, y: 6)
    }
}

// MARK: - Store Injection Helper Extension

private extension View {
    func injectStores(
        workspace: WorkspaceStore,
        mind: MindStore,
        board: BoardStore,
        orchestrate: OrchestrationStore,
        specs: SpecsStore,
        git: GitStore
    ) -> some View {
        self
            .environment(workspace)
            .environment(mind)
            .environment(board)
            .environment(orchestrate)
            .environment(specs)
            .environment(git)
            .environment(AppState.shared)
    }
}
