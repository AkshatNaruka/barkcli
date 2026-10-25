# Launch playbook — Wed Oct 28, 2026

**Goal of launch week:** real users + real numbers for the YC application.
Not virality for its own sake. Every number below goes into the application on
Nov 1.

**Launch moment:** Wed Oct 28, **8:00–8:15am PT** (= 8:30pm IST). Post the HN
link yourself, then stay in the thread for 4+ hours.

**Submit target:** Sun Nov 1, evening IST (Sun morning PT) — ~1.5 days before the
Nov 2, 8pm PT deadline.

---

## 1. Show HN — final post

**URL:** https://github.com/AkshatNaruka/barkcli
(Repo, not the landing page — HN trusts GitHub for OSS and the README has the GIF.)

**Title (recommended):**
`Show HN: Barkcli – Task queues and test gates for AI coding agents`

Backups:
- `Show HN: Barkcli – Make coding agents prove they're done`
- `Show HN: Barkcli – Open-source management layer for coding agents`

**First comment (post immediately after submitting):**

> Hi HN — I'm Akshat, a solo dev in Indore, India. barkcli is an MIT-licensed
> management layer for coding agents.
>
> I run my own products with Claude Code, OpenCode and Codex every day, and I kept
> hitting the same two failures. First, the agent says "done" and the build is
> broken — I was re-reading ~29,000 tokens of repo context every session just to
> check its work. Second, when I ran several agents at once, they stepped on each
> other's branches.
>
> barkcli gives agents a task queue, an isolated git worktree per attempt, and an
> acceptance gate that runs your project's own test command. A branch only merges
> if the gate passes. Parallel runs go through a merge train; conflicted branches
> re-run solo against a frozen main. There are lease heartbeats so a hung agent
> forfeits instead of holding a task forever.
>
> It's one Rust binary today: CLI, TUI, web app with a live view of every running
> agent, VS Code extension, and 71 MCP tools. 257 tests. v0.4.0 ships macOS/Linux/
> Windows binaries, crates.io, and Homebrew.
>
> What it is not: not an agent, not a hosted SaaS, not a Jira replacement. It's the
> layer between your repo and whichever agent you use.
>
> Install:
> `curl -fsSL https://github.com/AkshatNaruka/barkcli/releases/latest/download/install.sh | sh`
>
> Demo GIF and docs: https://akshatnaruka.github.io/barkcli
> Watch a recorded 3-agent run in the real UI (no install):
> https://akshatnaruka.github.io/barkcli/app/?run=replay#/mind
> Interactive benchmark: https://akshatnaruka.github.io/barkcli/benchmark
> (57× smaller context via the auto-maintained project context — a deterministic
> proxy for cold-start cost, re-runnable with `barkcli context benchmark --json`.)
>
> The core is free and MIT forever. I'm building the hosted team layer — shared
> live agent sessions, cloud sync, reliability analytics — at $99/month per team,
> flat, not per seat.
>
> I'd especially love feedback from people running agents on real repos: what
> breaks first for you? Happy to answer anything.

**Rules:** no vote requests, no alts, no edits to the title after 15 minutes, reply
to every top-level comment within ~5 minutes for the first 4 hours. If someone is
wrong, say what's true and move on — never argue.

**First 60 minutes:**
- 0–2 min: submit, post first comment, check the link works logged out.
- 2–10 min: refresh; reply to the first comments with specifics, not "thanks!".
- 10–60 min: one substantive reply per comment. Ask one genuine question back.
- Cross-post to X at 9:00am PT with the thread (below), not before.

---

## 2. X thread (7 tweets)

1. **Hook:** Coding agents lie about being done.
   I built the layer that makes them prove it.
   barkcli v0.4.0 — MIT, one Rust binary, task queues + test gates + a merge train.
   🧵
2. **Problem:** Every agent session ends the same way: "Done!" → broken build.
   I was burning ~29k tokens re-reading the repo to verify. And running two agents
   at once meant two agents fighting over one branch.
3. **Fix:** barkcli gives each attempt its own worktree, a lease so dead agents
   forfeit, and an acceptance gate that runs *your* tests. Only gate-passing
   branches merge — through a merge train, with conflicts re-run solo.
