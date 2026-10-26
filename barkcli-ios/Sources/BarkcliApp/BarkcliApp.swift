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
        #endif
    }
}
