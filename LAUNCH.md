# Launch Checklist — barkcli v0.2.0

> All content prepped. Check each item after completing.
>
> See also: [MANUAL.md](MANUAL.md) for step-by-step go-live instructions,
> [MARKETING.md](MARKETING.md) for positioning strategy.

---

## D1: VS Code Marketplace

**VSIX ready**: `vscode-extension/barkcli-vscode-0.1.0.vsix` (91 KB, 12 files)

### Publish command
```
cd vscode-extension && npx @vscode/vsce publish
```

### Pre-flight
- [ ] Create publisher: https://marketplace.visualstudio.com/manage/createpublisher
- [ ] Generate Azure DevOps PAT
- [ ] `npx @vscode/vsce login barkcli`
- [ ] `npx @vscode/vsce publish`
- [ ] Verify: https://marketplace.visualstudio.com/items?itemName=barkcli.barkcli-vscode

### Store listing
**Short (300 chars):**
> Git-native Kanban board editor for VS Code. Open any `.board` YAML file as a visual drag-and-drop board. Tasks live in your repo — no cloud, no accounts. Powered by barkcli.

---

## D2: Product Hunt

### Tagline
**Git for tasks** — CLI-native Kanban that lives in your repo. No cloud. No subscription.

### Description
barkcli turns your git repo into a project board. A single binary. No accounts. No servers. Your tasks are YAML files — commit them, diff them, merge them alongside your code.

### Demo script (record with asciinema or screen recorder)
```
barkcli --version
barkcli init
barkcli add "JWT auth middleware" -p high -l backend
barkcli add "OAuth login flow" -p high -l frontend
barkcli add "Unit tests for auth" -l testing
barkcli list
barkcli move jwt-auth-middleware doing
barkcli done unit-tests-for-auth
barkcli show oauth-login-flow
barkcli log
barkcli undo
barkcli tui
# (Show j/k nav, h/l columns, a add, q quit)
barkcli ai "Implement user registration with email verification"
barkcli stats
```

### First comment
Hey Product Hunt! I built barkcli because I was frustrated with project management tools that don't live in my git repo.

The insight: git already solves version control, diffing, and merging for code. Why can't it do the same for tasks?

Tasks are `.board` YAML files in your repo. `git diff` shows what changed. `git merge` syncs tasks. No database. No accounts. No lock-in.

It's open source (MIT), free for personal use. Pro is $49 one-time — no subscription.

Try it: curl -fsSL https://getbarkcli.dev | sh

Happy to answer questions! What would make you switch from your current task tool?

### Pro tips
- Launch Tue-Thu, 12:01 AM PST
- 5-10 friends ready to upvote in first hour
- Respond to every comment within 30 min
- First 4 hours = your rank

---

## D3: Awesome Lists

### awesome-rust
**Title:** Add barkcli — git-native Kanban board CLI
```
barkcli is a single-binary CLI for task tracking. Like .git but for
Kanban boards. Tasks are YAML files committed to your repo.

- CLI, TUI (ratatui), web server (axum), VS Code extension
- Git integration: diff, blame, changelog, pre-commit hooks
- AI task breakdown (OpenAI), sprint planning, GitHub Issues sync
- Offline-first, no cloud dependency — MIT licensed
- Repo: https://github.com/AkshatNaruka/barkcli
```

### awesome-cli
**Title:** Add barkcli — Git-native project board in your terminal
```
CLI-first task manager that stores tasks as YAML files in git.
Terminal, browser, and IDE — same data, same commands.
Install: curl -fsSL https://getbarkcli.dev | sh
Repo: https://github.com/AkshatNaruka/barkcli
```

### awesome-vscode
**Title:** Add barkcli — Kanban board editor for .board files
```
VS Code Custom Editor for git-native Kanban boards. Open .board
YAML files as visual drag-and-drop boards. 91 KB VSIX.
- Visual Kanban with dnd-kit drag-and-drop
- Card CRUD with modal forms, priority coloring, label pills
- Works alongside CLI: same file, multiple interfaces
Repo: https://github.com/AkshatNaruka/barkcli
```

### awesome-tuis
**Title:** Add barkcli — Terminal Kanban board with vim keys
```
Ratatui-based interactive Kanban board.
- vim keys: j/k nav, h/l columns, H/L move cards
- Command palette (:), search (/), themes
- Filter syntax: is:todo priority:high label:bug assignee:alice
Start: barkcli tui
Repo: https://github.com/AkshatNaruka/barkcli
```

---

## D4: Hacker News Show HN

### Title
**Show HN: Barkcli — Git-native Kanban board for the terminal, browser, and VS Code**

### URL
https://github.com/AkshatNaruka/barkcli

### First comment
I built this because I wanted project management that works like git — files in the repo, not a cloud account.

Key decisions:
1. YAML files — human-readable, diffable, mergeable
2. CLI first — TUI, web, and VS Code are different views into same data
3. Rust binary — fast, single file, no runtime deps
4. Free for individuals, $49 one-time for pro

This has been my daily driver for a month. The dev.board file in the repo is the actual board I use.

Things I'm proud of:
- `barkcli undo` — full state snapshots before every operation
- Git pre-commit hook that validates .board files
- AI breakdown that parses structured JSON from OpenAI
- The TUI is genuinely fun to use

What's missing (feedback welcome):
- Mobile view / PWA
- Webhooks/CI integration beyond git hooks
- Better merge conflict tooling

Ask me anything!

### Timing
- Post Mon-Thu, 8-10 AM Pacific
- First 30 min = make or break front page
- Monitor for 4 hours if traction

---

## Quick Reference

| Channel | URL | Action |
|---|---|---|
| Website | https://getbarkcli.dev | Deploy landing page |
| GitHub | https://github.com/AkshatNaruka/barkcli | Stars, watch |
| VS Code | marketplace.visualstudio.com | `npx @vscode/vsce publish` |
| Product Hunt | producthunt.com | Submit + schedule |
| HN | news.ycombinator.com | "Show HN:" prefix |
| Twitter | @probiex007 | Launch thread |

---

## Twitter/X Thread

1/7 I built a CLI kanban board that lives in your git repo.
    No cloud. No subscription. One binary.
    curl -fsSL https://getbarkcli.dev | sh

2/7 Why? Because project management should be as simple as git.
    Tasks = YAML files. Committed alongside code. Diffable. Mergeable.

3/7 Four interfaces, one data source:
    • CLI — barkcli add "Fix auth" -p high
    • TUI — vim-key kanban in your terminal
    • Web — drag-and-drop in the browser
    • VS Code — custom editor for .board files

4/7 AI task breakdown built in (Pro):
    barkcli ai "Implement JWT auth"
    → 6 tasks auto-generated with priorities

5/7 Full git integration:
    • git diff shows what tasks changed
    • Pre-commit hook validates board files
    • barkcli changelog generates release notes from completed tasks

6/7 Free forever for individuals. Pro = $49 one-time.
    No subscriptions. Your tasks stay in your repo. No lock-in.

7/7 Open source (MIT). Built in Rust. Ships with 20 integration tests.
    Try it: curl -fsSL https://getbarkcli.dev | sh
    ⭐ on GitHub: https://github.com/AkshatNaruka/barkcli
