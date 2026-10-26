# barkcli for Apple Platforms

Native Swift client and developer interface for `barkcli`, the management layer for AI agents.

Designed for iOS 17 and macOS 14 using Swift 6, SwiftUI, and the modern Observation framework.

## Positioning

barkcli is the management layer for AI agents (intent in, plans out, isolated worktrees, tests as the gate, and a merge train for whatever passes).

## Architectural Overview

The application features a clean dual engine architecture designed for high performance and offline evaluation:

* **Presentation Layer**: Built completely in SwiftUI using a dark mode aesthetic inspired by Codex and modern developer platforms. Features liquid glass cards, animated progress meters, and glowing status pills.
* **State Management**: Centralized reactive state in `AppState` using Swift 6 `@Observable`. Ensures fine grained view evaluations without SwiftUI refresh bottlenecks.
* **Dual Runtime Engine**:
  * **Live Engine**: Connects to any local or remote `barkcli` daemon via HTTP REST endpoints and live WebSocket events at `/ws`.
  * **Demo Store**: Comprehensive in memory simulation dataset mirroring `web/src/lib/demo.ts`. Enables instant evaluation of all features without running a server daemon.
* **Autonomous Agent Orchestration**: Real time runner monitoring with heartbeats, autonomous plan proposals with human approval gates, and multi worktree lifecycle tracking.
* **Git History Visualizer**: Commit tree viewer with additions and deletions metrics, unified diff inspections, and one tap task assignment directly to AI agents.
* **Living Context Integration**: Displays health metrics, active blockers with intelligent resolution hints, and sprint velocity.

## Repository Layout

```
barkcli-ios/
├── Package.swift                    # Swift 6 package manifest
├── Sources/
│   └── Barkcli/
│       ├── BarkcliApp.swift         # SwiftUI app entry point
│       ├── Models/                  # Domain models (Board, Card, Agent, Task, Spec, etc.)
│       ├── Services/
│       │   ├── APIClient.swift      # URLSession async client for barkcli daemon REST APIs
│       │   ├── WebSocketClient.swift# Real time WebSocket client with auto reconnect
│       │   └── DemoStore.swift      # Offline simulation engine and sample data
│       ├── State/
│       │   └── AppState.swift       # Central @Observable application state container
│       ├── Theme/
│       │   ├── Colors.swift         # Semantic dark palette (monochrome xAI palette, emerald, amber)
│       │   └── Components.swift     # GlassCard, MetricTile, StatusBadge, ActionButton
│       └── Views/
│           ├── MainView.swift       # Shell with liquid glass header and bottom navigation
│           ├── Mind/                # Health score meter, velocity tiles, blocker hints
│           ├── Board/               # Column switcher, priority filters, card details
│           ├── Orchestrate/         # Agent fleet roster, live runners, plan review
│           ├── History/             # Git commit log, diff inspector, agent task assignment
│           ├── Specs/               # Requirements traceability and verification matrix
│           └── Settings/            # Server endpoint configuration and demo mode toggle
└── Tests/
    └── BarkcliTests/
        └── BarkcliTests.swift       # Unit tests for models, serialization, and state
```

## Getting Started

### Prerequisites

* macOS 14 Sonoma or macOS 15 Sequoia
* Xcode 15 or Xcode 16 with Swift 6 support
* iOS 17 or iOS 18 Simulator or physical device

### Building with Swift Package Manager

Build the package directly from the command line:

```bash
cd barkcli-ios
swift build
```

Run the unit test suite:

```bash
cd barkcli-ios
swift test
```

### Opening in Xcode

Open the package in Xcode to run on iOS Simulator or connected physical devices:

```bash
cd barkcli-ios
open Package.swift
```

Select the `BarkcliApp` target, pick an iOS Simulator (such as iPhone 16 Pro), and press Run (`Cmd + R`).

## Core Views

### 1. Mind
Displays project health at a glance with a circular progress meter, active WIP warnings, and blockers. Each blocker evaluates prerequisite card states and provides actionable guidance for unblocking.

### 2. Board
Provides column navigation across Todo, Doing, Review, and Done. Supports fast priority filtering, text search, effort point chips, assignee badges, checklist progress, and detailed card editing.

### 3. Orchestrate
The command center for your agent workforce. Features a floating intent intake bar, pending plan proposal reviews with approve and reject actions, live runner session tiles with heartbeat indicators, and an agent fleet roster.

### 4. History
Shows recent git commits with branch selection and code changes metrics. Tapping any commit opens a unified diff inspector with syntax styling, alongside a quick action to dispatch an agent task from that commit.

### 5. Specs
A requirements traceability view displaying total coverage percentages and status indicators (Pending, In Progress, Implemented, Verified) with linked code paths.

### 6. Settings
Configures the connection to your local or remote `barkcli` server daemon (`http://localhost:4321` by default) with ping connectivity tests and an offline demo mode switch.
