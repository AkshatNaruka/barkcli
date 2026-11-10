# Implementation Plan: Bark Threads Work Like T3 (End-to-End)

## Overview
Make Bark's thread system work end-to-end for any project: from prompt input, through planning, worktree acquisition, agent execution with artifacts, acceptance gate, merge, and completion reporting. UI should follow Bark's T3-inspired design (graphite, minimal, progressive disclosure). Projects are saved in settings and threads can be initialized for any saved project.

## Architecture Decisions
- **Project binding**: RunService/RuntimeService/RuntimeStore accept an optional `project_root` override. When a thread's project_root differs from the server's current root, execution switches context to that project (desktop: restart sidecar; web: cross-root execution via project_root param).
- **Saved projects**: Durable registry in desktop app state + server API, separate from transient recents.
- **Thread lifecycle**: Prompt → plan → worktree → execute → artifacts → gate → merge → report, all using the thread's project_root.
- **UI**: Thread details with progress/steps/timings in a single Details control; VS Code-inspired status bars; inspector stable/resizable.

## Phase 1: Execution respects thread's project_root (CRITICAL)
- [ ] Task 1: Add `from_project_root(path)` to RuntimeStore, RuntimeService, RunService
- [ ] Task 2: Update server start_thread_build handler to extract project_root from thread and use it
- [ ] Task 3: Update server start_thread_chat handler similarly
- [ ] Task 4: Update run_cmd.rs to accept project_root override
- [ ] Checkpoint: cargo test + manual verification

## Phase 2: Saved projects registry
- [ ] Task 5: Desktop app state: saved projects (add/remove/reorder) in app.json
- [ ] Task 6: Tauri commands for saved projects
- [ ] Task 7: Server API: GET/POST/DELETE /api/projects/saved
- [ ] Task 8: Settings UI: Projects section
- [ ] Task 9: Composer: use saved projects in picker
- [ ] Checkpoint: web tests + build + desktop verification

## Phase 3: Thread lifecycle UI completeness
- [ ] Task 10: Thread details: merge steps/progress/timings into single Details control
- [ ] Task 11: VS Code-inspired thread status bar (already partially done)
- [ ] Task 12: Global status bar VS Code-inspired (already done)
- [ ] Task 13: Artifacts display in inspector during/after run
- [ ] Checkpoint: web tests + build

## Phase 4: Full lifecycle verification
- [ ] Task 14: End-to-end test: prompt → plan → worktree → execute → gate → merge → report
- [ ] Task 15: Fix any issues found
- [ ] Task 16: Rebuild/install desktop app + push

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Cross-project execution complexity | High | Use project_root param in RunService; desktop switches context |
| Gate failures in nested worktrees | Med | Already fixed (doc-only skip + better tails) |
| Large scope | High | Phase by phase, verify each checkpoint |

## Open Questions
- Should "Open folder…" in composer auto-save to saved projects? (default: yes, with option)
- Where should Projects live in nav? (default: Settings or Projects dashboard)