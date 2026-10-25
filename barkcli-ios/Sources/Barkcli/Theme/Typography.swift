import SwiftUI

/// Developer typography tokens aligning with Codex and t3codes aesthetics.
/// Emphasizes monospace typography for hashes, paths, IDs, and metrics,
/// alongside crisp, readable interface text hierarchy.
public struct BarkcliTypography: Sendable {
    // MARK: - Monospace Developer Tokens
    public static let codeHash = Font.system(.caption2, design: .monospaced).weight(.semibold)
    public static let codePath = Font.system(.footnote, design: .monospaced)
    public static let cardId = Font.system(.caption, design: .monospaced).weight(.bold)
    public static let branchName = Font.system(.caption2, design: .monospaced).weight(.medium)
    public static let metricNumber = Font.system(.title2, design: .rounded).weight(.bold)
    public static let metricLarge = Font.system(size: 28, weight: .bold, design: .rounded)

    // MARK: - Interface Hierarchy
    public static let screenTitle = Font.system(size: 24, weight: .bold, design: .default)
    public static let sectionHeader = Font.system(size: 15, weight: .semibold, design: .default)
    public static let cardTitle = Font.system(size: 14, weight: .semibold, design: .default)
    public static let bodyText = Font.system(size: 14, weight: .regular, design: .default)
    public static let subheadline = Font.system(size: 13, weight: .regular, design: .default)
    public static let badge = Font.system(size: 11, weight: .semibold, design: .default)
    public static let captionMuted = Font.system(size: 12, weight: .regular, design: .default)
    public static let labelSmall = Font.system(size: 10, weight: .bold, design: .default)
}

public extension Font {
    static let barkcliCodeHash = BarkcliTypography.codeHash
    static let barkcliCodePath = BarkcliTypography.codePath
    static let barkcliCardId = BarkcliTypography.cardId
    static let barkcliMetricNumber = BarkcliTypography.metricNumber
    static let barkcliScreenTitle = BarkcliTypography.screenTitle
    static let barkcliSectionHeader = BarkcliTypography.sectionHeader
    static let barkcliCardTitle = BarkcliTypography.cardTitle
    static let barkcliBadge = BarkcliTypography.badge
}
