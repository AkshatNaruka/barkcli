import SwiftUI

public enum IntentKind: String, CaseIterable, Identifiable, Sendable {
    case task = "Task"
    case feature = "Feature"
    case bug = "Bug"

    public var id: String { rawValue }

    public var apiValue: String {
        switch self {
        case .task: return "task"
        case .feature: return "feature"
        case .bug: return "bug"
        }
    }
}

public enum AgentBackend: String, CaseIterable, Identifiable, Sendable {
    case opencode = "OpenCode"
    case board = "Board Pool"
    case codex = "Codex"
    case claude = "Claude Code"

    public var id: String { rawValue }

    public var apiValue: String {
        switch self {
        case .opencode: return "opencode"
        case .board: return "board"
        case .codex: return "codex"
        case .claude: return "claude"
        }
    }
}

public struct IntentBar: View {
    @Environment(MindStore.self) private var envMindStore: MindStore?
    @State private var fallbackMindStore = MindStore.shared

    @State private var promptText: String = ""
    @State private var selectedKind: IntentKind = .feature
    @State private var selectedBackend: AgentBackend = .opencode
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

                Menu {
                    ForEach(AgentBackend.allCases) { backend in
                        Button {
                            selectedBackend = backend
                        } label: {
                            HStack {
                                Text(backend.rawValue)
                                if selectedBackend == backend {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(Color.barkcliTextPrimary)
                            .frame(width: 5, height: 5)
                        Text(selectedBackend.rawValue)
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
                    _ = try await mindStore.submitIntent(
                        prompt: clean,
                        kind: selectedKind.apiValue,
                        backend: selectedBackend.apiValue
                    )
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
