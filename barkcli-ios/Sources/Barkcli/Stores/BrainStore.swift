import Foundation
import Observation

/// Observable state store for brain knowledge graph concepts and relationships.
@MainActor
@Observable
public final class BrainStore: @unchecked Sendable {
    public static let shared = BrainStore()

    public var graph: BrainGraph
    public var selectedCategory: String?
    public var selectedNodeId: String?
    public var searchQuery: String
    public var isLoading: Bool
    public var lastError: String?

    public var client: any APIClientProtocol

    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.graph = BrainGraph()
        self.selectedCategory = nil
        self.selectedNodeId = nil
        self.searchQuery = ""
        self.isLoading = false
        self.lastError = nil
    }

    public var filteredNodes: [BrainNode] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return graph.nodes.filter { node in
            let matchesCategory = selectedCategory == nil || node.category.lowercased() == selectedCategory?.lowercased()
            let matchesQuery = query.isEmpty || node.label.lowercased().contains(query)
            return matchesCategory && matchesQuery
        }
    }

    public var categories: [String] {
        Array(Set(graph.nodes.map(\.category))).sorted()
    }

    public var selectedNode: BrainNode? {
        guard let selectedNodeId else { return nil }
        return graph.nodes.first(where: { $0.id == selectedNodeId })
    }

    public func edgesForNode(_ nodeId: String) -> [BrainEdge] {
        graph.edges.filter { $0.sourceId == nodeId || $0.targetId == nodeId }
    }

    public func loadGraph() async {
        isLoading = true
        lastError = nil
        do {
            self.graph = try await client.getBrainGraph()
        } catch {
            self.lastError = error.localizedDescription
        }
        isLoading = false
    }
}
