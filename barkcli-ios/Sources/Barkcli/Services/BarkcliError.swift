import Foundation

/// Typed errors produced across barkcli networking and client interactions.
public enum BarkcliError: LocalizedError, Sendable, Hashable {
    case invalidURL(String)
    case networkUnavailable
    case timeout
    case unauthorized(String)
    case serverError(statusCode: Int, message: String)
    case decodingError(String)
    case encodingError(String)
    case notFound(String)
    case workspaceUninitialized(String)
    case invalidState(String)
    case cancelled
    case unknown(String)

    public var errorDescription: String? {
        switch self {
        case .invalidURL(let address):
            return "Invalid server address: \(address)"
        case .networkUnavailable:
            return "Local network is unavailable or host cannot be reached"
        case .timeout:
            return "Network connection timed out after five seconds"
        case .unauthorized(let message):
            return "Unauthorized access: \(message)"
        case .serverError(let code, let message):
            return "Server responded with status code \(code): \(message)"
        case .decodingError(let message):
            return "Failed to decode response: \(message)"
        case .encodingError(let message):
            return "Failed to encode request payload: \(message)"
        case .notFound(let resource):
            return "Requested resource not found: \(resource)"
        case .workspaceUninitialized(let message):
            return "Workspace is uninitialized: \(message)"
        case .invalidState(let message):
            return "Invalid application state: \(message)"
        case .cancelled:
            return "Operation was cancelled"
        case .unknown(let message):
            return "An unexpected error occurred: \(message)"
        }
    }
}
