# The Trust Layer — research and opportunity brief

**Date:** 2026-10-28
**Status:** research complete; scope approved (Receipt + Guard + risk-ranked review)
**Decision record:** `specs/SPEC-007-trust-layer.md`, `specs/PLAN-007-trust-layer.md`

## Why this exists

barkcli already runs agents in isolated worktrees, gates merges on the
project's tests, and keeps a merge train for whatever passes. The next
constraint is not generation and it is not orchestration. It is **trust**:
knowing whether the work is correct, what was actually verified, and which
change deserves a human's attention first.

This brief collects the evidence, scores the candidate problems, and explains
why the Trust Layer is the right next surface for barkcli.

## Method and limits

Desk research across developer surveys, controlled studies, security research,
and a competitor scan. Vendor surveys have commercial incentives; we treat
their magnitudes as indicative and only act where independent and vendor
sources agree on direction. The competitor scan reflects public positioning as
of October 2026.

## Executive summary

1. **Generation got cheap; verification did not.** Developers report that AI
   output is usually close but rarely correct enough to merge unread, and that
   reviewing it costs more time than writing it did.
2. **Trust is the product gap.** Orchestration is crowded. The artifact that
   answers "why should I trust this merge?" does not exist as a category.
3. **barkcli already owns the ingredients.** Worktrees, a deterministic gate,
   run records, review state, complexity metrics, and test mapping are all in
   the repo. The Trust Layer is integration work, not a new product.
4. **The wedge is a receipt, not a dashboard.** A verifiable, hashable record
   of intent → agent → diff → gate → guard → review is defensible, local-first,
   and useful even to teams that never adopt another agent tool.

## The shift: from writing code to trusting it

| Signal | Number | Source |
|---|---|---|
| Committed code that is AI-assisted | 42% (65% projected for 2027) | Sonar, *State of Code 2025* |
| Developers who do not fully trust AI code | 96% | Sonar 2025 |
| Say AI code "looks correct but is unreliable" | 53% | Sonar 2025 |
| Now spending more time reviewing AI code | 67% | Sonar 2025 |
| Spend more time debugging AI problems | 52% | Sonar 2025 |
| Output that is "almost right, but not quite" | 66% | Stack Overflow 2025 |
| Say debugging AI code takes more time | 45.2% | Stack Overflow 2025 |
| Distrust AI accuracy | 46% | Stack Overflow 2025 |
| AI code that fails security tests | 45% (XSS: 86%) | Veracode 2025 |
| AI-suggested packages that do not exist | 19.7%, repeating 43% across prompts | USENIX Security 2025 |
| Experienced devs slower with AI, while believing faster | −19% actual / +20% perceived | METR 2025 |
| Ship faster with AI, but same or more friction | 87% / 72% | Atlassian 2026 |
| Regularly correct AI output | 65% | Atlassian 2026 |
| Little or no trust in AI code | 30% | DORA 2025 |

Two findings matter more than the rest:

- **The perception gap is a verification gap.** METR's experienced developers
  were 19% slower while believing they were 20% faster. When the feedback loop
  is subjective, teams cannot tell whether AI is helping. A receipt makes the
  loop objective.
- **AI amplifies existing dysfunction.** DORA found AI adoption correlates
  negatively with delivery stability and amplifies whatever process already
  exists. A weak gate plus more agents produces more unverified code faster.
  Verification has to be part of the agent loop, not an afterthought.

## Problem inventory

Scored 1–5. Weighted: pain 30%, frequency 20%, barkcli fit 25%, low effort 15%,
differentiation 10%.

