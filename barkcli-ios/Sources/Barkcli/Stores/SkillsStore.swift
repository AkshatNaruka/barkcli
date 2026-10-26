import Foundation
import Observation

/// Observable state store for agent skills registry and installations.
@MainActor
@Observable
public final class SkillsStore: @unchecked Sendable {
    public static let shared = SkillsStore()

    public var skills: [Skill]
    public var selectedTag: String?
    public var searchQuery: String
    public var showInstalledOnly: Bool
    public var isLoading: Bool
    public var lastError: String?

    public var client: any APIClientProtocol

    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.skills = []
        self.selectedTag = nil
        self.searchQuery = ""
        self.showInstalledOnly = false
        self.isLoading = false
        self.lastError = nil
    }

    public var installedCount: Int {
        skills.filter(\.installed).count
    }

    public var availableTags: [String] {
        Array(Set(skills.flatMap(\.tags))).sorted()
    }

    public var filteredSkills: [Skill] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return skills.filter { sk in
            let matchesInstalled = !showInstalledOnly || sk.installed
            let matchesTag = selectedTag == nil || sk.tags.contains(selectedTag!)
            let matchesQuery = query.isEmpty ||
                sk.name.lowercased().contains(query) ||
                sk.description.lowercased().contains(query)
            return matchesInstalled && matchesTag && matchesQuery
        }
    }

    public func loadSkills() async {
        isLoading = true
        lastError = nil
        do {
            self.skills = try await client.listSkills()
        } catch {
            self.lastError = error.localizedDescription
        }
        isLoading = false
    }

    public func toggleInstall(skillId: String) async {
        do {
            let updated = try await client.toggleSkillInstall(id: skillId)
            if let idx = skills.firstIndex(where: { $0.id == skillId }) {
                skills[idx] = updated
            }
        } catch {
            self.lastError = error.localizedDescription
        }
    }
}
