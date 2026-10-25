import SwiftUI
import Barkcli

@main
public struct BarkcliApp: App {
    @State private var appState = AppState.shared

    public init() {}

    public var body: some Scene {
        WindowGroup {
            MainView()
                .environment(appState)
                .preferredColorScheme(.dark)
        }
    }
}
