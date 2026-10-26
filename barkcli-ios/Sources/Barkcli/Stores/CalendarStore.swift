import Foundation
import Observation

/// Observable state store for calendar agenda milestones and task due dates.
@MainActor
@Observable
public final class CalendarStore: @unchecked Sendable {
    public static let shared = CalendarStore()

    public var agendaItems: [AgendaItem]
    public var selectedFilter: String?
    public var searchQuery: String
    public var isLoading: Bool
    public var lastError: String?

    public var client: any APIClientProtocol

    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.agendaItems = []
        self.selectedFilter = nil
        self.searchQuery = ""
        self.isLoading = false
        self.lastError = nil
    }

    public var overdueItems: [AgendaItem] {
        agendaItems.filter(\.isOverdue)
    }

    public var todayItems: [AgendaItem] {
        agendaItems.filter(\.isToday)
    }

    public var upcomingItems: [AgendaItem] {
        agendaItems.filter { !$0.isOverdue && !$0.isToday }
    }

    public var filteredItems: [AgendaItem] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return agendaItems.filter { item in
            let matchesQuery = query.isEmpty || item.title.lowercased().contains(query)
            if let selectedFilter {
                switch selectedFilter {
                case "overdue":
                    return matchesQuery && item.isOverdue
                case "today":
                    return matchesQuery && item.isToday
                case "upcoming":
                    return matchesQuery && (!item.isOverdue && !item.isToday)
                default:
                    return matchesQuery
                }
            }
            return matchesQuery
        }
    }

    public func loadAgenda() async {
        isLoading = true
        lastError = nil
        do {
            self.agendaItems = try await client.getAgenda()
        } catch {
            self.lastError = error.localizedDescription
        }
        isLoading = false
    }
}
