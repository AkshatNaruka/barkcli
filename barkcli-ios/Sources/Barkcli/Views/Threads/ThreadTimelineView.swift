import SwiftUI

public struct ThreadTimelineView: View {
    @Bindable var store: ThreadStore
    var onToggleInspector: () -> Void
    var onNewIntent: (String?) -> Void

    @State private var inputText: String = ""
    @State private var selectedBackend: String = "opencode"

    public init(
        store: ThreadStore,
        onToggleInspector: @escaping () -> Void,
        onNewIntent: @escaping (String?) -> Void
    ) {
        self.store = store
        self.onToggleInspector = onToggleInspector
        self.onNewIntent = onNewIntent
    }

    public var body: some View {
        VStack(spacing: 0) {
            if let detail = store.activeThreadDetail {
                activeTimelineView(detail: detail)
            } else {
                emptyOnboardingView
            }
        }
        .background(Color.barkcliCanvas)
    }

    private func activeTimelineView(detail: ThreadDetailItem) -> some View {
        VStack(spacing: 0) {
            headerBar(detail: detail)

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(detail.events) { event in
                            eventCard(event: event)
                                .id(event.id)
                        }
                    }
                    .padding(16)
                }
                .onChange(of: detail.events.count) { _, _ in
                    if let last = detail.events.last {
                        withAnimation {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            composerBar(cardId: detail.id)
        }
    }

    private func headerBar(detail: ThreadDetailItem) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(detail.id)
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(.barkcliTextMuted)

                    if let col = detail.card?.column {
                        Text(col.uppercased())
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.barkcliTextSecondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.barkcliCardSubtle)
                            .clipShape(Capsule())
                    }
                }

                Text(detail.card?.title ?? detail.id)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                    .lineLimit(1)
            }

            Spacer()

            Button(action: onToggleInspector) {
                HStack(spacing: 5) {
                    Image(systemName: "sidebar.right")
                        .font(.system(size: 12))
                    Text("Inspector")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(.barkcliTextSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.barkcliCardSubtle)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.barkcliCardBackground)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.barkcliBorder),
            alignment: .bottom
        )
    }

    @ViewBuilder
    private func eventCard(event: ThreadEventItem) -> some View {
        switch event.kind {
        case .user:
            userBubble(event: event)
        case .assistant:
            assistantBubble(event: event)
        case .planProposed:
            planProposalCard(event: event)
        case .planApproved:
            approvedCard(event: event)
        case .gate:
            gateCard(event: event)
        case .merge:
            mergeCard(event: event)
        case .taskSpawned:
            taskSpawnedCard(event: event)
        case .agentOutput, .steer, .custom:
            genericEventRow(event: event)
        }
    }

    private func userBubble(event: ThreadEventItem) -> some View {
        HStack {
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(event.text)
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextPrimary)
                    .padding(12)
                    .background(Color.barkcliCardSubtle)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(Color.barkcliBorderFocus, lineWidth: 1)
                    )

                Text(event.author)
                    .font(.system(size: 10))
                    .foregroundColor(.barkcliTextMuted)
            }
            .frame(maxWidth: 420, alignment: .trailing)
        }
    }

    private func assistantBubble(event: ThreadEventItem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(Color.barkcliTextPrimary)
                .frame(width: 24, height: 24)
                .overlay(
                    Image(systemName: "sparkles")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliCanvas)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(event.text)
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextPrimary)
                    .lineSpacing(3)
                    .padding(12)
                    .background(Color.barkcliCardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                    )

                Text(event.author)
                    .font(.system(size: 10))
                    .foregroundColor(.barkcliTextMuted)
            }
            Spacer()
        }
    }

    private func planProposalCard(event: ThreadEventItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "doc.text.below.ecg.fill")
                    .foregroundColor(.barkcliTextPrimary)
                Text("Proposed Plan")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                Spacer()
            }

            Text(event.text)
                .font(.system(size: 12))
                .foregroundColor(.barkcliTextSecondary)

            HStack(spacing: 10) {
                Button {
                    Task {
                        await store.approvePlan(cardId: event.cardId)
                    }
                } label: {
                    Text("Approve and Run")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.barkcliCanvas)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Color.barkcliTextPrimary)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)

                Button {
                    Task {
                        await store.rejectPlan(cardId: event.cardId, reason: "Needs revision")
                    }
                } label: {
                    Text("Request Changes")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.barkcliTextSecondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.barkcliCardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 4)
        }
        .padding(14)
        .background(Color.barkcliCardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.barkcliBorder, lineWidth: 1)
        )
    }

    private func approvedCard(event: ThreadEventItem) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.barkcliStatusActive)
            Text("Plan approved. Parallel agent workers active in isolated worktrees.")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.barkcliTextPrimary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.barkcliCardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func gateCard(event: ThreadEventItem) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "shield.checkerboard")
                .foregroundColor(.barkcliStatusActive)
            Text(event.text)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.barkcliTextPrimary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.barkcliCardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func mergeCard(event: ThreadEventItem) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "arrow.triangle.merge")
                .foregroundColor(.barkcliStatusActive)
            Text(event.text)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.barkcliTextPrimary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.barkcliCardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func taskSpawnedCard(event: ThreadEventItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "cpu")
                    .foregroundColor(.barkcliStatusActive)
                Text(event.text)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.barkcliTextPrimary)
                Spacer()
            }

            HStack(spacing: 8) {
                Button {
                    Task {
                        await store.stopSession(sessionId: event.cardId)
                    }
                } label: {
                    Text("Stop")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.barkcliTextMuted)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.barkcliCardSubtle)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)

                Button {
                    Task {
                        _ = await store.forkSession(sessionId: event.cardId)
                    }
                } label: {
                    Text("Fork")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.barkcliTextSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.barkcliCardSubtle)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)

                Button {
                    Task {
                        _ = await store.raceTask(taskId: event.cardId)
                    }
                } label: {
                    Text("Race")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.barkcliTextSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.barkcliCardSubtle)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.barkcliCardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(Color.barkcliBorder, lineWidth: 1)
        )
    }

    private func genericEventRow(event: ThreadEventItem) -> some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Color.barkcliTextMuted)
                .frame(width: 6, height: 6)

            Text(event.text)
                .font(.system(size: 11))
                .foregroundColor(.barkcliTextSecondary)

            Spacer()

            Text(event.author)
                .font(.system(size: 9))
                .foregroundColor(.barkcliTextMuted)
        }
        .padding(.horizontal, 4)
    }

    private func composerBar(cardId: String) -> some View {
        HStack(spacing: 8) {
            Menu {
                Button("opencode (deepseek free)") { selectedBackend = "opencode" }
                Button("claude") { selectedBackend = "claude" }
                Button("codex") { selectedBackend = "codex" }
            } label: {
                HStack(spacing: 4) {
                    Text(selectedBackend)
                        .font(.system(size: 11, weight: .medium))
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 9))
                }
                .foregroundColor(.barkcliTextSecondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(Color.barkcliCardSubtle)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .buttonStyle(.plain)

            TextField("Ask questions or steer requirements...", text: $inputText)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .foregroundColor(.barkcliTextPrimary)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(Color.barkcliCardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                )
                .onSubmit {
                    submitMessage(cardId: cardId)
                }

            Button {
                submitMessage(cardId: cardId)
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.barkcliCanvas)
                    .frame(width: 28, height: 28)
                    .background(Color.barkcliTextPrimary)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isSending)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.barkcliCardBackground)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.barkcliBorder),
            alignment: .top
        )
    }

    private func submitMessage(cardId: String) {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        inputText = ""
        Task {
            await store.sendMessage(id: cardId, text: trimmed, backend: selectedBackend)
        }
    }

    private var emptyOnboardingView: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Circle()
                        .fill(Color.barkcliCardBackground)
                        .frame(width: 48, height: 48)
                        .overlay(
                            Image(systemName: "sparkles")
                                .font(.system(size: 20))
                                .foregroundColor(.barkcliTextPrimary)
                        )
                        .overlay(
                            Circle()
                                .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                        )

                    Text("The management layer for AI agents")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    Text("barkcli coordinates coding agents with intent in, plans out, isolated worktrees, tests as the gate, and a merge train for whatever passes.")
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                        .frame(maxWidth: 440)
                }
                .padding(.top, 24)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    pillarCard(
                        number: "1.",
                        title: "Intent In",
                        detail: "Describe a feature or paste a specification to kick off planning."
                    )
                    pillarCard(
                        number: "2.",
                        title: "Plans Out",
                        detail: "AI breaks down the requirement into atomic, parallel child tasks."
                    )
                    pillarCard(
                        number: "3.",
                        title: "Isolated Worktrees",
                        detail: "Agents execute in isolated git worktrees so your working tree is undisturbed."
                    )
                    pillarCard(
                        number: "4.",
                        title: "Tests as the Gate",
                        detail: "Your actual test suite gates every change before landing via merge train."
                    )
                }
                .frame(maxWidth: 500)

                VStack(alignment: .leading, spacing: 8) {
                    Text("QUICK START EXAMPLES")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.barkcliTextMuted)
                        .tracking(0.6)

                    VStack(spacing: 8) {
                        starterButton("Add health check endpoint")
                        starterButton("Add structured logging middleware")
                        starterButton("Fix flaky test retry policy")
                        starterButton("Implement user API token auth")
                    }
                }
                .frame(maxWidth: 500)

                Button {
                    onNewIntent(nil)
                } label: {
                    Text("Start New Intent")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.barkcliCanvas)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 8)
                        .background(Color.barkcliTextPrimary)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.bottom, 30)
            }
            .padding(.horizontal, 24)
        }
    }

    private func pillarCard(number: String, title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text(number)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
            }

            Text(detail)
                .font(.system(size: 11))
                .foregroundColor(.barkcliTextMuted)
                .lineSpacing(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.barkcliCardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.barkcliBorder, lineWidth: 1)
        )
    }

    private func starterButton(_ text: String) -> some View {
        Button {
            onNewIntent(text)
        } label: {
            HStack {
                Text(text)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.barkcliTextPrimary)
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: 10))
                    .foregroundColor(.barkcliTextMuted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.barkcliCardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Color.barkcliBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
