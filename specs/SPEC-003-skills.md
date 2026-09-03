# SPEC-003 — Skills Registry (BMAD-style)

**Status:** planned  
**Branch:** `feat/spec-003-skills`  
**Depends:** SPEC-001, SPEC-002  
**Days:** 4  

## Goal

Repo carries its own crew: 4 opinionated skills (`mvp`, `planning`, `scrum-master`, `test`) that make every agent behave like a BMAD team without a plugin runtime. Skills are markdown files in repo, injected into every agent prompt.

## Context

Vision §9 + user decision 2026-09-03: Ship 4 builtins as Rust defaults, BMAD-aligned, not generic. Solo-first means solo dev gets scrum-master discipline for free; team-ready means skills travel with `git push`.

## Requirements

### R1 — Skill model + storage

NEW `barkcli-core/src/skills/mod.rs` + `registry.rs` + `loader.rs` + `builtin.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
  pub id: String,              // slug: "mvp"
  pub name: String,            // "MVP Slicer"
  pub description: String,     // one-liner frontmatter
  pub content: String,         // markdown body (after ---)
  pub triggers: Vec<String>,   // ["mvp","intake","feature"]
  pub source: SkillSource,     // Builtin | Project | UserHome
  pub path: Option<PathBuf>,   // Some(.board/skills/mvp.md)
}
#[derive(Debug, Clone)] pub enum SkillSource { Builtin, Project, User }

pub struct SkillRegistry { pub skills: Vec<Skill> }
impl SkillRegistry {
  pub fn load_all(board_name: Option<&str>) -> Result<Self> // scans 3 layers
  pub fn list(&self) -> &[Skill]
  pub fn get(&self, id: &str) -> Option<&Skill>
  pub fn matching(&self, ctx: &MatchContext) -> Vec<&Skill> // triggers ∩ labels/area/title tokens
}
pub struct MatchContext { pub labels: Vec<String>, pub area: Option<String>, pub title: String, pub pipeline_phase: String /* intake|plan|review|dispatch */ }
```

**Scan layers (priority Builtin < User < Project overrides):**

1. Builtin: embedded `include_str!("builtin/mvp.md")` etc. (compiled in)
2. User: `~/.board/skills/*.md` (global)
3. Project: `.board/skills/*.md` + optionally `skills/*.md` at repo root (if exists)

**Frontmatter parser:** simple: split on `---` header, parse `id:`, `name:`, `description:`, `triggers: [a,b]` via line split, no YAML dep. Fallback: filename = id, first `#` = name, rest = content, triggers = [].

### R2 — 4 Builtin skills content

NEW `barkcli-core/src/skills/builtin/{mvp,planning,scrum-master,test}.md`

**`mvp.md`**

```markdown
---
id: mvp
name: MVP Slicer
description: Ship smallest useful increment
triggers: [mvp, intake, feature, slice]
---
# MVP Slicer
- Keep child cards ≤3 days, effort 1-3
- One card = one deliverable, one PR
- Include "Out of Scope" in spec to bound agent
- Prefer vertical slice over horizontal layer
```

**`planning.md`**

```markdown
---
id: planning
name: Planning / Decomposition
description: Turn spec into agent-ready tasks
triggers: [plan, decompose, spec, planning]
---
# Planning
- Write requirements in EARS: "The system SHALL..."
- 2-6 child cards per feature, dependencies via BlockedBy
- Every task needs acceptance_criteria + context_files
- Split if effort >5 or risk high
```

**`scrum-master.md`**

```markdown
---
id: scrum-master
name: Scrum Master
description: WIP, blockers, next-action discipline
triggers: [scrum, dispatch, monitor, wip, blocker]
---
# Scrum Master
- WIP limit: ≤3 cards in doing, else bottleneck
- Blocked → link ty BlockedBy + surface in overview
- Priority: critical>high>medium>low, then FIFO
- Next: plan → dispatch → review, no skipping
```

**`test.md`**

```markdown
---
id: test
name: Test Architect
description: AC → tests before done
triggers: [test, review, verify, qa]
---
# Test Architect
- Every AC maps to checklist item, checked only when test passes
- Run `cargo test` before commit (or npm test / pytest fallback)
- Coverage hint: flagged files in FileContext.test_coverage must have tests
- Review gate: checklist done == total && tests_passed
```

Keep each <500 words (ETH Zurich minimal context), total injection <1.5k tokens.

### R3 — CLI `barkcli skills`

NEW `barkcli-core/src/commands/skills.rs`

