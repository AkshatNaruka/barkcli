# Thread workflow verification — 2026-11-02

Source checkout: `fcfd2fd` plus the existing shared, uncommitted working tree. No commit was made in the application repository. The temporary Git projects used for acceptance tests are separate from it.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Web component/unit suite | 165 tests, 33 files passed | `/tmp/bark-thread-web-tests-final.log` |
| Rust workspace | 492 passed, one explicitly filtered license-dependent test | `/tmp/bark-thread-rust-tests-final.log` |
| CLI lifecycle focused regressions | 2 passed: Running precedes output, output precedes completion, Stop interrupts the actual child process | `/tmp/bark-thread-cli-lifecycle-tests.log` |
| Desktop tests | 4 passed, including native preference roundtrip and key restrictions | `/tmp/bark-thread-desktop-tests-final.log` |
| Production TypeScript/Vite and Mac bundle | Passed | `/tmp/bark-thread-mac-build-final.log` |
| Packaged app smoke | Passed, including minimal Finder-like PATH, bundled web assets, APIs, and sidecar shutdown | `/tmp/bark-thread-mac-smoke-final.log` |
| Installed app verification | Passed; UI matches workspace dist and signature verifies | `/tmp/bark-thread-installed-verify.log` |
| Sidebar destinations | All 21 tool links opened their respective content in the browser fixture; no role-alert errors were observed | Route regression: `web/src/shell/SidebarDestinations.test.tsx` |
| Fixture APIs | 40 checks passed: tool reads, Rules and Memory CRUD, thread creation/update/pin/fork/delete | `/tmp/bark-thread-api-results.json`; script `/tmp/bark-thread-api-qa.mjs` |
| Native restart | Unsent prompt and Ask choice restored after quit/relaunch on a different port; QA prompt cleared, Build restored | Observed in installed `/Applications/Bark.app`; durable preference file also checked |
| Diff hygiene | `git diff --check` passed | Shared checkout preserved |

Commands: `npm --prefix web test`, `cargo test --workspace -- --skip test_report_sprint_burndown`, `cargo test -p barkcli-core cli_`, `cargo test --manifest-path desktop/Cargo.toml`, `bash desktop/scripts/build-macos-app.sh`, `bash desktop/scripts/smoke-app.sh`, and `bash desktop/scripts/verify-app.sh /Applications/Bark.app`.

The two focused CLI tests are included in the core test inventory; the Stop regression was added and run after the broad workspace run. Do not add the counts together as unique tests. The last addition is test-only and does not change the packaged production implementation.

## Live provider acceptance

Fixture: `/private/tmp/bark-thread-fixture-kusi0u_g`, board `work`. Real Codex was selected in Bark's composer and used its CLI default model. No alternate provider was substituted.

1. First prompt requested `hello.txt` with exact bytes `hello from bark\n`. The isolated run wrote the file and passed the project gate.
2. A follow-up in that same thread requested `followup.txt` with exact bytes `second turn works\n` while keeping `hello.txt` unchanged. Bark created a fresh attempt from the previous work and included the conversation context.
3. Both exact byte sequences were checked from disk. The follow-up passed `npm test --silent` at head `3572a2f7c5c01484f7b19eb41d5aaf789e1e717a`; target/base was `098a4c7f27224b371ceab02ea90a436dbf72dde0`.
4. The final UI showed two cumulative changed files, both new assistant replies, Checks passed, an available Build action, and zero Stop buttons or role-alert errors. At the Mac minimum viewport of 1040 × 680, document width also remained 1040. The light theme was inspected visually; dark-theme state was checked.
5. Both generated files remained absent from the fixture's main checkout. No live-provider branch was merged. The separate runtime integration test covers explicit merge approval, cumulative diff, preservation of partial edits, and invalidation of older check evidence.

Run evidence: `/tmp/bark-thread-live-proof.json`. First run `run_965e18f4382e4662bb59d42ff5bd2351`; continuation `run_8fb60a1a00d145328d2e27aba80210a7`. The continuation correctly stores the first as its parent.

The provider reported that its own Git commit was blocked by its sandbox. Bark's managed runtime checkpointed the output and ran the gate successfully. The final assistant's self-report is not used as the gate result. Local provider startup also logged existing skill/MCP configuration warnings; those global installations were not modified.

## Installed artifact and rollback

- Installed app: `/Applications/Bark.app`, version 0.4.0, ad-hoc signed.
- Built source bundle: `desktop/target/release/bundle/macos/Bark.app`.
- UI SHA-256: `83cb3a6beb4ac02c2ddeccdea856a18330cd54cdf40aa284e725f80a46d0a7d6`.
- Previous installed app retained at `/tmp/Bark-before-thread-workflow-20261102.app`.

## Limits

The unfiltered Rust run failed `test_report_sprint_burndown` because the CLI report requires a Bark Pro license in this environment. The final workspace command explicitly skips only that test; the license restriction was not bypassed. Existing compiler, mixed-import, and bundle-size warnings remain.

The real-provider test covers Codex prompt, reply, continuation, files, and checks. Claude/OpenCode execution, live-provider Stop/retry, every sidebar mutation, and full T3 attachment/queue/steer/rewind/remote parity were not established by this run. Stop was separately checked against a real local child process; partial-work continuation and review/merge were checked with an injected provider in temporary Git projects. These are distinct proof levels.

Native preference injection is limited to the local HTTP host, and durable keys are restricted to draft/provider/mode preferences. No credentials were read for the model catalog or stored in the preference file.