| # | Problem | Pain | Freq | Fit | Low effort | Diff | Score | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | "Is this AI change actually correct?" | 5 | 5 | 5 | 3 | 4 | **4.60** | Build — Guard + Receipt |
| 2 | No auditable proof of what/why merged | 4 | 3 | 5 | 4 | 5 | **4.15** | Build — Receipt |
| 3 | Which change should I review first? | 5 | 5 | 5 | 4 | 4 | **4.75** | Build — Review queue |
| 4 | Hallucinated deps, leaked secrets, slopsquatting | 4 | 4 | 5 | 5 | 4 | **4.40** | Fold into Guard |
| 5 | Flaky tests poison the gate | 3 | 4 | 4 | 2 | 3 | 3.30 | Later |
| 6 | Context switching / finding information | 4 | 5 | 2 | 2 | 1 | 3.10 | Skip |
| 7 | Unclear requirements | 4 | 4 | 2 | 2 | 1 | 2.90 | Skip |
| 8 | Code archaeology ("why is this here?") | 3 | 3 | 4 | 2 | 3 | 3.10 | Later |
| 9 | Spec / doc drift | 3 | 3 | 4 | 2 | 3 | 3.10 | Later |
| 10 | More agents / orchestration | 3 | 3 | 2 | 2 | 1 | 2.40 | Do not compete |

### Why 1, 3, and 4 collapse into one feature

They are three views of the same evidence:

- **Guard** answers "what is wrong with this diff?"
- **Receipt** answers "what was checked, by whom, and can I verify it later?"
- **Review queue** answers "given limited attention, what should I look at?"

Building any one alone leaves the loop open. Together they turn barkcli's gate
from a pass/fail bit into a trust record.

## Competitive landscape

**Crowded: orchestration.** Vibe Kanban, Conductor, Claude Squad, Sculptor,
Cursor cloud agents, and a new fleet of "run N agents" tools. The reported
ceiling is 3–6 concurrent agents, and the limiting factor is review capacity,
not spawn capacity.

**Adjacent: PR review bots.** CodeRabbit, Greptile, Qodo Merge, and Graphite
review pull requests. They are useful, but they are not native to the agent
loop: they do not know which worktree produced the branch, which gate command
ran, how many attempts failed first, or what the agent was asked to do.

**Empty: verifiable merge provenance.** No product we found markets a
verifiable artifact tying intent, agent/model, worktree, diff, gate result,
deterministic risk scan, and review state into one hashable record. A search
for "merge receipt" produced no direct competitor.

That is the gap: not another review UI, but **portable proof of work**.

## Why barkcli is positioned to own it

Existing primitives that the Trust Layer reuses:

| Primitive | Location | Used for |
|---|---|---|
| Worktree lifecycle | `agent/worktree.rs` | Branch provenance |
| Acceptance gate | `agent/verify.rs` | What actually ran, and its result |
| Run records | `runtime/event.rs`, `runtime/store.rs` | Provider, model, base/head SHA, diff stats, usage |
| Run pipeline | `commands/run_cmd.rs` | Guard + receipt insertion points |
| Review state | `review.rs` | Open comments, viewed files |
| Complexity metrics | `code/metrics.rs` | Review risk scoring |
| Test mapping | `code/tests.rs` | Missing-test checks |
| Secret patterns | `util/redact.rs` | Guard's secret check |
| MCP server | `mcp.rs` | Agent-facing access |
| Server + web | `barkcli-server`, `web/` | Human-facing access |

None of this has to be invented. The work is connecting it and making the
result verifiable.

## Recommended scope

### 1. `barkcli receipt`

A proof-of-work artifact written on every successful merge (and available on
demand):

- intent / card and task
- agent, provider, model, attempts
- branch, base SHA, head SHA, worktree
- files, additions, deletions, test files changed
- gate command, pass/fail, duration, log path
- guard findings, by severity
- review state (open/resolved comments, viewed files)
- a confidence rating with explicit reasons
- a SHA-256 content hash, verifiable later

Stored locally in `.board/receipts/<id>.{json,md}`. Markdown is exportable for
PR comments. The JSON is the canonical artifact.

### 2. `barkcli guard`

A deterministic, offline pre-merge scan of the diff:

