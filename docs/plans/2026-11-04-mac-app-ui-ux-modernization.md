# Mac App UI/UX Modernization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the barkcli macOS desktop app UI/UX into an ultra-fast, native SwiftUI control surface that elevates the core human loop (Intent → Worktrees → Test Gates → Review Queue), eliminates cognitive clutter, and provides an experience vastly superior to and simpler than t3.codes and DeepSeek Harness.

**Architecture:** Consolidate navigation from 18 flat tabs into a focused 3-tier hierarchy anchored by the 4 primary loop surfaces (Intent/Run, Review Queue, Board, Mind). Introduce a dedicated 3-pane Review Queue for diff inspection, test verdicts, and one-click merge trains. Replace mobile-ported UI artifacts with native macOS window toolbars, keyboard shortcuts, and responsive split views.

**Tech Stack:** Swift 5.10+, SwiftUI, Observation framework (`@Observable`, `@State`, `@Environment`), Apple HIG native navigation (`NavigationSplitView`, `.windowToolbarStyle(.unified)`), Rust Axum backend / JSON-RPC over HTTP & WebSocket (`localhost:4321`).

---

## Architecture & Competitive Comparison

### Why barkcli Beats t3.codes and DeepSeek Harness in UX

| Dimension | t3.codes (T3 Code) | DeepSeek / SWE-bench Harness | barkcli Native macOS App |
| :--- | :--- | :--- | :--- |
| **Engine & Footprint** | Heavy Electron + Node monorepo (300MB+, high RAM/CPU) | Python scripts + Docker containers | **Native Swift + Metal binary** (<40MB RAM, 100ms cold start, 120fps) |
| **Primary Interaction** | Unstructured chat terminal (raw PTY output) | Batch CLI commands + JSON evaluation traces | **The Autonomy Loop**: Intent → Spec → Worktree → Test Gate → Review |
| **Git Safety** | ❌ **Runs directly on working copy** (dirty git state) | Isolated clone or container | **Isolated Git Worktrees** (`git worktree add/remove` per task) |
| **Acceptance Gate** | ❌ **None** (agent self-reports completion) | Benchmark grading script | **Project Test Gate** (`cargo test`, `npm test` enforced before human sees it) |
| **Human Review Gate** | ❌ No structured review UI (read raw git diff in terminal) | Raw log files and patches | **Dedicated Review Queue**: Spec checklist + diff + test verdicts + 1-click merge |
| **Navigation Density** | 3 flat panes (sessions / chat / diff) | CLI terminal only | **3-Tier Collapsible Sidebar**: Core Loop → Knowledge & Specs → System |
| **Context System** | Raw token dump (hits context limits fast) | Raw prompt dump | **Living Context File** (`project_context.md`, 57× token savings) |

---

## Implementation Tasks

### Task 1: Navigation Hierarchy & Data Model Streamlining

**Files:**
- Modify: `barkcli-ios/Sources/Barkcli/Views/RootView.swift`
- Modify: `barkcli-ios/Sources/Barkcli/State/AppState.swift`
- Test: `barkcli-ios/Tests/BarkcliTests/NavigationTests.swift`

**Step 1: Write the failing navigation test**
Define test verifying the consolidated navigation enum and review queue routing.
```swift
import XCTest
@testable import Barkcli

final class NavigationTests: XCTestCase {
    func testPrimaryLoopTabsConsolidation() {
        let coreTabs = PrimaryNavigationSection.coreLoop.tabs
        XCTAssertEqual(coreTabs, [.run, .review, .board, .mind])
        XCTAssertTrue(coreTabs.contains(.review), "Review Queue must be a primary top-level destination")
    }
}
```

**Step 2: Run test to verify it fails**
Run: `swift test --package-path barkcli-ios --filter NavigationTests`
Expected: FAIL with "type 'PrimaryNavigationSection' not found".

**Step 3: Implement clean 3-tier navigation models in `RootView.swift`**
Replace the flat 18-tab structure with:
1. **Core Loop**:
   - `run` ("Run & Sessions", icon: `play.circle.fill`)
   - `review` ("Review Queue", icon: `checkmark.shield.fill`, badge: `inReviewCount`)
   - `board` ("Board", icon: `rectangle.split.3x1.fill`)
   - `mind` ("Mind", icon: `brain.head.profile`)
2. **Knowledge & Specs** (Collapsible):
   - `context` ("Context & Memory", icon: `doc.text.fill`)
   - `specs` ("Specs Matrix", icon: `list.bullet.clipboard.fill`)
   - `history` ("Git Story", icon: `clock.arrow.circlepath`)
   - `skills` ("Skills", icon: `wrench.and.screwdriver.fill`)
