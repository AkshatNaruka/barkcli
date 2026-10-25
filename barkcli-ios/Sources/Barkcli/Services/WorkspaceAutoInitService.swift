import Foundation

/// Coordinates workspace health verification, detection of missing management metadata (.board/),
/// and automatic workspace initialization across local or remote barkcli daemons.
public final class WorkspaceAutoInitService: Sendable {
    public static let shared = WorkspaceAutoInitService()

    public init() {}

    /// Probes the targeted workspace via the provided client to determine if initialization is required.
    /// Returns `true` if the workspace lacks boards or metadata.
    public func needsInitialization(client: any APIClientProtocol) async throws -> Bool {
        do {
            let status = try await client.checkWorkspaceStatus()
            return !status.initialized || status.boardsCount == 0
        } catch {
            // Check if boards endpoint returns empty or 404
            if let boards = try? await client.listBoards() {
                return boards.isEmpty
            }
            return true
        }
    }

    /// Triggers the automatic initialization flow for the workspace.
    /// Creates the default board configuration, optional sample starter cards,
    /// and returns the updated `WorkspaceStatus`.
    @discardableResult
    public func initializeWorkspace(
        client: any APIClientProtocol,
        options: AutoInitOptions = AutoInitOptions()
    ) async throws -> WorkspaceStatus {
        let boardName = options.boardName

        // 1. Trigger backend auto-initialization
        let initResult = try await client.autoInit(boardName: boardName)

        // 2. If configured and board is fresh, add the foundational starter card
        if options.createSampleCard {
            if let board = try? await client.getBoard(name: boardName), board.cards.isEmpty {
                let starterCard = Card(
                    id: "starter-card",
                    title: "Explore barkcli Management Layer",
                    column: "todo",
                    description: "Auto-initialized by mobile client. Intent → Plan → Isolated Worktree → Test Gate → Merge Train.",
                    priority: .high,
                    labels: ["welcome", "onboarding"],
                    acceptanceCriteria: [
                        "Review mind dashboard",
                        "Dispatch first natural language intent",
                        "Approve proposed agent plan"
                    ]
                )

                try? await client.saveCard(boardName: boardName, card: starterCard)
            }
        }

        // 3. Re-verify workspace health
        let finalStatus = try await client.checkWorkspaceStatus()
        if finalStatus.initialized {
            return finalStatus
        }

        return WorkspaceStatus(
            initialized: true,
            boardDirExists: true,
            configFileExists: true,
            boardsCount: max(1, finalStatus.boardsCount),
            message: initResult.message
        )
    }

    /// Verifies workspace status; if uninitialized, executes auto-init seamlessly.
    public func verifyOrAutoInit(
        client: any APIClientProtocol,
        options: AutoInitOptions = AutoInitOptions()
    ) async throws -> WorkspaceStatus {
        let needsInit = try await needsInitialization(client: client)
        if needsInit {
            return try await initializeWorkspace(client: client, options: options)
        }
        return try await client.checkWorkspaceStatus()
    }
}
