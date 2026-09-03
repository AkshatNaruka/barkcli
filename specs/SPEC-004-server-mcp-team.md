# SPEC-004 — Server/MCP Team Protocol (Mind, Skills, Dispatch)

**Status:** planned → in_progress  
**Branch:** `feat/mvp-all-specs` (same branch, continuation)  
**Depends:** SPEC-001, SPEC-002, SPEC-003  
**Days:** 4 (Weeks 5-6)  

## Goal

Make MVP team-ready: any HTTP or MCP client can `mind sync`, `skills list`, `dispatch`, `intake` without CLI. Wire `Card.spec_id` so spec ↔ card ↔ task is O(1).

## Requirements

### R1 — Card.spec_id (O(1) traceability)

Add to `models/card.rs:5 Card`:

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
pub spec_id: Option<String>,
```

- Back-compat: `default None`, YAML omit when None.
- Update `Default::default()`, `Card::new()` sets `spec_id: None`.
- On `commands/intake.rs: create_spec_from_intake:286` set `card.spec_id = Some(spec_id)` after `upsert_spec`.
- On `commands/plan.rs: create child cards` set `child.spec_id = Some(parent_card_id) // parent card's id as spec anchor, or spec id if parent has spec_id)` — use parent's `spec_id.unwrap_or(parent_id)`.
- Add migration: existing cards without spec_id remain None, no data loss.

### R2 — Server: /api/mind + /api/skills

Extend `barkcli-server/src/lib.rs:79 Router`:

```rust
.route("/api/mind", get(mind_snapshot_handler))
.route("/api/mind/digest", get(mind_digest_handler))
.route("/api/skills", get(list_skills_handler))
.route("/api/skills/:id", get(get_skill_handler))
```

Handlers:
- `mind_snapshot_handler: State<AppState> Query<BoardQuery>` → calls `barkcli_core::mind::snapshot::build(board_name)` then `Ok(Json(snapshot))`
- `mind_digest_handler` → `snapshot::digest::render(&snapshot)` as `Json({digest: String})` or `text/markdown`
- `list_skills_handler` → `SkillRegistry::load_all(None)` → `Json({skills: Vec<Skill>})`
- `get_skill_handler: Path<String>` → single skill or 404

All handlers reuse `resolve_board_name(&state, query.name)` and `ServerError::bad/internal`.

WS live reload already watches `.board/mind/*.json` via `watch_board_files:923` (metadata `.json` change triggers reload) — no extra work.

### R3 — MCP: mind_snapshot, overview, skill_list, skill_get, intake

Extend `barkcli-core/src/mcp.rs:239 tools/list` (33 → 38 tools) and `handle_tools_call:928`:

- `mind_snapshot: {board?}` → `snapshot::build(board_name)` → pretty JSON content
- `overview: {board?}` → `snapshot::build` + `digest::render` → text
- `skill_list: {}` → `SkillRegistry::load_all(None)` → array
- `skill_get: {id}` → single skill
- `intake: {text, bug?:bool, feature?:bool, board?}` → runs `intake::run_intake` logic without CLI (calls heuristic or LLM) and returns `{card_id, title, spec_created}`

Update `tools_list` JSON schemas accordingly, keep existing tools untouched.

### R4 — Dispatch consistency (team)

Ensure server `orchestrate/cycle` and CLI `dispatch` share same `OrchestrationEngine` persistence (already fixed in SPEC-001). No new code except alias already exists.

### R5 — Tests

- `barkcli-core/src/models/card.rs: Card::new sets spec_id None, serialize omits`
- `barkcli-core/src/mind/snapshot.rs: R1 integration` — create card with spec_id, snapshot shows it?
- `barkcli-server` handler tests: spin temp project, `mind_snapshot` returns `stats.total`
- `mcp: skill_list` returns 4, `mind_snapshot` board? returns snapshot

## Out of Scope

- Web MindView TUI tabs (SPEC-005)
- Milestones/Roadmap (SPEC-005)
- ONNX

## File Impact

```
modified:
  barkcli-core/src/models/card.rs               # R1
  barkcli-core/src/commands/intake.rs           # set spec_id
  barkcli-core/src/commands/plan.rs             # set spec_id on child
  barkcli-core/src/mcp.rs                       # R3 5 tools
  barkcli-server/src/lib.rs                     # R2 4 routes + handlers
new:
  barkcli-server/src/handlers/mind.rs? (or inline in lib.rs)
```

## Verification

```bash
cargo test -p barkcli-core skills mind card
TEST_DIR=$(mktemp -d) && cd $TEST_DIR && /path/barkcli init && /path/barkcli create t && /path/barkcli add "A" -p high && BARKCLI_API_KEY="" /path/barkcli intake "Add OAuth feature" --feature && /path/barkcli mind sync && cat .board/mind/t.json | jq .stats.total
curl http://localhost:4321/api/mind?name=t | jq .stats.total
barkcli mcp # then tools/call mind_snapshot
```
