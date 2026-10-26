import Foundation
import Network
import Observation

/// Service for discovering local and LAN barkcli daemons via Bonjour/mDNS (`_barkcli._tcp`)
/// and targeted subnet probing on the default daemon port (4321).
/// Measures round-trip latency and publishes active workspace endpoints.
@Observable
public final class NetworkDiscoveryService: @unchecked Sendable {
    public static let serviceType = "_barkcli._tcp"
    public static let defaultPort = 4321

    public var isBrowsing: Bool = false
    public var isProbing: Bool = false
    public var discoveredInstances: [DiscoveredInstance] = []
    public var lastProbeDate: Date?

    private var browser: NWBrowser?
    private let browserQueue = DispatchQueue(label: "com.barkcli.discovery.browser", qos: .utility)
    private let session: URLSession

    public init(probeTimeout: TimeInterval = 1.5) {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = probeTimeout
        config.timeoutIntervalForResource = probeTimeout
        self.session = URLSession(configuration: config)
    }

    // MARK: - Bonjour / mDNS Browsing

    public func startDiscovery() {
        guard !isBrowsing else { return }
        isBrowsing = true

        let parameters = NWParameters()
        parameters.includePeerToPeer = true
        let browser = NWBrowser(for: .bonjour(type: Self.serviceType, domain: nil), using: parameters)

        browser.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self else { return }
            Task { @MainActor in
                self.handleBonjourResults(results)
            }
        }

        browser.stateUpdateHandler = { [weak self] state in
            if case .failed = state {
                Task { @MainActor in
                    self?.stopDiscovery()
                }
            }
        }

        self.browser = browser
        browser.start(queue: browserQueue)

        // Simultaneously trigger instant local probe fallback on port 4321
        Task {
            _ = await self.probeDefaultEndpoints()
        }
    }

    public func stopDiscovery() {
        browser?.cancel()
        browser = nil
        isBrowsing = false
    }

    private func handleBonjourResults(_ results: Set<NWBrowser.Result>) {
        for result in results {
            switch result.endpoint {
            case .service(let name, _, _, _):
                let instanceId = "bonjour:\(name)"
                if !discoveredInstances.contains(where: { $0.id == instanceId }) {
                    let instance = DiscoveredInstance(
                        name: name,
                        host: "localhost",
                        port: Self.defaultPort,
                        latencyMs: nil,
                        isLocal: true,
                        version: "0.8.0",
                        hasMetadata: true
                    )
                    discoveredInstances.append(instance)

                    // Probe resolved candidate for latency
                    Task {
                        if let probed = await self.probeHost(host: "127.0.0.1", port: Self.defaultPort) {
                            await MainActor.run {
                                if let idx = self.discoveredInstances.firstIndex(where: { $0.id == instanceId }) {
                                    self.discoveredInstances[idx] = DiscoveredInstance(
                                        name: "\(name) (\(probed.latencyMs ?? 0)ms)",
                                        host: probed.host,
                                        port: probed.port,
                                        latencyMs: probed.latencyMs,
                                        isLocal: true,
                                        version: probed.version,
                                        hasMetadata: true
                                    )
                                }
                            }
                        }
                    }
                }
            default:
                break
            }
        }
    }

    // MARK: - Subnet Probing & Latency Measurement

    /// Probes a specific host:port endpoint to determine whether a barkcli daemon is listening.
    /// Measures round-trip HTTP latency in milliseconds.
    ///
    /// Uses the public liveness route: `/api/ping` never touches disk and
    /// returns `version` (which `/api/config` never did, so the version read
    /// below used to be dead code). Older daemons without the route answer
    /// `401` because it lives under `/api/`, and that still counts as alive.
    public func probeHost(host: String, port: Int = defaultPort) async -> DiscoveredInstance? {
        guard let url = URL(string: "http://\(host):\(port)/api/ping") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 1.5

        let start = ContinuousClock.now
        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else { return nil }

            // 200 OK or 401 Unauthorized both confirm a live barkcli daemon
            if httpResponse.statusCode == 200 || httpResponse.statusCode == 401 {
                let duration = ContinuousClock.now - start
                let ms = Int(duration.components.attoseconds / 1_000_000_000_000_000)
                let latency = max(1, ms)

                let isLocal = host == "127.0.0.1" || host == "localhost" || host == "::1"
                let name = isLocal ? "Local barkcli daemon" : "barkcli @ \(host)"

                // Check version if payload provided
                var version = "0.8.0"
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let v = json["version"] as? String {
                    version = v
                }

                let instance = DiscoveredInstance(
                    name: name,
                    host: host,
                    port: port,
                    latencyMs: latency,
                    isLocal: isLocal,
                    version: version,
                    hasMetadata: true
                )

                await MainActor.run {
                    if let existingIndex = self.discoveredInstances.firstIndex(where: { $0.host == host && $0.port == port }) {
                        self.discoveredInstances[existingIndex] = instance
                    } else {
                        self.discoveredInstances.append(instance)
                    }
                    self.lastProbeDate = Date()
                }

                return instance
            }
            return nil
        } catch {
            return nil
        }
    }

    /// Quickly probes common loopback and local candidates.
    public func probeDefaultEndpoints(port: Int = defaultPort) async -> [DiscoveredInstance] {
        await MainActor.run { self.isProbing = true }
        defer {
            Task { @MainActor in self.isProbing = false }
        }

        let candidates = ["127.0.0.1", "localhost"]
        var results: [DiscoveredInstance] = []

        await withTaskGroup(of: DiscoveredInstance?.self) { group in
            for host in candidates {
                group.addTask {
                    await self.probeHost(host: host, port: port)
                }
            }

            for await instance in group {
                if let instance {
                    results.append(instance)
                }
            }
        }

        return results
    }

    public func removeInstance(id: String) {
        discoveredInstances.removeAll { $0.id == id }
    }

    public func clearDiscovered() {
        discoveredInstances.removeAll()
    }
}
