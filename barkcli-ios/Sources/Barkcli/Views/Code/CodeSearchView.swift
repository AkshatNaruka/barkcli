import SwiftUI

public struct CodeSearchView: View {
    @Environment(CodeStore.self) private var codeStore

    @State private var selectedCardLinkTarget: String = ""
    @State private var linkingSymbolId: String? = nil

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            searchHeaderBar
            Divider().overlay(Color.barkcliBorder)

            filterToolbar
            Divider().overlay(Color.barkcliBorder)

            ScrollView {
                VStack(spacing: 12) {
                    if codeStore.filteredSymbols.isEmpty {
                        emptyState
                    } else {
                        ForEach(codeStore.filteredSymbols) { symbol in
                            symbolCard(symbol)
                        }
                    }
                }
                .padding(16)
            }
        }
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .task {
            if codeStore.symbols.isEmpty {
                await codeStore.search()
            }
        }
    }

    private var searchHeaderBar: some View {
        HStack(spacing: 12) {
            Image(systemName: "curlybraces")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.barkcliTextSecondary)

            TextField("Search symbols, functions, types, and files...", text: Binding(
                get: { codeStore.searchQuery },
                set: {
                    codeStore.searchQuery = $0
                    Task { await codeStore.search() }
                }
            ))
            .textFieldStyle(.plain)
            .font(.system(size: 13, design: .monospaced))
            .foregroundColor(.barkcliTextPrimary)

            if !codeStore.searchQuery.isEmpty {
                Button {
                    codeStore.searchQuery = ""
                    Task { await codeStore.search() }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.barkcliTextMuted)
                }
                .buttonStyle(.plain)
            }

            Spacer()

            StatusBadge(
                "\(codeStore.filteredSymbols.count) symbols",
                variant: .neutral
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.barkcliCardBackground)
    }

    private var filterToolbar: some View {
        HStack(spacing: 8) {
            Text("Language:")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(.barkcliTextMuted)

            filterButton("All", isSelected: codeStore.selectedLanguage == nil) {
                codeStore.selectedLanguage = nil
            }

            ForEach(codeStore.availableLanguages, id: \.self) { lang in
                filterButton(lang, isSelected: codeStore.selectedLanguage == lang) {
                    codeStore.selectedLanguage = lang
                }
            }

            Spacer()

            if let kind = codeStore.selectedKind {
                StatusBadge("kind: \(kind)", variant: .accent)
            }
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

    private func symbolCard(_ symbol: CodeSymbol) -> some View {
        GlassCard(cornerRadius: 6, padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    kindIcon(symbol.kind)

                    Text(symbol.name)
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundColor(.barkcliTextPrimary)

                    StatusBadge(symbol.kind, variant: .neutral)

                    Spacer()

                    StatusBadge(symbol.language, variant: .accent)
                }

                HStack(spacing: 6) {
                    Image(systemName: "folder")
                        .font(.system(size: 10))
                        .foregroundColor(.barkcliTextMuted)

                    Text("\(symbol.filePath):\(symbol.line)")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.barkcliTextSecondary)

                    Spacer()

                    if let cardId = symbol.linkedCardId {
                        HStack(spacing: 4) {
                            Image(systemName: "link")
                                .font(.system(size: 9))
                            Text("card: \(cardId)")
                                .font(.system(size: 10, weight: .medium, design: .monospaced))
                        }
                        .foregroundColor(.barkcliStatusActive)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.barkcliStatusActive.opacity(0.1))
                        .overlay(
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .strokeBorder(Color.barkcliStatusActive.opacity(0.3), lineWidth: 1)
                        )
                    } else {
                        Button {
                            linkingSymbolId = symbol.id
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "plus")
                                    .font(.system(size: 9))
                                Text("Link Card")
                                    .font(.system(size: 10, design: .monospaced))
                            }
                            .foregroundColor(.barkcliTextMuted)
                        }
                        .buttonStyle(.plain)
                    }
                }

                if let doc = symbol.documentation {
                    Text(doc)
                        .font(.system(size: 11))
                        .foregroundColor(.barkcliTextMuted)
                        .padding(.top, 2)
                }

                if linkingSymbolId == symbol.id {
                    HStack(spacing: 8) {
                        TextField("Enter card ID e.g. fix checkout", text: $selectedCardLinkTarget)
                            .textFieldStyle(.plain)
                            .font(.system(size: 11, design: .monospaced))
                            .padding(6)
                            .background(Color.barkcliCardSubtle)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                            )

                        ActionButton("Link", variant: .primary) {
                            Task {
                                try? await codeStore.linkSymbolToCard(
                                    symbolId: symbol.id,
                                    cardId: selectedCardLinkTarget
                                )
                                linkingSymbolId = nil
                                selectedCardLinkTarget = ""
                            }
                        }
                        .frame(width: 60)

                        ActionButton("Cancel", variant: .secondary) {
                            linkingSymbolId = nil
                            selectedCardLinkTarget = ""
                        }
                        .frame(width: 70)
                    }
                    .padding(.top, 4)
                }
            }
        }
    }

    private func kindIcon(_ kind: String) -> some View {
        let name: String
        switch kind.lowercased() {
        case "function":
            name = "function"
        case "struct":
            name = "square.stack.3d.down.right"
        case "class":
            name = "cube"
        case "protocol":
            name = "shield"
        default:
            name = "number"
        }
        return Image(systemName: name)
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.barkcliTextSecondary)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 28))
                .foregroundColor(.barkcliTextMuted)

            Text("No symbols match query")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.barkcliTextPrimary)

            Text("Try searching for functions structs or file paths across the workspace")
                .font(.system(size: 12))
                .foregroundColor(.barkcliTextMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
    }
}
