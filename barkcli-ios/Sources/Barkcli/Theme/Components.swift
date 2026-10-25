import SwiftUI

public struct GlassCard<Content: View>: View {
    private let cornerRadius: CGFloat
    private let paddingAmount: CGFloat
    private let borderColor: Color
    private let backgroundColor: Color
    private let content: Content

    public init(
        cornerRadius: CGFloat = 14,
        padding: CGFloat = 16,
        borderColor: Color = .barkcliBorderSubtle,
        backgroundColor: Color = .barkcliCard.opacity(0.85),
        @ViewBuilder content: () -> Content
    ) {
        self.cornerRadius = cornerRadius
        self.paddingAmount = padding
        self.borderColor = borderColor
        self.backgroundColor = backgroundColor
        self.content = content()
    }

    public var body: some View {
        content
            .padding(paddingAmount)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(backgroundColor)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}

public enum StatusBadgeVariant: Sendable, Hashable {
    case neutral
    case accent
    case success
    case warning
    case danger
    case cyber
    case electric
    case emerald
    case amber
    case crimson
    case custom(Color)

    public var foregroundColor: Color {
        switch self {
        case .neutral:
            return .barkcliTextMuted
        case .accent, .electric:
            return .barkcliElectricViolet
        case .success, .emerald:
            return .barkcliEmeraldGate
        case .warning, .amber:
            return .barkcliAmberPulse
        case .danger, .crimson:
            return .barkcliCrimsonBlocker
        case .cyber:
            return .barkcliCyberCyan
        case .custom(let color):
            return color
        }
    }

    public var backgroundColor: Color {
        foregroundColor.opacity(0.14)
    }

    public var borderColor: Color {
        foregroundColor.opacity(0.28)
    }
}

public struct StatusBadge: View {
    public let text: String
    public let systemImage: String?
    public let variant: StatusBadgeVariant

    public init(
        _ text: String,
        systemImage: String? = nil,
        variant: StatusBadgeVariant = .neutral
    ) {
        self.text = text
        self.systemImage = systemImage
        self.variant = variant
    }

    public var body: some View {
        HStack(spacing: 5) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 11, weight: .semibold))
            } else {
                Circle()
                    .fill(variant.foregroundColor)
                    .frame(width: 6, height: 6)
            }
            Text(text)
                .font(.system(size: 12, weight: .medium))
        }
        .foregroundColor(variant.foregroundColor)
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(variant.backgroundColor)
        )
        .overlay(
            Capsule()
                .strokeBorder(variant.borderColor, lineWidth: 1)
        )
    }
}

public enum MetricTrend: Sendable, Hashable {
    case up(String)
    case down(String)
    case neutral(String)

    public var text: String {
        switch self {
        case .up(let val):
            return val
        case .down(let val):
            return val
        case .neutral(let val):
            return val
        }
    }

    public var iconName: String {
        switch self {
        case .up:
            return "arrow.up.right"
        case .down:
            return "arrow.down.right"
        case .neutral:
            return "arrow.right"
        }
    }

    public var color: Color {
        switch self {
        case .up:
            return .barkcliSuccessEmerald
        case .down:
            return .barkcliDangerRose
        case .neutral:
            return .barkcliTextMuted
        }
    }
}

public struct MetricTile: View {
    public let title: String
    public let value: String
    public let subtitle: String?
    public let systemImage: String?
    public let trend: MetricTrend?
    public let accentColor: Color

    public init(
        title: String,
        value: String,
        subtitle: String? = nil,
        systemImage: String? = nil,
        trend: MetricTrend? = nil,
        accentColor: Color = .barkcliAccentPurple
    ) {
        self.title = title
        self.value = value
        self.subtitle = subtitle
        self.systemImage = systemImage
        self.trend = trend
        self.accentColor = accentColor
    }

    public var body: some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(title.uppercased())
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.barkcliTextMuted)
                        .tracking(0.5)
                    Spacer()
                    if let systemImage {
                        Image(systemName: systemImage)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(accentColor)
                    }
                }

                Text(value)
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(.barkcliTextPrimary)

                if let trend {
                    HStack(spacing: 4) {
                        Image(systemName: trend.iconName)
                            .font(.system(size: 10, weight: .bold))
                        Text(trend.text)
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(trend.color)
                } else if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)
                }
            }
        }
    }
}

public enum ActionButtonVariant: Sendable, Hashable {
    case primary
    case secondary
    case destructive
    case ghost
}

public struct ActionButton: View {
    public let title: String
    public let systemImage: String?
    public let variant: ActionButtonVariant
    public let isLoading: Bool
    public let isDisabled: Bool
    public let action: () -> Void

