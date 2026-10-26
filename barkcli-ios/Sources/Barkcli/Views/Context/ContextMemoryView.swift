import SwiftUI

public struct ContextMemoryView: View {
    @Environment(ContextMemoryStore.self) private var contextStore

    @State private var selectedTab: Int = 0
    @State private var showingAddFactSheet: Bool = false
    @State private var newFactText: String = ""
    @State private var newFactCategory: String = "convention"

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            headerBar
            Divider().overlay(Color.barkcliBorder)

            subNavigation
            Divider().overlay(Color.barkcliBorder)

            ScrollView {
                VStack(spacing: 16) {
                    if selectedTab == 0 {
                        livingContextSection
                    } else if selectedTab == 1 {
                        memoryFactsSection
                    } else {
                        memoryTiersSection
                    }
                }
                .padding(16)
            }
        }
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .task {
            if contextStore.facts.isEmpty {
                await contextStore.loadAll()
            }
        }
        .sheet(isPresented: $showingAddFactSheet) {
            addFactModal
        }
    }

    private var headerBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text("Living Context and Memory")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    StatusBadge("project context", variant: .accent)
                }

                Text("Synchronized working memory facts and living context digests")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            }

            Spacer()

            ActionButton(
                "Refresh Digest",
                systemImage: "arrow.clockwise",
                variant: .secondary
            ) {
                Task {
                    await contextStore.refreshDigest()
                }
            }
            .frame(width: 140)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.barkcliCardBackground)
    }

    private var subNavigation: some View {
        HStack(spacing: 16) {
            tabButton("Context Digest", index: 0)
            tabButton("Project Facts (\(contextStore.facts.count))", index: 1)
            tabButton("Memory Tiers (\(contextStore.memories.count))", index: 2)

            Spacer()

            if selectedTab == 1 {
                ActionButton("Add Fact", systemImage: "plus", variant: .primary) {
                    showingAddFactSheet = true
                }
                .frame(width: 100)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.barkcliCardSubtle)
    }

    private func tabButton(_ title: String, index: Int) -> some View {
        Button {
            selectedTab = index
        } label: {
            Text(title)
                .font(.system(size: 12, weight: selectedTab == index ? .bold : .medium, design: .monospaced))
                .foregroundColor(selectedTab == index ? .barkcliTextPrimary : .barkcliTextMuted)
                .padding(.vertical, 4)
                .overlay(
                    Rectangle()
                        .fill(selectedTab == index ? Color.barkcliTextPrimary : Color.clear)
                        .frame(height: 2)
                        .padding(.top, 22),
                    alignment: .bottom
                )
        }
        .buttonStyle(.plain)
    }

    private var livingContextSection: some View {
        VStack(spacing: 14) {
            HStack(spacing: 12) {
                MetricTile(
                    title: "Tokens Used",
                    value: "\(contextStore.livingContext.tokensUsed)",
                    subtitle: "\(contextStore.livingContext.tokenBudget) budget limit",
                    systemImage: "number"
                )

                MetricTile(
                    title: "Digest Staleness",
                    value: "\(contextStore.livingContext.stalenessSeconds)s",
                    subtitle: "Auto refreshed via server daemon",
                    systemImage: "timer"
                )

                MetricTile(
                    title: "Sections",
                    value: "\(contextStore.livingContext.sections.count)",
                    subtitle: "Parsed markdown sections",
                    systemImage: "list.bullet.rectangle"
                )
            }

            VStack(alignment: .leading, spacing: 8) {
                SectionHeader(
                    "Context Sections",
                    subtitle: "Auto maintained context slices with provenance"
                )

                ForEach(contextStore.livingContext.sections) { sec in
                    GlassCard(cornerRadius: 6, padding: 12) {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(sec.title)
                                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                                    .foregroundColor(.barkcliTextPrimary)

                                if sec.isManual {
                                    StatusBadge("manual", variant: .accent)
                                }

                                Spacer()

                                if let staleness = sec.staleness {
                                    StatusBadge(staleness, variant: .success)
                                }
                            }

                            Text(sec.content)
                                .font(.system(size: 12))
                                .foregroundColor(.barkcliTextSecondary)
                        }
                    }
                }
            }
        }
    }

    private var memoryFactsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(
                "Permanent Project Facts",
                subtitle: "High confidence invariants injected into agent reasoning prompts",
                count: contextStore.filteredFacts.count
            )

            ForEach(contextStore.filteredFacts) { fact in
                GlassCard(cornerRadius: 6, padding: 12) {
                    HStack(spacing: 12) {
                        Circle()
                            .fill(Color.barkcliStatusActive)
                            .frame(width: 5, height: 5)

                        VStack(alignment: .leading, spacing: 4) {
                            Text(fact.fact)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.barkcliTextPrimary)

                            HStack(spacing: 8) {
                                StatusBadge(fact.category, variant: .neutral)

                                Text("confidence: \(Int(fact.confidence * 100))%")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundColor(.barkcliTextMuted)

                                if !fact.sources.isEmpty {
                                    Text("sources: \(fact.sources.joined(separator: ", "))")
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundColor(.barkcliTextMuted)
                                }
                            }
                        }

                        Spacer()
                    }
                }
            }
        }
    }

    private var memoryTiersSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                tierFilterButton("All", tier: nil)
                tierFilterButton("Working", tier: .working)
                tierFilterButton("Short Term", tier: .shortTerm)
                tierFilterButton("Long Term", tier: .longTerm)
                tierFilterButton("External", tier: .external)
            }

            VStack(spacing: 8) {
                ForEach(contextStore.filteredMemories) { mem in
                    GlassCard(cornerRadius: 6, padding: 12) {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                StatusBadge(mem.tier.displayName, variant: tierBadgeVariant(mem.tier))

                                Spacer()

                                Text("access: \(mem.accessCount)")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundColor(.barkcliTextMuted)
                            }

                            Text(mem.content)
                                .font(.system(size: 12))
                                .foregroundColor(.barkcliTextPrimary)

                            if !mem.tags.isEmpty {
                                HStack(spacing: 4) {
                                    ForEach(mem.tags, id: \.self) { tag in
                                        Text("#\(tag)")
                                            .font(.system(size: 10, design: .monospaced))
                                            .foregroundColor(.barkcliTextMuted)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func tierFilterButton(_ label: String, tier: MemoryTier?) -> some View {
        let isSelected = contextStore.selectedTier == tier
        return Button {
            contextStore.selectedTier = tier
        } label: {
            Text(label)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextMuted)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(isSelected ? Color.barkcliCardBackground : Color.clear)
                .overlay(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .strokeBorder(isSelected ? Color.barkcliBorder : Color.clear, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private func tierBadgeVariant(_ tier: MemoryTier) -> StatusBadgeVariant {
        switch tier {
        case .working:
            return .warning
        case .shortTerm:
            return .accent
        case .longTerm:
            return .success
        case .external:
            return .neutral
        }
    }

    private var addFactModal: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Add Project Fact")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                Spacer()
                Button {
                    showingAddFactSheet = false
                } label: {
                    Image(systemName: "xmark")
                        .foregroundColor(.barkcliTextMuted)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Fact")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.barkcliTextMuted)
                TextField("e.g. Tests serve as the gate before merge train", text: $newFactText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .padding(8)
                    .background(Color.barkcliCardSubtle)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                    )
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Category")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.barkcliTextMuted)
                TextField("convention, constraint, architecture", text: $newFactCategory)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .padding(8)
                    .background(Color.barkcliCardSubtle)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                    )
            }

            HStack(spacing: 12) {
                ActionButton("Cancel", variant: .secondary) {
                    showingAddFactSheet = false
                }

                ActionButton("Save Fact", variant: .primary) {
                    Task {
                        try? await contextStore.addFact(fact: newFactText, category: newFactCategory)
                        showingAddFactSheet = false
                        newFactText = ""
                    }
                }
            }
        }
        .padding(20)
        .frame(width: 400)
        .background(Color.barkcliCardBackground)
    }
}
