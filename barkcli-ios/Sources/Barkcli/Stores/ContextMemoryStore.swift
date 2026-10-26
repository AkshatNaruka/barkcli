import Foundation
import Observation

/// Observable state store for living context digests facts and memory tiers.
@MainActor
@Observable
public final class ContextMemoryStore: @unchecked Sendable {
    public static let shared = ContextMemoryStore()

    public var livingContext: LivingContext
    public var memories: [MemoryEntry]
    public var facts: [ProjectFact]
    public var selectedTier: MemoryTier?
    public var searchQuery: String
    public var isLoading: Bool
    public var lastError: String?

    public var client: any APIClientProtocol

    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.livingContext = LivingContext()
        self.memories = []
        self.facts = []
        self.selectedTier = nil
        self.searchQuery = ""
        self.isLoading = false
        self.lastError = nil
    }

    public var filteredMemories: [MemoryEntry] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return memories.filter { mem in
            let matchesTier = selectedTier == nil || mem.tier == selectedTier
            let matchesQuery = query.isEmpty ||
                mem.content.lowercased().contains(query) ||
                mem.tags.contains(where: { $0.lowercased().contains(query) })
            return matchesTier && matchesQuery
        }
    }

    public var filteredFacts: [ProjectFact] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return facts }
        return facts.filter {
            $0.fact.lowercased().contains(query) ||
            $0.category.lowercased().contains(query)
        }
    }

    public func loadAll() async {
        isLoading = true
        lastError = nil
        do {
            async let ctx = client.getLivingContext()
            async let mems = client.listMemories(query: nil, tier: nil)
            async let fcts = client.listProjectFacts()

            let (fetchedCtx, fetchedMems, fetchedFacts) = try await (ctx, mems, fcts)
            self.livingContext = fetchedCtx
            self.memories = fetchedMems
            self.facts = fetchedFacts
        } catch {
            self.lastError = error.localizedDescription
        }
        isLoading = false
    }

    public func refreshDigest() async {
        isLoading = true
        do {
            self.livingContext = try await client.refreshLivingContext()
        } catch {
            self.lastError = error.localizedDescription
        }
        isLoading = false
    }

    public func addFact(fact: String, category: String) async throws {
        let created = try await client.addProjectFact(fact: fact, category: category)
        self.facts.insert(created, at: 0)
    }

    public func addMemory(content: String, tier: MemoryTier) async throws {
        let created = try await client.addMemory(content: content, tier: tier)
        self.memories.insert(created, at: 0)
    }
}
