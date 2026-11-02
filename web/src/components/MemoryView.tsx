import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { MemoryEntry, ProjectFact, MemoryTier } from "../lib/types";
import { Icon } from "./Icon";
import { fetchMemory, addMemory, deleteMemory, fetchMemoryStats, addFact, fetchFacts, ingestMemory, consolidateMemory } from "../lib/api";
import { QuietSelect } from "./QuietSelect";

const TIER_COLORS: Record<string, string> = {
  working: "#60a5fa",
  short_term: "#facc15",
  long_term: "#4ade80",
  external: "#94a3b8",
};

const TIER_LABELS: Record<string, string> = {
  working: "Working",
  short_term: "Short-term",
  long_term: "Long-term",
  external: "External",
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  convention: { bg: "rgba(59, 130, 246, 0.12)", text: "#60a5fa", border: "rgba(59, 130, 246, 0.25)" },
  pattern: { bg: "rgba(99, 102, 241, 0.12)", text: "#818cf8", border: "rgba(99, 102, 241, 0.25)" },
  architecture: { bg: "rgba(168, 85, 247, 0.12)", text: "#c084fc", border: "rgba(168, 85, 247, 0.25)" },
  decision: { bg: "rgba(16, 185, 129, 0.12)", text: "#34d399", border: "rgba(16, 185, 129, 0.25)" },
  preference: { bg: "rgba(20, 184, 166, 0.12)", text: "#2dd4bf", border: "rgba(20, 184, 166, 0.25)" },
  gotcha: { bg: "rgba(245, 158, 11, 0.12)", text: "#fbbf24", border: "rgba(245, 158, 11, 0.25)" },
  perf: { bg: "rgba(244, 63, 94, 0.12)", text: "#fb7185", border: "rgba(244, 63, 94, 0.25)" },
};

const FACT_CATEGORIES = [
  "convention",
  "pattern",
  "architecture",
  "decision",
  "gotcha",
  "perf",
  "preference",
] as const;

const FACT_STARTER_TEMPLATES = [
  { label: "Tests as Gate", category: "convention", text: "Project tests are the acceptance gate; do not report complete without passing tests." },
  { label: "Isolated Worktrees", category: "architecture", text: "All code edits run in isolated worktrees before merge train integration." },
  { label: "Preserve Existing Docs", category: "convention", text: "Always preserve documentation integrity and keep unrelated comments intact." },
  { label: "Clean Dependencies", category: "gotcha", text: "Avoid installing unnecessary heavy npm or cargo dependencies without explicit reason." },
];

