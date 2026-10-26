import SwiftUI

public struct CalendarAgendaView: View {
    @Environment(CalendarStore.self) private var calendarStore

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            headerBar
            Divider().overlay(Color.barkcliBorder)

            filterToolbar
            Divider().overlay(Color.barkcliBorder)

            ScrollView {
                VStack(spacing: 16) {
                    agendaSummaryDeck

                    if !calendarStore.overdueItems.isEmpty && (calendarStore.selectedFilter == nil || calendarStore.selectedFilter == "overdue") {
                        agendaSection("Overdue Milestones", items: calendarStore.overdueItems, color: .barkcliStatusError)
                    }

                    if !calendarStore.todayItems.isEmpty && (calendarStore.selectedFilter == nil || calendarStore.selectedFilter == "today") {
                        agendaSection("Due Today", items: calendarStore.todayItems, color: .barkcliStatusWarning)
                    }

                    if !calendarStore.upcomingItems.isEmpty && (calendarStore.selectedFilter == nil || calendarStore.selectedFilter == "upcoming") {
                        agendaSection("Upcoming Horizons", items: calendarStore.upcomingItems, color: .barkcliStatusActive)
                    }
                }
                .padding(16)
            }
        }
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .task {
            if calendarStore.agendaItems.isEmpty {
                await calendarStore.loadAgenda()
            }
        }
    }

    private var headerBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text("Calendar Agenda")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    StatusBadge("\(calendarStore.agendaItems.count) milestones", variant: .accent)
                }

                Text("Time boundaries overdue items and task delivery deadlines")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            }

            Spacer()

            TextField("Search agenda...", text: Binding(
                get: { calendarStore.searchQuery },
                set: { calendarStore.searchQuery = $0 }
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
            Text("Filter:")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(.barkcliTextMuted)

            filterButton("All", isSelected: calendarStore.selectedFilter == nil) {
                calendarStore.selectedFilter = nil
            }
            filterButton("Overdue (\(calendarStore.overdueItems.count))", isSelected: calendarStore.selectedFilter == "overdue") {
                calendarStore.selectedFilter = "overdue"
            }
            filterButton("Today (\(calendarStore.todayItems.count))", isSelected: calendarStore.selectedFilter == "today") {
                calendarStore.selectedFilter = "today"
            }
            filterButton("Upcoming (\(calendarStore.upcomingItems.count))", isSelected: calendarStore.selectedFilter == "upcoming") {
                calendarStore.selectedFilter = "upcoming"
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.barkcliCardSubtle)
    }

    private func filterButton(_ label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
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

    private var agendaSummaryDeck: some View {
        HStack(spacing: 12) {
            MetricTile(
                title: "Overdue",
                value: "\(calendarStore.overdueItems.count)",
                subtitle: "Requires attention",
                systemImage: "exclamationmark.triangle",
                accentColor: .barkcliStatusError
            )

            MetricTile(
                title: "Due Today",
                value: "\(calendarStore.todayItems.count)",
                subtitle: "Active focus",
                systemImage: "clock",
                accentColor: .barkcliStatusWarning
            )

            MetricTile(
                title: "Upcoming",
                value: "\(calendarStore.upcomingItems.count)",
                subtitle: "Next 14 days",
                systemImage: "calendar.badge.clock",
                accentColor: .barkcliStatusActive
            )
        }
    }

    private func agendaSection(_ title: String, items: [AgendaItem], color: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle()
                    .fill(color)
                    .frame(width: 6, height: 6)

                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                StatusBadge("\(items.count)", variant: .neutral)
            }

            ForEach(items) { item in
                agendaRow(item, dotColor: color)
            }
        }
    }

    private func agendaRow(_ item: AgendaItem, dotColor: Color) -> some View {
        GlassCard(cornerRadius: 6, padding: 12) {
            HStack(spacing: 12) {
                Circle()
                    .fill(dotColor)
                    .frame(width: 6, height: 6)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(item.title)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)

                        StatusBadge("card: \(item.cardId)", variant: .neutral)
                    }

                    HStack(spacing: 8) {
                        StatusBadge(item.column.uppercased(), variant: .accent)

                        Text("priority: \(item.priority.displayName)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)
                    }
                }

                Spacer()

                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                        .font(.system(size: 10))
                        .foregroundColor(.barkcliTextMuted)

                    Text(formattedDate(item.dueDate))
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundColor(dotColor)
                }
            }
        }
    }

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy MM dd"
        return formatter.string(from: date)
    }
}
