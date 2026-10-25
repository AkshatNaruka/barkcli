# Show HN: Barkcli — git-native management layer for AI coding agents

*(draft — adjust to whatever is fresh at post time; numbers verified against the repo at `339f66a`)*

---

**Title:** Show HN: Barkcli – Git-native management layer for AI coding agents (Rust, MIT)

**Link:** https://github.com/AkshatNaruka/barkcli

**First comment (the meat):**

> Hi HN — I've been living in AI coding agents for the last year, and the thing that kept breaking wasn't the model. It was everything around it: where does the task list live, what is the agent working on right now, and how do I trust "done"?
>
> Barkcli is my answer. It's a single Rust binary (also a TUI, a web app, and 40+ MCP tools) that keeps tasks, specs, memory, skills, and agent runs as plain YAML/JSON *inside your repo*. No account, no cloud, no database — `git diff` is the audit log.
>
> The core loop is the part I'm most happy with: `barkcli run "ship the settings redesign" --agents 3 --yes` plans the intent into tasks, spawns up to N agents in isolated git worktrees with 30s lease heartbeats, watches each transcript, and runs *your project's own tests* as the acceptance gate. Three rules make it honest:
>
> 1. Done means the gate passed in the worktree — never that the agent said so. A crashed agent with no changes and a no-op gate still fails.
> 2. Gate-passing branches ride a merge train in finish order; a conflicted branch re-queues, waits for the pool to drain, and re-runs solo against a frozen main — so merges converge instead of thrashing.
> 3. Every verdict (gate output, attempts, branch) is recorded in the run report and in cross-session memory, so the next run doesn't repeat the last one's mistakes.
>
> Skills are the other half: small markdown playbooks installed from any git repo (barkcli skills install AkshatNaruka/barkcli-skills) and pinned in a committed skills.lock — rev + sha256 per skill. Publish yours back with a branch + gh PR.
>
> It's MIT, self-contained, and works with OpenCode, Claude Code, Codex, or any script via BARKCLI_AGENT_CMD. Happy to answer questions about the merge train, the lease model, or why I think boards belong in git.

**Smaller variants if the thread prefers terseness:**

- "Task tracker whose database is your repo: barkcli. Agents read/write the same board, and `barkcli run --agents 3` merges their work only when your tests pass in their worktree."
- "Jira for humans managers a team; barkcli is the missing manager for your coding agents — boards, specs, memory, skills, and an acceptance-gated merge train, all files in git."

**Asset notes:**
- GIF: https://github.com/AkshatNaruka/barkcli/raw/master/landing-next/public/run-agents-demo.gif (also embedded on https://barkcli.vercel.app)
- Benchmark claim (context-file cold start): https://barkcli.vercel.app/benchmark — deterministic, re-runnable via `barkcli context benchmark --json`.

**Reminders for post day:** only post once the repo is public & README is current; monitor thread for 2h; answer technical criticisms with numbers (250 tests, 57.1× @ 339f66a) rather than claims; pin the GIF reply.
