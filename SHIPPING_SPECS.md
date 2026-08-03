# Shipping Specs — barkcli Market Readiness

> Status: ✅ Complete | 🔄 In Progress | ❌ Not Started
> Each checkbox must be verified before marking complete.

---

## Block A: Foundation (3–4 days)

### A1: Add MIT LICENSE
- [x] **A1.1**: Create `LICENSE` file at repo root with MIT license text + copyright

### A2: Rename `board` → `barkcli` everywhere
- [x] **A2.1**: AGENTS.md — replace binary/product name references
- [x] **A2.2**: SPECS.md — replace binary/product name + crate name references
- [x] **A2.3**: PRODUCT_SPECS.md — replace binary name + domain references
- [x] **A2.4**: install.sh — rename binary, repo, vars, log messages
- [x] **A2.5**: vscode-extension/package.json — update displayName
- [x] **A2.6**: .vercelignore — update old crate directory names
- [x] **A2.7**: Verify README.md, DESIGN.md, landing/index.html remain consistent

### A3: CI/CD GitHub Actions
- [x] **A3.1**: `.github/workflows/ci.yml` — build + test on ubuntu-latest, macos-latest
- [x] **A3.2**: `.github/workflows/release.yml` — on tag: build release binaries, create GitHub Release

### A4: Integration Tests
- [x] **A4.1**: `barkcli-cli/tests/cli.rs` — 20 integration tests covering init, add, list, move, show, update, remove, validate, doctor, export, import, clean, history, status, boards
- [x] **A4.2**: All tests pass: `cargo test` (22 tests: 20 integration + 2 unit)

---

## Block B: Distribution (2–3 days)

### B1: Install Script
- [x] **B1.1**: Verify install.sh works end-to-end on macOS and Linux
- [ ] **B1.2**: Test `curl -fsSL https://getbarkcli.dev | sh` flow (needs DNS + web server)

### B2: Homebrew Formula
- [x] **B2.1**: Create formula at `homebrew/barkcli.rb`
- [x] **B2.2**: Formula references GitHub Releases for source
- [ ] **B2.3**: Test `brew install` from tap (needs tagged release + tap repo)

### B3: VS Code Extension
- [x] **B3.1**: Add marketplace icon (128x128 PNG — generated)
- [x] **B3.2**: Write `CHANGELOG.md` for extension
- [x] **B3.3**: Add package.json metadata (repository, homepage, bugs, keywords)
- [x] **B3.4**: Package VSIX: `barkcli-vscode-0.1.0.vsix` (12 files, 91 KB)
- [ ] **B3.5**: Publish to VS Code Marketplace (`npx @vscode/vsce publish`)

### B4: Landing Page
- [x] **B4.1**: Verify all binary references use `barkcli` (21 occurrences, 0 stale)
- [ ] **B4.2**: Ensure `getbarkcli.dev` DNS resolves to Vercel deployment
- [ ] **B4.3**: Test install CTA copy button works

### B5: Domain Setup
- [ ] **B5.1**: Verify `getbarkcli.dev` DNS → Vercel
- [ ] **B5.2**: Serve install.sh at `https://getbarkcli.dev/install.sh`

---

## Block C: Polish (1–2 days)

### C1: README Badges
- [x] **C1.1**: Add CI passing badge
- [x] **C1.2**: Add version badge (0.2.0)
- [x] **C1.3**: Add license badge (MIT)

### C2: Git Attributes
- [x] **C2.1**: `.gitattributes` — set `*.tar.gz binary`, release binaries as binary

### C3: Version Bump
- [ ] **C3.1**: Tag `v0.2.0` as first public release (pending commit)
- [x] **C3.2**: Verify `barkcli --version` prints correct version

### C4: Feature Gating
- [x] **C4.1**: P8 (Sprints) — fully implemented, marked done in PRODUCT_SPECS.md
- [x] **C4.2**: P9 (GitHub Sync) — fully implemented, marked done in PRODUCT_SPECS.md
- [x] **C4.3**: Fixed 44 stale `board` → `barkcli` references in Rust source code
- [x] **C4.4**: Critical fix: git pre-commit hook now runs `barkcli validate` not `board validate`

