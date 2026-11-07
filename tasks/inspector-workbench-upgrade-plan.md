# Inspector / Workbench / Surfaces Upgrade Plan

Branch: `fix/inspector-steps-details` (incremental commits)
Scope: `web/` only, no backend/API contract changes. Preserve run/gate/review/merge behavior.
Design constraints: `DESIGN.md`, `web/REDESIGN_T3.md` (T3 graphite, progressive disclosure, quiet chrome, a11y, keyboard, token colors).

## Goals
1. Steps/Details polish (BARK-023/030-adjacent): clear running/completed/failed states, richer provenance from event data, consistent open-file deep links.
2. Inspector diff/review layout (BARK-025): better changed-files/revision cues, wrapping, actionable toolbar clarity; avoid risky UnifiedDiff rewrite.
3. Checks/Evidence/Context clarity (BARK-009/013/016/025): gate eligibility/freshness and tested vs target revision prominent; context pack/manifest/reuse and included sections/files visible; evidence entry points clear.
4. Surfaces/right sidebar richness (real data only): thread status, active attempt, blockers/warnings, real artifacts/subagents/tasks, contextual actions, polished T3 layout. No mock/demo fallbacks.

## Verification
- Targeted vitest for touched areas.
- `cd web && tsc --noEmit` / `npm run build`.
