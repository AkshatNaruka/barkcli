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
- [ ] **B1.1**: Verify install.sh works end-to-end on macOS and Linux
- [ ] **B1.2**: Test `curl -fsSL https://getbarkcli.dev | sh` flow

### B2: Homebrew Formula
- [ ] **B2.1**: Create `homebrew-barkcli` tap repo
- [ ] **B2.2**: Write Formula that downloads from GitHub Releases
- [ ] **B2.3**: Test `brew install anomalyco/barkcli/barkcli`

### B3: VS Code Extension
- [ ] **B3.1**: Add marketplace icon (128x128 PNG)
- [ ] **B3.2**: Write `CHANGELOG.md` for extension
- [ ] **B3.3**: Publish to VS Code Marketplace as `anomalyco.barkcli-kanban`
- [ ] **B3.4**: Verify extension works via marketplace install

### B4: Landing Page
- [ ] **B4.1**: Verify all binary references use `barkcli`
- [ ] **B4.2**: Ensure `getbarkcli.dev` DNS resolves to Vercel deployment
- [ ] **B4.3**: Test install CTA copy button works

### B5: Domain Setup
- [ ] **B5.1**: Verify `getbarkcli.dev` DNS → Vercel
- [ ] **B5.2**: Test `curl -fsSL https://getbarkcli.dev | sh` returns install script

---

## Block C: Polish (1–2 days)

### C1: README Badges
- [ ] **C1.1**: Add CI passing badge
- [ ] **C1.2**: Add version badge
- [ ] **C1.3**: Add license badge

### C2: Git Attributes
- [ ] **C2.1**: `.gitattributes` — set `*.tar.gz binary`, release binaries as binary

### C3: Version Bump
- [ ] **C3.1**: Tag `v0.2.0` as first public release
- [ ] **C3.2**: Verify `barkcli --version` prints correct version

### C4: Feature Gating
- [ ] **C4.1**: Either complete P8 (Sprints) or hide from help text
- [ ] **C4.2**: Either complete P9 (GitHub Sync) or hide from help text

### C5: Help Command
- [ ] **C5.1**: Ensure `barkcli help` shows all subcommands with descriptions
- [ ] **C5.2**: Ensure `barkcli <cmd> --help` works for all subcommands

---

## Block D: Launch (1 day)

### D1: VS Code Marketplace
- [x] (Covered in B3)

### D2: Product Hunt
- [ ] **D2.1**: Write tagline: "Git for tasks — CLI-native Kanban that lives in your repo"
- [ ] **D2.2**: Record demo GIF/video showing full workflow
- [ ] **D2.3**: Draft first comment with "why we built this" story
- [ ] **D2.4**: Submit to Product Hunt

### D3: Awesome Lists
- [ ] **D3.1**: Submit PR to `awesome-rust`
- [ ] **D3.2**: Submit PR to `awesome-cli`
- [ ] **D3.3**: Submit PR to `awesome-vscode`
- [ ] **D3.4**: Submit PR to `awesome-tuis`

### D4: Hacker News
- [ ] **D4.1**: Draft Show HN post title and first comment
- [ ] **D4.2**: Submit at optimal time (weekday morning Pacific)

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
