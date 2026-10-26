import SwiftUI

public struct BrainGraphView: View {
    @Environment(BrainStore.self) private var brainStore

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            headerBar
            Divider().overlay(Color.barkcliBorder)

            categoryToolbar
            Divider().overlay(Color.barkcliBorder)

            HSplitView {
                nodesListPane
                    .frame(minWidth: 320, maxWidth: .infinity)

                inspectorPane
                    .frame(minWidth: 280, maxWidth: 360)
            }
        }
        .background(Color.barkcliCanvas.ignoresSafeArea())
        .task {
            if brainStore.graph.nodes.isEmpty {
                await brainStore.loadGraph()
            }
        }
    }

    private var headerBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text("Brain Knowledge Graph")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.barkcliTextPrimary)

                    StatusBadge("\(brainStore.graph.nodes.count) concepts", variant: .accent)
                    StatusBadge("\(brainStore.graph.edges.count) relations", variant: .neutral)
                }

                Text("Extracted ontology concepts degree centrality ranks and connections")
                    .font(.system(size: 11))
                    .foregroundColor(.barkcliTextMuted)
            }

            Spacer()

            TextField("Search concepts...", text: Binding(
                get: { brainStore.searchQuery },
                set: { brainStore.searchQuery = $0 }
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

    private var categoryToolbar: some View {
        HStack(spacing: 8) {
            Text("Category:")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(.barkcliTextMuted)

            categoryButton("All", isSelected: brainStore.selectedCategory == nil) {
                brainStore.selectedCategory = nil
            }

            ForEach(brainStore.categories, id: \.self) { cat in
                categoryButton(cat, isSelected: brainStore.selectedCategory == cat) {
                    brainStore.selectedCategory = cat
                }
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.barkcliCardSubtle)
    }

    private func categoryButton(_ label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
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

    private var nodesListPane: some View {
        ScrollView {
            VStack(spacing: 8) {
                ForEach(brainStore.filteredNodes) { node in
                    let isSelected = brainStore.selectedNodeId == node.id
                    Button {
                        brainStore.selectedNodeId = node.id
                    } label: {
                        GlassCard(cornerRadius: 6, padding: 10, borderColor: isSelected ? .barkcliBorderFocus : .barkcliBorder) {
                            HStack(spacing: 12) {
                                Circle()
                                    .fill(categoryColor(node.category))
                                    .frame(width: 6, height: 6)

                                VStack(alignment: .leading, spacing: 3) {
                                    Text(node.label)
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.barkcliTextPrimary)

                                    HStack(spacing: 6) {
                                        StatusBadge(node.category, variant: .neutral)
                                        Text("degree: \(node.degree)")
                                            .font(.system(size: 10, design: .monospaced))
                                            .foregroundColor(.barkcliTextMuted)
                                    }
                                }

                                Spacer()

                                Text("\(Int(node.importance * 100))%")
                                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                                    .foregroundColor(.barkcliTextSecondary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
    }

    private var inspectorPane: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let node = brainStore.selectedNode {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Circle()
                            .fill(categoryColor(node.category))
                            .frame(width: 8, height: 8)
                        Text(node.label)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.barkcliTextPrimary)
                    }

                    StatusBadge(node.category, variant: .accent)
                }

                Divider().overlay(Color.barkcliBorder)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Relations")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(.barkcliTextMuted)

                    let relatedEdges = brainStore.edgesForNode(node.id)
                    if relatedEdges.isEmpty {
                        Text("No direct relations recorded")
                            .font(.system(size: 11))
                            .foregroundColor(.barkcliTextMuted)
                    } else {
                        ForEach(relatedEdges) { edge in
                            GlassCard(cornerRadius: 4, padding: 8) {
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack {
                                        Text(edge.relation)
                                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                            .foregroundColor(.barkcliStatusActive)
                                        Spacer()
                                        Text("weight: \(String(format: "%.1f", edge.weight))")
                                            .font(.system(size: 9, design: .monospaced))
                                            .foregroundColor(.barkcliTextMuted)
                                    }

                                    let targetLabel = brainStore.graph.nodes.first(where: {
                                        $0.id == (edge.sourceId == node.id ? edge.targetId : edge.sourceId)
                                    })?.label ?? "unknown"

                                    Text(targetLabel)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(.barkcliTextPrimary)
                                }
                            }
                        }
                    }
                }

                Spacer()
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "cursorarrow.click.2")
                        .font(.system(size: 24))
                        .foregroundColor(.barkcliTextMuted)
                    Text("Select a concept node to inspect relations")
                        .font(.system(size: 12))
                        .foregroundColor(.barkcliTextMuted)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .padding(16)
        .background(Color.barkcliCardBackground)
    }

    private func categoryColor(_ cat: String) -> Color {
        switch cat.lowercased() {
        case "autonomy":
            return .barkcliStatusActive
        case "isolation":
            return .barkcliStatusWarning
        case "verification":
            return .barkcliStatusInfo
        case "git":
            return .barkcliTextSecondary
        default:
            return .barkcliTextMuted
        }
    }
}
