import SwiftUI

public struct BarkcliColors: Sendable {
    // Pitch black canvas and charcoal surfaces modeled after xAI
    public static let canvas = Color(hex: 0x000000)
    public static let cardBackground = Color(hex: 0x0D0D11)
    public static let cardSubtle = Color(hex: 0x141418)
    public static let border = Color(hex: 0x222226)
    public static let borderFocus = Color(hex: 0x3A3A40)
    public static let tagBackground = Color(hex: 0x18181D)

    // Strictly functional status indicators
    public static let statusActive = Color(hex: 0x10B981)
    public static let statusWarning = Color(hex: 0xF59E0B)
    public static let statusError = Color(hex: 0xEF4444)
    public static let statusInfo = Color(hex: 0x38BDF8)

    // High contrast monochromatic typography tokens
    public static let textPrimary = Color(hex: 0xFFFFFF)
    public static let textSecondary = Color(hex: 0x8E8E93)
    public static let textMuted = Color(hex: 0x55555C)

    // Backward compatibility tokens
    public static let obsidianDark = Color(hex: 0x000000)
    public static let spaceBlack = Color(hex: 0x0D0D11)
    public static let slateGlass = Color(hex: 0x141418)
    public static let borderHairline = Color(hex: 0x222226)
    public static let cyberCyan = Color(hex: 0x38BDF8)
    public static let amberPulse = Color(hex: 0xF59E0B)
    public static let emeraldGate = Color(hex: 0x10B981)
    public static let crimsonBlocker = Color(hex: 0xEF4444)

    // Semantic aliases
    public static let darkBackground = canvas
    public static let surface = cardBackground
    public static let borderSubtle = border
    public static let accentPurple = textPrimary
    public static let successEmerald = statusActive
    public static let dangerRose = statusError
    public static let warningAmber = statusWarning
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

    // Zinc developer tokens
    static let barkcliCanvas = BarkcliColors.canvas
    static let barkcliCardBackground = BarkcliColors.cardBackground
    static let barkcliCardSubtle = BarkcliColors.cardSubtle
    static let barkcliBorder = BarkcliColors.border
    static let barkcliBorderFocus = BarkcliColors.borderFocus
    static let barkcliTagBackground = BarkcliColors.tagBackground
    static let barkcliStatusActive = BarkcliColors.statusActive
    static let barkcliStatusWarning = BarkcliColors.statusWarning
    static let barkcliStatusError = BarkcliColors.statusError
    static let barkcliStatusInfo = BarkcliColors.statusInfo

    // Surface and semantic redirects
    static let barkcliDarkBackground = BarkcliColors.canvas
    static let barkcliBackground = BarkcliColors.canvas
    static let barkcliSurface = BarkcliColors.cardBackground
    static let barkcliCard = BarkcliColors.cardBackground
    static let barkcliBorderHairline = BarkcliColors.border
    static let barkcliBorderSubtle = BarkcliColors.border
    static let barkcliAccent = BarkcliColors.textPrimary
    static let barkcliSuccess = BarkcliColors.statusActive
    static let barkcliDanger = BarkcliColors.statusError
    static let barkcliWarning = BarkcliColors.statusWarning
    static let barkcliTextPrimary = BarkcliColors.textPrimary
    static let barkcliTextSecondary = BarkcliColors.textSecondary
    static let barkcliTextMuted = BarkcliColors.textMuted

    // Preserved tokens for compatibility
    static let barkcliObsidian = BarkcliColors.obsidianDark
    static let barkcliSpaceBlack = BarkcliColors.spaceBlack
    static let barkcliSlateGlass = BarkcliColors.slateGlass
    static let barkcliCyberCyan = BarkcliColors.cyberCyan
    static let barkcliAmberPulse = BarkcliColors.amberPulse
    static let barkcliEmeraldGate = BarkcliColors.emeraldGate
    static let barkcliCrimsonBlocker = BarkcliColors.crimsonBlocker
    static let barkcliAccentPurple = BarkcliColors.accentPurple
    static let barkcliSuccessEmerald = BarkcliColors.successEmerald
    static let barkcliDangerRose = BarkcliColors.dangerRose
    static let barkcliWarningAmber = BarkcliColors.warningAmber
}
