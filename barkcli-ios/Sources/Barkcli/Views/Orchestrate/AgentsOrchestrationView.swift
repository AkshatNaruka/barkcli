import SwiftUI

/// Central command view for the AI Agent Fleet orchestration layer.
/// Displays registered fleet agents, live runner sessions in worktrees (/api/run/live),
/// orchestration cycle dispatch controls, and the filterable task queue.
public struct AgentsOrchestrationView: View {
    @Environment(OrchestrationStore.self) private var envStore: OrchestrationStore?
    @State private var fallbackStore = OrchestrationStore.shared

    @State private var showRegisterAgentSheet: Bool = false
    @State private var newAgentName: String = ""
    @State private var newAgentRole: AgentRole = .techLead
    @State private var showCycleResultBanner: Bool = false

    public init() {}

    private var store: OrchestrationStore {
        envStore ?? fallbackStore
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Top Metrics & Cycle Dispatch Card
                cycleDispatchHeaderCard

                // Cycle Result Banner
                if let cycle = store.lastCycleResult {
                    cycleResultBanner(cycle)
                }

                // Live Autonomous Worktree Runs (/api/run/live)
                liveRunnerSessionsRail

                // Agent Fleet Grid
                fleetSection

                // Filterable Task Queue
                taskQueueSection
            }
            .padding(16)
        }
        .background(Color.barkcliDarkBackground.ignoresSafeArea())
        .navigationTitle("Orchestration")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showRegisterAgentSheet = true
                } label: {
                    Image(systemName: "person.crop.circle.badge.plus")
                        .font(.system(size: 16))
                        .foregroundColor(.barkcliTextPrimary)
                }
            }
        }
        .refreshable {
            await store.refresh()
        }
        .task {
            if store.agents.isEmpty {
                await store.load()
            }
        }
        .sheet(isPresented: $showRegisterAgentSheet) {
            registerAgentModal
        }
    }

    // MARK: Cycle Dispatch and Fleet Overview Header

    private var cycleDispatchHeaderCard: some View {
        GlassCard(padding: 18) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("AGENT FLEET ORCHESTRATION")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                            .tracking(0.6)

                        Text("Autonomous Autopilot Loop")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    Spacer()

                    StatusBadge(
                        "\(store.activeAgentsCount) Active",
                        variant: store.activeAgentsCount > 0 ? .accent : .neutral
                    )
                }

                Text("Dispatches intent into decomposed subtasks, assigns to isolated git worktrees, runs acceptance test gates, and merges passing attempts.")
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextMuted)

                // High Impact Quick Stats
                HStack(spacing: 8) {
                    MetricTile(
                        title: "AGENTS",
                        value: "\(store.agents.count)",
                        subtitle: "\(store.activeAgentsCount) working",
                        systemImage: "cpu"
                    )

                    MetricTile(
                        title: "RUNNERS",
                        value: "\(store.runningSessionsCount)",
                        subtitle: "/api/run/live",
                        systemImage: "terminal.fill"
                    )

                    MetricTile(
                        title: "TASKS QUEUED",
                        value: "\(store.tasks.count)",
                        subtitle: "\(store.taskCountsByStatus[.completed] ?? 0) done",
                        systemImage: "tray.full.fill"
                    )
                }

                // CTA Button: Run Orchestration Cycle
                ActionButton(
                    store.isRunningCycle ? "Dispatching Cycle..." : "Run Orchestration Cycle",
                    systemImage: "arrow.triangle.2.circlepath.circle.fill",
                    variant: .primary,
                    isLoading: store.isRunningCycle
                ) {
                    Task {
                        do {
                            _ = try await store.runCycle()
                            #if os(iOS)
                            let generator = UINotificationFeedbackGenerator()
                            generator.notificationOccurred(.success)
                            #endif
                        } catch {
                            #if os(iOS)
                            let generator = UINotificationFeedbackGenerator()
                            generator.notificationOccurred(.error)
                            #endif
                        }
                    }
                }
            }
        }
    }

    // MARK: - Cycle Result Banner

    private func cycleResultBanner(_ result: CycleResult) -> some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "sparkles")
                        .foregroundColor(.barkcliStatusActive)

                    Text("Cycle #\(result.cycleNumber) Complete")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    Spacer()

                    Text("\(result.tasksDispatched) dispatched · \(result.tasksCompleted) completed")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundColor(.barkcliEmeraldGate)
                }

                if !result.insights.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(result.insights, id: \.self) { insight in
                            HStack(alignment: .top, spacing: 6) {
                                Text("•")
                                    .foregroundColor(.barkcliTextMuted)
                                Text(insight)
                                    .font(.system(size: 12))
                                    .foregroundColor(.barkcliTextMuted)
                            }
                        }
                    }
                }
            }
        }
        .liquidGlass(cornerRadius: 8, interactive: false, borderColor: Color.barkcliBorderHairline)
    }

    // MARK: Live Runner Sessions Rail (/api/run/live)

    private var liveRunnerSessionsRail: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                "Live Runner Sessions",
                count: store.liveSessions.count,
                systemImage: "terminal.fill"
            )

            if store.liveSessions.isEmpty {
                GlassCard(padding: 16) {
                    HStack(spacing: 12) {
                        Image(systemName: "tray")
                            .font(.system(size: 20))
                            .foregroundColor(.barkcliTextMuted)

                        VStack(alignment: .leading, spacing: 2) {
                            Text("No active worktree runners")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.barkcliTextPrimary)

                            Text("When intent is dispatched, agent workers spawn in isolated git worktrees here.")
                                .font(.system(size: 12))
                                .foregroundColor(.barkcliTextMuted)
                        }
                    }
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(store.liveSessions) { session in
                            LiveSessionRow(session: session)
                                .frame(width: 290)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    // MARK: Fleet Section

    private var fleetSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                "Registered Fleet",
                count: store.agents.count,
                systemImage: "person.3.fill",
                actionTitle: "Register",
                action: {
                    showRegisterAgentSheet = true
                }
            )

            if store.agents.isEmpty {
                GlassCard(padding: 20) {
                    VStack(spacing: 8) {
                        Image(systemName: "cpu")
                            .font(.system(size: 28))
                            .foregroundColor(.barkcliTextMuted)

                        Text("No agents registered")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.barkcliTextPrimary)

                        Text("Register Scrum Master, Tech Lead, Product Owner, or Project Manager agents.")
                            .font(.system(size: 12))
                            .foregroundColor(.barkcliTextMuted)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                }
            } else {
                VStack(spacing: 12) {
                    ForEach(store.agents) { agent in
                        AgentCardView(agent: agent, onRemove: {
                            Task {
                                try? await store.removeAgent(id: agent.id)
                            }
                        })
                    }
                }
            }
        }
    }

    // MARK: Task Queue Section

    private var taskQueueSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                "Task Queue",
                count: store.filteredTasks.count,
                systemImage: "list.bullet.rectangle.fill"
            )

            // Search Bar & Filters
            searchAndFilterBar

            // Tasks List
            if store.filteredTasks.isEmpty {
                GlassCard(padding: 20) {
                    VStack(spacing: 6) {
                        Image(systemName: "checklist")
                            .font(.system(size: 24))
                            .foregroundColor(.barkcliTextMuted)

                        Text("No tasks match current filter")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.barkcliTextPrimary)

                        Text("Change filter status or search query.")
                            .font(.system(size: 12))
                            .foregroundColor(.barkcliTextMuted)
                    }
                    .frame(maxWidth: .infinity)
                }
            } else {
                VStack(spacing: 10) {
                    ForEach(store.filteredTasks) { task in
                        taskRow(task)
                    }
                }
            }
        }
    }

    private var searchAndFilterBar: some View {
        @Bindable var bindableStore = store
        return VStack(spacing: 10) {
            // Search field
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.barkcliTextMuted)
                    .font(.system(size: 13))

                TextField("Search tasks, card IDs, descriptions", text: $bindableStore.searchQuery)
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextPrimary)
                    .textFieldStyle(.plain)

                if !store.searchQuery.isEmpty {
                    Button {
                        store.searchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.barkcliTextMuted)
                            .font(.system(size: 13))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(Color.barkcliSpaceBlack)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(Color.barkcliBorderHairline, lineWidth: 0.5)
            )

            // Status filter horizontal pills
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    filterPill(title: "All", isSelected: store.selectedStatusFilter == nil) {
                        store.selectedStatusFilter = nil
                    }

                    ForEach(TaskStatus.allCases) { status in
                        let count = store.taskCountsByStatus[status] ?? 0
                        filterPill(
                            title: "\(status.displayName) (\(count))",
                            isSelected: store.selectedStatusFilter == status
                        ) {
                            store.selectedStatusFilter = status
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func filterPill(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .foregroundColor(isSelected ? Color.barkcliCanvas : Color.barkcliTextMuted)
                .background(isSelected ? Color.barkcliTextPrimary : Color.barkcliCardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(isSelected ? Color.barkcliTextPrimary : Color.barkcliBorderHairline, lineWidth: 0.5)
                )
        }
        .buttonStyle(.plain)
    }

    private func taskRow(_ task: TaskRequest) -> some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    StatusBadge(task.cardId, variant: .accent)

                    StatusBadge(task.status.displayName, variant: task.status.badgeVariant)

                    StatusBadge(task.priority.displayName, variant: task.priority == .critical ? .danger : .neutral)

                    Spacer()

                    Text("Attempt \(task.attempts)/\(task.maxAttempts)")
                        .font(BarkcliTypography.captionMuted)
                        .foregroundColor(.barkcliTextMuted)
                }

                Text(task.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.barkcliTextPrimary)

                if !task.description.isEmpty {
                    Text(task.description)
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)
                        .lineLimit(2)
                }

                // Assigned agent and action buttons
                HStack(spacing: 8) {
                    if let agent = task.assignedAgent {
                        HStack(spacing: 4) {
                            Image(systemName: "person.crop.circle")
                                .font(.system(size: 11))
                                .foregroundColor(.barkcliTextSecondary)

                            Text(agent)
                                .font(.system(size: 11, weight: .medium, design: .monospaced))
                                .foregroundColor(.barkcliTextSecondary)
                        }
                    } else {
                        Text("Unassigned")
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextMuted)
                    }

                    Spacer()

                    if task.status == .pending {
                        Button("Claim") {
                            Task {
                                try? await store.claimTask(taskId: task.id, agentId: "tech-lead")
                            }
                        }
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliStatusActive)
                    } else if task.status == .inProgress || task.status == .assigned {
                        Button("Complete") {
                            Task {
                                try? await store.completeTask(taskId: task.id, agentId: task.assignedAgent)
                            }
                        }
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliEmeraldGate)

                        Button("Fail") {
                            Task {
                                try? await store.failTask(taskId: task.id, agentId: task.assignedAgent, error: "Manual fail")
                            }
                        }
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliCrimsonBlocker)
                    }
                }
            }
        }
    }

    // MARK: Register Agent Modal

    private var registerAgentModal: some View {
        NavigationStack {
            Form {
                Section("Agent Details") {
                    TextField("Agent Name (e.g. Atlas, Jarvis)", text: $newAgentName)
                        .foregroundColor(.barkcliTextPrimary)

                    Picker("Role", selection: $newAgentRole) {
                        ForEach(AgentRole.allCases) { role in
                            Text(role.displayName).tag(role)
                        }
                    }
                }

                Section("Role Responsibilities") {
                    Text(newAgentRole.description)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextMuted)
                }
            }
            .navigationTitle("Register Agent")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showRegisterAgentSheet = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Register") {
                        Task {
                            let cleanName = newAgentName.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !cleanName.isEmpty else { return }
                            _ = try? await store.registerAgent(name: cleanName, role: newAgentRole)
                            newAgentName = ""
                            showRegisterAgentSheet = false
                        }
                    }
                    .disabled(newAgentName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
