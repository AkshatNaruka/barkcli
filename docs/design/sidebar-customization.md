# Sidebar customization

Scope: finish the shared Mac/browser sidebar requested on 2026-11-01.

1. Keep the project card and New thread fixed, with Recent folders removed from this area. Recent projects remain on All projects.
2. Let users reorder and rename categories, create custom categories, move tools between categories, reorder tools, and hide tools. Keep keyboard alternatives to drag and drop, automatic local persistence, command search, and a reversible reset.
3. Finish interaction details: Escape cancels inline renaming before closing the panel, new categories immediately accept a name, drag insertion respects the indicated row, and changes sync across windows sharing the same origin.
4. Validate the layout model, actual sidebar integration, keyboard interactions, web suite and build; then rebuild and verify the Mac bundle. Record the exact checks and any untested native behavior here.

Layout preferences apply across projects. The Mac app saves its layout in `~/Library/Application Support/barkcli/sidebar-layout.json`, independent of the sidecar's port; the browser uses local storage for its origin. Hidden tools retain their position and remain available through command search. Removing a custom category returns its tools to their default categories.

## Validation — 2026-11-01

- `npm --prefix web test -- --reporter=dot`: 123 tests passed across 30 files. Covers layout repair, group/item ordering, drop insertion, visibility, custom groups, reset, actual sidebar integration, rename cancellation, nested-menu dismissal, storage events, native hydration and ordered writes.
- `npm --prefix web run build`: TypeScript and Vite build passed. Existing mixed-import and chunk-size warnings remain.
- `cargo check --manifest-path desktop/Cargo.toml` passed; `cargo test --manifest-path desktop/Cargo.toml`: 3 tests passed, including an isolated preference-file round trip and refusal to overwrite it with an invalid layout.
- `bash desktop/scripts/build-macos-app.sh` passed, including packaged asset freshness and signature verification. Installed `/Applications/Bark.app` also passed `verify-app.sh`. Bundled `assets/index.js` SHA-256: `43a89197df21685944c5f8e7144c78d96f2e0a8db5d8a8141d49954f7b92f648`.
- `bash desktop/scripts/smoke-app.sh` passed in its temporary repository, including bundled UI serving and sidecar shutdown. This is a headless integration check, not provider execution proof.
- Native UI checked through the installed app: project card followed by New thread without Recent folders; panel rendering; inline rename and Escape cancellation; native preference file written; full quit/relaunch onto a different port restored the category name; move-menu Escape retained the panel. The test rename was restored to `Plan` afterward.
- Automated browser inspection was attempted in a temporary repository but did not run: the cached Playwright package lacks its Chromium headless executable. No browser screenshot or viewport assertions passed. Minimum-width, light-theme, mobile, VoiceOver, drag gestures, and actual cross-project switching were not rechecked visually in this slice. Storage synchronization and tool movement have automated component/model coverage.
- `git diff --check` passed. The complete Rust workspace and live provider runs were not rerun for this sidebar slice.

Logs: `/tmp/bark-sidebar-web-tests.log`, `/tmp/bark-sidebar-mac-build.log`, `/tmp/bark-sidebar-mac-smoke.log`. The previous installed app was retained at `/tmp/Bark-before-sidebar-20261101-1518.app`. The checkout already contained extensive UI and native changes; they were preserved. No commit was created.