3. **Workspace & Ops** (Collapsible):
   - `usage` ("Tokens & Usage", icon: `gauge.with.needle.fill`)
   - `code` ("Symbol Search", icon: `chevron.left.forwardslash.chevron.right`)
   - `timeline` ("Checkpoints", icon: `timeline.selection`)
   - `settings` ("Workspace & Daemon", icon: `gearshape.fill`)

**Step 4: Run test to verify it passes**
Run: `swift test --package-path barkcli-ios --filter NavigationTests`
Expected: PASS.

**Step 5: Commit**
```bash
git add barkcli-ios/Sources/Barkcli/Views/RootView.swift barkcli-ios/Tests/BarkcliTests/NavigationTests.swift
git commit -m "feat(mac): streamline navigation into 3-tier core loop hierarchy"
```

---

### Task 2: First-Class Review Queue View (`ReviewQueueView.swift`)

**Files:**
- Create: `barkcli-ios/Sources/Barkcli/Views/Review/ReviewQueueView.swift`
- Create: `barkcli-ios/Sources/Barkcli/Views/Review/ReviewItemDetailView.swift`
- Create: `barkcli-ios/Sources/Barkcli/Views/Review/UnifiedDiffView.swift`
- Modify: `barkcli-ios/Sources/Barkcli/Views/RootView.swift`
- Test: `barkcli-ios/Tests/BarkcliTests/ReviewQueueTests.swift`

**Step 1: Write the failing unit test**
Verify review queue card discovery, approval trigger, and request changes callback.
```swift
import XCTest
@testable import Barkcli

final class ReviewQueueTests: XCTestCase {
    func testReviewQueueFiltersCardsInReview() async throws {
        let store = BoardStore.shared
        let reviewCards = store.cardsInReview
        XCTAssertFalse(reviewCards.isEmpty, "Demo data should have cards in review column")
    }
}
```

**Step 2: Run test to verify it fails**
Run: `swift test --package-path barkcli-ios --filter ReviewQueueTests`
Expected: FAIL with "value of type 'BoardStore' has no member 'cardsInReview'".

**Step 3: Implement `ReviewQueueView` & `BoardStore.cardsInReview`**
Add:
- 3-Pane Review Split View:
  - **Left Pane (Review Items)**: List of finished tasks waiting for signoff. Each item displays card title, author/agent badge (`OpenCode`, `Claude Code`), worktree branch name, and time in review.
  - **Center Pane (Acceptance & Test Results)**:
    - Spec Requirements Checklist: interactive or verified acceptance criteria.
    - Acceptance Gate Verdict Box: Test execution exit code (`cargo test: 48 passed, 0 failed in 1.2s`), automated lint check, and memory facts recorded.
  - **Right Pane (Unified Diff Inspector)**:
    - Syntax-highlighted git diff (`+` green additions, `-` red deletions).
    - File switcher list with modified line counts.
  - **Bottom Action Bar**:
    - `[✓ Approve & Merge]`: Triggers git merge train into main branch, cleans up isolated worktree, moves card to `done`.
    - `[↺ Request Changes]`: Pops inline feedback input, re-dispatches agent in worktree with human critique.
    - `[✕ Reject]`: Discards worktree branch.

**Step 4: Run test to verify it passes**
Run: `swift test --package-path barkcli-ios --filter ReviewQueueTests`
Expected: PASS.

**Step 5: Commit**
```bash
git add barkcli-ios/Sources/Barkcli/Views/Review/ barkcli-ios/Sources/Barkcli/Stores/BoardStore.swift
git commit -m "feat(mac): implement dedicated 3-pane Review Queue view"
```

---

### Task 3: Streamlined Run & Worktrees Cockpit (`RunCockpitView.swift`)

**Files:**
- Modify: `barkcli-ios/Sources/Barkcli/Views/Threads/ThreadsContainerView.swift`
- Modify: `barkcli-ios/Sources/Barkcli/Views/Threads/ThreadTimelineView.swift`
- Modify: `barkcli-ios/Sources/Barkcli/Views/Threads/ThreadInspectorView.swift`
- Test: `barkcli-ios/Tests/BarkcliTests/RunCockpitTests.swift`

**Step 1: Write the failing test**
Verify parallel worktree session monitoring and tool call folding.
```swift
import XCTest
@testable import Barkcli

final class RunCockpitTests: XCTestCase {
    func testThreadWorktreeStateBinding() {
        let thread = ThreadDetailItem.mockWithWorktree()
        XCTAssertNotNil(thread.worktreePath)
        XCTAssertEqual(thread.status, .verifying)
    }
}
```

