# Marketing Plan — barkcli

> Positioning, messaging, competitive landscape, audience, and go-to-market strategy.

---

## Positioning

**One-liner:**
> **Git for tasks** — CLI-native Kanban that lives in your repo.

**Elevator pitch:**
barkcli turns your git repo into a project board. Tasks are YAML files committed alongside code — diff them, merge them, grep them. Terminal, browser, VS Code — same data, same commands. No cloud, no accounts, no subscription.

**Category:**
Developer Tools → Project Management → Git-Native Task Tracking

**Distribution:** Compiled binaries (Homebrew, GitHub Releases), VS Code Marketplace. Open source (MIT).

---

## Value Proposition

| Pain Point | barkcli Solution |
|---|---|
| Jira/Linear require accounts, cloud, subscriptions | Single binary. Offline. No sign-up. |
| Tasks siloed from code in separate tools | `.board` YAML in the repo. `git diff` shows task changes. |
| Can't work without internet | All data local. Sync via `git push/pull`. |
| Vendor lock-in | Plain YAML. Works with any text editor. No export needed. |
| Too many tools (CLI + browser + IDE) | One data source, four interfaces: CLI, TUI, web, VS Code. |
| Expensive per-seat pricing for teams | Free and open source (MIT). No recurring fees. |

---

## Target Audience

### Primary: Solo Developers & Indie Hackers
- Build side projects, SaaS MVPs, and open-source tools
- Work in the terminal all day
- Value simplicity over feature bloat
- Price-sensitive — prefer one-time over subscriptions
- Use VS Code as primary editor

**Reach them on:** Hacker News, Twitter/X, r/rust, r/commandline, Indie Hackers

### Secondary: Small Engineering Teams (2-10)
- Want project management that lives in git
- Tired of Jira's complexity
- Evaluate tools by developer experience
- Will pay for useful features (AI, GitHub sync, sprints)

**Reach them on:** Product Hunt, Hacker News, dev.to, engineering blogs

### Tertiary: Open Source Maintainers
- Track issues and roadmap in the same repo as code
- Contributors can see task board without signing up for a service
- `.board` files are mergeable — PRs can include task updates

**Reach them on:** GitHub, r/opensource, twitter developer circles

---

## Competitive Landscape

### Direct Competitors (partial overlap)

| Tool | Overlap | Why Barkcli Wins |
|---|---|---|
| **Linear** | Kanban board, CLI | No cloud, no subscription, git-native, offline |
| **Jira** | Project management | 10x simpler, CLI-first, $0 vs $8/user/mo |
| **Taskwarrior** | CLI tasks | Kanban board, VS Code, web UI, git integration |
| **git-bug** | Git-embedded | Kanban columns, card CRUD, VS Code, AI features |
| **Notion** | Task database | Purpose-built, terminal-first, zero setup |
| **VSCode Kanban** | VS Code kanban | Actively maintained, CLI companion, web UI |

### Indirect Competitors

| Tool | What They Do | Why They're Not a Threat |
|---|---|---|
| GitHub Projects | GitHub-native projects | Cloud-only, no CLI, no offline |
| Obsidian Kanban | Markdown kanban | Not developer-focused, no CLI, no git integration |
| Todoist CLI | Personal tasks | No kanban, no boards, not for software projects |

### Defensible Moat
1. **Data format**: `.board` YAML is dead simple. No one owns this format.
2. **Multi-interface**: CLI + TUI + web + VS Code from one binary. Competitors do 1-2.
3. **Git integration depth**: Undo, diff, blame, pre-commit hooks, changelog. Not surface-level.
4. **Rust codebase**: One compiled binary, fast startup, small footprint — plus an open source community can build on it.

---

## Monetization Strategy (future, not launched)

Pricing is intentionally **not set yet** — the tool ships free and open source
(MIT). When monetization is introduced it will be additive (e.g. hosted cloud
sync), never taking away from the local, MIT-licensed core.

- Open source builds trust — no lock-in
- Cloud sync is the likely recurring revenue play later, once adoption exists

---

## Messaging

### Taglines (by context)

| Context | Tagline |
|---|---|
| Hero (landing page) | Tasks in your repo. No cloud. No subscription. |
| GitHub description | Git-native Kanban board. CLI + TUI + web + VS Code. |
| Product Hunt | Git for tasks — CLI-native Kanban that lives in your repo. |
| Hacker News | A Kanban board that lives in your git repo. |
| Twitter bio | Git-native task management. One binary. Zero lock-in. |
| Elevator pitch | Like `.gitignore` but for your todo list. |

### Key Messages (repeat everywhere)
1. **No cloud** — your data stays in your repo
2. **One binary** — `curl \| sh`, ready in 10 seconds
3. **Four interfaces** — CLI, TUI, web, VS Code — same data
4. **Git-native** — diff, merge, blame, undo
5. **Open source** — MIT licensed, no subscription

### Voice & Tone
- Direct, not clever. Say what it does.
- Warm, not corporate. Like a good README.
- Confident, not loud. Let the terminal demo do the selling.
- Developer-native. Use `$` prompts, real code, real flags.

---

## Distribution Channels

| Channel | Audience | Strategy | Target |
|---|---|---|---|
| **VS Code Marketplace** | 20M+ developers | Capture 42k installs from deprecated VSCode Kanban | 1,000 installs in month 1 |
| **Homebrew** | macOS developers | `brew install barkcli` | 500 downloads |
| **Product Hunt** | Early adopters, indie hackers | Launch on a Tuesday, 12 AM PST | Top 5 product of the day |
| **Hacker News** | Developers, founders | Show HN, weekday morning Pacific | Front page, 100+ points |
| **GitHub** | Developer community | Stars, search ranking | 500 stars in month 1 |
| **Twitter/X** | Dev community | Regular posts, launch thread | 200 followers |
| **Reddit** | r/rust, r/commandline, r/vscode | Share launches, respond to questions | 50 upvotes per post |
| **Dev.to / Hashnode** | Developer blogs | Technical deep-dives, "how we built" | 2-3 articles |

---

## Launch Timeline

```
Day -7:  Repo renamed, domain live, install flow tested
Day -3:  VS Code extension published
Day -2:  Product Hunt scheduled
Day -1:  Homebrew formula live, release binaries verified
Day  0:  Product Hunt + HN launch (Tue, 12 AM + 8 AM Pacific)
Day +1:  Awesome list PRs submitted
Day +2:  Reddit posts (r/rust, r/commandline)
Day +7:  Launch recap blog post
```

---

## Success Metrics (30-Day)

| Metric | Target | Stretch |
|---|---|---|
| GitHub Stars | 500 | 1,000 |
| VS Code Installs | 1,000 | 2,500 |
| CLI Downloads | 500 | 1,000 |
| Product Hunt Upvotes | 200 | 500 |
| HN Points | 100 | 300 |
| Pro Licenses Sold | 10 | 25 |
| Twitter Followers | 200 | 500 |
| GitHub Issues | <10 open | Active discussion |

---

## Swipe File

See `LAUNCH.md` for ready-to-post copy:
- Product Hunt: tagline, description, first comment
- Hacker News: Show HN title, first comment
- Awesome lists: submission blurbs for 4 lists
- Twitter/X: 7-tweet launch thread
- VS Code Marketplace: short + full description
