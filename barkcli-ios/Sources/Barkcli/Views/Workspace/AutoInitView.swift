import SwiftUI

/// View facilitating zero configuration workspace bootstrapping.
/// Triggered when an instance lacks `.board/` management layer metadata.
/// Initializes the board layout, sample starter card, and git worktree gates.
public struct AutoInitView: View {
    @Environment(WorkspaceStore.self) private var workspaceStore
    @Environment(\.dismiss) private var dismiss

    @State private var boardName: String = "dev"
    @State private var includeSampleCard: Bool = true
    @State private var isExecuting: Bool = false
    @State private var resultMessage: String?
    @State private var errorMessage: String?

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    // Hero Explainer Card
                    explainerHeroCard

                    // Configuration Options
                    configurationSection

                    // Error or Success Banner
                    if let error = errorMessage {
                        statusBanner(text: error, isError: true)
                    } else if let result = resultMessage {
                        statusBanner(text: result, isError: false)
                    }

                    // Action Button
                    ActionButton(
                        "Initialize Management Layer",
                        systemImage: "wand.and.stars",
                        variant: .primary,
                        isLoading: isExecuting,
                        isDisabled: boardName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ) {
                        Task {
                            await runAutoInit()
                        }
                    }
                    .padding(.top, 10)
                }
                .padding(18)
            }
            .background(Color.barkcliObsidian.ignoresSafeArea())
            .navigationTitle("Auto Initialize")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Dismiss") {
                        dismiss()
                    }
                    .foregroundColor(.barkcliTextMuted)
                }
            }
        }
    }

    private var explainerHeroCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "cpu.fill")
                        .foregroundColor(.barkcliStatusActive)
                    Text("barkcli Management Layer")
                        .font(BarkcliTypography.sectionHeader)
                        .foregroundColor(.barkcliTextPrimary)
                }

                Text("barkcli is the management layer for AI agents (intent in, plans out, isolated worktrees, tests as the gate, and a merge train for whatever passes).")
                    .font(BarkcliTypography.bodyText)
                    .foregroundColor(.barkcliTextPrimary)
                    .lineSpacing(3)

                Text("Running auto initialization establishes the '.board/' directory, config.json, and default columns without requiring manual command line intervention.")
                    .font(BarkcliTypography.captionMuted)
                    .foregroundColor(.barkcliTextMuted)
            }
        }
    }

    private var configurationSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                "Initial Workspace Setup",
                subtitle: "Default board and column configuration",
                systemImage: "slider.horizontal.3"
            )

            VStack(spacing: 12) {
                HStack {
                    Text("Board Name")
                        .font(BarkcliTypography.cardTitle)
                        .foregroundColor(.barkcliTextPrimary)
                    Spacer()
                    TextField("Board name", text: $boardName)
                        .font(BarkcliTypography.codeHash)
                        .foregroundColor(.barkcliTextPrimary)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 120)
                }

                Divider().background(Color.barkcliBorderHairline)

                HStack {
                    Text("Standard Columns")
                        .font(BarkcliTypography.cardTitle)
                        .foregroundColor(.barkcliTextPrimary)
                    Spacer()
                    HStack(spacing: 4) {
                        columnPill("todo")
                        columnPill("doing")
                        columnPill("review")
                        columnPill("done")
                    }
                }

                Divider().background(Color.barkcliBorderHairline)

                Toggle(isOn: $includeSampleCard) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Include Starter Onboarding Card")
                            .font(BarkcliTypography.cardTitle)
                            .foregroundColor(.barkcliTextPrimary)
                        Text("Creates a welcome card explaining worktree gates")
                            .font(BarkcliTypography.captionMuted)
                            .foregroundColor(.barkcliTextMuted)
                    }
                }
                .tint(.barkcliTextPrimary)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.barkcliSpaceBlack))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5))
        }
    }

    private func columnPill(_ name: String) -> some View {
        Text(name)
            .font(BarkcliTypography.codeHash)
            .foregroundColor(.barkcliTextMuted)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color.barkcliBorderHairline.opacity(0.4)))
    }

    private func statusBanner(text: String, isError: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: isError ? "xmark.circle.fill" : "checkmark.circle.fill")
                .foregroundColor(isError ? .barkcliCrimsonBlocker : .barkcliEmeraldGate)
            Text(text)
                .font(BarkcliTypography.captionMuted)
                .foregroundColor(isError ? .barkcliCrimsonBlocker : .barkcliEmeraldGate)
            Spacer()
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(isError ? Color.barkcliCrimsonBlocker.opacity(0.12) : Color.barkcliEmeraldGate.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(isError ? Color.barkcliCrimsonBlocker.opacity(0.3) : Color.barkcliEmeraldGate.opacity(0.3), lineWidth: 0.5)
        )
    }

    private func runAutoInit() async {
        isExecuting = true
        errorMessage = nil
        resultMessage = nil

        let options = AutoInitOptions(
            boardName: boardName,
            columns: ["todo", "doing", "review", "done"],
            createSampleCard: includeSampleCard
        )

        do {
            let status = try await workspaceStore.triggerAutoInit(options: options)
            resultMessage = status.message
            isExecuting = false

            // Auto dismiss after success
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            isExecuting = false
        }
    }
}
