import SwiftUI

/// Apple Human Interface Guidelines typography tokens.
/// Integrates system text styles with Dynamic Type support alongside
/// precision monospaced styles for technical developer telemetry.
public struct BarkcliTypography: Sendable {
    // MARK: - Monospace Developer Tokens
    public static let codeHash = Font.system(.caption2, design: .monospaced).weight(.semibold)
    public static let codePath = Font.system(.footnote, design: .monospaced)
    public static let cardId = Font.system(.caption, design: .monospaced).weight(.bold)
    public static let branchName = Font.system(.caption2, design: .monospaced).weight(.medium)
    public static let metricNumber = Font.system(.title2, design: .monospaced).weight(.bold)
    public static let metricLarge = Font.system(.largeTitle, design: .monospaced).weight(.bold)

    // MARK: - Apple Interface Hierarchy (Dynamic Type Compliant)
    public static let screenTitle = Font.title.weight(.bold)
    public static let sectionHeader = Font.headline.weight(.semibold)
    public static let cardTitle = Font.subheadline.weight(.semibold)
    public static let bodyText = Font.body
    public static let subheadline = Font.subheadline
    public static let badge = Font.caption.weight(.medium)
    public static let captionMuted = Font.caption
    public static let labelSmall = Font.caption2.weight(.medium)
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
    static let barkcliBodyText = BarkcliTypography.bodyText
    static let barkcliSubheadline = BarkcliTypography.subheadline
    static let barkcliCaptionMuted = BarkcliTypography.captionMuted
    static let barkcliLabelSmall = BarkcliTypography.labelSmall
}