- `barkcli skills list [--board <n>]` → table `ID | Name | Source | Triggers` + count
- `barkcli skills show <id>` → cat markdown
- `barkcli skills install <id> [--from <url/path>]` → copy `<id>.md` into `.board/skills/` (for MVP, just scaffolding: if builtin id, copy builtin content)
- Modify `cli.rs: dispatch` to route `"skills" => commands::skills::run_skills`

### R4 — Injection into agent prompts

Modify 3 places to call `SkillRegistry::load_all` + `matching`:

- `commands/intake.rs:60` — before `chat_json`, prepend to system prompt:

```
System:
You are intake... (existing)
## Project Skills (matching)
### MVP Slicer
...mvp.md content...
### Planning ...
```

- `commands/plan.rs:62` — same
- `barkcli-cli/src/listener.rs: build_agent_prompt:421` — before "## Instructions", add:

```
## Project Skills (2 matched)
...scrum-master.md...
...test.md...
## Files to Modify
...
```

Match logic: `ctx.triggers ∩ skill.triggers` non-empty OR label/area/title token overlap (reuse `code/symbols.rs: tokens_of`). Max 2-3 skills; if >3, take highest overlap, note " +1 more in .board/mind/digest.md".

### R5 — Heuristic fallback for intake/plan (offline)

Extend `commands/intake.rs: run_intake` and `plan.rs: run_plan`:

If `resolve_config:53` fails (no API key), do not bail; instead:

```rust
let heuristic_classification = |text: &str| {
  let lower = text.to_lowercase();
  let is_bug = lower.contains("crash") || lower.contains("error") || lower.contains("panic") || lower.contains("fix");
  let is_feature = lower.contains("add") || lower.contains("build") || lower.contains("implement");
  let priority = if lower.contains("critical") || lower.contains("urgent") { "high" } else { "medium" };
  IntakeClassification { card_type: if is_bug { "bug" } else { "feature" }.into(), priority: priority.into(), scope: "medium".into(), area: "fullstack".into(), labels: vec![], title: text.chars().take(60).collect(), description: text.into(), acceptance_criteria: vec!["AC via heuristic — refine after".into()] }
};
```

Add `--dry-run` already handles.

### R6 — Interaction with mind

`plan.rs` injection also adds `top_memories: store.search(card.title,3)` (from `mind::snapshot` reuse) after skills, so plan sees both conventions and project facts.

## Acceptance Criteria

- [ ] `barkcli skills list` shows 4 Builtin rows with triggers
- [ ] `barkcli skills show mvp` cats builtin markdown
- [ ] Manual: `barkcli intake "Add OAuth" --feature` with LLM available → system prompt includes `## Project Skills` (verified via `RUST_LOG=debug` or temp log)
- [ ] `BARKCLI_API_KEY="" barkcli intake "fix crash on checkout"` → heuristic card created, `priority=high`, `card_type=bug`, no crash
- [ ] `barkcli plan <id> --tasks` with offline → heuristic child cards (2) and queue `context_files` non-empty if `context scan` done
- [ ] `listener --dry-run` prompt contains 2 skills matched for a `label:test` card
- [ ] `cargo test` includes `skills::registry::tests`

## Out of Scope

- MCP `skill_list`/`skill_get` (team-ready fast-follow, not MVP CLI gate)
- Web Skills view
- Milestones
- ONNX

## File Impact

```
new:
  barkcli-core/src/skills/mod.rs
  barkcli-core/src/skills/registry.rs
  barkcli-core/src/skills/loader.rs
  barkcli-core/src/skills/builtin.rs
  barkcli-core/src/skills/builtin/mvp.md
  barkcli-core/src/skills/builtin/planning.md
  barkcli-core/src/skills/builtin/scrum-master.md
  barkcli-core/src/skills/builtin/test.md
  barkcli-core/src/commands/skills.rs
modified:
  barkcli-core/src/lib.rs                 # pub mod skills
  barkcli-core/src/cli.rs                 # dispatch skills, print_usage
  barkcli-core/src/commands/intake.rs     # heuristic + skill inject
  barkcli-core/src/commands/plan.rs       # heuristic + skill+memory inject
  barkcli-cli/src/listener.rs             # skill inject in build_agent_prompt
```

## Verification

```bash
cargo test skills
barkcli skills list
barkcli skills show planning
BARKCLI_API_KEY="" barkcli intake "fix auth crash" --dry-run
BARKCLI_API_KEY="" barkcli intake "fix auth crash" && barkcli list
barkcli plan <id> --dry-run
```
