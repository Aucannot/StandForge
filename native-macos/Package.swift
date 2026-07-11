// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "StandForgeMac",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(name: "StandForgeMac", targets: ["StandForgeMac"])
    ],
    targets: [
        .executableTarget(
            name: "StandForgeMac",
            path: "Sources/StandForgeMac"
        ),
        .testTarget(
            name: "StandForgeMacTests",
            dependencies: ["StandForgeMac"]
        )
    ]
)
