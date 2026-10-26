import SwiftUI

public struct ThreadListView: View {
    @Bindable var store: ThreadStore
    var onNewIntent: () -> Void

    public init(store: ThreadStore, onNewIntent: @escaping () -> Void) {
        self.store = store
        self.onNewIntent = onNewIntent
    }

    public var body: some View {
        VStack(spacing: 0) {
            headerBar
            searchBar
            contentList
        }
        .background(Color.barkcliCardBackground)
    }

    private var headerBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "tray.fill")
                .font(.system(size: 14))
                .foregroundColor(.barkcliTextPrimary)

            Text("Inbox")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.barkcliTextPrimary)

            Spacer()

            Button(action: onNewIntent) {
                HStack(spacing: 4) {
                    Image(systemName: "plus")
                        .font(.system(size: 11, weight: .bold))
                    Text("New")
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundColor(.barkcliCanvas)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Color.barkcliTextPrimary)
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.barkcliBorder),
            alignment: .bottom
        )
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12))
                .foregroundColor(.barkcliTextMuted)

            Text("Filter threads and intents...")
                .font(.system(size: 12))
                .foregroundColor(.barkcliTextMuted)

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Color.barkcliCanvas)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(Color.barkcliBorder, lineWidth: 1)
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var contentList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if store.isLoading && store.threads.isEmpty {
                    VStack(spacing: 8) {
                        ProgressView()
                            .tint(.barkcliTextMuted)
                        Text("Loading threads...")
                            .font(.system(size: 12))
                            .foregroundColor(.barkcliTextMuted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 30)
                } else if store.threads.isEmpty {
                    welcomeCard
                } else {
                    if !store.needsYou.isEmpty {
                        sectionView(
                            title: "Needs you",
                            subtitle: "awaiting your approval",
                            items: store.needsYou,
                            dotColor: .barkcliStatusWarning
                        )
                    }

                    if !store.running.isEmpty {
                        sectionView(
                            title: "Running",
                            subtitle: "agents in isolated worktrees",
                            items: store.running,
                            dotColor: .barkcliTextPrimary
                        )
                    }

                    if !store.features.isEmpty {
                        sectionView(
                            title: "Features",
                            subtitle: "queued specifications",
                            items: store.features,
                            dotColor: .barkcliTextMuted
                        )
                    }

                    if !store.settled.isEmpty {
                        sectionView(
                            title: "Settled",
                            subtitle: "verified by test gates",
                            items: store.settled,
                            dotColor: .barkcliStatusActive
                        )
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    private var welcomeCard: some View {
        VStack(spacing: 10) {
            Image(systemName: "sparkles")
                .font(.system(size: 20))
                .foregroundColor(.barkcliTextPrimary)

            Text("Welcome to barkcli")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.barkcliTextPrimary)

            Text("barkcli is the management layer for AI agents. Enter your intent and let agents build it in isolated worktrees.")
                .font(.system(size: 11))
                .foregroundColor(.barkcliTextMuted)
                .multilineTextAlignment(.center)
                .lineSpacing(2)

            Button(action: onNewIntent) {
                Text("Start First Intent")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.barkcliCanvas)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(Color.barkcliTextPrimary)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(16)
        .background(Color.barkcliCardSubtle)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Color.barkcliBorder, lineWidth: 1)
        )
        .padding(.top, 20)
    }

    private func sectionView(
        title: String,
        subtitle: String,
        items: [ThreadSummaryItem],
        dotColor: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(title.uppercased())
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.barkcliTextMuted)
                    .tracking(0.6)

                Text("(\(subtitle))")
                    .font(.system(size: 9))
                    .foregroundColor(.barkcliTextMuted.opacity(0.8))

                Spacer()

                Text("\(items.count)")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.barkcliTextSecondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(Color.barkcliSurface)
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 4)

            ForEach(items) { item in
                threadRow(item: item, dotColor: dotColor)
            }
        }
    }

    private func threadRow(item: ThreadSummaryItem, dotColor: Color) -> some View {
        let isSelected = item.id == store.selectedThreadId

        return Button {
            Task {
                await store.selectThread(id: item.id)
            }
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .fill(dotColor)
                    .frame(width: 8, height: 8)
                    .padding(.top, 4)

                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title)
                        .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
                        .foregroundColor(isSelected ? .barkcliTextPrimary : .barkcliTextSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    HStack(spacing: 6) {
                        Text(item.id)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)

                        if let backend = item.backend {
                            Text(backend)
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(.barkcliTextSecondary)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Color.barkcliTagBackground)
                                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                        }

                        Spacer()

                        Text("\(item.eventCount) evts")
                            .font(.system(size: 9))
                            .foregroundColor(.barkcliTextMuted)
                    }
                }
            }
            .padding(10)
            .background(isSelected ? Color.barkcliCardSubtle : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(isSelected ? Color.barkcliBorderFocus : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