4. **Demo:** [GIF] Three agents, one board, live view. Done = gate passed.
   Replay it in the real UI: akshatnaruka.github.io/barkcli/app/?run=replay#/mind
5. **Built:** 257 tests · 5 platform binaries · crates.io + Homebrew · 71 MCP tools
   · VS Code + TUI + web app · skills registry with a sha-pinned lockfile.
6. **Free:** Core is MIT forever. The company is the multiplayer layer: shared live
   sessions, cloud sync, analytics for teams running fleets of agents.
7. **Try it:** one-liner in the reply. If you run Claude Code/Codex/OpenCode on a
   real repo, I want it to break on your setup — tell me what happens.
   github.com/AkshatNaruka/barkcli

---

## 3. LinkedIn (launch day, 10:00am PT)

> I've shipped 14 products. This one scared me the most.
>
> For three months I've run my own products with coding agents. They're incredible
> — and they lie. "Done" often means "the build is broken." I was re-reading
> 29,000 tokens of repo context every session just to check.
>
> So I built barkcli: an open-source management layer for coding agents. Task
> queue, isolated worktree per attempt, an acceptance gate that runs your tests,
> and a merge train. Done means the gate passed — never the agent's word.
>
> One Rust binary: CLI, TUI, web app, VS Code, 71 MCP tools. 257 tests. MIT.
> v0.4.0 is live today.
>
> I'm building the company on top: multiplayer live sessions and reliability
> analytics for teams. The core stays free forever.
>
> If you use coding agents on a real repo, I'd love your most brutal feedback.
> Link in comments. 👇

---

## 4. Medium outline

**Title:** "Done is the hardest problem in AI coding agents"
**Subtitle:** Why I built an acceptance gate and a merge train for agents — and
what three months of dogfooding taught me.

1. The lie: an agent's "done" is a claim, not a fact.
2. The cost: 29k tokens per cold start; the benchmark and its limits.
3. The collision: parallel agents on one branch.
4. The mechanism: worktrees, leases, gate, merge train (with the run report).
5. What I got wrong first (leases came after a hung agent; gate came after a lie).
6. The company: free CLI, paid multiplayer; why not the other way around.
7. What's next + honest ask for feedback.

Publish **Fri Oct 30**, link it in the HN thread and X.

---

## 5. DM templates (send 30, expect 8 replies)

**Warm dev friend:**
> Hey [name] — I'm launching barkcli on HN Wednesday. You use Claude Code/Codex
> daily; would you try it on one real repo this week and tell me what breaks? No
> ask beyond honest feedback. One-liner: `curl -fsSL https://github.com/AkshatNaruka/barkcli/releases/latest/download/install.sh | sh`

**Founder/engineer using agents:**
> [name] — saw your post about [specific agent workflow]. I built barkcli: task
> queue + test gate + merge train for coding agents (MIT, one binary). Launching
> Wednesday. Would you trade 10 minutes of trying it for brutal feedback? Happy to
> send the demo GIF first.

**OSS maintainer / dev-tool builder:**
> [name] — barkcli is an MIT management layer for coding agents (worktrees, test
> gates, merge train). Not asking for a share — I'd genuinely value your take on
> the merge-train design, since you've thought about [their area]. Repo:
> github.com/AkshatNaruka/barkcli

---

## 6. Launch YC listing (post Wed Oct 28)

- **Name:** barkcli
- **Tagline (≤60):** The management layer for AI coding agents
- **Description (≤500):**
  > barkcli is the open-source management layer for coding agents. Agents get a
  > task queue, an isolated git worktree per attempt, and an acceptance gate that
  > runs your project's own tests — "done" means the gate passed, never the agent's
  > word. Parallel runs merge through a merge train. Teams watch every agent live.
  > One Rust binary: CLI, TUI, web app, VS Code, 71 MCP tools. MIT core, free
  > forever; the company is the multiplayer cloud — shared live sessions, sync,
  > and reliability analytics. v0.4.0 is live today.
- **Links:** GitHub repo + landing page + demo GIF
- **Launch date:** Oct 28, 2026
- **Asking for:** feedback from teams running coding agents; design partners for
  the multiplayer layer.

---

## 7. Communities (only where self-promo is allowed — always disclose)

