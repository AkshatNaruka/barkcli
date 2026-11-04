import SwiftUI

public extension Notification.Name {
    static let barkcliOpenCommandPalette = Notification.Name("barkcliOpenCommandPalette")
    static let barkcliOpenIntent = Notification.Name("barkcliOpenIntent")
    static let barkcliNavigateTab = Notification.Name("barkcliNavigateTab")
}

public struct CommandPaletteItem: Identifiable {
    public let id: String
    public let title: String
    public let subtitle: String
    public let icon: String
    public let action: () -> Void

    public init(id: String = UUID().uuidString, title: String, subtitle: String, icon: String, action: @escaping () -> Void) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.action = action
    }
}

public struct CommandPaletteView: View {
    public let onSelectTab: (AppNavigationTab) -> Void
    public let onNewIntent: () -> Void
    public let onClose: () -> Void

    @State private var query: String = ""
    @FocusState private var isFieldFocused: Bool

    public init(
        onSelectTab: @escaping (AppNavigationTab) -> Void,
        onNewIntent: @escaping () -> Void,
        onClose: @escaping () -> Void
    ) {
        self.onSelectTab = onSelectTab
        self.onNewIntent = onNewIntent
        self.onClose = onClose
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Search Input Header
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14))
                    .foregroundColor(.barkcliTextMuted)

                TextField("Type a command, destination, or card search...", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .foregroundColor(.barkcliTextPrimary)
                    .focused($isFieldFocused)

                if !query.isEmpty {
                    Button {
                        query = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 12))
                            .foregroundColor(.barkcliTextMuted)
                    }
                    .buttonStyle(.plain)
                }

                Text("ESC to close")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.barkcliTextMuted)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Color.barkcliCardSubtle)
                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            }
            .padding(14)
            .background(Color.barkcliCardBackground)
            .overlay(
                Rectangle()
                    .frame(height: 1)
                    .foregroundColor(Color.barkcliBorder),
                alignment: .bottom
            )

            // Results List
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(filteredItems) { item in
                        Button {
                            onClose()
                            item.action()
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: item.icon)
                                    .font(.system(size: 14))
                                    .foregroundColor(.barkcliAccent)
                                    .frame(width: 20)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(.barkcliTextPrimary)

                                    Text(item.subtitle)
                                        .font(.system(size: 11))
                                        .foregroundColor(.barkcliTextMuted)
                                }

                                Spacer()

                                Image(systemName: "return")
                                    .font(.system(size: 10))
                                    .foregroundColor(.barkcliTextMuted)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.clear)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(8)
            }
        }
        .frame(width: 560, height: 360)
        .background(Color.barkcliCanvas)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Color.barkcliBorderFocus, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.5), radius: 24, y: 8)
        .onAppear {
            isFieldFocused = true
        }
    }

    private var allItems: [CommandPaletteItem] {
        let items: [CommandPaletteItem] = [
            CommandPaletteItem(
                title: "New Intent",
                subtitle: "State what you want built — dispatch to isolated worktrees",
                icon: "plus.circle.fill",
                action: onNewIntent
            ),
            CommandPaletteItem(
                title: "Jump to Run & Sessions",
                subtitle: "View active agent worktree runs and live streaming turns",
                icon: "play.circle.fill",
                action: { onSelectTab(.run) }
            ),
            CommandPaletteItem(
                title: "Jump to Review Queue",
                subtitle: "Inspect finished passing work, diffs, and 1-click merge",
                icon: "checkmark.shield.fill",
                action: { onSelectTab(.review) }
            ),
            CommandPaletteItem(
                title: "Jump to Board",
                subtitle: "View full Kanban board with spec_id links",
                icon: "rectangle.split.3x1.fill",
                action: { onSelectTab(.board) }
            ),
            CommandPaletteItem(
                title: "Jump to Mind Overview",
                subtitle: "Central command deck and health overview",
                icon: "brain.head.profile",
                action: { onSelectTab(.mind) }
            ),
            CommandPaletteItem(
                title: "View Context (project_context.md)",
                subtitle: "Living codebase digest with 57× token savings",
                icon: "doc.text.fill",
                action: { onSelectTab(.context) }
            ),
            CommandPaletteItem(
                title: "View Specs & Verification Matrix",
                subtitle: "Traceability from spec to card to code",
                icon: "list.bullet.clipboard.fill",
                action: { onSelectTab(.specs) }
            ),
            CommandPaletteItem(
                title: "Git Commit Story",
                subtitle: "Distill commits into AI feature bundles",
                icon: "clock.arrow.circlepath",
                action: { onSelectTab(.history) }
            ),
            CommandPaletteItem(
                title: "Agent Skills Registry",
                subtitle: "Install and manage remote agent skills",
                icon: "wrench.and.screwdriver.fill",
                action: { onSelectTab(.skills) }
            )
        ]
        return items
    }

    private var filteredItems: [CommandPaletteItem] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if q.isEmpty {
            return allItems
        }
        return allItems.filter {
            $0.title.lowercased().contains(q) || $0.subtitle.lowercased().contains(q)
        }
    }
}
