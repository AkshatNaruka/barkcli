# Ultimate Agentic Harness: Execution Timeline, In-Thread Reviews, & E2E Testing

> **Goal:** Elevate barkcli into the premier management layer for AI agents, surpassing benchmarks like DeepSeek Harness by introducing a real-time visual Gantt execution timeline (Input / Model / Tools / Test Gate), rich in-thread diff review cards with 1-click merge approvals, and an exhaustive end-to-end prompt testing matrix.

**Architecture:**
- **Telemetry (`barkcli-core` & `barkcli-server`)**: Collect microsecond-precision trace spans across run phases (`Input`, `Model`, `Tool`, `Gate`) and stream them via Server-Sent Events.
- **Frontend (`web/src/`)**: Introduce `ExecutionTimeline.tsx` (multi-lane Gantt chart) and `RunReviewCard.tsx` (inline worktree review with diffs and acceptance test receipts).
- **Desktop (`desktop/`)**: Refresh the bundled macOS app dist and verify full bundle parity via `verify-app.sh`.
- **Harness Verification**: Automated end-to-end prompt test matrix covering feature build, bug fix with failed gate retry, no-op gate rejection, and parallel pool merge trains.

---

### Task 1: Trace & Span Telemetry Model (`barkcli-core` & `barkcli-server`)

**Files:**
- Create: `barkcli-core/src/agent/trace.rs`
- Modify: `barkcli-core/src/agent/mod.rs`
- Modify: `barkcli-core/src/agent/runner.rs`
- Modify: `barkcli-server/src/routes/runs.rs`
- Test: `barkcli-core/src/agent/trace.rs` (unit tests)

**Step 1: Write the failing unit tests for trace and spans**
- Test span duration calculation, phase classification (`input`, `model`, `tool`, `gate`), and chronological ordering.
- Test JSON serialization matches web contract.

**Step 2: Implement `TraceSpan` and `RunTrace` in `barkcli-core`**
```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SpanPhase {
    Input,
    Model,
    Tool,
    Gate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceSpan {
    pub id: String,
    pub phase: SpanPhase,
    pub label: String,
    pub detail: Option<String>,
    pub start_ms: u64,
    pub duration_ms: u64,
    pub status: String, // "running", "success", "failed"
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RunTrace {
    pub run_id: String,
    pub spans: Vec<TraceSpan>,
    pub total_duration_ms: u64,
}
```

**Step 3: Instrument `runner.rs` to record spans**
- Record `SpanPhase::Input` during context packing.
- Record `SpanPhase::Model` during agent CLI invocation.
- Record `SpanPhase::Tool` when parsing tool invocations from agent transcript.
- Record `SpanPhase::Gate` during acceptance test execution (`cargo test`, etc.).

**Step 4: Run cargo tests to verify**
Run: `cargo test -p barkcli-core --lib agent::trace`
Expected: PASS.

---

### Task 2: DeepSeek-Style Visual Gantt Execution Timeline (`ExecutionTimeline.tsx`)

**Files:**
- Create: `web/src/components/ExecutionTimeline.tsx`
- Create: `web/src/components/ExecutionTimeline.test.tsx`
- Modify: `web/src/threads/ThreadPane.tsx`
- Modify: `web/src/shell/InspectorPane.tsx`

**Step 1: Write the failing Vitest tests**
- Test multi-lane rendering: `Input` (cyan), `Model` (violet/amber), `Tools` (blue/emerald), `Test Gate` (green/rose).
- Test summary metrics header calculation: total elapsed time, turns count, tool calls count.
- Test hover tooltips with span label, duration, and status.
- Test empty or in-progress trace states.

**Step 2: Implement `ExecutionTimeline.tsx`**
- Compute relative percentage widths based on total run duration.
- Render horizontal lanes with responsive SVG / styled divs.
- Provide interactive hover cards and click-to-filter/jump into transcript events.
- Match obsidian dark (`#07080B`) and warm caramel/amber palette (`#B8845C`, `#E5AA7A`).

**Step 3: Integrate into `ThreadPane.tsx` & `InspectorPane.tsx`**
- Mount `ExecutionTimeline` above active/completed runs in `ThreadPane`.
- Include full trace inspector in `InspectorPane`.