export function MemoryView({ boardName }: { boardName: string | null }) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ total: number; by_tier: Record<string, number>; facts: number } | null>(null);
  const [facts, setFacts] = useState<ProjectFact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filterTier, setFilterTier] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [newContent, setNewContent] = useState("");
  const [newTier, setNewTier] = useState<MemoryTier>("short_term");
  const [newTags, setNewTags] = useState("");
  const [showAddFact, setShowAddFact] = useState(false);
  const [factText, setFactText] = useState("");
  const [factCategory, setFactCategory] = useState("convention");
  const [tab, setTab] = useState<"memories" | "facts">("memories");
  const [loading, setLoading] = useState(true);
  const [brainMsg, setBrainMsg] = useState<string | null>(null);

  // Debounce search query to reduce unnecessary fetches
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleIngest = async () => {
    setBrainMsg("Ingesting sessions…");
    const r = await ingestMemory(boardName || undefined);
    setBrainMsg(r ? `Ingested ${r.sessions_ingested} session(s), ${r.memories_added} new memories` : "Ingest failed");
    load();
  };

  const handleConsolidate = async () => {
    setBrainMsg("Consolidating…");
    const r = await consolidateMemory(boardName || undefined);
    setBrainMsg(r ? `${r.promoted} promoted, ${r.evicted} evicted` : "Consolidate failed");
    load();
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [memData, statsData, factsData] = await Promise.all([
      fetchMemory(boardName || undefined, debouncedQuery || undefined, filterTier || undefined),
      fetchMemoryStats(boardName || undefined),
      fetchFacts(boardName || undefined),
    ]);
    setMemories(memData.memories);
    setTotal(memData.total);
    setStats(statsData);
    setFacts(factsData);
    setLoading(false);
  }, [boardName, debouncedQuery, filterTier]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    const tags = newTags.split(",").map(t => t.trim()).filter(Boolean);
    await addMemory(newContent, newTier, tags.length > 0 ? tags : undefined, undefined, boardName || undefined);
    setNewContent("");
    setNewTags("");
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteMemory(id, boardName || undefined);
    load();
  };

  const handleAddFact = async () => {
    if (!factText.trim()) return;
    await addFact(factText, factCategory, undefined, undefined, boardName || undefined);
    setFactText("");
    setShowAddFact(false);
    load();
  };

  const handleAddPresetFact = async (text: string, cat: string) => {
    await addFact(text, cat, undefined, undefined, boardName || undefined);
    load();
  };

  const filteredFacts = useMemo(() => {
    let result = facts;
    if (selectedCategory !== "all") {
      result = result.filter(f => f.category.toLowerCase() === selectedCategory.toLowerCase());
    }
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter(f => f.fact.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
    }
    return result;
  }, [facts, selectedCategory, debouncedQuery]);

  return (
    <div className="h-full flex flex-col p-4 gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-text">Memory</h2>
          <p className="text-xs text-muted">Cross-session knowledge and project facts</p>
        </div>
        {stats && (
          <div className="flex gap-3 text-xs text-muted">
            <span className="bg-surface px-2 py-0.5 rounded border border-border">{stats.total} memories</span>
            <span className="bg-surface px-2 py-0.5 rounded border border-border">{stats.facts} facts</span>
          </div>
        )}
      </div>

      {/* Brain controls */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleIngest}
          className="px-3 py-1.5 bg-accent text-white text-xs rounded font-medium hover:bg-accent-hover transition-colors"
        >
          Ingest sessions
        </button>
        <button
          onClick={handleConsolidate}
          className="px-3 py-1.5 bg-card border border-border text-text text-xs rounded font-medium hover:border-border-strong transition-colors"
        >
          Consolidate
        </button>
        {brainMsg && <span className="text-xs text-muted animate-fadeIn">{brainMsg}</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 shrink-0 w-fit border border-border">
        {(["memories", "facts"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium capitalize transition-colors ${
              tab === t ? "bg-card text-text shadow-sm" : "text-muted hover:text-text"
            }`}
          >
            {t} {t === "facts" ? `(${facts.length})` : `(${total})`}
          </button>
        ))}
      </div>

      {tab === "memories" && (
        <>
          {/* Search & Filter */}
          <div className="flex gap-2 shrink-0">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search memories..."
                className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <span className="absolute left-2.5 top-2.5 text-muted pointer-events-none">
                <Icon name="search" size={14} />
              </span>
            </div>
            <QuietSelect
              value={filterTier}
              onChange={e => setFilterTier(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">All tiers</option>
              <option value="working">Working</option>
              <option value="short_term">Short-term</option>
              <option value="long_term">Long-term</option>
              <option value="external">External</option>
            </QuietSelect>
          </div>

          {/* Add Memory */}
          <div className="bg-surface border border-border rounded-lg p-3 shrink-0">
            <textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="Add a memory to preserve cross-session context..."
              className="w-full bg-transparent text-sm text-text placeholder:text-muted resize-none focus:outline-none"
              rows={2}
            />
            <div className="flex items-center gap-2 mt-2">
              <QuietSelect
                value={newTier}
                onChange={e => setNewTier(e.target.value as MemoryTier)}
                className="bg-card border border-border rounded px-2 py-1 text-xs text-text"
              >
                <option value="working">Working</option>
                <option value="short_term">Short-term</option>
                <option value="long_term">Long-term</option>
                <option value="external">External</option>
              </QuietSelect>
              <input
                type="text"
                value={newTags}
                onChange={e => setNewTags(e.target.value)}
                placeholder="tags (comma-separated)"
                className="flex-1 bg-card border border-border rounded px-2 py-1 text-xs text-text placeholder:text-muted"
              />
              <button
                onClick={handleAdd}
                disabled={!newContent.trim()}
                className="px-3 py-1 bg-accent text-white text-xs rounded font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                Add Memory
              </button>
            </div>
          </div>

          {/* Memory List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-surface rounded-lg animate-pulse" />
                ))}
              </div>
            ) : memories.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border rounded-lg">
                <p className="text-sm text-muted">No memories found</p>
                <p className="text-xs text-muted mt-1">Ingest sessions or add items manually to warm up agent memory.</p>
              </div>
            ) : (
              memories.map(m => (
                <div key={m.id} className="bg-surface border border-border rounded-lg p-3 group hover:border-border-strong transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-text flex-1 whitespace-pre-wrap">{m.content}</p>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      title="Delete memory"
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted bg-card px-1.5 py-0.5 rounded border border-border">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: TIER_COLORS[m.tier] || "var(--muted)" }} title={TIER_LABELS[m.tier] || m.tier} />
                      {TIER_LABELS[m.tier] || m.tier}
                    </span>
                    {m.tags.map(tag => (
                      <span key={tag} className="text-[10px] text-muted bg-card px-1.5 py-0.5 rounded border border-border">
                        #{tag}
                      </span>
                    ))}
                    {typeof m.importance === "number" && (
                      <span className="text-[10px] text-accent-text bg-accent-soft px-1.5 py-0.5 rounded">
                        importance {(m.importance * 100).toFixed(0)}%
                      </span>
                    )}
                    {m.access_count > 0 && (
                      <span className="text-[10px] text-muted">accessed {m.access_count}x</span>
                    )}
                    <span className="text-[10px] text-muted ml-auto font-mono">
                      {m.created_at?.slice(0, 10)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === "facts" && (
        <>
          {/* Fact Filter & Quick Bar */}
          <div className="flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search project facts..."
                  className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <span className="absolute left-2.5 top-2 text-muted pointer-events-none">
                  <Icon name="search" size={13} />
                </span>
              </div>
              <button
                onClick={() => setShowAddFact(!showAddFact)}
                className="px-3 py-1.5 bg-accent text-white text-xs rounded font-medium hover:bg-accent-hover transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Icon name={showAddFact ? "x" : "plus"} size={13} />
                {showAddFact ? "Close" : "Add Fact"}
              </button>
            </div>

            {/* Category filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-2 py-0.5 rounded transition-colors ${
                  selectedCategory === "all" ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-text"
                }`}
              >
                All ({facts.length})
              </button>
              {FACT_CATEGORIES.map(cat => {
                const count = facts.filter(f => f.category.toLowerCase() === cat.toLowerCase()).length;
                const cMeta = CATEGORY_COLORS[cat] || { text: "var(--muted)", bg: "var(--card)", border: "var(--border)" };
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-0.5 rounded transition-colors capitalize ${
                      selectedCategory === cat ? "bg-accent text-white" : "bg-card border border-border hover:opacity-90"
                    }`}
                    style={selectedCategory === cat ? undefined : { color: cMeta.text, borderColor: cMeta.border, background: cMeta.bg }}
                  >
                    {cat} {count > 0 && `(${count})`}
                  </button>
                );
              })}
            </div>
          </div>

          {showAddFact && (
            <div className="bg-surface border border-accent/30 rounded-lg p-3 shrink-0 shadow-sm animate-fadeIn">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text">New Project Fact</span>
                <span className="text-[11px] text-muted">Injects into compiler context pack</span>
              </div>
              <textarea
                value={factText}
                onChange={e => setFactText(e.target.value)}
                placeholder="Project fact (e.g. 'All API routes require authentication header except /api/ping')"
                className="w-full bg-card border border-border rounded p-2 text-xs text-text placeholder:text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                rows={2}
              />
              <div className="flex items-center justify-between gap-2 mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted">Category:</span>
                  <QuietSelect
                    value={factCategory}
                    onChange={e => setFactCategory(e.target.value)}
                    className="bg-card border border-border rounded px-2 py-1 text-xs text-text capitalize"
                  >
                    {FACT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </QuietSelect>
                </div>
                <button
                  onClick={handleAddFact}
                  disabled={!factText.trim()}
                  className="px-3 py-1 bg-accent text-white text-xs rounded font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  Save Fact
                </button>
              </div>
            </div>
          )}

          {/* Starter presets when zero facts exist */}
          {facts.length === 0 && (
            <div className="bg-surface border border-border rounded-lg p-4 shrink-0">
              <h3 className="text-xs font-semibold text-text mb-1">Quick-start Project Facts</h3>
              <p className="text-[11px] text-muted mb-3">
                Founders and agentic teams seed core constraints early so all coding subagents adhere to them:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {FACT_STARTER_TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => handleAddPresetFact(tpl.text, tpl.category)}
                    className="text-left p-2.5 rounded border border-border bg-card hover:border-accent/40 hover:bg-card/80 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-text group-hover:text-accent-text">{tpl.label}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface text-muted uppercase tracking-wider">{tpl.category}</span>
                    </div>
                    <p className="text-[11px] text-muted line-clamp-2">{tpl.text}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredFacts.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border rounded-lg">
                <p className="text-sm text-muted">No project facts match your filter</p>
                <p className="text-xs text-muted mt-1">Add facts to teach agents immutable guidelines and conventions.</p>
              </div>
            ) : (
              filteredFacts.map((f, i) => {
                const colorMeta = CATEGORY_COLORS[f.category.toLowerCase()] || {
                  bg: "rgba(255, 255, 255, 0.04)",
                  text: "var(--text)",
                  border: "var(--border)",
                };
                return (
                  <div key={i} className="bg-surface border border-border rounded-lg p-3 hover:border-border-strong transition-colors">
                    <p className="text-xs text-text leading-relaxed">{f.fact}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded capitalize"
                        style={{
                          backgroundColor: colorMeta.bg,
                          color: colorMeta.text,
                          border: `1px solid ${colorMeta.border}`,
                        }}
                      >
                        {f.category}
                      </span>
                      {typeof f.confidence === "number" && (
                        <span className="text-[10px] text-muted bg-card px-1.5 py-0.5 rounded border border-border">
                          confidence: {((f.confidence || 0) * 100).toFixed(0)}%
                        </span>
                      )}
                      {f.sources && f.sources.length > 0 && (
                        <span className="text-[10px] text-muted bg-card px-1.5 py-0.5 rounded border border-border">
                          {f.sources.length} source(s)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
