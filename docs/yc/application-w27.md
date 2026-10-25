# YC W27 application — barkcli (draft v1)

**Status:** paste-ready answers. `[FILL]` = only Akshat can supply. `[DECIDE]` = needs a decision.
**Deadline:** Nov 2, 8pm PT (= Nov 3, 8:30am IST). **Target submit: Sat Nov 1, evening IST.**
**Batch:** Winter 2027 · in-person SF, Jan–Mar · applying solo.

> Before submitting, run the checklist at the bottom. Every claim here is either
> true today or marked `[FILL]` with the exact number to insert after launch.

---

## Company basics

- **Name:** barkcli
- **URL:** https://akshatnaruka.github.io/barkcli
- **50 chars or less:** `Multiplayer management layer for AI coding agents` (49 chars)
- **What are you applying for:** Winter 2027 batch
- **Have you applied to YC before?** `[FILL: no / details]`
- **How did you hear about YC?** `[FILL]`
- **Are you applying with a co-founder?** No — solo.
- **Incorporated?** `[FILL: not yet — YC incorporates at acceptance]`
- **Where do you live now?** Indore, India
- **Where will the company be based after YC?** San Francisco (can relocate Jan–Mar for the batch; visa logistics via YC guidance) `[FILL: confirm visa status]`

---

## Founder

**Akshat Naruka, 25, Indore, India.** Indie hacker. 14 products shipped solo across
Swift/macOS, Go CLIs, Rust, and Next.js SaaS. GitHub: 53 public repos.
Product Hunt maker; writes on X/Medium about shipping.

- GitHub: https://github.com/AkshatNaruka
- LinkedIn: https://www.linkedin.com/in/akshatnaruka/
- X: https://x.com/probiex007
- Portfolio: https://akshatnaruka.github.io/Portoflio/ `[FILL: fix the age/stats counter — it renders wrong]`
- Education: `[FILL: school, degree, year]`
- Work history: `[FILL: jobs / freelance / self-employed dates]`
- Most-used languages: TypeScript, Swift, Go, Rust, Python

---

## Q&A (paste-ready)

### What is your company going to make?

> barkcli is the open-source management layer for AI coding agents. Today it is a
> single Rust binary — CLI, TUI, web app, VS Code extension, 71 MCP tools — that
> gives coding agents a task queue, an isolated git worktree per attempt, and an
> acceptance gate that runs the project's own test suite. "Done" means the gate
> passed, never that the agent said so. Gate-passing branches merge through a
> merge train; conflicted branches re-run solo against a frozen main. Teams watch
> every agent live on a shared board.
>
> Next we are building the multiplayer cloud: shared live agent sessions, cloud
> board sync, and reliability analytics so a team can trust a fleet of agents.

### What is your product and for whom?

> For engineers and small teams already using coding agents (Claude Code, Codex,
> OpenCode, Cursor) on real repositories, who can't trust the agent's "done".
> Solo developers today; teams with 2–50 engineers next. The product is free and
> MIT — the company is the multiplayer layer built on top.

### How did you come up with this idea?

> I run my own 14-product portfolio with coding agents every day. The same thing
> kept happening: the agent says it's done, and the build is broken; and every new
> session burned ~29,000 tokens re-reading the repo to reconstruct context. I
> started with a git-native task board, then added the things that actually made
> agents trustworthy — worktrees, leases, a test gate, a merge train — because I
> was my own first user and the failures were mine to fix.

### How do you know people want this?

> I use it daily on my own products (dogfooding since July). The pain is visible
> everywhere agents are used — the "agent said done but broke the build" thread
> is universal. Public evidence as of submission:
> `[FILL after launch: X GitHub stars, Y release downloads, Z users running real tasks, N written stories]`
> We launched publicly on `[FILL: date]`; before that, barkcli was used privately
> by me and `[FILL: any early users]`.

### What have you built so far? What will you build next?