**Step 4: Run Vitest tests**
Run: `npm --prefix web test -- src/components/ExecutionTimeline.test.tsx --run`
Expected: PASS.

---

### Task 3: In-Thread Task & Diff Review Card (`RunReviewCard.tsx`)

**Files:**
- Create: `web/src/threads/RunReviewCard.tsx`
- Create: `web/src/threads/RunReviewCard.test.tsx`
- Modify: `web/src/threads/ThreadPane.tsx`

**Step 1: Write the failing Vitest tests**
- Test review card renders when a run completes with changed files.
- Test git branch pill, commit sha, and file count badges (`+X -Y`).
- Test expanding/collapsing embedded diff viewer ([`UnifiedDiff.tsx`](file:///Users/akshatnaruka/Downloads/.ses/barkcli/web/src/components/UnifiedDiff.tsx)).
- Test gate pass badge (`cargo test` exit 0, duration, test count).
- Test clicking `[Approve & Merge]` invokes `approveRun(run.id)`.

**Step 2: Implement `RunReviewCard.tsx`**
- Display clean card layout with warm caramel accent border.
- Embed `UnifiedDiff` with syntax highlighting and file jumping.
- Prominent acceptance gate verdict badge showing project tests passed in the isolated worktree.
- Action bar: `[Approve & Merge]` primary button and `[Reject]` secondary button.

**Step 3: Wire into `ThreadPane.tsx`**
- When `run_completed` or `approval_requested` event fires, render `RunReviewCard` directly in the message flow.

**Step 4: Run Vitest tests**
Run: `npm --prefix web test -- src/threads/RunReviewCard.test.tsx --run`
Expected: PASS.

---

### Task 4: macOS App Bundle Freshness & Parity Verification

**Files:**
- Script: `desktop/scripts/build-web.sh`
- Script: `desktop/scripts/build-macos-app.sh`
- Script: `desktop/scripts/verify-app.sh`

**Step 1: Rebuild web assets**
Run: `bash desktop/scripts/build-web.sh`

**Step 2: Refresh macOS bundle dist**
- Copy freshly compiled `web/dist` assets into `Bark.app/Contents/Resources/web/dist`.
- Ensure sidecar binary matches current release build.

**Step 3: Run verification script**
Run: `bash desktop/scripts/verify-app.sh`
Expected: All checks pass (`ok bundled UI matches web/dist`).

---

### Task 5: Comprehensive E2E Prompt Test Matrix Script

**Files:**
- Create: `desktop/scripts/e2e-prompt-matrix.sh`
- Make executable: `chmod +x desktop/scripts/e2e-prompt-matrix.sh`

**Step 1: Construct the 5-scenario test matrix**
1. **Scenario 1 (Feature Intent)**:
   - Natural language prompt: `"Add a health check endpoint at /api/health returning uptime"`
   - Verify isolated worktree creation (`.board/worktrees/`), code generation, and test gate execution.
2. **Scenario 2 (Bug Fix with Failed Gate Recovery)**:
   - Introduce a failing test assertion.
   - Run bug fix prompt.
   - Verify first gate fails (exit code != 0), verdict injects into prompt, agent fixes code, second gate passes.
3. **Scenario 3 (Cheating / No-Op Guard)**:
   - Prompt agent to simulate completion with 0 file changes.
   - Verify barkcli rejects the run as a no-op gate violation.
4. **Scenario 4 (Concurrent Parallel Pool & Merge Train)**:
   - Launch `--agents 3` on independent tasks simultaneously.
   - Verify separate worktrees, 30s heartbeat monitoring, and serial merge train integration without collisions.
5. **Scenario 5 (Native macOS App IPC)**:
   - Test Tauri command handlers (`open_project_dialog`, `switch_project`, `open_terminal`, `notify`).

**Step 2: Execute E2E Prompt Matrix**
Run: `bash desktop/scripts/e2e-prompt-matrix.sh`
Expected: All 5 scenarios report `OK`.

---

### Verification Checklist
- [ ] `cargo test --workspace` passes (509+ tests).
- [ ] `npm --prefix web test -- --run` passes (all test suites).
- [ ] `bash desktop/scripts/verify-app.sh` passes 100%.
- [ ] `bash desktop/scripts/e2e-prompt-matrix.sh` passes all 5 scenarios.
