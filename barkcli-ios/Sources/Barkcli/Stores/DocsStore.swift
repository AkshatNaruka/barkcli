import Foundation
import Observation

/// Observable state store for system documentation and architecture manuals.
@MainActor
@Observable
public final class DocsStore: @unchecked Sendable {
    public static let shared = DocsStore()

    public var docs: [DocItem]
    public var selectedDocId: String?
    public var selectedCategory: String?
    public var searchQuery: String
    public var isLoading: Bool
    public var lastError: String?

    public var client: any APIClientProtocol

    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.docs = []
        self.selectedDocId = nil
        self.selectedCategory = nil
        self.searchQuery = ""
        self.isLoading = false
        self.lastError = nil
    }

    public var selectedDoc: DocItem? {
        if let selectedDocId {
            return docs.first(where: { $0.id == selectedDocId })
        }
        return docs.first
    }

    public var categories: [String] {
        Array(Set(docs.map(\.category))).sorted()
    }

    public var filteredDocs: [DocItem] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return docs.filter { doc in
            let matchesCat = selectedCategory == nil || doc.category.lowercased() == selectedCategory?.lowercased()
            let matchesQuery = query.isEmpty ||
                doc.title.lowercased().contains(query) ||
                doc.summary.lowercased().contains(query)
            return matchesCat && matchesQuery
        }
    }

    public func loadDocs() async {
        isLoading = true
        lastError = nil
        do {
            self.docs = try await client.listDocs()
            if selectedDocId == nil {
                selectedDocId = docs.first?.id
            }
        } catch {
            self.lastError = error.localizedDescription
        }
        isLoading = false
    }
}
