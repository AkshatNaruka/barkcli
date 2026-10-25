# YC interview pack — barkcli (W27)

Interview is 10 minutes, 2–3 partners, rapid-fire. They will interrupt. Answers
should be **10–20 seconds**, numbers first, no setup. If you don't know: "I don't
know — here's how I'd find out." Never argue, never bluff.

**Memorize these:** 257 tests · 71 MCP tools · 5 platforms · 57.1× context proxy
(29,400 → 515 tokens) · 14 products · 53 repos · ~12 weeks · v0.4.0 Oct 25 ·
$20/seat/mo · 10k teams × 10 seats = $24M ARR · solo, 25, Indore, can be in SF Jan.

---

## The 20 questions

### 1. What does barkcli do?
> The management layer for coding agents. Agents get a task queue, an isolated git
> worktree, and an acceptance gate that runs your tests. Only gate-passing branches
> merge. Teams watch every agent live.

### 2. Who is it for? Who's using it today?
> Engineers and small teams already running Claude Code, Codex, or OpenCode on real
> repos. Today: me daily, plus `[FILL: real users from launch]`. The buyer is the
> eng lead who has 3–10 agents running and no idea what they're doing.

### 3. Why won't Linear/Jira/GitHub Projects just do this?
> They're human-first cloud databases. They track what people say they did. They
> can't run a gate in an agent's worktree or decide whether a branch merges. The
> board is the easy part; the verification contract is the product.

### 4. Why won't Anthropic/OpenAI/Cursor build this themselves?
> They're building the agent, and each one wants you inside their walled garden.
> The management layer has to be neutral across backends — that's why it's
> open-source and repo-native. If they bundle task lists, that's single-player and
> self-reported; we're the cross-agent layer with an external gate.

### 5. You're free forever — how do you make money?
> The CLI is MIT and stays free — it's distribution. The company sells what only a
> server can do: shared live agent sessions, cloud board sync, and reliability
> analytics. ~$20/user/month. 10k teams × 10 seats = $24M ARR. No revenue today;
> the paid layer ships when teams ask for it.

### 6. What's your traction?
> Honest: `[FILL: X stars, Y downloads, Z users, N stories]` since launch on
> `[date]`. Before that, private dogfooding for ~12 weeks — 257 tests, v0.4.0 on
> five platforms. No revenue.

### 7. Why are you the right person?
> I've been the customer for three months and I ship the whole stack alone: Rust
> core, web app, TUI, VS Code, MCP, five distribution channels. 14 products before
> this. Every mechanism in barkcli came from a failure I personally hit.

### 8. You're solo. Why? Would you take a cofounder?
> Solo because I can build and ship the entire stack, and I've done it 14 times.
> `[DECIDE: "I'm open to a technical cofounder strong in growth/devrel" OR "I'm not
> looking — I'd rather hire around the gaps after the batch."]` The batch is where
> I'd fix that.

### 9. What's the hardest technical problem you solved?
> Making "done" trustworthy under parallelism. Each attempt gets a worktree and a
> lease; the gate runs in that worktree; gate-passing branches merge through a
> train; conflicted branches re-run solo against a frozen main. The hard part is
> the state machine — dead agents, stale leases, rebases — not the LLM call.

### 10. What did you learn from launch week?
> `[FILL after launch — be specific: what surprised you, what broke, what users
> asked for first.]` Pre-launch lesson: distribution is harder than the build, and
> "agent said done but broke the build" is a universal complaint.

### 11. What will you build during the batch?
> The multiplayer cloud: (1) shared live sessions — drop into a teammate's running
> agent, watch, redirect, hand off; (2) cloud board sync across repos; (3)
> reliability analytics — gate pass rate and cost per completed task by backend.
> Then a GitHub Action so runs happen in CI with zero install.

### 12. How do you get your first 1,000 users?
> The OSS funnel: HN/Reddit/X launch, then the places agents are already discussed.
> The one-liner and the GIF do the selling. Then design partners: 10 teams running
> agents, weekly feedback, paid multiplayer when it exists. I've launched on
> Product Hunt before; I know how to run a launch week.

### 13. What is the 57× benchmark, exactly?
> A deterministic context-cost proxy on this repo: a cold agent session costs
> ~29,400 tokens of listing/searching/reading; one read of the auto-maintained
> `project_context.md` is ~515. It measures context, not agent quality, and it's
> re-runnable with `barkcli context benchmark --json`. I don't claim it makes
> agents 57× better.

### 14. Show me the product.
> Have the demo repo pre-staged (see `video-script.md`). 60-second path:
> `barkcli run "..." --agents 3 --test-cmd "node test.js" --yes` → live web view →
> merge report → `git log` on main. If they ask for a real agent, use OpenCode with
> a fast model; if the network fails, say so and fall back to the scripted demo,
> labeled as scripted.

### 15. What's the biggest risk?
> GitHub bundling agent management into Projects + Actions + Copilot. We mitigate
> by being cross-backend and owning the verification contract — they'd have to
> rebuild permissions and merge flows to match it. Second risk: OSS monetization;
> we charge only for server-side multiplayer, never the core.

### 16. Why now?
> Agents crossed from demo to daily production use in the last 18 months. That's
> exactly when teams discover they can't verify any of it. Before agents, this
> product made no sense; in two years it may be bundled. The window is now.

### 17. Who's your first paying customer?
> A 5–20 person product team running 3+ coding agents, with a test suite and a
> release process — they feel the merge collisions and the "done but broken" pain
> weekly. `[FILL: name any design partner from launch.]`

### 18. How big can this be? Bottom-up.
> Every team that employs coding agents needs coordination and verification. At
> $20/seat, 10k teams × 10 seats = $24M ARR; 100k teams = $240M. Comparable PM
> seats price at $10–20/user/mo. YC's Fall '26 RFS names "Multiplayer AI" as the
> area — shared agents for teams.

### 19. What would make you give up?
> If teams using agents at scale told me verification doesn't matter because the
> agents become reliable enough — I'd test that hard before believing it. Or if
> distribution stays at zero after two more launch cycles. Neither is true today.

### 20. Why YC / why W27?
> I want the batch's pressure on distribution and the network for design partners
> and hiring. I can be in SF Jan–Mar. I'm building the company, not a side project
> — the free core is the funnel, the multiplayer layer is the business.

---

## Questions to ask them (pick 2, only if time)

- "For a solo founder selling to eng teams, what would you want to see in the
  first 10 weeks?"
- "Would you push the paid multiplayer layer earlier, or keep dogfooding free
  until teams pull it?"
- "What's the failure mode you've seen for OSS dev tools that monetize late?"

## Mechanics

- **Setup:** laptop charged, demo repo pre-staged, browser tabs: repo, live view,
  benchmark, application. Terminal font large. Phone silenced.
- **Camera:** look at the lens, smile, energy up 20%. Speak in the first 5 seconds.
- **If interrupted:** stop mid-sentence. Answer the new question. Don't finish your
  thought.
- **If challenged on a number:** give the number, then the method. If wrong, say
  "that's the number I have; I'd verify it."
- **If the demo breaks:** "Let me show you the recording" (have the GIF/video
  ready) — then explain what should have happened. Don't debug live for 2 minutes.
- **End strong:** "The core is free forever; the company is the multiplayer layer.
  I'm all in."
