import SwiftUI

/// Workspace Switcher and Network Discovery view.
/// Allows instant switching between local Bonjour daemons, remote IP:port servers,
/// and the bundled Offline Demo workspace with live round-trip latency indicators.
public struct WorkspaceSwitcherView: View {
    @Environment(WorkspaceStore.self) private var workspaceStore
    @Environment(\.dismiss) private var dismiss

    @State private var newName: String = ""
    @State private var newHost: String = ""
    @State private var newPortString: String = "4321"
    @State private var newToken: String = ""
    @State private var showAddModal: Bool = false
    @State private var showAutoInitSheet: Bool = false

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Active Workspace Hero Card
                    activeWorkspaceHeroCard

                    // Missing .board/ Auto-Init Alert Banner (if detected)
                    if workspaceStore.needsAutoInit {
                        autoInitAlertBanner
                    }

                    // Discovered Local Daemons Section
                    discoveredDaemonsSection

                    // Saved Workspaces Section
                    savedWorkspacesSection

                    // Offline Demo Workspace Section
                    offlineDemoSection
                }
                .padding(16)
            }
            .background(Color.barkcliObsidian.ignoresSafeArea())
            .navigationTitle("Workspaces")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(.barkcliTextMuted)
                }

                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showAddModal = true
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.barkcliElectricViolet)
                    }
                }
            }
            .sheet(isPresented: $showAddModal) {
                addWorkspaceSheet
            }
            .sheet(isPresented: $showAutoInitSheet) {
                AutoInitView()
            }
            .task {
                await workspaceStore.scanForInstances()
            }
        }
    }

    // MARK: - Active Workspace Hero Card
    private var activeWorkspaceHeroCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("ACTIVE WORKSPACE")
                        .font(BarkcliTypography.labelSmall)
                        .foregroundColor(.barkcliTextMuted)
                        .tracking(1.0)

                    Spacer()

                    connectionPill
                }

                HStack(spacing: 10) {
                    Image(systemName: workspaceStore.connectionMode == .demoMode ? "cube.transparent.fill" : "server.rack")
                        .font(.system(size: 22))
                        .foregroundColor(.barkcliElectricViolet)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(workspaceStore.currentWorkspace.name)
                            .font(BarkcliTypography.screenTitle)
                            .foregroundColor(.barkcliTextPrimary)

                        Text("\(workspaceStore.currentWorkspace.host):\(workspaceStore.currentWorkspace.port)")
                            .font(BarkcliTypography.codePath)
                            .foregroundColor(.barkcliTextMuted)
                    }
                }

                Divider().background(Color.barkcliBorderHairline)

                HStack {
                    if let latency = workspaceStore.lastLatencyMs {
                        HStack(spacing: 5) {
                            Circle()
                                .fill(latency < 50 ? Color.barkcliEmeraldGate : Color.barkcliAmberPulse)
                                .frame(width: 7, height: 7)
                            Text("\(latency) ms roundtrip")
                                .font(BarkcliTypography.codeHash)
                                .foregroundColor(.barkcliTextMuted)
                        }
                    } else if workspaceStore.connectionMode == .demoMode {
                        HStack(spacing: 5) {
                            Circle().fill(Color.barkcliElectricViolet).frame(width: 7, height: 7)
                            Text("Zero latency offline sandbox")
                                .font(BarkcliTypography.codeHash)
                                .foregroundColor(.barkcliTextMuted)
                        }
                    }

                    Spacer()

                    Button {
                        Task {
                            await workspaceStore.checkHealth()
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 11))
                            Text("Check Health")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundColor(.barkcliElectricViolet)
                    }
                }
            }
        }
    }

    private var connectionPill: some View {
        let (color, label) = connectionStateDisplay
        return HStack(spacing: 5) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(label)
                .font(BarkcliTypography.codeHash)
                .foregroundColor(color)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(color.opacity(0.12)))
        .overlay(Capsule().strokeBorder(color.opacity(0.3), lineWidth: 0.5))
    }

    private var connectionStateDisplay: (Color, String) {
        switch workspaceStore.connectionMode {
        case .connected:
            return (.barkcliEmeraldGate, "CONNECTED")
        case .connecting:
            return (.barkcliAmberPulse, "CONNECTING")
        case .disconnected:
            return (.barkcliCrimsonBlocker, "DISCONNECTED")
        case .demoMode:
            return (.barkcliElectricViolet, "DEMO MODE")
        }
    }

    // MARK: - Auto-Init Alert Banner
    private var autoInitAlertBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles.rectangle.stack.fill")
                .font(.system(size: 20))
                .foregroundColor(.barkcliAmberPulse)

            VStack(alignment: .leading, spacing: 3) {
                Text("Missing Management Metadata")
                    .font(BarkcliTypography.cardTitle)
                    .foregroundColor(.barkcliTextPrimary)
                Text("This workspace lacks a .board/ management layer. Run auto setup to configure.")
                    .font(BarkcliTypography.captionMuted)
                    .foregroundColor(.barkcliTextMuted)
            }

            Spacer()

            Button("Set Up") {
                showAutoInitSheet = true
            }
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Capsule().fill(Color.barkcliAmberPulse))
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.barkcliAmberPulse.opacity(0.12)))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.barkcliAmberPulse.opacity(0.4), lineWidth: 0.5))
    }

    // MARK: - Discovered Local Daemons Section
    private var discoveredDaemonsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionHeader(
                    "Local Network Daemons",
                    subtitle: "Auto detected via Bonjour (_barkcli._tcp) & port 4321",
                    count: workspaceStore.discoveredInstances.count,
                    systemImage: "antenna.radiowaves.left.and.right"
                )

                Spacer()

                Button {
                    Task {
                        await workspaceStore.scanForInstances()
                    }
                } label: {
                    if workspaceStore.isScanning {
                        ProgressView()
                            .scaleEffect(0.7)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 13))
                            .foregroundColor(.barkcliElectricViolet)
                    }
                }
            }

            if workspaceStore.discoveredInstances.isEmpty {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.barkcliTextMuted)
                    Text("No local daemons detected. Run 'barkcli serve' on your machine.")
                        .font(BarkcliTypography.captionMuted)
                        .foregroundColor(.barkcliTextMuted)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.barkcliSpaceBlack))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5))
            } else {
                VStack(spacing: 8) {
                    ForEach(workspaceStore.discoveredInstances) { instance in
                        discoveredInstanceRow(instance)
                    }
                }
            }
        }
    }

    private func discoveredInstanceRow(_ instance: DiscoveredInstance) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color.barkcliEmeraldGate)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 2) {
                Text(instance.name)
                    .font(BarkcliTypography.cardTitle)
                    .foregroundColor(.barkcliTextPrimary)

                Text("\(instance.host):\(instance.port)")
                    .font(BarkcliTypography.codePath)
                    .foregroundColor(.barkcliTextMuted)
            }

            Spacer()

            if let lat = instance.latencyMs {
                Text("\(lat) ms")
                    .font(BarkcliTypography.codeHash)
                    .foregroundColor(.barkcliTextMuted)
            }

            Button("Connect") {
                Task {
                    await workspaceStore.switchToLive(host: instance.host, port: instance.port)
                    dismiss()
                }
            }
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.barkcliElectricViolet)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(Color.barkcliElectricViolet.opacity(0.15)))
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.barkcliSpaceBlack))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5))
    }

    // MARK: - Saved Workspaces Section
    private var savedWorkspacesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                "Configured Workspaces",
                subtitle: "Stored local and remote workspaces",
                count: workspaceStore.availableWorkspaces.count,
                systemImage: "folder.fill"
            )

            VStack(spacing: 8) {
                ForEach(workspaceStore.availableWorkspaces) { ws in
                    HStack(spacing: 12) {
                        Image(systemName: ws.isRemote ? "network" : "desktopcomputer")
                            .foregroundColor(.barkcliTextMuted)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(ws.name)
                                .font(BarkcliTypography.cardTitle)
                                .foregroundColor(.barkcliTextPrimary)
                            Text("\(ws.host):\(ws.port)")
                                .font(BarkcliTypography.codePath)
                                .foregroundColor(.barkcliTextMuted)
                        }

                        Spacer()

                        if ws.id == workspaceStore.currentWorkspace.id {
                            StatusBadge("ACTIVE", variant: .accent)
                        } else {
                            Button("Switch") {
                                Task {
                                    await workspaceStore.connect(to: ws)
                                    dismiss()
                                }
                            }
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.barkcliTextMuted)
                        }
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.barkcliSpaceBlack))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5))
                }
            }
        }
    }

    // MARK: - Offline Demo Section
    private var offlineDemoSection: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Image(systemName: "sparkles")
                        .foregroundColor(.barkcliElectricViolet)
                    Text("Offline Demo Workspace")
                        .font(BarkcliTypography.cardTitle)
                        .foregroundColor(.barkcliTextPrimary)
                    Spacer()
                    StatusBadge("OFFLINE", variant: .electric)
                }

                Text("Explore 15+ rich cards, 5 registered agents, real time simulated autopilot intent flows, specs matrix, and git commit history without requiring an active remote server.")
                    .font(BarkcliTypography.captionMuted)
                    .foregroundColor(.barkcliTextMuted)

                Button {
                    workspaceStore.switchToDemo()
                    dismiss()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 11))
                        Text("Switch to Demo Mode")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.barkcliElectricViolet))
                }
            }
        }
    }

    // MARK: - Add Workspace Sheet
    private var addWorkspaceSheet: some View {
        NavigationStack {
            Form {
                Section("Workspace Details") {
                    TextField("Name (e.g. Production Cluster)", text: $newName)
                    TextField("Host / IP Address (e.g. 192.168.1.50)", text: $newHost)
                    TextField("Port (default 4321)", text: $newPortString)
                    SecureField("Auth Token (optional)", text: $newToken)
                }
            }
            .navigationTitle("Add Workspace")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showAddModal = false
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save & Connect") {
                        let port = Int(newPortString) ?? 4321
                        let name = newName.isEmpty ? "\(newHost):\(port)" : newName
                        workspaceStore.addWorkspace(name: name, host: newHost, port: port, isRemote: true)
                        Task {
                            await workspaceStore.switchToLive(host: newHost, port: port, token: newToken.isEmpty ? nil : newToken)
                            showAddModal = false
                            dismiss()
                        }
                    }
                    .disabled(newHost.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
