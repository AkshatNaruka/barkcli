import SwiftUI
import Barkcli

@main
public struct BarkcliApp: App {
    @State private var appState = AppState.shared

    public init() {}

    public var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .tint(Color.barkcliTextPrimary)
                .accentColor(Color.barkcliTextPrimary)
                #if os(macOS)
                .frame(minWidth: 960, minHeight: 640)
                #endif
        }
        #if os(macOS)
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified(showsTitle: true))
        .defaultSize(width: 1240, height: 800)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Intent...") {
                    NotificationCenter.default.post(name: .barkcliOpenIntent, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }
            CommandMenu("Navigate") {
                Button("Run & Sessions") {
                    NotificationCenter.default.post(name: .barkcliNavigateTab, object: AppNavigationTab.run)
                }
                .keyboardShortcut("1", modifiers: .command)

                Button("Review Queue") {
                    NotificationCenter.default.post(name: .barkcliNavigateTab, object: AppNavigationTab.review)
                }
                .keyboardShortcut("2", modifiers: .command)

                Button("Board") {
                    NotificationCenter.default.post(name: .barkcliNavigateTab, object: AppNavigationTab.board)
                }
                .keyboardShortcut("3", modifiers: .command)

                Button("Mind Overview") {
                    NotificationCenter.default.post(name: .barkcliNavigateTab, object: AppNavigationTab.mind)
                }
                .keyboardShortcut("4", modifiers: .command)

                Divider()

                Button("Command Palette...") {
                    NotificationCenter.default.post(name: .barkcliOpenCommandPalette, object: nil)
                }
                .keyboardShortcut("k", modifiers: .command)
            }
        }
        #endif
    }
}
