import Foundation
import Observation

public enum WebSocketState: String, Sendable {
    case disconnected
    case connecting
    case connected
}

public struct WSMessage: Codable, Sendable {
    public var type: String
    public var version: Int?
    public var payload: String?

    public init(type: String, version: Int? = nil, payload: String? = nil) {
        self.type = type
        self.version = version
        self.payload = payload
    }
}

@Observable
public final class WebSocketClient: @unchecked Sendable {
    public var baseURL: URL
    public var authToken: String?
    public var state: WebSocketState = .disconnected
    public var lastReloadVersion: Int = 0

    public var onReload: (@Sendable (Int) -> Void)?
    public var onRunnerHeartbeat: (@Sendable (LiveRunnerSession) -> Void)?

    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession?
    private var reconnectAttempt: Int = 0
    private var isIntentionallyClosed: Bool = false
    private let maxReconnectDelay: TimeInterval = 16.0
    private let baseReconnectDelay: TimeInterval = 1.0

    public init(
        baseURL: URL = URL(string: "http://localhost:4321")!,
        authToken: String? = nil
    ) {
        self.baseURL = baseURL
        self.authToken = authToken
    }

    public func updateEndpoint(baseURL: URL, authToken: String?) {
        self.baseURL = baseURL
        self.authToken = authToken
        if state == .connected || state == .connecting {
            disconnect()
            connect()
        }
    }

    public func connect() {
        isIntentionallyClosed = false
        guard state != .connected && state != .connecting else { return }

        state = .connecting
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: true) else {
            state = .disconnected
            return
        }

        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.path = "/ws"

        var queryItems: [URLQueryItem] = []
        if let token = authToken, !token.isEmpty {
            queryItems.append(URLQueryItem(name: "token", value: token))
        }
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let wsURL = components.url else {
            state = .disconnected
            return
        }

        let config = URLSessionConfiguration.default
        let newSession = URLSession(configuration: config)
        self.session = newSession

        var request = URLRequest(url: wsURL)
        if let token = authToken, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let task = newSession.webSocketTask(with: request)
        self.webSocketTask = task
        task.resume()

        state = .connected
        reconnectAttempt = 0
        receiveMessage()
    }

    public func disconnect() {
        isIntentionallyClosed = true
        state = .disconnected
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        session?.invalidateAndCancel()
        session = nil
    }

    private func receiveMessage() {
        guard let task = webSocketTask else { return }

        task.receive { [weak self] result in
            guard let self else { return }

            switch result {
            case .success(let message):
                self.handleIncoming(message)
                self.receiveMessage()

            case .failure:
                self.handleDisconnection()
            }
        }
    }

    private func handleIncoming(_ message: URLSessionWebSocketTask.Message) {
        let textData: Data?
        switch message {
        case .string(let text):
            textData = text.data(using: .utf8)
        case .data(let data):
            textData = data
        @unknown default:
            textData = nil
        }

        guard let data = textData else { return }

        if let wsMsg = try? JSONDecoder().decode(WSMessage.self, from: data) {
            if wsMsg.type == "reload" {
                let ver = wsMsg.version ?? 0
                self.lastReloadVersion = ver
                self.onReload?(ver)
            } else if wsMsg.type == "heartbeat" {
                if let payload = wsMsg.payload?.data(using: .utf8),
                   let runner = try? JSONDecoder().decode(LiveRunnerSession.self, from: payload) {
                    self.onRunnerHeartbeat?(runner)
                }
            }
        } else if let runner = try? JSONDecoder().decode(LiveRunnerSession.self, from: data) {
            self.onRunnerHeartbeat?(runner)
        }
    }

    private func handleDisconnection() {
        state = .disconnected
        webSocketTask = nil
        guard !isIntentionallyClosed else { return }

        let delay = min(maxReconnectDelay, baseReconnectDelay * pow(2.0, Double(reconnectAttempt)))
        reconnectAttempt += 1

        Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard let self, !self.isIntentionallyClosed else { return }
            self.connect()
        }
    }

    public func sendPing() {
        webSocketTask?.sendPing { error in
            if error != nil {
                // Ping error indicates lost connection
            }
        }
    }
}
