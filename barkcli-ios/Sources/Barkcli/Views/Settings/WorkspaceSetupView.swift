import SwiftUI

public struct WorkspaceSetupView: View {
    @Environment(AppState.self) private var appState

    @State private var serverURLString: String = ""
    @State private var authTokenString: String = ""
    @State private var isPinging: Bool = false
    @State private var pingResult: Bool?
    @State private var isInitializingWorkspace: Bool = false
    @State private var initMessage: String?

    public init() {}

    private var connectionStatusColor: Color {
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

    public var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                connectionStatusHeroCard

                serverConfigurationCard

                demoModeCard

                workspaceStatusCard

                aboutCard
            }
            .padding(16)
        }
        .background(Color.barkcliDarkBackground.ignoresSafeArea())
        .onAppear {
            serverURLString = appState.projectURL.absoluteString
            authTokenString = appState.authToken ?? ""
        }
    }

    private var connectionStatusHeroCard: some View {
        GlassCard(padding: 16) {
            HStack(spacing: 14) {
                Circle()
                    .fill(connectionStatusColor)
                    .frame(width: 14, height: 14)
                    .overlay(
                        Circle()
                            .stroke(connectionStatusColor.opacity(0.35), lineWidth: 6)
                    )

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text("CONNECTION STATUS")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                            .tracking(0.6)

                        StatusBadge(
                            appState.connectionMode.displayName,
                            variant: appState.connectionMode == .connected ? .success :
                                     appState.connectionMode == .demoMode ? .accent : .warning
                        )
                    }

                    Text(appState.isDemoMode ? "Running in offline demo mode" : appState.projectURL.absoluteString)
                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                        .foregroundColor(.barkcliTextPrimary)
                }

                Spacer()
            }
        }
    }

    private var serverConfigurationCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                Text("SERVER CONNECTION")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
                    .tracking(0.6)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Server Address")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.barkcliTextMuted)

                    TextField("http://localhost:4321", text: $serverURLString)
                        .font(.system(size: 14, design: .monospaced))
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

                VStack(alignment: .leading, spacing: 6) {
                    Text("Auth Token (Optional)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.barkcliTextMuted)

                    TextField("Bearer token or empty", text: $authTokenString)
                        .font(.system(size: 14, design: .monospaced))
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

                HStack(spacing: 10) {
                    ActionButton(
                        appState.connectionMode == .connected ? "Disconnect" : "Connect",
                        systemImage: appState.connectionMode == .connected ? "stop.circle" : "bolt.horizontal.fill",
                        variant: appState.connectionMode == .connected ? .secondary : .primary,
                        isLoading: appState.connectionMode == .connecting
                    ) {
                        if appState.connectionMode == .connected {
                            appState.disconnect()
                        } else {
                            if let url = URL(string: serverURLString.trimmingCharacters(in: .whitespacesAndNewlines)) {
                                let token = authTokenString.trimmingCharacters(in: .whitespacesAndNewlines)
                                Task {
                                    await appState.connect(url: url, authToken: token.isEmpty ? nil : token)
                                }
                            }
                        }
                    }

                    ActionButton(
                        "Ping Server",
                        systemImage: "waveform.path",
                        variant: .secondary,
                        isLoading: isPinging
                    ) {
                        Task {
                            isPinging = true
                            pingResult = await appState.pingServer()
                            isPinging = false
                        }
                    }
                }

                if let result = pingResult {
                    HStack(spacing: 6) {
                        Image(systemName: result ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .font(.system(size: 12))
                            .foregroundColor(result ? .barkcliSuccessEmerald : .barkcliDangerRose)

                        Text(result ? "Server is responsive and healthy." : "Server unreachable at specified URL.")
                            .font(.system(size: 12))
                            .foregroundColor(result ? .barkcliSuccessEmerald : .barkcliDangerRose)
                    }
                    .padding(8)
                    .background((result ? Color.barkcliSuccessEmerald : Color.barkcliDangerRose).opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
            }
        }
    }

    private var demoModeCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("DEMO MODE")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                            .tracking(0.6)

                        Text("Instant Offline Testing")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    Spacer()

                    StatusBadge(
                        appState.isDemoMode ? "Active" : "Disabled",
                        variant: appState.isDemoMode ? .accent : .neutral
                    )
                }

                Text("Allows full interaction with simulated boards, agents, worktrees, and gates without requiring a live server process.")
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextMuted)

                ActionButton(
                    appState.isDemoMode ? "Exit Demo Mode" : "Switch to Demo Mode",
                    systemImage: appState.isDemoMode ? "arrow.triangle.swap" : "play.fill",
                    variant: appState.isDemoMode ? .secondary : .primary
                ) {
                    appState.toggleDemoMode()
                }
            }
        }
    }

    private var workspaceStatusCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("WORKSPACE INITIALIZATION")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                            .tracking(0.6)

                        Text("Metadata and board files")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    Spacer()

                    let isInit = appState.workspaceStatus?.initialized ?? (appState.isDemoMode ? true : false)
                    StatusBadge(
                        isInit ? "Initialized" : "Uninitialized",
                        systemImage: isInit ? "checkmark.circle.fill" : "exclamationmark.circle.fill",
                        variant: isInit ? .success : .warning
                    )
                }

                VStack(alignment: .leading, spacing: 6) {
                    let dirExists = appState.workspaceStatus?.boardDirExists ?? true
                    let configExists = appState.workspaceStatus?.configFileExists ?? true
                    let count = appState.workspaceStatus?.boardsCount ?? appState.availableBoards.count

                    statusRow(label: ".board directory detected", ok: dirExists)
                    statusRow(label: "config.json present", ok: configExists)
                    statusRow(label: "\(count) board files ready", ok: count > 0)
                }

                if let message = initMessage {
                    Text(message)
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliStatusInfo)
                }

                ActionButton(
                    "Auto Initialize Workspace",
                    systemImage: "wand.and.stars",
                    variant: .secondary,
                    isLoading: isInitializingWorkspace
                ) {
                    Task {
                        isInitializingWorkspace = true
                        do {
                            let res = try await appState.apiClient.initWorkspace(boardName: appState.currentBoardName)
                            appState.workspaceStatus = res
                            initMessage = "Workspace successfully initialized."
                        } catch {
                            initMessage = "Initialization error: \(error.localizedDescription)"
                        }
                        isInitializingWorkspace = false
                    }
                }
            }
        }
    }

    private func statusRow(label: String, ok: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: ok ? "checkmark.circle.fill" : "exclamationmark.circle")
                .font(.system(size: 12))
                .foregroundColor(ok ? .barkcliSuccessEmerald : .barkcliWarningAmber)

            Text(label)
                .font(.system(size: 12))
                .foregroundColor(.barkcliTextPrimary)
        }
    }

    private var aboutCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("ABOUT BARKCLI")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
                    .tracking(0.6)

                Text("barkcli is the management layer for AI agents.")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                Text("Intent in, plans out, isolated worktrees, tests as the gate, and a merge train for whatever passes.")
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
