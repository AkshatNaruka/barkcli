import SwiftUI

public struct BarkcliColors: Sendable {
    public static let darkBackground = Color(hex: 0x0A0A0E)
    public static let surface = Color(hex: 0x13141C)
    public static let cardBackground = Color(hex: 0x1C1D28)
    public static let borderSubtle = Color(hex: 0x2E3142)
    public static let accentPurple = Color(hex: 0x8B5CF6)
    public static let successEmerald = Color(hex: 0x10B981)
    public static let dangerRose = Color(hex: 0xEF4444)
    public static let warningAmber = Color(hex: 0xF59E0B)
    public static let textPrimary = Color(hex: 0xF9FAFB)
    public static let textMuted = Color(hex: 0x9CA3AF)
    public static let textSecondary = Color(hex: 0x6B7280)
}

public extension Color {
    init(hex: UInt32, alpha: Double = 1.0) {
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }

    init(hexString: String, alpha: Double = 1.0) {
        let clean = hexString.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: clean).scanHexInt64(&int)
        let r, g, b: UInt64
        switch clean.count {
        case 3:
            (r, g, b) = ((int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (r, g, b) = (int >> 16, (int >> 8) & 0xFF, int & 0xFF)
        default:
            (r, g, b) = (0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255.0,
            green: Double(g) / 255.0,
            blue: Double(b) / 255.0,
            opacity: alpha
        )
    }

    static let barkcliDarkBackground = BarkcliColors.darkBackground
    static let barkcliSurface = BarkcliColors.surface
    static let barkcliCard = BarkcliColors.cardBackground
    static let barkcliBorderSubtle = BarkcliColors.borderSubtle
    static let barkcliAccentPurple = BarkcliColors.accentPurple
    static let barkcliSuccessEmerald = BarkcliColors.successEmerald
    static let barkcliDangerRose = BarkcliColors.dangerRose
    static let barkcliWarningAmber = BarkcliColors.warningAmber
    static let barkcliTextPrimary = BarkcliColors.textPrimary
    static let barkcliTextMuted = BarkcliColors.textMuted

    static let barkcliBackground = barkcliDarkBackground
    static let barkcliAccent = barkcliAccentPurple
    static let barkcliSuccess = barkcliSuccessEmerald
    static let barkcliDanger = barkcliDangerRose
    static let barkcliWarning = barkcliWarningAmber
    static let barkcliBorder = barkcliBorderSubtle
}
