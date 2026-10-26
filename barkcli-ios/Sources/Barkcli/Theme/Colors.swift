import SwiftUI

public struct BarkcliColors: Sendable {
    // Pitch zinc canvas and surface tokens
    public static let canvas = Color(hex: 0x09090B)
    public static let cardBackground = Color(hex: 0x121215)
    public static let cardSubtle = Color(hex: 0x18181B)
    public static let border = Color(hex: 0x27272A)
    public static let borderFocus = Color(hex: 0x3F3F46)

    // Discrete status indicators
    public static let statusActive = Color(hex: 0x22C55E)
    public static let statusWarning = Color(hex: 0xF59E0B)
    public static let statusError = Color(hex: 0xEF4444)
    public static let statusInfo = Color(hex: 0x0284C7)

    // High contrast typography tokens
    public static let textPrimary = Color(hex: 0xFAFAFA)
    public static let textSecondary = Color(hex: 0xA1A1AA)
    public static let textMuted = Color(hex: 0x71717A)

    // Backward compatibility tokens
    public static let obsidianDark = Color(hex: 0x0A0A0E)
    public static let spaceBlack = Color(hex: 0x12131A)
    public static let slateGlass = Color(hex: 0x181924)
    public static let borderHairline = Color(hex: 0x2E3142)
    public static let electricViolet = Color(hex: 0x8B5CF6)
    public static let cyberCyan = Color(hex: 0x06B6D4)
    public static let amberPulse = Color(hex: 0xF59E0B)
    public static let emeraldGate = Color(hex: 0x10B981)
    public static let crimsonBlocker = Color(hex: 0xEF4444)

    // Semantic aliases
    public static let darkBackground = canvas
    public static let surface = cardBackground
    public static let borderSubtle = border
    public static let accentPurple = statusInfo
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
    static let barkcliElectricViolet = BarkcliColors.electricViolet
    static let barkcliCyberCyan = BarkcliColors.cyberCyan
    static let barkcliAmberPulse = BarkcliColors.amberPulse
    static let barkcliEmeraldGate = BarkcliColors.emeraldGate
    static let barkcliCrimsonBlocker = BarkcliColors.crimsonBlocker
    static let barkcliAccentPurple = BarkcliColors.accentPurple
    static let barkcliSuccessEmerald = BarkcliColors.successEmerald
    static let barkcliDangerRose = BarkcliColors.dangerRose
    static let barkcliWarningAmber = BarkcliColors.warningAmber
}
