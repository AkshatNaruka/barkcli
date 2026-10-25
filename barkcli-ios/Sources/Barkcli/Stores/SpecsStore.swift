import Foundation
import Observation

/// Observable state store powering the Specs Traceability Matrix.
/// Manages requirements coverage, verification states, linked code chips,
/// test traceability, and staleness detection across specs.
@MainActor
@Observable
public final class SpecsStore: @unchecked Sendable {
    public static let shared = SpecsStore()

    // MARK: - Published State
    public var specs: [SpecItem]
    public var coverageReport: CoverageReport?
    public var isLoading: Bool
    public var selectedStatusFilter: RequirementStatus?
    public var showStaleOnly: Bool
    public var searchQuery: String
    public var lastError: String?

    // MARK: - API Client
    public var client: any APIClientProtocol

    // MARK: - Initializer
    public init(client: (any APIClientProtocol)? = nil) {
        self.client = client ?? MockAPIClient()
        self.specs = []
        self.coverageReport = nil
        self.isLoading = false
        self.selectedStatusFilter = nil
        self.showStaleOnly = false
        self.searchQuery = ""
        self.lastError = nil
    }

    // MARK: - Computed Traceability Metrics

    public var allRequirements: [SpecRequirement] {
        specs.flatMap(\.requirements)
    }

    public var totalRequirementsCount: Int {
        coverageReport?.totalRequirements ?? allRequirements.count
    }

    public var implementedCount: Int {
        if let direct = coverageReport?.implemented {
            return direct
        }
        return allRequirements.filter { $0.status == .implemented || $0.status == .verified }.count
    }

    public var verifiedCount: Int {
        coverageReport?.verified ?? allRequirements.filter { $0.status == .verified }.count
    }

    public var staleCount: Int {
        coverageReport?.stale ?? allRequirements.filter(\.stale).count
    }

    public var coveragePercent: Double {
        if let direct = coverageReport?.coveragePercent {
            return direct
        }
        guard !allRequirements.isEmpty else { return 100.0 }
        return (Double(implementedCount) / Double(allRequirements.count)) * 100.0
    }

    public var filteredSpecs: [SpecItem] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return specs.compactMap { spec in
            var matchingReqs = spec.requirements

            if let filter = selectedStatusFilter {
                matchingReqs = matchingReqs.filter { $0.status == filter }
            }

            if showStaleOnly {
                matchingReqs = matchingReqs.filter(\.stale)
            }

            if !query.isEmpty {
                let specMatches = spec.title.lowercased().contains(query) ||
                    spec.id.lowercased().contains(query) ||
                    (spec.description?.lowercased().contains(query) ?? false)

                if !specMatches {
                    matchingReqs = matchingReqs.filter { req in
                        req.title.lowercased().contains(query) ||
                        req.id.lowercased().contains(query) ||
                        req.linkedCode.contains(where: { $0.lowercased().contains(query) }) ||
                        req.linkedTests.contains(where: { $0.lowercased().contains(query) })
                    }
                }
            }

            if matchingReqs.isEmpty && (selectedStatusFilter != nil || showStaleOnly || !query.isEmpty) {
                // If filtering is active and no requirements match, omit spec
                let specMatches = !query.isEmpty && (
                    spec.title.lowercased().contains(query) ||
                    spec.id.lowercased().contains(query)
                )
                if !specMatches {
                    return nil
                }
            }

            var pruned = spec
            if selectedStatusFilter != nil || showStaleOnly || !query.isEmpty {
                pruned.requirements = matchingReqs
            }
            return pruned
        }
    }

    // MARK: - Lifecycle Actions

    public func load() async {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            async let fetchedSpecs = client.listSpecs()
            async let fetchedCoverage = client.getSpecsCoverage()

            let (s, c) = try await (fetchedSpecs, fetchedCoverage)
            self.specs = s
            self.coverageReport = c
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    public func refresh() async {
        await load()
    }
}