- **r/rust** — Showoff Saturday or a text post about the merge-train design, not a
  drive-by link. Check the sidebar first.
- **r/ClaudeAI / r/codex / r/LocalLLaMA** — read rules; many require flair or ban
  launch posts. Prefer answering a relevant thread with the tool only if asked.
- **Discords** (agent/dev-tool servers you're already in) — one message, in the
  right channel, with the demo GIF.
- **Newsletters:** Rust Weekly, This Week in Rust (PR to the next issue), TLDR,
  Pointer, Hacker Newsletter (submit after HN). Short pitch: one paragraph, link,
  why now.

**Never:** buy stars, ask for upvotes, use alts, DM spam, or claim users you don't
have. HN and YC both check.

---

## 8. Day-by-day (Oct 25 → Nov 1)

**Sun Oct 25 (today)**
- [ ] Fix portfolio stats (25, 14 products, 53 repos).
- [ ] Build the demo repo from `video-script.md`; run it twice.
- [ ] Record video draft #1; watch on your phone.
- [ ] Fill every `[FILL]` you can in `application-w27.md` (education, work, links).

**Mon Oct 26**
- [ ] Replay-demo MVP + landing "multiplayer" section (build agent).
- [ ] Clean-machine install test (fresh container/VM, one-liner, `barkcli pro`).
- [ ] Draft Medium post; collect 3 screenshots.

**Tue Oct 27**
- [ ] Record final video (<60s); upload unlisted; test logged out.
- [ ] Landing QA: every link, GIF, benchmark, install tab.
- [ ] Rehearse the HN first comment aloud once.
- [ ] Build the 30-person DM list with names + context.

**Wed Oct 28 — LAUNCH**
- [ ] 8:00am PT: HN post + first comment.
- [ ] 8:30–12:30pm PT: comment duty; log every piece of feedback in a doc.
- [ ] 9:00am PT: X thread. 10:00am PT: LinkedIn. 11:00am PT: Launch YC.
- [ ] Evening: Discord/Reddit where allowed; reply to everything.

**Thu Oct 29**
- [ ] Ship the top 1–3 fixes from feedback; reply in-thread when fixed.
- [ ] DM wave 1 (15 people). Second X post with the best comment + fix.
- [ ] Send newsletter pitches.

**Fri Oct 30**
- [ ] Publish Medium; link from HN thread + X.
- [ ] DM wave 2 (15 people). Podcast pitches (2–3 shows).
- [ ] Collect user stories verbatim (name + what they ran + what broke).

**Sat Oct 31**
- [ ] Fill real numbers into the application; reread aloud.
- [ ] Update README with launch numbers if meaningful.
- [ ] Final video check; application dry run (open the form, paste, don't submit).

**Sun Nov 1**
- [ ] Submit by evening IST. Screenshot the confirmation.
- [ ] Tell the launch thread: "applied to YC W27" (optional, honest, no ask).

**Mon Nov 2** — deadline 8pm PT. Emergency edits only.

---

## 9. Metrics (run daily, paste into a notes file)

```bash
# stars / forks / watchers
gh api repos/AkshatNaruka/barkcli --jq '{stars:.stargazers_count,forks:.forks_count,watchers:.subscribers_count}'

# release downloads by asset
gh api repos/AkshatNaruka/barkcli/releases/latest \
  --jq '.assets[] | "\(.name)\t\(.download_count)"'

# crates.io downloads
curl -s https://crates.io/api/v1/crates/barkcli | jq '{total:.crate.downloads,recent:.crate.recent_downloads}'

# HN item (points + comments) — replace ID
curl -s https://hacker-news.firebaseio.com/v0/item/<id>.json | jq '{score,descendants}'
```

Track in one table: date · stars · downloads · crates · HN points/comments · users
who wrote to you. **Only real numbers go into the application.**

---

## 10. Honesty rules for launch week

1. The scripted demo agent is a demo agent. Say so if asked.
2. "257 tests" means the repo's suite, not user-facing guarantees.
3. The 57× benchmark is a context-cost proxy, not an agent-quality benchmark.
4. No revenue means no revenue. "Launching this week" is the answer.
5. If a comment finds a real bug: thank them, fix it, say what you fixed.
6. Don't promise dates you can't hit for the multiplayer layer.
