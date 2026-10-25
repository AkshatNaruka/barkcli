import SwiftUI

/// Liquid Glass visual modifier inspired by Apple Liquid Glass and Codex dark-mode surfaces.
/// Uses `.ultraThinMaterial` on iOS 17+, with graceful support for iOS 26+ native glassEffect,
/// bounded by precision hairline borders (`#2E3142`) and optional neon glow highlights.
public struct LiquidGlassModifier: ViewModifier {
    public let cornerRadius: CGFloat
    public let interactive: Bool
    public let borderColor: Color
    public let tint: Color?
    public let glowColor: Color?
    public let glowRadius: CGFloat

    public init(
        cornerRadius: CGFloat = 16,
        interactive: Bool = false,
        borderColor: Color = Color.barkcliBorderHairline,
        tint: Color? = nil,
        glowColor: Color? = nil,
        glowRadius: CGFloat = 0
    ) {
        self.cornerRadius = cornerRadius
        self.interactive = interactive
        self.borderColor = borderColor
        self.tint = tint
        self.glowColor = glowColor
        self.glowRadius = glowRadius
    }

    public func body(content: Content) -> some View {
        #if os(iOS)
        if #available(iOS 26, *) {
            content
                .glassEffect(interactive ? .regular.interactive() : .regular, in: .rect(cornerRadius: cornerRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(borderColor, lineWidth: 0.5)
                )
                .shadow(
                    color: glowColor?.opacity(0.35) ?? .clear,
                    radius: glowRadius,
                    x: 0,
                    y: 0
                )
        } else {
            fallbackGlass(content: content)
        }
        #else
        fallbackGlass(content: content)
        #endif
    }

    @ViewBuilder
    private func fallbackGlass(content: Content) -> some View {
        content
            .background {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        if let tint {
                            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                                .fill(tint.opacity(0.12))
                        }
                    }
            }
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: 0.5)
            )
            .shadow(
                color: glowColor?.opacity(0.35) ?? .clear,
                radius: glowRadius,
                x: 0,
                y: 0
            )
    }
}

public extension View {
    /// Applies the Codex Liquid Glass appearance with translucent material, hairline border, and optional neon glow.
    func liquidGlass(
        cornerRadius: CGFloat = 16,
        interactive: Bool = false,
        borderColor: Color = Color.barkcliBorderHairline,
        tint: Color? = nil,
        glowColor: Color? = nil,
        glowRadius: CGFloat = 0
    ) -> some View {
        modifier(
            LiquidGlassModifier(
                cornerRadius: cornerRadius,
                interactive: interactive,
                borderColor: borderColor,
                tint: tint,
                glowColor: glowColor,
                glowRadius: glowRadius
            )
        )
    }

    /// Convenience modifier for frosted liquid card surfaces.
    func frostedCard(
        cornerRadius: CGFloat = 14,
        borderColor: Color = Color.barkcliBorderHairline,
        accent: Color? = nil
    ) -> some View {
        modifier(
            LiquidGlassModifier(
                cornerRadius: cornerRadius,
                interactive: false,
                borderColor: borderColor,
                tint: accent,
                glowColor: accent,
                glowRadius: accent != nil ? 4 : 0
            )
        )
    }

    /// Adds a subtle glowing neon border to any view.
    func glowingBorder(
        color: Color,
        cornerRadius: CGFloat = 12,
        lineWidth: CGFloat = 1,
        glowRadius: CGFloat = 6
    ) -> some View {
        overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(color.opacity(0.8), lineWidth: lineWidth)
                .shadow(color: color.opacity(0.4), radius: glowRadius)
        )
    }
}
