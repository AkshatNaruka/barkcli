# Release DMG Packaging & Mac App One-Liner Installer Plan

> **For Claude / Antigravity:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Package the latest Bark macOS app into an easy-to-install `.dmg` and archive, upload assets to GitHub Releases (v0.4.62), provide a seamless 1-line curl installer that automatically clears macOS Gatekeeper quarantine (`xattr -cr`), and update the landing website with direct DMG download buttons, curl commands, and clear unquarantine instructions.

**Architecture:** 
1. Build script `desktop/scripts/package-dmg.sh` uses native macOS `hdiutil` to package a compressed `.dmg` containing `Bark.app` and `/Applications` symlink, plus `Bark-macOS.tar.gz`.
2. Public shell script `landing-next/public/install-app.sh` downloads the latest macOS app bundle/DMG, installs to `/Applications`, strips quarantine attributes (`xattr -cr /Applications/Bark.app`), re-signs ad-hoc, symlinks the CLI to `~/.local/bin/barkcli`, and launches Bark.
3. Next.js landing page (`landing-next/src/app/page.tsx` & docs) provides dual hero install choices (Mac App curl vs CLI curl), a direct "Download .DMG" button, and quarantine guidance.
4. GitHub release v0.4.62 is created with `Bark.dmg`, `Bark-macOS.tar.gz`, CLI binaries, checksums, and release notes.

**Tech Stack:** Bash, macOS `hdiutil` & `xattr` & `codesign`, Next.js 15, Tailwind CSS, Lucide React, GitHub CLI (`gh`).

---

### Task 1: Create DMG & macOS Release Packaging Script
**Files:**
- Create: `desktop/scripts/package-dmg.sh`

**Step 1: Write packaging script**
- Script checks for `$ROOT/desktop/target/release/bundle/macos/Bark.app` (builds if missing).
- Prepares temporary staging folder with `Bark.app` and symlink `Applications -> /Applications`.
- Clears attributes on `Bark.app`: `xattr -cr "$APP"`.
- Uses `hdiutil create -volname "Bark" -srcfolder "$STAGING" -ov -format UDZO "$OUT_DIR/Bark.dmg"`.
- Creates `$OUT_DIR/Bark-macOS.tar.gz` (`tar -czf`).
- Generates `SHA256SUMS`.

**Step 2: Run script and verify output**
- Run: `bash desktop/scripts/package-dmg.sh`
- Verify `Bark.dmg` mounts with `hdiutil attach -nobrowse -readonly` and unmounts cleanly with `hdiutil detach`.

---

### Task 2: Create Mac App One-Liner Curl Installer (`install-app.sh`)
**Files:**
- Create: `landing-next/public/install-app.sh`

**Step 1: Write install-app.sh**
- OS verification (Darwin macOS only; helpful error on Linux/Windows).
- Architecture detection (Apple Silicon `arm64` vs Intel `x86_64`).
- Fetches latest release metadata from GitHub API or falls back to `https://github.com/AkshatNaruka/barkcli/releases/latest/download/...`.
- Downloads `Bark.dmg` (or tar.gz) with progress indicator.
- Mounts DMG or extracts archive into `/Applications/Bark.app` (or `$HOME/Applications/Bark.app` if permissions require).
- **Cleans quarantine & extended attributes:**
  ```bash
  xattr -cr "$DEST_APP"
  xattr -d com.apple.quarantine "$DEST_APP" 2>/dev/null || true
  codesign --force --deep --sign - "$DEST_APP" 2>/dev/null || true
  ```
- Links CLI binary to `$HOME/.local/bin/barkcli`.
- Opens app: `open "$DEST_APP"`.

**Step 2: Test install script locally**
- Test with local asset/mock to verify directory creation, permissions, and `xattr -cr` execution.

---

### Task 3: Update Landing Page with Direct DMG Download & Mac App Curl
**Files:**
- Modify: `landing-next/src/app/page.tsx`
- Modify: `landing-next/src/app/docs/getting-started/page.tsx`

**Step 1: Add Mac App options in Hero**
- Add toggle or segmented controls for "macOS App (Desktop)" vs "CLI Binary".
- For Mac App:
  - Display one-liner: `curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/landing-next/public/install-app.sh | bash` (or `https://barkcli.com/install-app.sh | bash`).
  - Add primary **"Download .DMG"** button linking to `https://github.com/AkshatNaruka/barkcli/releases/latest/download/Bark.dmg`.
  - Add Gatekeeper note: "Includes automatic quarantine bypass (`xattr -cr`)" with tooltip.

**Step 2: Add Dedicated Mac App Card in Install Section**
- In the "Get started in 10 seconds" section, add a prominent card for **macOS Desktop App**:
  - Direct DMG download link.
  - Install command.
  - Note: *"If downloading DMG directly, run `xattr -cr /Applications/Bark.app` once to bypass Apple Gatekeeper."*

**Step 3: Update Getting Started Docs**
- Add Desktop App section with DMG download and curl installer command.

**Step 4: Verify Next.js build**
- Run `npm run build` in `landing-next`.

---

### Task 4: Tag & Publish GitHub Release v0.4.62
**Files:**
- Release Tag: `v0.4.62`
- Release Assets:
  - `Bark.dmg`
  - `Bark-macOS.tar.gz`
  - `barkcli-aarch64-apple-darwin.tar.gz`
  - `install-app.sh`
  - `install.sh`
  - `SHA256SUMS`

**Step 1: Tag git commit**
- `git tag -a v0.4.62 -m "Release v0.4.62: Bark Desktop App, AI Model Dynamic Sync & Resizable Sidebar"`
- `git push origin v0.4.62`

**Step 2: Create GitHub release with assets**
- Run `gh release create v0.4.62 Bark.dmg Bark-macOS.tar.gz ... --title "v0.4.62: Bark Desktop & AI Model Sync" --notes "..."`

**Step 3: Verify release on GitHub**
- Run `gh release view v0.4.62` to verify all assets are attached and downloadable.
