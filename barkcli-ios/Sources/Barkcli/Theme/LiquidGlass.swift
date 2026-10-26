import SwiftUI

/// Utilitarian surface modifier inspired by t3 codes developer aesthetic.
/// Applies crisp hairline borders, dark zinc translucent backings, and compact geometries.
public struct LiquidGlassModifier: ViewModifier {
    public let cornerRadius: CGFloat
    public let interactive: Bool
    public let borderColor: Color
    public let tint: Color?
    public let glowColor: Color?
    public let glowRadius: CGFloat

    public init(
        cornerRadius: CGFloat = 8,
        interactive: Bool = false,
        borderColor: Color = Color.barkcliBorder,
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
                        .strokeBorder(borderColor, lineWidth: 1)
                )
        } else {
            fallbackSurface(content: content)
        }
        #else
        fallbackSurface(content: content)
        #endif
    }

    @ViewBuilder
    private func fallbackSurface(content: Content) -> some View {
        content
            .background {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color.barkcliCardBackground)
                    .overlay {
                        if let tint {
                            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                                .fill(tint.opacity(0.06))
                        }
                    }
            }
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: 1)
            )
    }
}

public extension View {
    /// Applies the t3 codes developer surface appearance with hairline border and crisp corner geometry.
    func liquidGlass(
        cornerRadius: CGFloat = 8,
        interactive: Bool = false,
        borderColor: Color = Color.barkcliBorder,
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

    /// Convenience modifier for crisp zinc card surfaces.
    func frostedCard(
        cornerRadius: CGFloat = 8,
        borderColor: Color = Color.barkcliBorder,
        accent: Color? = nil
    ) -> some View {
        modifier(
            LiquidGlassModifier(
                cornerRadius: cornerRadius,
                interactive: false,
                borderColor: borderColor,
                tint: accent,
                glowColor: nil,
                glowRadius: 0
            )
        )
    }

    /// Crisp focus border without fuzzy neon halos.
    func glowingBorder(
        color: Color,
        cornerRadius: CGFloat = 8,
        lineWidth: CGFloat = 1,
        glowRadius: CGFloat = 0
    ) -> some View {
        overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(color, lineWidth: lineWidth)
        )
    }
}
