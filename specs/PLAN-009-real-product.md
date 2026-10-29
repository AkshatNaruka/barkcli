# PLAN-009 — Real product implementation plan

> Phase by phase. Each phase ends with a verification command and a commit.
> Keep `project_context.md` untouched; it has a pre-existing user change.

**Spec:** `specs/SPEC-009-real-product.md`
**Branch:** `feat/real-product`

## Phase 1 — Truthful shell and project lifecycle

**Core/server**

- Add `GET /api/project` (root, name, board dir, boards, active board, git
  state, context state, setup state, counts).
- Add `GET /api/hooks` and `POST /api/hooks/install`; refactor the hooks
  command into reusable functions.
- Add `POST /api/project/init-git` (explicit confirmation) for non-git folders.
- Add automatic onboarding on desktop launch and a `barkcli serve --onboard`
  path (server-side idempotent; failures are reported, not fatal).

**Web**

- New `WorkspaceView`: project identity, setup checklist, provider readiness,
  quick actions, recent activity, “Open folder”, “Initialize Git”.
- Add Context and History tabs; replace the duplicated Workspace/Context view.
- Fix the duplicate tab `onClick`.
- Add Tauri bridge (`withGlobalTauri`) plus `open`, `switch`, `recent`,
  `reveal` commands and a capability file.
- Hard-off demo/replay in Tauri; remove synthetic assistant/provider fallbacks.

**Verify**

```bash
cargo test -p barkcli-core -p barkcli-server
cd web && npm test && npm run build
cd ../desktop && cargo test
```

Commit: `feat(project): real workspace, folder switching, and automatic setup`

## Phase 2 — Providers, authentication, and models

- Extend `ProviderStatus` with auth fields and real probes.
- Add `GET /api/providers/{id}/models`.
- Add desktop terminal-login command for allowlisted providers.
- Use live providers/models in New Intent, ThreadPane, TeamView, Settings.
- Show “not installed”, “needs sign-in”, and “ready” states.

**Verify**

```bash
cargo test -p barkcli-core -p barkcli-server
cd web && npm test && npm run build
```

Commit: `feat(providers): authenticated local agents and model selection`

## Phase 3 — Skills, agents, and delegation

- Add skills to create-thread/run payloads and persist `skill:<id>` labels.
- Merge profile skills into the run context.
- Add skill pickers to New Intent and ThreadPane; add “Attach to chat/agent”
  actions.
- Add the built-in role gallery, custom profile multi-select, and readiness.
- Add the Board delegate panel and navigate to the thread after dispatch.

**Verify**

```bash
cargo test -p barkcli-core -p barkcli-server
cd web && npm test && npm run build
```

Commit: `feat(agents): attach skills and delegate board work for real`

## Phase 4 — Living brain loop

- Store prompt on `RunRecord`; append one session per terminal run.
- Deduplicate run sessions; feed memory ingest and context digest.
- Surface last brain update/session counts in Workspace and Brain.
- Test success, gate failure, interruption, and duplicate prevention.

**Verify**

```bash
cargo test -p barkcli-core -p barkcli-server
cd web && npm test && npm run build
```

Commit: `feat(brain): learn from every completed app run`

## Phase 5 — Onboarding, Operations, and hardening

- Finalize the setup pipeline and AI plan-first analysis prompt.
- Make Agent API show live local connection details.
- Verify every Operations tab against real endpoints and empty states.
- Add web/API tests for project setup, provider states, skills, delegation.
- Rebuild `Bark.app`; run `verify-app.sh`, `smoke-app.sh`, and a manual launch.
- Update docs/README and spec table.

**Verify**

```bash
cargo test --workspace
cd web && npm test && npm run build
cd ../barkcli-ios && swift test
bash desktop/scripts/build-macos-app.sh
bash desktop/scripts/verify-app.sh
bash desktop/scripts/smoke-app.sh
```

Commit: `docs(release): verify the real product surface`

## Risks

- **Tauri remote IPC.** The window loads `http://127.0.0.1`; the capability
  must allow the remote origin. If the bridge is unavailable, the Workspace
  shows the browser fallback instead of pretending switching works.
- **Sidecar restart race.** Stop the old child, wait for the port, then start
  the new one; if it fails, restart the previous project and report the error.
- **Automatic setup time.** Digest/scan can be slow on large repos. Run setup
  asynchronously on launch and keep the UI usable; every step is re-runnable.
- **Hook install side effects.** Hooks are written only after the user opens a
  project; they are idempotent and removable.
- **No user data loss.** Setup never deletes cards, specs, memory, or context.
