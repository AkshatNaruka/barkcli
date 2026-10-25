import Foundation
import Network
import Observation

/// System network interface observer using `NWPathMonitor`.
/// Tracks connectivity status (`wifi`, `cellular`, `wiredEthernet`, `offline`),
/// expensive link warnings (cellular/hotspot), and constrained data modes.
@Observable
public final class NetworkMonitor: @unchecked Sendable {
    public static let shared = NetworkMonitor()

    public var isConnected: Bool = true
    public var isExpensive: Bool = false
    public var isConstrained: Bool = false
    public var currentInterface: NetworkInterfaceType = .wifi
    public var isMonitoring: Bool = false

    private var monitor: NWPathMonitor?
    private let monitorQueue = DispatchQueue(label: "com.barkcli.networkmonitor", qos: .utility)

    public init() {
        start()
    }

    deinit {
        stop()
    }

    public func start() {
        guard !isMonitoring else { return }
        isMonitoring = true

        let mon = NWPathMonitor()
        mon.pathUpdateHandler = { [weak self] path in
            guard let self else { return }

            let connected = (path.status == .satisfied)
            let expensive = path.isExpensive
            let constrained = path.isConstrained

            let ifType: NetworkInterfaceType
            if !connected {
                ifType = .offline
            } else if path.usesInterfaceType(.wifi) {
                ifType = .wifi
            } else if path.usesInterfaceType(.cellular) {
                ifType = .cellular
            } else if path.usesInterfaceType(.wiredEthernet) {
                ifType = .wiredEthernet
            } else if path.usesInterfaceType(.loopback) {
                ifType = .loopback
            } else {
                ifType = .other
            }

            Task { @MainActor in
                self.isConnected = connected
                self.isExpensive = expensive
                self.isConstrained = constrained
                self.currentInterface = ifType
            }
        }

        self.monitor = mon
        mon.start(queue: monitorQueue)
    }

    public func stop() {
        monitor?.cancel()
        monitor = nil
        isMonitoring = false
    }

    public var statusDescription: String {
        guard isConnected else {
            return "Offline (No network connection)"
        }
        var desc = "Connected via \(currentInterface.displayName)"
        if isExpensive {
            desc += " (Metered)"
        }
        if isConstrained {
            desc += " (Low Data Mode)"
        }
        return desc
    }
}
