import Foundation
import Observation

/// Observable state store managing active workspace selection, connection state,
/// network instance discovery, and zero-config workspace auto-initialization.
@Observable
public final class WorkspaceStore: @unchecked Sendable {
    public static let shared = WorkspaceStore()

    // MARK: - Published State
    public var currentWorkspace: WorkspaceInfo
    public var availableWorkspaces: [WorkspaceInfo]
    public var connectionMode: ConnectionMode
    public var connectionState: ConnectionState
    public var discoveredInstances: [DiscoveredInstance]
    public var isScanning: Bool
    public var isInitializing: Bool
    public var lastLatencyMs: Int?
    public var lastError: String?
    public var needsAutoInit: Bool

    // MARK: - Active Services
    public var client: any APIClientProtocol
    private let discoveryService: NetworkDiscoveryService

    // MARK: - Initializer
    public init(
        client: (any APIClientProtocol)? = nil,
        initialWorkspace: WorkspaceInfo = WorkspaceInfo(name: "Demo Workspace", host: "127.0.0.1", port: 4321, isRemote: false),
        initialMode: ConnectionMode = .demoMode
    ) {
        self.client = client ?? MockAPIClient()
        self.currentWorkspace = initialWorkspace
        self.availableWorkspaces = [
            initialWorkspace,
            WorkspaceInfo(name: "Localhost", host: "127.0.0.1", port: 4321, isRemote: false),
            WorkspaceInfo(name: "Dev Container", host: "192.168.1.100", port: 4321, isRemote: true)
        ]
        self.connectionMode = initialMode
        self.connectionState = initialMode == .demoMode ? .demoMode : .disconnected(reason: "Not connected")
        self.discoveredInstances = []
        self.isScanning = false
        self.isInitializing = false
        self.lastLatencyMs = nil
        self.lastError = nil
        self.needsAutoInit = false
        self.discoveryService = NetworkDiscoveryService()
    }

    // MARK: - Mode & Connection Switching
    public func switchToDemo() {
        self.connectionMode = .demoMode
        self.connectionState = .demoMode
        self.currentWorkspace = WorkspaceInfo(name: "Demo Workspace", host: "127.0.0.1", port: 4321, isRemote: false)
        self.client = MockAPIClient()
        self.lastLatencyMs = 0
        self.lastError = nil
        self.needsAutoInit = false
    }

    public func switchToLive(host: String = "127.0.0.1", port: Int = 4321, token: String? = nil) async {
        let baseURL = URL(string: "http://\(host):\(port)") ?? URL(string: "http://localhost:4321")!
        let liveClient = LiveAPIClient(baseURL: baseURL, authToken: token)
        self.client = liveClient
        self.currentWorkspace = WorkspaceInfo(name: "\(host):\(port)", host: host, port: port, isRemote: host != "127.0.0.1" && host != "localhost")
        self.connectionMode = .connecting
        self.connectionState = .connecting

        _ = await checkHealth()
    }

    public func connect(to workspace: WorkspaceInfo, token: String? = nil) async {
        if workspace.name == "Demo Workspace" {
            switchToDemo()
            return
        }

        await switchToLive(host: workspace.host, port: workspace.port, token: token)
    }

    // MARK: - Health Check & Latency
    @discardableResult
    public func checkHealth() async -> Bool {
        if connectionMode == .demoMode {
            self.lastLatencyMs = 0
            self.connectionState = .demoMode
            return true
        }

        let start = Date()
        do {
            let status = try await client.checkHealth()
            let latency = Int(Date().timeIntervalSince(start) * 1000)
            self.lastLatencyMs = latency
            self.connectionMode = .connected
            self.connectionState = .connected(latencyMs: latency)
            self.lastError = nil

            // Check if workspace requires auto-init
            if let autoInitService = try? await WorkspaceAutoInitService.shared.needsInitialization(client: client) {
                self.needsAutoInit = autoInitService
            }

            return status.status == "ok"
        } catch {
            self.connectionMode = .disconnected
            self.connectionState = .disconnected(reason: error.localizedDescription)
            self.lastError = error.localizedDescription
            self.lastLatencyMs = nil
            return false
        }
    }

    // MARK: - Auto-Initialization Flow
    @discardableResult
    public func triggerAutoInit(options: AutoInitOptions = AutoInitOptions()) async throws -> WorkspaceStatus {
        isInitializing = true
        defer { isInitializing = false }

        do {
            let status = try await WorkspaceAutoInitService.shared.initializeWorkspace(client: client, options: options)
            self.needsAutoInit = false
            self.lastError = nil
            return status
        } catch {
            self.lastError = error.localizedDescription
            throw error
        }
    }

    // MARK: - Instance Discovery
    public func scanForInstances() async {
        isScanning = true
        defer { isScanning = false }

        discoveryService.startDiscovery()

        // Wait brief interval for mDNS/subnet probes to resolve
        try? await Task.sleep(nanoseconds: 200_000_000)

        let discovered = discoveryService.discoveredInstances
        if !discovered.isEmpty {
            self.discoveredInstances = discovered
        } else if connectionMode == .demoMode {
            // Provide simulated local discovered instance for testing/preview
            self.discoveredInstances = [
                DiscoveredInstance(name: "barkcli dev daemon", host: "127.0.0.1", port: 4321, latencyMs: 2, isLocal: true, version: "0.8.0", hasMetadata: true)
            ]
        }
    }

    // MARK: - Workspace Management
    public func addWorkspace(name: String, host: String, port: Int = 4321, isRemote: Bool = false) {
        let ws = WorkspaceInfo(name: name, host: host, port: port, isRemote: isRemote, lastSeen: Date())
        if !availableWorkspaces.contains(where: { $0.id == ws.id }) {
            availableWorkspaces.append(ws)
        }
    }

    public func removeWorkspace(id: String) {
        availableWorkspaces.removeAll { $0.id == id }
    }
}
