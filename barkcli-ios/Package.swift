// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Barkcli",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "BarkcliKit",
            targets: ["Barkcli"]
        ),
        .executable(
            name: "BarkcliApp",
            targets: ["BarkcliApp"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "Barkcli",
            dependencies: [],
            path: "Sources/Barkcli"
        ),
        .executableTarget(
            name: "BarkcliApp",
            dependencies: ["Barkcli"],
            path: "Sources/BarkcliApp"
        ),
        .testTarget(
            name: "BarkcliTests",
            dependencies: ["Barkcli"],
            path: "Tests/BarkcliTests"
        )
    ]
)
