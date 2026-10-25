import SwiftUI

public enum IntentKind: String, CaseIterable, Identifiable, Sendable {
    case auto = "Auto"
    case feature = "Feature"
    case bug = "Bug"
    case mvp = "MVP"

    public var id: String { rawValue }

    public var apiValue: String {
        switch self {
        case .auto: return "feature"
        case .feature: return "feature"
        case .bug: return "bug"
        case .mvp: return "feature"
        }
    }
}

/// Floating liquid glass prompt capsule anchored above bottom navigation.
/// Allows humans to dispatch natural language intent directly to the barkcli management layer.
public struct IntentBar: View {
    @Environment(MindStore.self) private var envMindStore: MindStore?
    @State private var fallbackMindStore = MindStore.shared

    @State private var promptText: String = ""
    @State private var selectedKind: IntentKind = .auto
    @State private var isSubmitting: Bool = false
    @FocusState private var isFocused: Bool

    public var onSubmit: (@Sendable (String, IntentKind) async -> Void)? = nil

    public init(onSubmit: (@Sendable (String, IntentKind) async -> Void)? = nil) {
        self.onSubmit = onSubmit
    }

    private var mindStore: MindStore {
        envMindStore ?? fallbackMindStore
    }

    public var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                // Kind Picker Menu
                Menu {
                    ForEach(IntentKind.allCases) { kind in
                        Button {
                            selectedKind = kind
                        } label: {
                            HStack {
                                Text(kind.rawValue)
                                if selectedKind == kind {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(selectedKind.rawValue)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliElectricViolet)

                        Image(systemName: "chevron.up.chevron.down")
                            .font(.system(size: 9))
                            .foregroundColor(.barkcliTextMuted)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(Color.barkcliElectricViolet.opacity(0.12))
                    .clipShape(Capsule())
                }

                // Prompt Textfield
                TextField("What should get done? (e.g. Add JWT auth)", text: $promptText)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.barkcliTextPrimary)
                    .textFieldStyle(.plain)
                    .focused($isFocused)
                    .submitLabel(.send)
                    .onSubmit {
                        submitIntent()
                    }

                // Clear button if text present
                if !promptText.isEmpty {
                    Button {
                        promptText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 13))
                            .foregroundColor(.barkcliTextMuted)
                    }
                    .buttonStyle(.plain)
                }

                // Send Dispatch Button
                Button {
                    submitIntent()
                } label: {
                    if isSubmitting {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(.white)
                            .frame(width: 32, height: 32)
                    } else {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(canSubmit ? .barkcliElectricViolet : .barkcliTextMuted)
                    }
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit || isSubmitting)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.barkcliSpaceBlack.opacity(0.85))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(
                        isFocused ? Color.barkcliElectricViolet : Color.barkcliBorderHairline,
                        lineWidth: isFocused ? 1.0 : 0.5
                    )
            )
            .liquidGlass(
                cornerRadius: 22,
                interactive: true,
                borderColor: isFocused ? Color.barkcliElectricViolet.opacity(0.4) : Color.white.opacity(0.1),
                glowColor: isFocused ? Color.barkcliElectricViolet : nil,
                glowRadius: isFocused ? 6 : 0
            )
            .shadow(color: Color.black.opacity(0.35), radius: 10, y: 5)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    private var canSubmit: Bool {
        !promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submitIntent() {
        let clean = promptText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, !isSubmitting else { return }

        isSubmitting = true
        isFocused = false

        Task {
            defer { isSubmitting = false }
            if let onSubmit {
                await onSubmit(clean, selectedKind)
            } else {
                do {
                    _ = try await mindStore.submitIntent(prompt: clean, kind: selectedKind.apiValue)
                } catch {
                    // Handled in store
                }
            }
            promptText = ""
            #if os(iOS)
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()
            #endif
        }
    }
}
