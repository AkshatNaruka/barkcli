import SwiftUI

public struct SkillsRegistryView: View {
    @Environment(SkillsStore.self) private var skillsStore

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            headerBar
            Divider().overlay(Color.barkcliBorder)

            filterToolbar
            Divider().overlay(Color.barkcliBorder)

            ScrollView {
                VStack(spacing: 12) {
                    skillsGrid
                }
                .padding(16)
            }
        }
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .task {
            if skillsStore.skills.isEmpty {
                await skillsStore.loadSkills()
            }
        }
    }

    private var headerBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text("Skills Registry")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    StatusBadge("\(skillsStore.installedCount) installed", variant: .success)
                    StatusBadge("\(skillsStore.skills.count) available", variant: .neutral)
                }

                Text("Specialized agent capability modules matching prompt intents")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            }

            Spacer()

            TextField("Search skills...", text: Binding(
                get: { skillsStore.searchQuery },
                set: { skillsStore.searchQuery = $0 }
            ))
            .textFieldStyle(.plain)
            .font(.system(size: 12, design: .monospaced))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Color.barkcliCardSubtle)
            .overlay(
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .strokeBorder(Color.barkcliBorder, lineWidth: 1)
            )
            .frame(width: 200)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.barkcliCardBackground)
    }

    private var filterToolbar: some View {
        HStack(spacing: 8) {
            Text("Tag:")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(.barkcliTextMuted)

            tagFilterButton("All", isSelected: skillsStore.selectedTag == nil) {
                skillsStore.selectedTag = nil
            }

            ForEach(skillsStore.availableTags, id: \.self) { tag in
                tagFilterButton(tag, isSelected: skillsStore.selectedTag == tag) {
                    skillsStore.selectedTag = tag
                }
            }

            Spacer()

            Toggle(isOn: Binding(
                get: { skillsStore.showInstalledOnly },
                set: { skillsStore.showInstalledOnly = $0 }
            )) {
                Text("Installed only")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundColor(.barkcliTextMuted)
            }
            .toggleStyle(.checkbox)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.barkcliCardSubtle)
    }

    private func tagFilterButton(_ label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
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

    private var skillsGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 300, maximum: 480), spacing: 12)], spacing: 12) {
            ForEach(skillsStore.filteredSkills) { skill in
                skillCard(skill)
            }
        }
    }

    private func skillCard(_ skill: Skill) -> some View {
        GlassCard(cornerRadius: 6, padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(skill.installed ? Color.barkcliStatusActive : Color.barkcliTextMuted)
                            .frame(width: 6, height: 6)

                        Text(skill.name)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    Spacer()

                    StatusBadge(skill.installed ? "ACTIVE" : "READY", variant: skill.installed ? .success : .neutral)
                }

                Text(skill.description)
                    .font(.system(size: 12))
                    .foregroundColor(.barkcliTextSecondary)
                    .lineLimit(2)

                HStack(spacing: 4) {
                    ForEach(skill.tags, id: \.self) { tag in
                        Text("#\(tag)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color.barkcliCardSubtle)
                            .overlay(
                                RoundedRectangle(cornerRadius: 3, style: .continuous)
                                    .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                            )
                    }

                    Spacer()

                    ActionButton(
                        skill.installed ? "Uninstall" : "Install",
                        variant: skill.installed ? .secondary : .primary
                    ) {
                        Task {
                            await skillsStore.toggleInstall(skillId: skill.id)
                        }
                    }
                    .frame(width: 90)
                }
            }
        }
    }
}