- secrets in added lines (reusing redaction rules, never printing the value)
- undeclared or hallucinated dependencies
- near-miss / typosquatted dependency names (Levenshtein)
- manifest changed without lockfile
- dangerous patterns (`shell=True`, disabled TLS verification, `--no-verify`,
  `curl | sh`)
- production code changed without tests
- debug leftovers
- oversized diffs

Advisory by default; blocking is a config switch. Exit codes are CI-friendly.

### 3. `barkcli review next` / `review queue`

Risk-ranked review ordering from signals barkcli already has:

- security-sensitive paths (auth, crypto, payments, sessions, SQL, exec)
- complexity of changed files
- production changes without test changes
- churn (lines changed)
- public API surface changes
- diff size

Tiers: **must review** (≥70), **should review** (≥40), **skim** (<40). Every
score is explainable, with the reasons that produced it.

## Non-goals

- More orchestration, fleets, or agent-spawning features.
- A general project-management surface.
- Hosted storage, accounts, or a cloud dashboard.
- Blocking merges by default in v1 (advisory first, then dogfood the numbers).
- Network calls during guard or receipt generation.

## Risks and counterarguments

| Risk | Response |
|---|---|
| "Agents will verify themselves." | Self-reports are not evidence. The gate and guard run outside the agent, in a worktree barkcli controls. |
| "PR review bots already do this." | They review a PR; they do not know the agent run, gate command, retries, or worktree provenance. Receipts are complementary and portable. |
| "Guard false positives will annoy people." | Advisory by default, per-check config, and a v1.1 inline suppression syntax. Precision is a tracked metric. |
| "A receipt can be gamed by weak tests." | True. Confidence measures process evidence, not correctness. The receipt says exactly what ran so a human can judge test quality. |
| "Too much friction." | Receipt generation is automatic and silent; guard adds one fast local scan. The only new human action is reading the receipt. |
| "Local receipts do not help teams." | Markdown export covers PR comments and audits. Hosted sharing is a later, separate decision. |

## Success metrics

Track after one release of dogfooding:

- **Receipt coverage:** % of merges with a receipt (target: >90%).
- **Confidence distribution:** % High / Medium / Low, and whether Low
  correlates with rework.
- **Guard precision:** confirmed findings / total error findings (target:
  >80%; if lower, demote the check to warning).
- **Time to first review:** median branch-ready → first review comment.
- **Review hit rate:** % of "must review" items that produced a change request
  (validates the risk weights).
- **Escaped defects:** post-merge fixes within 7 days per 100 merges, before
  and after.
- **Trust survey:** quarterly, 5-point agreement with "I can tell what was
  verified before this merged."

## Sources

| Source | Used for |
|---|---|
| Stack Overflow, *2025 Developer Survey — AI* (survey.stackoverflow.co/2025/ai) | 66% "almost right", 45.2% debugging time, 46% distrust |
| Sonar, *State of Code 2025* (sonarsource.com) | 42% AI-assisted, 96% distrust, 67% more review, 52% debugging, 53% looks-correct, 40% duplicative code |
| Atlassian, *State of Developer Experience 2026* (atlassian.com) | 87% faster, 72% friction, 65% corrections |
| Google Cloud DORA, *2025 State of AI-assisted Software Development* (dora.dev) | Amplification, delivery stability, 30% low trust |
| METR, *Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity* (metr.org) | −19% actual vs +20% perceived |
| Veracode, *2025 GenAI Code Security Report* (veracode.com) | 45% security failure, 86% XSS |
| USENIX Security 2025, package-hallucination study (usenix.org) | 19.7% hallucinated packages, 43% repetition |
| Google, *Flaky Tests at Google and How We Mitigate Them* (2016) | ~2.5% of developer time lost to flaky tests |

Vendor figures are directional. The independent signals (METR, DORA, USENIX)
and the vendor signals agree on the direction: verification, not generation,
is the constraint.