### C5: Help Command
- [x] **C5.1**: `barkcli help` shows all subcommands including pro commands
- [x] **C5.2**: All error/usage strings use `barkcli` not `board`

---

## Block D: Launch (1 day)

### D1: VS Code Marketplace
- [x] **D1.1**: VSIX packaged — 91 KB, 12 files
- [x] **D1.2**: Store listing copy written (short + full description)
- [ ] **D1.3**: Publish (`npx @vscode/vsce publish`) — needs publisher account

### D2: Product Hunt
- [x] **D2.1**: Tagline: "Git for tasks — CLI-native Kanban that lives in your repo"
- [x] **D2.2**: Demo script with 10 command sequence
- [x] **D2.3**: First comment draft explaining "why we built this"
- [x] **D2.4**: Pro tips (timing, upvotes, engagement)
- [ ] **D2.5**: Submit to Product Hunt

### D3: Awesome Lists
- [x] **D3.1**: awesome-rust submission blurb
- [x] **D3.2**: awesome-cli submission blurb
- [x] **D3.3**: awesome-vscode submission blurb
- [x] **D3.4**: awesome-tuis submission blurb
- [ ] **D3.5**: Submit PRs to all 4 lists

### D4: Hacker News
- [x] **D4.1**: Show HN post title + URL
- [x] **D4.2**: First comment draft with key decisions + ask
- [x] **D4.3**: Timing guidance
- [ ] **D4.4**: Submit Show HN

### D5: Social
- [x] **D5.1**: 7-tweet Twitter/X thread drafted
- [ ] **D5.2**: Post thread on launch day

### D6: Launch Materials
- [x] **D6.1**: LAUNCH.md — all copy, scripts, URLs in one place

---

## Phase 2: SaaS Readiness (Future)

### E1: Cloud Sync Server
- [ ] **E1.1**: Hosted `barkcli-server` with multi-tenancy (orgs, teams, projects)
- [ ] **E1.2**: User accounts via GitHub OAuth
- [ ] **E1.3**: `barkcli sync --cloud` — CLI push/pull to cloud

### E2: License Server
- [ ] **E2.1**: Replace compile-time hash set with server-side validation
- [ ] **E2.2**: Seat management, renewals, expiry

### E3: Payment
- [ ] **E3.1**: Stripe Checkout for one-time ($49) + subscription ($5/user/mo)
- [ ] **E3.2**: Webhook-driven auto-provisioning

### E4: Landing v3
- [ ] **E4.1**: Subscription pricing tiers
- [ ] **E4.2**: Sign-up flow → Stripe → auto-create workspace

### E5: Team Features
- [ ] **E5.1**: Shared boards with R/W permissions
- [ ] **E5.2**: Activity feed + @mentions
- [ ] **E5.3**: Email + Slack notifications

### E6: Enterprise
- [ ] **E6.1**: SSO/SAML
- [ ] **E6.2**: SCIM provisioning
- [ ] **E6.3**: Audit logs + custom retention

---

## Phase 3: Growth (Ongoing)

### F1: Community
- [ ] **F1.1**: Discord server
- [ ] **F1.2**: GitHub Discussions enabled
- [ ] **F1.3**: `awesome-barkcli` community list

### F2: Content
- [ ] **F2.1**: Blog: "Why we built a CLI Kanban board"
- [ ] **F2.2**: Blog: "Tasks as code: git-committed project boards"
- [ ] **F2.3**: Blog: "Migrating from Jira to barkcli"

### F3: Integrations
- [ ] **F3.1**: GitHub App (auto-create `.board` from PR templates)
- [ ] **F3.2**: Slack bot (`/barkcli add`)
- [ ] **F3.3**: Linear import/export script

### F4: Mobile
- [ ] **F4.1**: Read-only board viewer (PWA or lightweight app)

---

## Pricing Model (Finalized)

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | Unlimited boards, CLI, TUI, web, VS Code, git integration, history, undo |
| **Pro** | $49 one-time | AI task breakdown, reports, changelog, stats, templates, sprint commands |
| **Cloud Sync** | $5/user/mo | Cloud-hosted boards, team sync, activity feed, web dashboard (future) |
