import SwiftUI

public struct ReviewItemDetailView: View {
    public let card: Card
    public let onApprove: () -> Void
    public let onRequestChanges: (String) -> Void
    public let onReject: () -> Void

    @State private var showFeedbackSheet: Bool = false
    @State private var feedbackText: String = ""
    @State private var isRunningTestGate: Bool = false
    @State private var testGateStatus: String = "48 passed; 0 failed; 0 ignored (1.2s)"
    @State private var mockDiff: String = """
diff --git a/src/auth/middleware.rs b/src/auth/middleware.rs
index 4b825dc..f891b20 100644
--- a/src/auth/middleware.rs
+++ b/src/auth/middleware.rs
@@ -42,6 +42,18 @@ pub async fn verify_token_gate(
+    // Rate limiting check per client IP
+    if let Some(client_ip) = req.headers().get("X-Forwarded-For") {
+        let bucket = RATE_LIMITER.get_bucket(client_ip);
+        if !bucket.try_acquire(1) {
+            return Err(AuthError::RateLimitExceeded);
+        }
+    }
+
     let claims = decode_jwt(&raw_token)?;
     req.extensions_mut().insert(claims);
     Ok(next.run(req).await)
"""

    public init(
        card: Card,
        onApprove: @escaping () -> Void,
        onRequestChanges: @escaping (String) -> Void,
        onReject: @escaping () -> Void
    ) {
        self.card = card
        self.onApprove = onApprove
        self.onRequestChanges = onRequestChanges
        self.onReject = onReject
    }

    public var body: some View {
        VStack(spacing: 0) {
            headerBar

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Spec & Criteria checklist
                    criteriaSection

                    // Test Acceptance Gate Box
                    testGateSection

                    // Diff Inspection
                    diffSection
                }
                .padding(20)
            }

            // Bottom Action Bar
            actionBar
        }
        .background(Color.barkcliCanvas)
        .sheet(isPresented: $showFeedbackSheet) {
            feedbackSheet
        }
    }

    private var headerBar: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(card.id)
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(.barkcliTextMuted)

                    Text(card.priority.rawValue.uppercased())
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(priorityColor(card.priority))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(priorityColor(card.priority).opacity(0.12))
                        .clipShape(Capsule())

                    if let specId = card.specId {
                        HStack(spacing: 4) {
                            Image(systemName: "link")
                                .font(.system(size: 9))
                            Text(specId)
                                .font(.system(size: 9, weight: .semibold))
                        }
                        .foregroundColor(.barkcliAccent)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.barkcliAccent.opacity(0.1))
                        .clipShape(Capsule())
                    }
                }

                Text(card.title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                if let desc = card.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 13))
                        .foregroundColor(.barkcliTextSecondary)
                }
            }

            Spacer()
        }
        .padding(16)
        .background(Color.barkcliCardBackground)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.barkcliBorder),
            alignment: .bottom
        )
    }

    private var criteriaSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "checklist")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.barkcliAccent)
                Text("Acceptance Criteria Gate")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                Spacer()
                Text("Verified by tester agent")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.barkcliStatusActive)
            }

            VStack(alignment: .leading, spacing: 8) {
                checkRow("Isolated worktree tests pass without regressions", checked: true)
                checkRow("Code conforms to spec and architectural boundaries", checked: true)
                checkRow("Zero unhandled edge cases or memory leaks", checked: true)
            }
            .padding(12)
            .background(Color.barkcliCardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Color.barkcliBorder, lineWidth: 1)
            )
        }
    }

    private func checkRow(_ text: String, checked: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: checked ? "checkmark.circle.fill" : "circle")
                .foregroundColor(checked ? .barkcliStatusActive : .barkcliTextMuted)
                .font(.system(size: 13))
            Text(text)
                .font(.system(size: 12))
                .foregroundColor(.barkcliTextPrimary)
            Spacer()
        }
    }

    private var testGateSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.shield.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.barkcliStatusActive)
                Text("Acceptance Test Gate Verdict")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                Spacer()
                Text("Gate: Passing (exit 0)")
                    .font(.barkcliCodeHash)
                    .foregroundColor(.barkcliStatusActive)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("$ cargo test --all")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundColor(.barkcliTextPrimary)
                    Spacer()
                    if isRunningTestGate {
                        ProgressView().controlSize(.small)
                    } else {
                        Button {
                            Task {
                                isRunningTestGate = true
                                try? await Task.sleep(nanoseconds: 800_000_000)
                                isRunningTestGate = false
                            }
                        } label: {
                            Text("Re-run Gate")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.barkcliAccent)
                        }
                        .buttonStyle(.plain)
                    }
                }

                Text(testGateStatus)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.barkcliStatusActive)
            }
            .padding(12)
            .background(Color.black.opacity(0.4))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Color.barkcliStatusActive.opacity(0.3), lineWidth: 1)
            )
        }
    }

    private var diffSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "arrow.triangle.branch")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.barkcliAccent)
                Text("Unified Git Diff")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)
                Spacer()
                Text("+12 / -0 lines")
                    .font(.barkcliCodeHash)
                    .foregroundColor(.green)
            }

            UnifiedDiffView(diffText: mockDiff, filesChanged: ["src/auth/middleware.rs"])
                .frame(minHeight: 220)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                )
        }
    }

    private var actionBar: some View {
        HStack(spacing: 12) {
            Button(action: onReject) {
                HStack(spacing: 5) {
                    Image(systemName: "xmark")
                    Text("Reject")
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.red)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color.red.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)

            Spacer()

            Button {
                showFeedbackSheet = true
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "arrow.counterclockwise")
                    Text("Request Changes")
                }
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.barkcliTextPrimary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color.barkcliCardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)

            Button(action: onApprove) {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark")
                    Text("Approve & Merge")
                }
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.black)
                .padding(.horizontal, 18)
                .padding(.vertical, 8)
                .background(Color.barkcliAccent)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .background(Color.barkcliCardBackground)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.barkcliBorder),
            alignment: .top
        )
    }

    private var feedbackSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("Request Changes from Agent")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.barkcliTextPrimary)

                Text("Enter critique or required adjustments. barkcli will re-dispatch the agent in its isolated worktree with your feedback.")
                    .font(.system(size: 12))
                    .foregroundColor(.barkcliTextSecondary)

                TextEditor(text: $feedbackText)
                    .font(.system(size: 12, design: .monospaced))
                    .padding(8)
                    .background(Color.barkcliCanvas)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .strokeBorder(Color.barkcliBorder, lineWidth: 1)
                    )
                    .frame(height: 140)

                HStack {
                    Button("Cancel") {
                        showFeedbackSheet = false
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(.barkcliTextMuted)

                    Spacer()

                    Button {
                        let text = feedbackText
                        showFeedbackSheet = false
                        onRequestChanges(text)
                    } label: {
                        Text("Re-dispatch with Critique")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 6)
                            .background(Color.barkcliAccent)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(feedbackText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(20)
            .background(Color.barkcliCardBackground)
        }
        .frame(width: 480, height: 280)
    }

    private func priorityColor(_ priority: Priority) -> Color {
        switch priority {
        case .critical: return .red
        case .high: return .orange
        case .medium: return .yellow
        case .low: return .green
        }
    }
}
