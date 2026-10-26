import Foundation
import Observation

/// Observable state store for codebase symbol search and card symbol linking.
@MainActor
@Observable
public final class CodeStore: @unchecked Sendable {
    public static let shared = CodeStore()

    public var symbols: [CodeSymbol]
    public var searchQuery: String
    public var selectedLanguage: String?
    public var selectedKind: String?
    public var isLoading: Bool
    public var lastError: String?

    public var client: any APIClientProtocol

    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.symbols = []
        self.searchQuery = ""
        self.selectedLanguage = nil
        self.selectedKind = nil
        self.isLoading = false
        self.lastError = nil
    }

    public var filteredSymbols: [CodeSymbol] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return symbols.filter { sym in
            let matchesQuery = query.isEmpty ||
                sym.name.lowercased().contains(query) ||
                sym.filePath.lowercased().contains(query)
            let matchesLang = selectedLanguage == nil || sym.language.lowercased() == selectedLanguage?.lowercased()
            let matchesKind = selectedKind == nil || sym.kind.lowercased() == selectedKind?.lowercased()
            return matchesQuery && matchesLang && matchesKind
        }
    }

    public var availableLanguages: [String] {
        Array(Set(symbols.map(\.language))).sorted()
    }

    public var availableKinds: [String] {
        Array(Set(symbols.map(\.kind))).sorted()
    }

    public func search(query: String? = nil) async {
        let term = query ?? searchQuery
        isLoading = true
        lastError = nil
        do {
            self.symbols = try await client.searchCode(query: term)
        } catch {
            self.lastError = error.localizedDescription
        }
        isLoading = false
    }

    public func linkSymbolToCard(symbolId: String, cardId: String) async throws {
        try await client.linkCodeToCard(symbolId: symbolId, cardId: cardId)
        if let idx = symbols.firstIndex(where: { $0.id == symbolId }) {
            symbols[idx].linkedCardId = cardId
        }
    }
}
