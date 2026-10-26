import SwiftUI

public struct ThreadsContainerView: View {
    @Environment(AppState.self) private var appState

    @State private var showInspector: Bool = true
    @State private var showComposerSheet: Bool = false
    @State private var composerInitialText: String = ""

    public init() {}

    public var body: some View {
        HStack(spacing: 0) {
            ThreadListView(store: appState.threadStore) {
                openComposer(initialText: "")
            }
            .frame(width: 280)

            Rectangle()
                .frame(width: 1)
                .foregroundColor(Color.barkcliBorder)

            ThreadTimelineView(
                store: appState.threadStore,
                onToggleInspector: {
                    withAnimation {
                        showInspector.toggle()
                    }
                },
                onNewIntent: { text in
                    openComposer(initialText: text ?? "")
                }
            )
            .frame(maxWidth: .infinity)

            if showInspector {
                Rectangle()
                    .frame(width: 1)
                    .foregroundColor(Color.barkcliBorder)

                ThreadInspectorView(store: appState.threadStore) {
                    withAnimation {
                        showInspector = false
                    }
                }
                .transition(.move(edge: .trailing))
            }
        }
        .background(Color.barkcliCanvas)
        .sheet(isPresented: $showComposerSheet) {
            composerSheet
        }
        .task {
            if appState.threadStore.threads.isEmpty {
                await appState.threadStore.loadThreads(board: appState.currentBoardName)
            }
        }
    }

    private func openComposer(initialText: String) {
        self.composerInitialText = initialText
        self.showComposerSheet = true
    }

    private var composerSheet: some View {
        NavigationStack {
            UniversalComposerSheet(
                initialText: composerInitialText,
                boardName: appState.currentBoardName
            ) { text, kind, backend, mode in
                showComposerSheet = false
                Task {
                    _ = await appState.threadStore.createThread(
                        text: text,
                        kind: kind,
                        backend: backend,
                        mode: mode,
                        board: appState.currentBoardName
                    )
                }
            } onCancel: {
                showComposerSheet = false
            }
        }
    }
}

public struct UniversalComposerSheet: View {
    var initialText: String
    var boardName: String
    var onDispatch: (String, String, String, String) -> Void
    var onCancel: () -> Void

    @State private var text: String = ""
    @State private var kind: String = "feature"
    @State private var backend: String = "opencode"
    @State private var mode: String = "plan_first"

    public init(
        initialText: String,
        boardName: String,
        onDispatch: @escaping (String, String, String, String) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.initialText = initialText
        self.boardName = boardName
        self.onDispatch = onDispatch
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text("UNIVERSAL COMPOSER")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
                    .tracking(0.6)

                TextEditor(text: $text)
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextPrimary)
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .frame(height: 120)
                    .background(Color.barkcliCardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                    )

                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("TYPE")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)

                        Picker("Type", selection: $kind) {
                            Text("Feature").tag("feature")
                            Text("Bugfix").tag("bug")
                            Text("Refactor").tag("refactor")
                            Text("Task").tag("task")
                        }
                        .labelsHidden()
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("BACKEND")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)

                        Picker("Backend", selection: $backend) {
                            Text("opencode").tag("opencode")
                            Text("claude").tag("claude")
                            Text("codex").tag("codex")
                        }
                        .labelsHidden()
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("MODE")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)

                        Picker("Mode", selection: $mode) {
                            Text("Plan first").tag("plan_first")
                            Text("Just do it").tag("plan_and_run")
                        }
                        .labelsHidden()
                    }
                }
            }
            .padding(16)
            .background(Color.barkcliCardSubtle)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Color.barkcliBorder, lineWidth: 1)
            )

            Spacer()
        }
        .padding(16)
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .navigationTitle("New Intent")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel", action: onCancel)
                    .foregroundColor(.barkcliTextMuted)
            }

            ToolbarItem(placement: .confirmationAction) {
                Button("Start Intent") {
                    onDispatch(text, kind, backend, mode)
                }
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .foregroundColor(.barkcliTextPrimary)
                .font(.system(size: 13, weight: .bold))
            }
        }
        .onAppear {
            if !initialText.isEmpty {
                self.text = initialText
            }
        }
    }
}