> **Built (v0.4.0, Oct 2026, MIT):** parallel agent pool (`--agents N`) with
> worktree-per-attempt; 30s lease heartbeats so dead agents forfeit; acceptance
> gates running the project's own tests; merge train with solo-drain conflict
> re-dispatch; live session view (`/api/run/live`) in the web app; run reports
> (`workers_peak`, `merged_branches`); 56-tool MCP server; skills registry with a
> committed `skills.lock` (rev + sha256); 257 tests; five-platform release
> pipeline (macOS/Linux/Windows), crates.io, Homebrew; three starter templates.
>
> **Next (batch):** the multiplayer cloud — (1) shared live agent sessions:
> anyone on a team drops into the same running agent, watches, redirects, hands
> off; (2) cloud board sync across repos and teammates; (3) reliability
> analytics: gate pass rate, merge rate, and cost per completed task by backend
> and by agent. Then a GitHub Action so agent runs happen in CI with zero install.

### How far along are you? How much progress?

> v0.4.0 shipped publicly on Oct 25, 2026: all five platform binaries, crates.io,
> Homebrew, live site with an interactive demo. 257 tests green. ~12 weeks of
> daily work, solo. No revenue — public launch is this week.
> `[FILL after launch: stars/downloads/users]`

### Why did you pick this idea to work on?

> Because the agent wave made the management layer urgent, and I'm the customer.
> Agents are now good enough to do real work — and that is exactly when teams
> discover they can't verify any of it. I could build the whole stack alone
> (Rust core, web app, TUI, VS Code, MCP), and I couldn't stop using it.

### What's new about what you're making?

> The first management layer where "done" is verifiable. The acceptance gate runs
> in the agent's own worktree; the merge train only lands gate-passing branches;
> leases make a dead agent forfeit instead of silently holding a task. It is
> backend-agnostic (OpenCode, Claude Code, Codex, or any script via
> `BARKCLI_AGENT_CMD`), repo-native (board, specs, memory, skills are YAML/JSON in
> git), and it makes agent economics measurable — our context benchmark shows a
> cold agent session costs ~29,400 tokens of listing/searching/reading on this
> repo, versus ~515 for one read of the auto-maintained `project_context.md`
> (57.1× smaller, deterministic proxy, re-runnable with
> `barkcli context benchmark --json`).

### Who are your competitors and who might become one?

> **Today:** Linear, Jira, GitHub Projects, Notion — human-first cloud databases;
> they manage people, not agent attempts, and they can't verify execution. Agent
> vendors' built-in task systems (Claude Code todos, Devin sessions, Cursor
> background agents) are single-player and self-reported by the agent itself.
> Open-source agent task runners exist (task-master-style MCP tools, vibe-kanban,
> backlog.md) but are single-backend and have no merge discipline.
> **Could become:** GitHub (Projects + Actions + Copilot is the natural bundle)
> and the agent vendors themselves. We win by being cross-backend and by owning
> the verification contract — the gate and merge train are the moat, not the board.
> `[VERIFY: name-check the 2–3 closest OSS projects as they exist at submission]`

### How will you make money? How much could you make?

> The CLI is free and MIT forever — it is the distribution engine. The company
> charges teams for what only a server can do: multiplayer live agent sessions,
> cloud board sync, and reliability/audit analytics, at ~$20/user/month.
>
> Math: 10,000 teams × 10 seats × $20/mo = $24M ARR; 100,000 teams = $240M ARR.
> Comparable seat-based PM tools (Linear, Jira) price at $10–20/user/mo; every
> team adopting coding agents needs a coordination and verification layer.
> No revenue today. The first paid feature ships only when teams ask for it —
> the free core stays free. `[DECIDE: confirm this is your conviction before submitting]`

### Where's the evidence for your claim of market size?

