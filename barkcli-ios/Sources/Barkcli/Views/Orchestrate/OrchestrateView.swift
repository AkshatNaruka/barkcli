import SwiftUI

public struct OrchestrateView: View {
    @Environment(AppState.self) private var appState

    @State private var isRunningCycle: Bool = false
    @State private var selectedProposal: PlanProposal?

    public init() {}

    private var pendingProposal: PlanProposal? {
        appState.pendingProposal
    }

    private var liveRunners: [LiveRunnerSession] {
        appState.liveRunners
    }

    private var agents: [AgentItem] {
        appState.agents
    }

    private var tasks: [TaskRequest] {
        appState.tasks
    }

    private var lastGateVerdict: TestGateVerdict? {
        appState.lastGateVerdict
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                intentPromptCard

                if let proposal = pendingProposal {
                    pendingPlanProposalCard(proposal)
                }

                if let gate = lastGateVerdict {
                    testGateStatusCard(gate)
                }

                liveRunnersSection

                agentFleetSection

                taskQueueSection

                orchestrationCycleCard
            }
            .padding(16)
        }
        .background(Color.barkcliDarkBackground.ignoresSafeArea())
        .sheet(item: $selectedProposal) { proposal in
            IntentPromptSheet(proposal: proposal)
        }
        .sheet(isPresented: Binding(
            get: { appState.showPlanProposalModal && appState.pendingProposal != nil },
            set: { appState.showPlanProposalModal = $0 }
        )) {
            if let proposal = appState.pendingProposal {
                IntentPromptSheet(proposal: proposal)
            }
        }
        .refreshable {
            await appState.refresh()
        }
    }

    private var intentPromptCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.barkcliAccentPurple)

                    Text("AUTONOMOUS INTENT")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.barkcliAccentPurple)
                        .tracking(0.8)

                    Spacer()

                    Text("management layer")
                        .font(.system(size: 11))
                        .foregroundColor(.barkcliTextMuted)
                }

                Text("Dispatch intent to autonomous agents")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                HStack(spacing: 10) {
                    @Bindable var state = appState
                    TextField("What should the agent build?", text: $state.intentDraft)
                        .font(.system(size: 14))
                        .foregroundColor(.barkcliTextPrimary)
                        .textFieldStyle(.plain)
                        .padding(10)
                        .background(Color.barkcliSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .strokeBorder(Color.barkcliBorderSubtle, lineWidth: 1)
                        )

                    Button {
                        let text = appState.intentDraft
                        Task {
                            await appState.submitIntent(text: text)
                        }
                    } label: {
                        HStack(spacing: 5) {
                            if appState.isSubmittingIntent {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(0.8)
                            } else {
                                Image(systemName: "arrow.up.circle.fill")
                                    .font(.system(size: 14, weight: .bold))
                                Text("Submit")
                                    .font(.system(size: 13, weight: .bold))
                            }
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Color.barkcliAccentPurple)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(appState.isSubmittingIntent || appState.intentDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func pendingPlanProposalCard(_ proposal: PlanProposal) -> some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    StatusBadge("Plan Pending Review", systemImage: "clock.fill", variant: .warning)

                    Spacer()

                    StatusBadge(proposal.cardId, variant: .accent)
                }

                Text(proposal.cardTitle)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                Text(proposal.rationale.isEmpty ? "The agent decomposed this intent into verified child tasks." : proposal.rationale)
                    .font(.system(size: 13))
                    .foregroundColor(.barkcliTextMuted)
                    .lineLimit(2)

                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Image(systemName: "list.bullet.rectangle")
                            .font(.system(size: 11))
                        Text("\(proposal.children.count) tasks")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(.barkcliTextMuted)

                    HStack(spacing: 4) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 11))
                        Text("\(proposal.estimatedTotalEffort) pts")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(.barkcliAccentPurple)

                    Spacer()

                    Button {
                        selectedProposal = proposal
                    } label: {
                        HStack(spacing: 4) {
                            Text("Inspect Plan")
                                .font(.system(size: 12, weight: .bold))
                            Image(systemName: "chevron.right")
                                .font(.system(size: 10, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.barkcliAccentPurple)
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func testGateStatusCard(_ gate: TestGateVerdict) -> some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    StatusBadge(
                        gate.passed ? "Gate Passed" : "Gate Failed",
                        systemImage: gate.passed ? "checkmark.shield.fill" : "xmark.shield.fill",
                        variant: gate.passed ? .success : .danger
                    )

                    Spacer()

                    Text(String(format: "%.2f s", gate.durationSeconds))
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundColor(.barkcliTextMuted)
                }

                Text(gate.command)
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundColor(.barkcliTextPrimary)

                if !gate.output.isEmpty {
                    Text(gate.output)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.barkcliTextMuted)
                        .lineLimit(2)
                }
            }
        }
    }

    private var liveRunnersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                "Active Worktrees",
                subtitle: "Isolated git worktrees with active agent execution",
                count: liveRunners.count,
                systemImage: "macwindow.on.rectangle"
            )

            if liveRunners.isEmpty {
                GlassCard(padding: 14) {
                    HStack(spacing: 12) {
                        Image(systemName: "shippingbox")
                            .font(.system(size: 24))
                            .foregroundColor(.barkcliTextMuted)

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Zero Active Runners")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.barkcliTextPrimary)

                            Text("No agent worktrees currently executing.")
                                .font(.system(size: 12))
                                .foregroundColor(.barkcliTextMuted)
                        }
                    }
                }
            } else {
                ForEach(liveRunners) { runner in
                    liveRunnerCard(runner)
                }
            }
        }
    }

    private func liveRunnerCard(_ runner: LiveRunnerSession) -> some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 8) {
                    StatusBadge(runner.agentId, variant: .accent)

                    StatusBadge(runner.backend, variant: .neutral)

                    Spacer()

                    StatusBadge(runner.status.capitalized, systemImage: "bolt.fill", variant: .success)
                }

                if let branch = runner.branch {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.triangle.branch")
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliAccentPurple)
                        Text(branch)
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundColor(.barkcliTextPrimary)
                    }
                }

                if let path = runner.worktreePath {
                    HStack(spacing: 6) {
                        Image(systemName: "folder")
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextMuted)
                        Text(path)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)
                            .lineLimit(1)
                    }
                }

                if let beat = runner.lastHeartbeat {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color.barkcliSuccessEmerald)
                            .frame(width: 5, height: 5)
                        Text("Heartbeat \(beat.formatted(date: .omitted, time: .standard))")
                            .font(.system(size: 10))
                            .foregroundColor(.barkcliTextMuted)
                    }
                }
            }
        }
    }

    private var agentFleetSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                "Agent Fleet Roster",
                subtitle: "Autonomous agents registered with the orchestrator",
                count: agents.count,
                systemImage: "person.3.fill"
            )

            ForEach(agents) { agent in
                agentCard(agent)
            }
        }
    }

    private func agentCard(_ agent: AgentItem) -> some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 10) {
                    Circle()
                        .fill(Color.barkcliAccentPurple.opacity(0.18))
                        .frame(width: 34, height: 34)
                        .overlay(
                            Image(systemName: agent.role.iconName)
                                .font(.system(size: 14))
                                .foregroundColor(.barkcliAccentPurple)
                        )

                    VStack(alignment: .leading, spacing: 2) {
                        Text(agent.name)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)

                        Text(agent.role.displayName)
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextMuted)
                    }

                    Spacer()

                    StatusBadge(agent.status.displayName, variant: agent.status.badgeVariant)
                }

                Divider()
                    .overlay(Color.barkcliBorderSubtle.opacity(0.5))

                HStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("ACTIVE")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                        Text("\(agent.activeTasks.count)")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("COMPLETED")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                        Text("\(agent.completedTasks.count)")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundColor(.barkcliSuccessEmerald)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("SUCCESS RATE")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                        Text("\(Int(agent.metrics.successRate * 100))%")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundColor(.barkcliAccentPurple)
                    }

                    Spacer()

                    if let beat = agent.lastHeartbeat {
                        Text("Active \(beat.formatted(date: .omitted, time: .shortened))")
                            .font(.system(size: 10))
                            .foregroundColor(.barkcliTextMuted)
                    }
                }
            }
        }
    }

    private var taskQueueSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                "Task Queue",
                subtitle: "Queued and active autonomous tasks",
                count: tasks.count,
                systemImage: "tray.full.fill"
            )

            if tasks.isEmpty {
                GlassCard(padding: 14) {
                    HStack(spacing: 12) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 24))
                            .foregroundColor(.barkcliSuccessEmerald)

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Zero Queued Tasks")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.barkcliTextPrimary)

                            Text("Task queue is clear and ready for new work.")
                                .font(.system(size: 12))
                                .foregroundColor(.barkcliTextMuted)
                        }
                    }
                }
            } else {
                ForEach(tasks) { task in
                    taskQueueCard(task)
                }
            }
        }
    }

    private func taskQueueCard(_ task: TaskRequest) -> some View {
        GlassCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(task.id)
                                .font(.system(size: 11, weight: .bold, design: .monospaced))
                                .foregroundColor(.barkcliAccentPurple)

                            StatusBadge(task.status.displayName, variant: task.status.badgeVariant)
                        }

                        Text(task.title)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    Spacer()

                    StatusBadge(task.priority.displayName, variant: taskPriorityVariant(task.priority))
                }

                if !task.description.isEmpty {
                    Text(task.description)
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)
                        .lineLimit(2)
                }

                if let agent = task.assignedAgent {
                    HStack(spacing: 5) {
                        Image(systemName: "person.crop.circle")
                            .font(.system(size: 11))
                        Text("Assigned to \(agent)")
                            .font(.system(size: 11))
                    }
                    .foregroundColor(.barkcliTextMuted)
                }

                HStack(spacing: 8) {
                    if task.status == .pending {
                        Button {
                            Task {
                                let agentId = agents.first?.id ?? "agent"
                                await appState.claimTask(taskId: task.id, agentId: agentId)
                            }
                        } label: {
                            Text("Claim")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Color.barkcliAccentPurple)
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }

                    if task.status.isActive {
                        Button {
                            Task {
                                await appState.completeTask(taskId: task.id, agentId: task.assignedAgent)
                            }
                        } label: {
                            Text("Complete")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Color.barkcliSuccessEmerald)
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                        .buttonStyle(.plain)

                        Button {
                            Task {
                                await appState.failTask(taskId: task.id, agentId: task.assignedAgent, error: "Task failed acceptance gate")
                            }
                        } label: {
                            Text("Fail")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Color.barkcliDangerRose)
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }

                    Spacer()
                }
            }
        }
    }

    private var orchestrationCycleCard: some View {
        GlassCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("ORCHESTRATION CYCLE")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.barkcliTextMuted)
                            .tracking(0.6)

                        Text("Autonomous scheduling engine")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    Spacer()

                    StatusBadge(
                        "Cycle \(appState.orchestrationStatus.cycleCount)",
                        variant: .neutral
                    )
                }

                Text("Triggers worktree assignment and evaluates passing gates.")
                    .font(.system(size: 12))
                    .foregroundColor(.barkcliTextMuted)

                ActionButton(
                    "Trigger Orchestration Cycle",
                    systemImage: "arrow.triangle.2.circlepath",
                    variant: .primary,
                    isLoading: isRunningCycle
                ) {
                    Task {
                        isRunningCycle = true
                        await appState.runOrchestrationCycle()
                        isRunningCycle = false
                    }
                }
            }
        }
    }

    private func taskPriorityVariant(_ priority: TaskPriority) -> StatusBadgeVariant {
        switch priority {
        case .critical:
            return .danger
        case .high:
            return .warning
        case .medium:
            return .accent
        case .low:
            return .neutral
        }
    }
}
