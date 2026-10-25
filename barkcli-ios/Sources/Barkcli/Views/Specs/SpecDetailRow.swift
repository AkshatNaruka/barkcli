import SwiftUI

/// Component rendering a specification item and its expandable requirements checklist,
/// status dots, code links, and staleness badges.
public struct SpecDetailRow: View {
    public let spec: SpecItem
    @State private var isExpanded: Bool = true

    public init(spec: SpecItem) {
        self.spec = spec
    }

    public var body: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                // Header: ID, Title, Status lozenge, Expand toggle
                HStack(alignment: .center, spacing: 8) {
                    StatusBadge(spec.id, variant: .cyber)

                    Text(spec.title)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)
                        .lineLimit(1)

                    Spacer()

                    StatusBadge(spec.status.displayName, variant: specStatusVariant(spec.status))

                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            isExpanded.toggle()
                        }
                    } label: {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.barkcliTextMuted)
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                }

                if let desc = spec.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)
                }

                // Requirements count summary
                HStack(spacing: 12) {
                    let total = spec.requirements.count
                    let verified = spec.requirements.filter { $0.status == .verified }.count
                    let stale = spec.requirements.filter(\.stale).count

                    Text("\(verified)/\(total) verified")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundColor(.barkcliEmeraldGate)

                    if stale > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 10))
                                .foregroundColor(.barkcliAmberPulse)

                            Text("\(stale) stale")
                                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                                .foregroundColor(.barkcliAmberPulse)
                        }
                    }

                    Spacer()

                    if !spec.tags.isEmpty {
                        HStack(spacing: 4) {
                            ForEach(spec.tags.prefix(3), id: \.self) { tag in
                                Text("#\(tag)")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(.barkcliTextMuted)
                            }
                        }
                    }
                }

                // Expanded Requirements Checklist
                if isExpanded && !spec.requirements.isEmpty {
                    Divider()
                        .overlay(Color.barkcliBorderHairline)

                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(spec.requirements) { req in
                            requirementCard(req)
                        }
                    }
                }
            }
        }
    }

    private func requirementCard(_ req: SpecRequirement) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                // Status dot indicator
                requirementStatusIcon(req.status)

                Text(req.title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(req.status == .verified ? .barkcliTextPrimary : .barkcliTextPrimary)

                Spacer()

                if req.stale {
                    HStack(spacing: 3) {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.system(size: 9))
                        Text("STALE")
                            .font(.system(size: 9, weight: .bold))
                    }
                    .foregroundColor(.barkcliAmberPulse)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.barkcliAmberPulse.opacity(0.12))
                    .clipShape(Capsule())
                }

                Text(req.id)
                    .font(BarkcliTypography.codeHash)
                    .foregroundColor(.barkcliTextMuted)
            }

            // Linked Code Files chips
            if !req.linkedCode.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(req.linkedCode, id: \.self) { codePath in
                            CodeLinkChip(codePath)
                        }
                    }
                }
            }

            // Acceptance criteria
            if !req.acceptanceCriteria.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(req.acceptanceCriteria, id: \.self) { criterion in
                        HStack(alignment: .top, spacing: 5) {
                            Text("–")
                                .foregroundColor(.barkcliTextMuted)
                            Text(criterion)
                                .font(.system(size: 11))
                                .foregroundColor(.barkcliTextMuted)
                        }
                    }
                }
                .padding(.leading, 18)
            }
        }
        .padding(8)
        .background(Color.barkcliSpaceBlack.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    @ViewBuilder
    private func requirementStatusIcon(_ status: RequirementStatus) -> some View {
        switch status {
        case .pending:
            Circle()
                .strokeBorder(Color.barkcliTextMuted, lineWidth: 1.5)
                .frame(width: 10, height: 10)
        case .inProgress:
            Circle()
                .fill(Color.barkcliAmberPulse)
                .frame(width: 10, height: 10)
        case .implemented:
            Circle()
                .fill(Color.barkcliElectricViolet)
                .frame(width: 10, height: 10)
        case .verified:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 12))
                .foregroundColor(.barkcliEmeraldGate)
        case .failed:
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 12))
                .foregroundColor(.barkcliCrimsonBlocker)
        }
    }

    private func specStatusVariant(_ status: SpecStatus) -> StatusBadgeVariant {
        switch status {
        case .draft:
            return .neutral
        case .inProgress:
            return .warning
        case .implemented:
            return .accent
        case .verified:
            return .success
        case .deprecated:
            return .danger
        }
    }
}
