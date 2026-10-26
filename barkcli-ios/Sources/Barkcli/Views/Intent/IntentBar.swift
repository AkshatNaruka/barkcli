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
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.barkcliTextPrimary)

                        Image(systemName: "chevron.up.chevron.down")
                            .font(.system(size: 9))
                            .foregroundColor(.barkcliTextMuted)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(Color.barkcliCardSubtle)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                    )
                }

                TextField("What should get done? (e.g. Add JWT auth)", text: $promptText)
                    .font(.barkcliBodyText)
                    .foregroundColor(.barkcliTextPrimary)
                    .textFieldStyle(.plain)
                    .focused($isFocused)
                    .submitLabel(.send)
                    .onSubmit {
                        submitIntent()
                    }

                if !promptText.isEmpty {
                    Button {
                        promptText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.barkcliTextMuted)
                    }
                    .buttonStyle(.plain)
                }

                Button {
                    submitIntent()
                } label: {
                    if isSubmitting {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(.barkcliTextPrimary)
                            .scaleEffect(0.7)
                            .frame(width: 24, height: 24)
                    } else {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 24))
                            .foregroundColor(canSubmit ? .barkcliTextPrimary : .barkcliTextMuted)
                    }
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit || isSubmitting)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(
                        isFocused ? Color.barkcliTextPrimary.opacity(0.4) : Color.barkcliBorder,
                        lineWidth: 0.5
                    )
            )
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
