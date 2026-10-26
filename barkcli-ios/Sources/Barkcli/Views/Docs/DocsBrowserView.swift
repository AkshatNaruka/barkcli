import SwiftUI

public struct DocsBrowserView: View {
    @Environment(DocsStore.self) private var docsStore

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            headerBar
            Divider().overlay(Color.barkcliBorder)

            HSplitView {
                docListSidebar
                    .frame(minWidth: 260, maxWidth: 320)

                docContentPane
                    .frame(minWidth: 400, maxWidth: .infinity)
            }
        }
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .task {
            if docsStore.docs.isEmpty {
                await docsStore.loadDocs()
            }
        }
    }

    private var headerBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text("Documentation")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    StatusBadge("\(docsStore.docs.count) articles", variant: .neutral)
                }

                Text("Integrated architecture manuals and operator references")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            }

            Spacer()

            TextField("Search documentation...", text: Binding(
                get: { docsStore.searchQuery },
                set: { docsStore.searchQuery = $0 }
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

    private var docListSidebar: some View {
        ScrollView {
            VStack(spacing: 8) {
                ForEach(docsStore.filteredDocs) { doc in
                    let isSelected = docsStore.selectedDocId == doc.id
                    Button {
                        docsStore.selectedDocId = doc.id
                    } label: {
                        GlassCard(
                            cornerRadius: 6,
                            padding: 10,
                            borderColor: isSelected ? .barkcliBorderFocus : .barkcliBorder,
                            backgroundColor: isSelected ? Color.barkcliCardSubtle : Color.barkcliCardBackground
                        ) {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(doc.title)
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.barkcliTextPrimary)
                                    Spacer()
                                    StatusBadge(doc.category, variant: .neutral)
                                }

                                Text(doc.summary)
                                    .font(.system(size: 11))
                                    .foregroundColor(.barkcliTextMuted)
                                    .lineLimit(2)

                                Text(doc.path)
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundColor(.barkcliTextSecondary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(12)
        }
        .background(Color.barkcliCardBackground)
    }

    private var docContentPane: some View {
        ScrollView {
            if let doc = docsStore.selectedDoc {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            StatusBadge(doc.category, variant: .accent)
                            Spacer()
                            Text(doc.path)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.barkcliTextMuted)
                        }

                        Text(doc.title)
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)

                        Text(doc.summary)
                            .font(.system(size: 13))
                            .foregroundColor(.barkcliTextSecondary)
                    }

                    Divider().overlay(Color.barkcliBorder)

                    Text(doc.content)
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundColor(.barkcliTextPrimary)
                        .lineSpacing(4)
                }
                .padding(24)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "book")
                        .font(.system(size: 24))
                        .foregroundColor(.barkcliTextMuted)
                    Text("Select a document to read")
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(40)
            }
        }
    }
}
