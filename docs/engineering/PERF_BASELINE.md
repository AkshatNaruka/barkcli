# Performance / Context Baseline (A5, scoped)

**Date:** 2026-11-07  
**Baseline commit:** `80afdb5` (measured in worktree branch `plan/upgrade-a1-baseline`)  
**Host/toolchain:** rustc/cargo 1.97.1, node v26.13.0, npm 11.20.0 (darwin). Numbers are **point-in-time** on this machine; re-run and record hardware/OS/load for comparisons.

## 1. Context benchmark (first-party command, deterministic proxy)
Command:
```bash
cargo run -q -p barkcli --bin barkcli -- context benchmark --json
```
Raw output: `docs/engineering/context-benchmark-a5.json` (valid JSON).

Observed (from captured result):
| Metric | Value |
|---|---:|
| repo/commit/date | `barkcli` / `80afdb5` / `2026-11-07` |
| files_seen / files_scanned | 1818 / 1555 |
| cold_listing_tokens | 23632 |
| cold_locate_tokens | 769 |
| cold_read_tokens | 10569 |
| **cold_tokens** | **34970** |
| **warm_tokens** | **824** |
| warm_available | true |

**Methodology (per command):** deterministic proxy — directory listing → keyword search for active card titles → read top candidates. **No LLM measured, no model vendors involved.** Token counts are proxy/estimates per the tool’s implementation, not provider-billed actuals. The `queries`/`top_files` in the JSON reflect that proxy’s behavior (note: includes archived/demo/ios paths in candidates — useful signal for A5/C filtering quality).

## 2. Build/test timing (observed during A1/A1-ext)
| Command | Result | Time/notes |
|---|---|---|
| `cargo test -p barkcli-core --lib` | 419 passed, 0 failed | **~4.60s** |
| `cargo test -p barkcli-core --lib <product_plan test>` | 1 passed | ~0.00s (filtered run) |
| `cargo test -p barkcli-core --lib <a3 paraphrase test>` | 1 passed | ~0.22s (incl. cached build state) |
| `cargo fmt --all --check` | fail (drift) | fast; formatting debt |
| `cargo clippy -p barkcli-core --lib -- -D warnings` | fail (153 errors) | not timed precisely here; compile+lint cost significant |
| `cd web && npm ci` | pass | ~6s |
| `cd web && npm test -- --run` | 2 failed / 228 passed tests (51 files) | **~11.30s** |
| `cd web && npm run build` | pass | **~3.37s** (Vite chunk warnings: `OperationsView`/`index` large) |

## 3. Footprint / UX signals (qualitative, to quantify in C/E)
- Web production build warns on large chunks (>500kB pre-gzip threshold context in Vite output) — candidate for code-splitting/manualChunks.
- Context benchmark top candidates include non-source/demo/platform paths (`pages-test`, `barkcli-ios`, demo TS) — retrieval scoping/filtering may improve precision and token efficiency (C/P2).
- Warm context path shows large proxy reduction (34970 → 824) when available — validate with real manifest/reuse semantics and provider-actual tokens where supported.

## 4. Not yet measured (A5 remaining / Phase C-E)
- Full `cargo test --workspace` / `cargo clippy --workspace` wall time and flake rate.
- Symbol indexing latency/memory (native regex index) and incremental invalidation.
- Memory search latency, event streaming throughput (1k+ events), WS/SSE reconnect behavior.
- UI render responsiveness under large thread/history/diff payloads (React profiling).
- Disk footprint of `.board/` artifacts, worktrees, indexes; peak RAM/CPU during parallel runs.
- Cross-platform matrix (macOS/Linux/Windows) and provider-reported actual token/cost accounting.
- Competitor journey timing (DeepSeek Harness, T3 Code) — requires controlled demos.

## 5. A5 acceptance (scoped)
- [x] First-party context benchmark captured with reproducible command and raw JSON.
- [x] Key build/test timings recorded from A1/A1-ext with explicit pass/fail/skip context.
- [x] Limitations and next measurements documented (no fabricated competitor/LLM numbers).
- [ ] Full profiling matrix (indexing, streaming, UI, memory, disk, OS, provider-actual usage) — deferred to C/E with fixtures/harness.