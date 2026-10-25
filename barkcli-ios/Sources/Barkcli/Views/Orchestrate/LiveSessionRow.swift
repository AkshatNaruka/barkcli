import SwiftUI

/// Component displaying an active agent runner session in an isolated worktree.
/// Reflects real-time data from `/api/run/live`.
public struct LiveSessionRow: View {
    public let session: LiveSession

    public init(session: LiveSession) {
        self.session = session
    }

    public var body: some View {
        GlassCard(cornerRadius: 12, padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                // Top line: Backend badge, Branch name, Status indicator
                HStack(spacing: 8) {
                    // Backend badge
                    Text(session.backend.uppercased())
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(backendColor(session.backend))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(backendColor(session.backend).opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))

                    // Branch name
                    if let branch = session.branch {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.triangle.branch")
                                .font(.system(size: 10))
                                .foregroundColor(.barkcliCyberCyan)

                            Text(branch)
                                .font(BarkcliTypography.branchName)
                                .foregroundColor(.barkcliTextPrimary)
                                .lineLimit(1)
                        }
                    }

                    Spacer()

                    // Status dot & text
                    HStack(spacing: 5) {
                        Circle()
                            .fill(statusColor(session.status))
                            .frame(width: 7, height: 7)

                        Text(session.status.capitalized)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(statusColor(session.status))
                    }
                }

                // Worktree Path & PID
                HStack(spacing: 12) {
                    if let path = session.worktreePath {
                        HStack(spacing: 4) {
                            Image(systemName: "folder.badge.gearshape")
                                .font(.system(size: 10))
                                .foregroundColor(.barkcliTextMuted)

                            Text(path)
                                .font(BarkcliTypography.codePath)
                                .foregroundColor(.barkcliTextMuted)
                                .lineLimit(1)
                        }
                    }

                    Spacer()

                    if let pid = session.pid {
                        Text("PID \(pid)")
                            .font(BarkcliTypography.codeHash)
                            .foregroundColor(.barkcliTextMuted)
                    }
                }

                // Session Note or Activity
                if let note = session.note, !note.isEmpty {
                    Text(note)
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextPrimary)
                        .lineLimit(2)
                }

                // Acceptance Gate verdict banner if completed/failed
                if session.status.lowercased() == "completed" {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliEmeraldGate)

                        Text("Test gate passed · ready for merge train")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.barkcliEmeraldGate)
                    }
                    .padding(.top, 2)
                } else if session.status.lowercased() == "failed" {
                    HStack(spacing: 6) {
                        Image(systemName: "xmark.octagon.fill")
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliCrimsonBlocker)

                        Text("Acceptance gate failed · tests broken")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.barkcliCrimsonBlocker)
                    }
                    .padding(.top, 2)
                }
            }
        }
        .liquidGlass(
            cornerRadius: 12,
            interactive: false,
            borderColor: session.status.lowercased() == "running" ? Color.barkcliCyberCyan.opacity(0.3) : Color.barkcliBorderHairline,
            glowColor: session.status.lowercased() == "running" ? Color.barkcliCyberCyan : nil,
            glowRadius: session.status.lowercased() == "running" ? 3 : 0
        )
    }

    private func backendColor(_ backend: String) -> Color {
        switch backend.lowercased() {
        case "claude":
            return .barkcliAmberPulse
        case "codex":
            return .barkcliEmeraldGate
        case "opencode":
            return .barkcliElectricViolet
        default:
            return .barkcliCyberCyan
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "running":
            return .barkcliCyberCyan
        case "completed":
            return .barkcliEmeraldGate
        case "failed":
            return .barkcliCrimsonBlocker
        default:
            return .barkcliTextMuted
        }
    }
}