> GitHub has 100M+ developers, and coding agents went from demos to daily
> production use in under two years (Claude Code, Codex, Cursor). The management
> layer is a new seat category: comparable PM tools charge $10–20/user/mo, and
> YC's own Fall 2026 Requests for Startups names "Multiplayer AI" — shared agents
> for engineering teams — as an area to fund. Bottom-up: every team that employs
> coding agents needs coordination, visibility, and verification; at 10k teams ×
> 10 seats × $20/mo the market is $24M ARR before the long tail.
> `[VERIFY: add 1–2 links/sources before submitting]`

### Tell us about your team.

> Solo founder: Akshat Naruka, 25, Indore. I have shipped 14 products solo —
> Swift/macOS utilities, Go CLIs, Next.js SaaS — and I do the engineering, design,
> and distribution myself. barkcli is the most serious of them: a Rust binary
> with web app, TUI, VS Code extension, MCP server, and 257 tests in ~12 weeks.
> `[DECIDE: if you're open to a cofounder, add one honest line about actively looking]`

### What do you think your team has that others don't?

> I have been my own customer for three months, so every mechanism came from a
> real failure: leases from a hung agent, the gate from a lying agent, the merge
> train from conflicts. And I ship end-to-end alone: 14 products, and this one
> across Rust, TypeScript, and five distribution channels. Most teams building
> agent tooling are either agent researchers who don't ship product, or product
> people who can't build the execution layer.

### Please tell us about an interesting project, preferably outside of class or work.

> `[FILL — pick 1–2 from the portfolio with real numbers. Suggested:]`
> SpaceEX — a native macOS storage explorer and manager in Swift: scans volumes,
> finds large/duplicate files, and reclaims space with a real UI. Notchly — a
> widget hub for the MacBook notch, shipped to users. I like building things that
> make a computer feel better to use; barkcli is the same instinct applied to
> agents.

### Please tell us in one or two sentences about the most impressive thing other than this startup that you or your team has built or done.

> I turn ideas into shipped products fast and alone: 14 products across
> Swift/macOS, Go, Rust, and Next.js by 25 — including Saasuji
> `[FILL: users/revenue]` — with Product Hunt launches and write-ups along the
> way. barkcli is the most serious of them: a full management stack (CLI, web,
> TUI, VS Code, MCP, registry, 257 tests) built in ~12 weeks.

### What have you learned so far?

> Agents fail at honesty more than at coding. Distribution is the bottleneck for
> dev tools — the product can be excellent and still invisible. Open source is
> the funnel, and verification is the moat: anyone can render a board; almost
> nobody can prove a branch passed the gate.

### What are the risks?

> (1) Incumbents bundle agent features (GitHub is the obvious one) — mitigated by
> being cross-backend and owning the verification contract, which they can't
> retrofit without rebuilding permissions and merge flows. (2) OSS monetization is
> hard — mitigated by charging only for server-side multiplayer/analytics, never
> the core. (3) Solo bandwidth — I ship fast, but a cofounder would help; the
> batch would accelerate hiring. (4) Agent vendors absorb task management —
> mitigated by being the neutral layer across all of them.

### Anything else we should know?

> Links: demo GIF on the landing page; interactive benchmark at `/benchmark`;
> skills registry at github.com/AkshatNaruka/barkcli-skills; v0.4.0 release with
> five-platform binaries. I'm applying solo, can be in San Francisco in January,
> and I'm fully committed to this for the long run.

---

## Before-submit checklist (Sat Nov 1)

- [ ] Launch happened; real numbers replace every `[FILL after launch]`
- [ ] Saasuji / Skilluply numbers filled (users, revenue — honest, even zero)
- [ ] Portfolio stats fixed (age 25, real repo/product counts)
- [ ] Education + work history filled
- [ ] `[VERIFY]` competitor names checked against reality
- [ ] Market-size answer has 1–2 links/sources
- [ ] `[DECIDE]` monetization conviction confirmed — the interview will probe it
- [ ] Video recorded (see `video-script.md`), under 60s, plays with sound
- [ ] Application reread aloud once — every sentence specific, no buzzwords
- [ ] Submitted by Sat evening IST (deadline Nov 2, 8pm PT = Nov 3, 8:30am IST)