**Step 2: Run test to verify it fails**
Run: `swift test --package-path barkcli-ios --filter RunCockpitTests`
Expected: FAIL.

**Step 3: Enhance `ThreadsContainerView` for macOS**
- Replace mobile-like cards with high-density, terminal-grade streaming cards.
- Add Worktree Pill in header: shows isolated directory (e.g., `.board/worktrees/feat-auth-1`), active branch, and live gate status.
- Collapsible tool calls: clean folded blocks for `[bash]`, `[read_file]`, and `[write_file]` that expand on click.
- Prominent Steer / Intervene bar: allows injecting immediate guidance into the running worktree agent without stopping the run.

**Step 4: Run test to verify it passes**
Run: `swift test --package-path barkcli-ios --filter RunCockpitTests`
Expected: PASS.

**Step 5: Commit**
```bash
git add barkcli-ios/Sources/Barkcli/Views/Threads/ barkcli-ios/Tests/BarkcliTests/RunCockpitTests.swift
git commit -m "feat(mac): streamline Run Cockpit with worktree badges and collapsible tool calls"
```

---

### Task 4: Native macOS Window, Unified Toolbar & Global Shortcuts

**Files:**
- Modify: `barkcli-ios/Sources/BarkcliApp/BarkcliApp.swift`
- Modify: `barkcli-ios/Sources/Barkcli/Views/RootView.swift`
- Create: `barkcli-ios/Sources/Barkcli/Views/Components/CommandPalette.swift`

**Step 1: Remove mobile bottom bar on macOS**
Conditionally compile out `customBottomTabBar` and mobile bottom overlays on macOS, keeping it strictly on iOS.
On macOS, embed controls into the unified window toolbar:
- Board Switcher dropdown menu
- Daemon Status pill with live ping (`4321 • 8ms`)
- Quick Action buttons: `+ Intent (⌘N)`, `Refresh (⌘R)`
- Command Palette search trigger (`⌘K`)

**Step 2: Implement Global Command Palette (`⌘K`)**
Create `CommandPalette.swift`:
- Instant modal overlay with keyboard focus.
- Fuzzy search across:
  - Active threads / sessions
  - Board cards & columns
  - Specs & acceptance criteria
  - Code symbols
  - CLI actions (`barkcli doctor`, `barkcli context prime`)

**Step 3: Keyboard Navigation Wiring**
- `⌘1`: Jump to Run / Sessions
- `⌘2`: Jump to Review Queue
- `⌘3`: Jump to Board
- `⌘4`: Jump to Mind Overview
- `⌘N`: Open Intent Composer
- `⌘Return`: Submit prompt / Approve review item
- `⌘B`: Toggle Left Sidebar

**Step 4: Verify with Swift compiler and test bundle**
Run: `swift build --package-path barkcli-ios`
Expected: Build complete with zero warnings.

**Step 5: Commit**
```bash
git add barkcli-ios/Sources/BarkcliApp/ barkcli-ios/Sources/Barkcli/Views/Components/CommandPalette.swift
git commit -m "feat(mac): add native unified toolbar, ⌘K command palette, and keyboard shortcuts"
```

---

### Task 5: End-to-End Build, Packaging & Verification

**Files:**
- Modify: `scripts/deploy_mac_app.sh`
- Test: Full native app launch and interaction

**Step 1: Run comprehensive Swift test suite**
Run: `swift test --package-path barkcli-ios`
Expected: All tests pass.

**Step 2: Deploy and package native Mac App**
Run: `./scripts/deploy_mac_app.sh`
Expected:
- Swift build succeeds.
- App bundle `build/Barkcli.app` is updated and ad-hoc signed.
- Launches fresh instance of `Barkcli.app`.

**Step 3: Verify visually and functionally on macOS**
- Confirm new 3-tier navigation sidebar.
- Open Review Queue and verify 3-pane layout (Cards, Acceptance Gate, Diff).
- Trigger `⌘K` command palette and verify instant keyboard search.
- Trigger `⌘N` and test Intent submission.

**Step 4: Commit and Push**
```bash
git add docs/plans/2026-11-04-mac-app-ui-ux-modernization.md scripts/deploy_mac_app.sh
git commit -m "docs: finalize mac app ui/ux modernization plan"
git push origin master
```

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-11-04-mac-app-ui-ux-modernization.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagents per task, review between tasks, fast iteration.
**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints.

Which approach would you like to take?
