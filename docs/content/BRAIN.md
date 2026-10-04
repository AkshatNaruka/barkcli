# Brain — the memory graph

barkcli's memory brain is a graph, not just a flat list. Nodes are things the
project knows about; edges are the relations between them. The graph is the
modern, human-brain-like form of the memory store:

- **Layers** — memory tiers act as layers, mirroring the hippocampus → cortex
  consolidation path in human memory:
  - `working` — the always-on buffer (current task context)
  - `short_term` — episodic memories from recent agent sessions
  - `long_term` — semantic facts/decisions that survived consolidation
  - `external` — archive of old sessions, cards, agents
- **Nodes** — memories, project facts, sessions, cards, agents
  (`kind: memory | fact | session | card | agent`)
- **Edges** — typed relations:
  - `derived_from` — memory came from a session
  - `touched_card` — session worked on a card
  - `related` — shared tags or similar content (Zettelkasten links)
  - `same_session` — memories from one session are interlinked
  - `produced_by` — memory/session created by an agent
  - `fact_of` — fact derived from a session

## How it improves over time

1. Every `barkcli session log` (fired by Claude/OpenCode hooks) ingests the
   session into memory and rebuilds the graph.
2. Consolidation promotes important memories, compresses short-term groups,
   and evicts stale ones — edges re-derive each pass.
3. Nodes that are surfaced to agents get `accessed` increments, and graph
   centrality (degree) boosts them in `memory brief`.
4. Near-duplicate memories (cosine > 0.95) collapse into one node; edges
   union — so the brain gets *denser*, not just *bigger*.

## Inspecting the brain

```bash
barkcli brain                      # node/edge counts, tiers, top-connected nodes
barkcli brain graph --json         # full graph dump
barkcli brain neighbors <node-id>  # one-hop relations for a node
```

The web app exposes a **Brain** tab: a force-directed, Obsidian-style graph.
Node size = importance + connections, color = layer, labels on hover/click,
zoom/pan, and filters by layer/kind/search.

REST: `GET /api/brain`, `GET /api/brain/node/:id`
MCP: `brain_graph`, `brain_neighbors`

## Research basis

- **MemGPT** (Packer et al., 2023) — OS-style tiered paging of memory.
- **Generative Agents** (Park et al., 2023, arXiv:2304.03442) — importance
  scoring + reflection.
- **MemoryBank** (Zhong et al., 2023, arXiv:2305.10250) — hierarchical
  summarization of episodic memory.
- **Mem0** (2025) — LLM fact extraction, dedup, merge on write.
- **A-MEM** (Xu et al., 2025, arXiv:2502.12110) — Zettelkasten-style linked
  notes, the direct inspiration for our `related` edges.
- **Zep / Graphiti** (2025, arXiv:2501.13956) — temporal knowledge graphs.
- **Graph-based Agent Memory** survey (arXiv:2602.05665) — taxonomy of
  graph-structured agent memory and evolution.
