import SwiftUI

public enum MainTab: String, CaseIterable, Identifiable {
    case mind = "Mind"
    case board = "Board"
    case orchestrate = "Orchestrate"
    case history = "History"
    case specs = "Specs"
    case settings = "Settings"

    public var id: String { rawValue }

    public var iconName: String {
        switch self {
        case .mind:
            return "brain.head.profile"
        case .board:
            return "rectangle.split.3x1.fill"
        case .orchestrate:
            return "cpu.fill"
        case .history:
            return "clock.arrow.circlepath"
        case .specs:
            return "list.bullet.clipboard.fill"
        case .settings:
            return "gearshape.fill"
        }
    }
}

public struct MainView: View {
    @Environment(AppState.self) private var appState

    @State private var selectedTab: MainTab = .mind
    @State private var showCreateBoardSheet: Bool = false
    @State private var newBoardTitle: String = ""

    public init() {}

    public var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                liquidGlassHeader

                if let message = appState.statusBannerMessage {
                    floatingBanner(message)
                }

                activeTabContentView
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            customBottomTabBar
        }
        .background(Color.barkcliDarkBackground.ignoresSafeArea())
        .sheet(isPresented: $showCreateBoardSheet) {
            createBoardSheet
        }
    }

    private var liquidGlassHeader: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "circle.grid.cross.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.barkcliTextPrimary)

                VStack(alignment: .leading, spacing: 1) {
                    Text("barkcli")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    Text("management layer")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.barkcliTextMuted)
                }
            }

            Spacer()

            Menu {
                Section("Switch Board") {
                    ForEach(appState.availableBoards, id: \.self) { boardName in
                        Button {
                            Task {
                                await appState.switchBoard(to: boardName)
                            }
                        } label: {
                            HStack {
                                Text(boardName)
                                if boardName == appState.currentBoardName {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                }

                Section {
                    Button {
                        showCreateBoardSheet = true
                    } label: {
                        Label("Create New Board", systemImage: "plus")
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "square.grid.2x2")
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextSecondary)

                    Text(appState.currentBoardName)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.barkcliTextPrimary)

                    Image(systemName: "chevron.down")
                        .font(.system(size: 10))
                        .foregroundColor(.barkcliTextMuted)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.barkcliSurface)
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                )
            }

            Button {
                selectedTab = .settings
            } label: {
                HStack(spacing: 5) {
                    Circle()
                        .fill(connectionDotColor)
                        .frame(width: 8, height: 8)

                    Text(connectionDotText)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.barkcliTextMuted)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Color.barkcliSurface.opacity(0.8))
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.barkcliSurface.opacity(0.92))
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.barkcliBorderSubtle),
            alignment: .bottom
        )
    }

    private func floatingBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "info.circle.fill")
                .font(.system(size: 12))
                .foregroundColor(.barkcliStatusInfo)

            Text(message)
                .font(.system(size: 12))
                .foregroundColor(.barkcliTextPrimary)
                .lineLimit(1)

            Spacer()

            Button {
                appState.statusBannerMessage = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.barkcliCardSubtle)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(Color.barkcliBorder, lineWidth: 1)
        )
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    @ViewBuilder
    private var activeTabContentView: some View {
        switch selectedTab {
        case .mind:
            MindView()
        case .board:
            BoardView()
        case .orchestrate:
            OrchestrateView()
        case .history:
            HistoryView()
        case .specs:
            SpecsView()
        case .settings:
            WorkspaceSetupView()
        }
    }

    private var customBottomTabBar: some View {
        HStack(spacing: 4) {
            ForEach(MainTab.allCases) { tab in
                let isSelected = selectedTab == tab
                Button {
                    selectedTab = tab
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.iconName)
                            .font(.system(size: 17, weight: isSelected ? .bold : .medium))
                            .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextMuted)

                        Text(tab.rawValue)
                            .font(.system(size: 10, weight: isSelected ? .bold : .medium))
                            .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextMuted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(
                        isSelected ?
                        Color.barkcliCardSubtle :
                        Color.clear
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .strokeBorder(isSelected ? Color.barkcliBorderFocus : Color.clear, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color.barkcliCard.opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
        )
        .padding(.horizontal, 14)
        .padding(.bottom, 10)
        .shadow(color: Color.black.opacity(0.4), radius: 12, y: 4)
    }

    private var createBoardSheet: some View {
        NavigationStack {
            VStack(spacing: 16) {
                GlassCard(padding: 16) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("BOARD TITLE")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                            .tracking(0.6)

                        TextField("Enter board title", text: $newBoardTitle)
                            .font(.system(size: 15))
                            .foregroundColor(.barkcliTextPrimary)
                            .textFieldStyle(.plain)
                            .padding(10)
                            .background(Color.barkcliSurface)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                            )
                    }
                }

                Spacer()
            }
            .padding(18)
            .background(Color.barkcliDarkBackground.ignoresSafeArea())
            .navigationTitle("New Board")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showCreateBoardSheet = false
                    }
                    .foregroundColor(.barkcliTextMuted)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let clean = newBoardTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !clean.isEmpty else { return }
                        Task {
                            await appState.createBoard(name: clean)
                            newBoardTitle = ""
                            showCreateBoardSheet = false
                        }
                    }
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                    .disabled(newBoardTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private var connectionDotColor: Color {
        switch appState.connectionMode {
        case .connected:
            return .barkcliSuccessEmerald
        case .connecting:
            return .barkcliWarningAmber
        case .disconnected:
            return .barkcliDangerRose
        case .demoMode:
            return .barkcliStatusInfo
        }
    }

    private var connectionDotText: String {
        switch appState.connectionMode {
        case .connected:
            return "Live"
        case .connecting:
            return "Connecting"
        case .disconnected:
            return "Offline"
        case .demoMode:
            return "Demo"
        }
    }
}
