import SwiftUI

public struct UnifiedDiffView: View {
    public let diffText: String
    public let filesChanged: [String]

    public init(diffText: String, filesChanged: [String] = []) {
        self.diffText = diffText
        self.filesChanged = filesChanged
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header with files count
            if !filesChanged.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "doc.badge.gearshape")
                        .font(.system(size: 11))
                        .foregroundColor(.barkcliTextMuted)
                    Text("\(filesChanged.count) files changed")
                        .font(.barkcliCodeHash)
                        .foregroundColor(.barkcliTextSecondary)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.barkcliCardBackground)
                .overlay(
                    Rectangle()
                        .frame(height: 1)
                        .foregroundColor(Color.barkcliBorder),
                    alignment: .bottom
                )
            }

            // Monospace Diff Lines
            ScrollView([.horizontal, .vertical]) {
                VStack(alignment: .leading, spacing: 2) {
                    if diffText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("No file changes detected or diff clean.")
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(.barkcliTextMuted)
                            .padding(16)
                    } else {
                        ForEach(Array(diffText.components(separatedBy: "\n").enumerated()), id: \.offset) { index, line in
                            diffLine(line: line, lineNumber: index + 1)
                        }
                    }
                }
                .padding(12)
            }
            .background(Color.barkcliCanvas)
        }
    }

    @ViewBuilder
    private func diffLine(line: String, lineNumber: Int) -> some View {
        let isAddition = line.hasPrefix("+") && !line.hasPrefix("+++")
        let isDeletion = line.hasPrefix("-") && !line.hasPrefix("---")
        let isHunk = line.hasPrefix("@@")
        let isHeader = line.hasPrefix("diff ") || line.hasPrefix("index ") || line.hasPrefix("---") || line.hasPrefix("+++")

        HStack(alignment: .top, spacing: 8) {
            Text("\(lineNumber)")
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.barkcliTextMuted.opacity(0.6))
                .frame(width: 32, alignment: .trailing)

            Text(line)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(
                    isAddition ? Color.green :
                    isDeletion ? Color.red :
                    isHunk ? Color.barkcliAccent :
                    isHeader ? Color.barkcliTextPrimary.opacity(0.8) :
                    Color.barkcliTextSecondary
                )
                .lineLimit(nil)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
        .padding(.vertical, 1)
        .background(
            isAddition ? Color.green.opacity(0.08) :
            isDeletion ? Color.red.opacity(0.08) :
            isHunk ? Color.barkcliAccent.opacity(0.05) :
            Color.clear
        )
    }
}
