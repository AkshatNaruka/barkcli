# E2E Test Infra: barkcli-ios

## Test Philosophy
- Opaque-box, requirement-driven. Derived from ORIGINAL_REQUEST.md and PROJECT.md § Feature Inventory.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.
- Framework: Native Swift XCTest / Testing suite in `barkcli-ios/Tests/BarkcliTests/`.
- Execution: `swift test --package-path /Users/akshatnaruka/Downloads/.ses/barkcli/barkcli-ios` or Xcode test target.

## Feature Inventory & Test Mapping
| # | Feature | Requirement | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Interactions) | Tier 4 (Workloads) |
|---|---------|-------------|:-----------------:|:-----------------:|:---------------------:|:------------------:|
| 1 | Serde & Model Parity | R2, R4 | 5 cases | 5 cases | Pairwise with stores | Model roundtrip |
| 2 | Bundled Sample Workspaces | R3 | 5 cases | 5 cases | Pairwise with UI | Full offline walk |
| 3 | Stateful Mock API Engine | R3 | 5 cases | 5 cases | Pairwise with network | Mutation simulation |
| 4 | Uniform API Client Protocol | R1, R3 | 5 cases | 5 cases | Live vs Mock switch | Protocol conformance |
| 5 | Live HTTP & WebSocket Client | R1 | 5 cases | 5 cases | Auth token injection | Reconnect stream |
| 6 | Daemon Discovery & Health | R1 | 5 cases | 5 cases | Timeout & port probe | Discovery lifecycle |
| 7 | Workspace Auto-Initialization | R1 | 5 cases | 5 cases | Missing vs present | Auto-setup dispatch |
| 8 | Codex Dark-Mode Theme Tokens | R2 | 5 cases | 5 cases | Color contrast | Style consistency |
| 9 | Liquid Glass UI Modifiers | R2 | 5 cases | 5 cases | OS fallback bounds | Rendering bounds |
| 10 | Dynamic Mind Dashboard | R2, AGENTS.md | 5 cases | 5 cases | Empty vs full metrics | Decision deck flow |
| 11 | Interactive Kanban Board View | R2 | 5 cases | 5 cases | Column WIP bounds | Drag & move cards |
| 12 | Card Detail & Inspector Sheet | R2 | 5 cases | 5 cases | Nil optional fields | Comment & checklist |
| 13 | Agents Fleet Orchestration View | R2, AGENTS.md | 5 cases | 5 cases | 0 to N agents | Cycle dispatch |
| 14 | Real-time Runner Sessions | R4 | 5 cases | 5 cases | Heartbeat staleness | Gate stream update |
| 15 | Specs Matrix & Traceability | R2 | 5 cases | 5 cases | 0% to 100% coverage | Code/task linking |
| 16 | Git History & Codex Diff View | R2 | 5 cases | 5 cases | Empty git vs DAG | Diff parser & CTA |
| 17 | Floating Intent Input Bar | R4 | 5 cases | 5 cases | Whitespace & bounds | Prompt submission |
| 18 | Plan Proposal Review & Approval | R4 | 5 cases | 5 cases | Approve / Reject | Slices decomposition |
| 19 | Workspace Switcher & Status Bar | R1, R3 | 5 cases | 5 cases | Switching states | Multi-instance |
| 20 | E2E Acceptance Integration | All | 5 cases | 5 cases | Full pipeline | End-to-end user loop |

## Test Architecture
- Test runner: `swift test --package-path barkcli-ios`
- Test files located in `barkcli-ios/Tests/BarkcliTests/`:
  - `ModelTests.swift`: Tier 1 & 2 model serialization, validation, and boundaries.
  - `MockClientTests.swift`: Tier 1, 2 & 3 mock engine and `APIClientProtocol` state transitions.
  - `StoreTests.swift`: Tier 1, 2 & 3 observable store mutations, health tracking, and intent workflows.
  - `E2EFlowTests.swift`: Tier 3 & 4 real-world user scenarios (offline navigation, intent to plan approval, agent cycle, workspace switching).

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Cold Start Offline Demo Walkthrough | F2, F3, F8, F9, F10, F11, F19 | High |
| 2 | Intent Prompt to Plan Approval & Task Enqueue | F1, F3, F10, F17, F18, F13 | High |
| 3 | Card Column Move & Checklist Update | F1, F3, F11, F12 | Medium |
| 4 | Fleet Orchestration Cycle & Runner Session Stream | F1, F3, F13, F14 | High |
| 5 | Workspace Switcher & Live Reconnect Transition | F4, F5, F6, F7, F19 | High |

## Coverage Thresholds
- Tier 1: Comprehensive feature coverage across all 20 features.
- Tier 2: Boundary value and edge case tests.
- Tier 3: Cross-feature interaction tests.
- Tier 4: Real-world application scenarios.
- Acceptance Target: 100% passing tests with zero compiler warnings or runtime errors.
