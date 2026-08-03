# Manual Actions — Go-Live Checklist

> Everything that can be automated is done. These steps require human action.
> Check each box as you complete it. Estimated time: 2-3 hours.

---

## 1. Repository

- [ ] **1.1** Rename GitHub repo from `inboard` → `barkcli`
  - Go to https://github.com/AkshatNaruka/inboard/settings
  - Rename to `barkcli`
  - Update local remote: `git remote set-url origin https://github.com/AkshatNaruka/barkcli.git`

- [ ] **1.2** Verify all links in `README.md`, `SHIPPING_SPECS.md`, `LAUNCH.md` point to `AkshatNaruka/barkcli`

- [ ] **1.3** Enable GitHub Discussions
  - Settings → Features → Discussions → Enable

- [ ] **1.4** Set up branch protection for `master`
  - Require CI to pass before merge
  - Require pull request reviews

---

## 2. Domain & Landing Page

- [ ] **2.1** Purchase `getbarkcli.dev` domain (if not already owned)
  - Provider: Namecheap, Cloudflare, or Porkbun

- [ ] **2.2** Point DNS to Vercel
  - Add CNAME `getbarkcli.dev` → `cname.vercel-dns.com`
  - Add CNAME `www.getbarkcli.dev` → `cname.vercel-dns.com`

- [ ] **2.3** Deploy landing page to Vercel
  ```bash
  cd landing && vercel --prod
  ```

- [ ] **2.4** Configure Vercel project
  - Domain: `getbarkcli.dev`
  - Redirect `www.getbarkcli.dev` → `getbarkcli.dev`
  - Enable HTTPS (automatic)

- [ ] **2.5** Configure Vercel to serve `install.sh` at root
  - Add `install.sh` to `landing/` directory
  - Or configure rewrites in `vercel.json`:
    ```json
    { "rewrites": [{ "source": "/install.sh", "destination": "/install.sh" }] }
    ```

- [ ] **2.6** Test the install flow
  ```bash
  curl -fsSL https://getbarkcli.dev/install.sh | sh
  ```
  Verify `barkcli --version` outputs correctly.

---

## 3. GitHub Releases & Binary Distribution

- [ ] **3.1** Verify CI triggered on tag `v0.2.0`
  - Go to https://github.com/AkshatNaruka/barkcli/actions
  - Check the Release workflow ran successfully

- [ ] **3.2** Download and test release binaries
  - macOS ARM: download, `chmod +x`, `./barkcli --version`
  - macOS x86_64: same
  - Linux x86_64: same

- [ ] **3.3** Update `homebrew/barkcli.rb` with the correct SHA256 hash
  ```bash
  curl -sL https://github.com/AkshatNaruka/barkcli/archive/refs/tags/v0.2.0.tar.gz | shasum -a 256
  ```
  Replace `TBD` in `homebrew/barkcli.rb` with the hash.

- [ ] **3.4** Create Homebrew tap repository
  - Create `https://github.com/AkshatNaruka/homebrew-barkcli`
  - Copy `homebrew/barkcli.rb` to the tap repo
  - Test: `brew tap AkshatNaruka/barkcli && brew install barkcli`

---

## 4. VS Code Marketplace

- [ ] **4.1** Create Azure DevOps organization
  - https://dev.azure.com
  - Name: `barkcli`

- [ ] **4.2** Create VS Code Marketplace publisher
  - https://marketplace.visualstudio.com/manage/createpublisher
  - Publisher ID: `barkcli`
  - Display name: `barkcli`

- [ ] **4.3** Generate Personal Access Token (PAT)
  - Azure DevOps → User Settings → Personal Access Tokens
  - Scope: `Marketplace (Publish)`
  - Save the token securely

- [ ] **4.4** Login and publish
  ```bash
  cd vscode-extension
  npx @vscode/vsce login barkcli
  # Paste PAT when prompted
  npx @vscode/vsce publish
  ```

- [ ] **4.5** Verify listing
  - https://marketplace.visualstudio.com/items?itemName=barkcli.barkcli-vscode
  - Check: description, icon, categories, version

---

## 5. Launch Day

### Product Hunt

- [ ] **5.1** Create Product Hunt account if needed
  - https://www.producthunt.com

- [ ] **5.2** Schedule launch
  - Submit product 1-2 days before target date
  - Use tagline and copy from `LAUNCH.md`
  - Add demo GIF (record with `asciinema` or CleanShot)
  - Target: Tuesday, 12:01 AM PST

- [ ] **5.3** Prepare launch team
  - Share the Product Hunt URL with 5-10 friends
  - Ask them to upvote and comment in the first hour

- [ ] **5.4** Monitor and respond
  - Reply to every comment within 30 minutes
  - Keep a browser tab open all day

### Hacker News

- [ ] **5.5** Post Show HN
  - URL: https://news.ycombinator.com/submit
  - Title and first comment from `LAUNCH.md`
  - Time: Monday-Thursday, 8-10 AM Pacific
  - Monitor first 4 hours for comments

### Social

- [ ] **5.6** Post Twitter/X thread
  - Copy from `LAUNCH.md`
  - Pin to profile for launch week
  - Tag relevant accounts: @rustlang, @code, @vscode

### Awesome Lists

- [ ] **5.7** Submit PR to awesome-rust
  - Repository: https://github.com/rust-unofficial/awesome-rust
  - Copy from `LAUNCH.md`

- [ ] **5.8** Submit PR to awesome-cli
  - Repository: https://github.com/agarrharr/awesome-cli-apps

- [ ] **5.9** Submit PR to awesome-vscode
  - Repository: https://github.com/viatsko/awesome-vscode

- [ ] **5.10** Submit PR to awesome-tuis
  - Repository: https://github.com/rothgar/awesome-tuis

---

## 6. Post-Launch

- [ ] **6.1** Monitor GitHub issues and respond within 24 hours

- [ ] **6.2** Track analytics
  - GitHub: Stars, clones, traffic (Insights → Traffic)
  - VS Code Marketplace: Installs (dashboard)
  - Product Hunt: Upvotes, comments
  - HN: Points, comments
  - Twitter: Impressions, engagement

- [ ] **6.3** Write a "launch recap" blog post after 1 week
  - Metrics: stars, installs, traffic
  - Top feedback from each channel
  - What's next on the roadmap

- [ ] **6.4** Create a `ROADMAP.md` based on `SHIPPING_SPECS.md` Phase 2 + 3

---

## Quick URLs

| Resource | URL |
|---|---|
| GitHub Repo | https://github.com/AkshatNaruka/barkcli |
| Landing Page | https://getbarkcli.dev |
| Install Script | https://getbarkcli.dev/install.sh |
| VS Code Marketplace | https://marketplace.visualstudio.com/manage |
| Product Hunt Submit | https://www.producthunt.com/posts/new |
| HN Submit | https://news.ycombinator.com/submit |
| Azure DevOps | https://dev.azure.com |