    public init(
        _ title: String,
        systemImage: String? = nil,
        variant: ActionButtonVariant = .primary,
        isLoading: Bool = false,
        isDisabled: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.variant = variant
        self.isLoading = isLoading
        self.isDisabled = isDisabled
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: foregroundColor))
                        .scaleEffect(0.85)
                } else if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 14, weight: .semibold))
                }
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .foregroundColor(foregroundColor)
            .background(backgroundView)
            .overlay(borderOverlay)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .disabled(isDisabled || isLoading)
        .opacity(isDisabled ? 0.45 : 1.0)
    }

    private var foregroundColor: Color {
        switch variant {
        case .primary:
            return .white
        case .secondary:
            return .barkcliTextPrimary
        case .destructive:
            return .white
        case .ghost:
            return .barkcliTextMuted
        }
    }

    @ViewBuilder
    private var backgroundView: some View {
        switch variant {
        case .primary:
            Color.barkcliAccentPurple
        case .secondary:
            Color.barkcliCard
        case .destructive:
            Color.barkcliDangerRose
        case .ghost:
            Color.clear
        }
    }

    @ViewBuilder
    private var borderOverlay: some View {
        switch variant {
        case .secondary:
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
        case .ghost:
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.barkcliBorderSubtle.opacity(0.4), lineWidth: 1)
        default:
            EmptyView()
        }
    }
}

public struct SectionHeader: View {
    public let title: String
    public let subtitle: String?
    public let count: Int?
    public let systemImage: String?
    public let actionTitle: String?
    public let action: (() -> Void)?

    public init(
        _ title: String,
        subtitle: String? = nil,
        count: Int? = nil,
        systemImage: String? = nil,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.count = count
        self.systemImage = systemImage
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.barkcliAccentPurple)
                }

                Text(title)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                if let count {
                    Text("\(count)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliTextMuted)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(Color.barkcliBorderSubtle.opacity(0.6))
                        )
                }

                Spacer()

                if let actionTitle, let action {
                    Button(action: action) {
                        Text(actionTitle)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.barkcliAccentPurple)
                    }
                }
            }

            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextMuted)
            }
        }
    }
}

// MARK: - Kanban & Board Visual Components

public struct WIPLimitBadge: View {
    public let count: Int
    public let limit: Int?

    public init(count: Int, limit: Int? = nil) {
        self.count = count
        self.limit = limit
    }

    private var isOverLimit: Bool {
        guard let limit else { return false }
        return count > limit
    }

    private var isAtLimit: Bool {
        guard let limit else { return false }
        return count == limit
    }

    private var badgeColor: Color {
        if isOverLimit {
            return .barkcliCrimsonBlocker
        } else if isAtLimit {
            return .barkcliAmberPulse
        } else {
            return .barkcliTextMuted
        }
    }

    public var body: some View {
        HStack(spacing: 3) {
            if isOverLimit {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 9))
                    .foregroundColor(.barkcliCrimsonBlocker)
            }
            Text(limit != nil ? "\(count)/\(limit!)" : "\(count)")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundColor(badgeColor)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 2.5)
        .background(
            Capsule()
                .fill(isOverLimit ? Color.barkcliCrimsonBlocker.opacity(0.16) : Color.barkcliBorderHairline.opacity(0.4))
        )
        .overlay(
            Capsule()
                .strokeBorder(isOverLimit ? Color.barkcliCrimsonBlocker : Color.barkcliBorderHairline.opacity(0.6), lineWidth: 0.5)
        )
    }
}

public struct SpecLinkChip: View {
    public let specId: String

    public init(_ specId: String) {
        self.specId = specId
    }

    public var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 10, weight: .semibold))
            Text("spec: \(specId)")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
        }
        .foregroundColor(.barkcliCyberCyan)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(
            Capsule()
                .fill(Color.barkcliCyberCyan.opacity(0.12))
        )
        .overlay(
            Capsule()
                .strokeBorder(Color.barkcliCyberCyan.opacity(0.3), lineWidth: 0.5)
        )
    }
}

public struct ChecklistProgressBar: View {
    public let completed: Int
    public let total: Int

    public init(completed: Int, total: Int) {
        self.completed = completed
        self.total = max(0, total)
    }

    private var fraction: Double {
        guard total > 0 else { return 0 }
        return min(1.0, Double(completed) / Double(total))
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                HStack(spacing: 3) {
                    Image(systemName: completed == total && total > 0 ? "checkmark.circle.fill" : "checklist")
                        .font(.system(size: 10))
                        .foregroundColor(completed == total && total > 0 ? .barkcliEmeraldGate : .barkcliTextMuted)
                    Text("\(completed)/\(total)")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.barkcliTextMuted)
                }

                Spacer()

                Text("\(Int(fraction * 100))%")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(fraction == 1.0 ? .barkcliEmeraldGate : .barkcliTextMuted)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.barkcliBorderHairline.opacity(0.5))
                        .frame(height: 4)

                    Capsule()
                        .fill(fraction == 1.0 ? Color.barkcliEmeraldGate : Color.barkcliElectricViolet)
                        .frame(width: max(0, geo.size.width * fraction), height: 4)
                }
            }
            .frame(height: 4)
        }
    }
}

public struct BlockedIndicatorBanner: View {
    public let blockerIds: [String]

    public init(blockerIds: [String]) {
        self.blockerIds = blockerIds
    }

    public init(blockerId: String) {
        self.blockerIds = [blockerId]
    }

    public var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "exclamationmark.octagon.fill")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.barkcliCrimsonBlocker)

            Text("Blocked by \(blockerIds.joined(separator: ", "))")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(.barkcliCrimsonBlocker)
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color.barkcliCrimsonBlocker.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .strokeBorder(Color.barkcliCrimsonBlocker.opacity(0.4), lineWidth: 0.5)
        )
    }
}

