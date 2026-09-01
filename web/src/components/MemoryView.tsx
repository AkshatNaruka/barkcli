import React, { useState, useEffect, useCallback } from "react";
import type { MemoryEntry, ProjectFact, MemoryTier } from "../lib/types";
import { fetchMemory, addMemory, deleteMemory, fetchMemoryStats, addFact, fetchFacts } from "../lib/api";

const TIER_COLORS: Record<string, string> = {
  working: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  short_term: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  long_term: "bg-green-500/10 text-green-400 border-green-500/20",
  external: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const TIER_LABELS: Record<string, string> = {
  working: "Working",
  short_term: "Short-term",
  long_term: "Long-term",
  external: "External",
};

export function MemoryView({ boardName }: { boardName: string | null }) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ total: number; by_tier: Record<string, number>; facts: number } | null>(null);
  const [facts, setFacts] = useState<ProjectFact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTier, setFilterTier] = useState<string>("");
  const [newContent, setNewContent] = useState("");
  const [newTier, setNewTier] = useState<MemoryTier>("short_term");
  const [newTags, setNewTags] = useState("");
  const [showAddFact, setShowAddFact] = useState(false);
  const [factText, setFactText] = useState("");
  const [factCategory, setFactCategory] = useState("convention");
  const [tab, setTab] = useState<"memories" | "facts">("memories");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [memData, statsData, factsData] = await Promise.all([
      fetchMemory(boardName || undefined, searchQuery || undefined, filterTier || undefined),
      fetchMemoryStats(boardName || undefined),
      fetchFacts(boardName || undefined),
    ]);
    setMemories(memData.memories);
    setTotal(memData.total);
    setStats(statsData);
    setFacts(factsData);
    setLoading(false);
  }, [boardName, searchQuery, filterTier]);

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
            <span>{stats.total} memories</span>
            <span>{stats.facts} facts</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 shrink-0 w-fit">
        {(["memories", "facts"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium capitalize transition-colors ${
              tab === t ? "bg-card text-text shadow-sm" : "text-muted hover:text-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "memories" && (
        <>
          {/* Search & Filter */}
          <div className="flex gap-2 shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search memories..."
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent"
            />
            <select
              value={filterTier}
              onChange={e => setFilterTier(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
            >
              <option value="">All tiers</option>
              <option value="working">Working</option>
              <option value="short_term">Short-term</option>
              <option value="long_term">Long-term</option>
              <option value="external">External</option>
            </select>
          </div>

          {/* Add Memory */}
          <div className="bg-surface border border-border rounded-lg p-3 shrink-0">
            <textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="Add a memory..."
              className="w-full bg-transparent text-sm text-text placeholder:text-muted resize-none focus:outline-none"
              rows={2}
            />
            <div className="flex items-center gap-2 mt-2">
              <select
                value={newTier}
                onChange={e => setNewTier(e.target.value as MemoryTier)}
                className="bg-card border border-border rounded px-2 py-1 text-xs text-text"
              >
                <option value="working">Working</option>
                <option value="short_term">Short-term</option>
                <option value="long_term">Long-term</option>
                <option value="external">External</option>
              </select>
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
                className="px-3 py-1 bg-accent text-white text-xs rounded font-medium hover:bg-accent/80 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {/* Memory List */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-surface rounded-lg animate-pulse" />
                ))}
              </div>
            ) : memories.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">No memories found</p>
            ) : (
              memories.map(m => (
                <div key={m.id} className="bg-surface border border-border rounded-lg p-3 group hover:border-border-strong transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-text flex-1">{m.content}</p>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                    >
                      x
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${TIER_COLORS[m.tier] || ""}`}>
                      {TIER_LABELS[m.tier] || m.tier}
                    </span>
                    {m.tags.map(tag => (
                      <span key={tag} className="text-[10px] text-muted bg-card px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
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
          <div className="flex justify-between items-center shrink-0">
            <p className="text-xs text-muted">{facts.length} project facts</p>
            <button
              onClick={() => setShowAddFact(!showAddFact)}
              className="px-3 py-1 bg-accent text-white text-xs rounded font-medium hover:bg-accent/80"
            >
              + Add Fact
            </button>
          </div>

          {showAddFact && (
            <div className="bg-surface border border-border rounded-lg p-3 shrink-0">
              <textarea
                value={factText}
                onChange={e => setFactText(e.target.value)}
                placeholder="Project fact (e.g. 'Uses snake_case for variables')"
                className="w-full bg-transparent text-sm text-text placeholder:text-muted resize-none focus:outline-none"
                rows={2}
              />
              <div className="flex items-center gap-2 mt-2">
                <select
                  value={factCategory}
                  onChange={e => setFactCategory(e.target.value)}
                  className="bg-card border border-border rounded px-2 py-1 text-xs text-text"
                >
                  <option value="convention">Convention</option>
                  <option value="pattern">Pattern</option>
                  <option value="decision">Decision</option>
                  <option value="preference">Preference</option>
                </select>
                <button
                  onClick={handleAddFact}
                  disabled={!factText.trim()}
                  className="px-3 py-1 bg-accent text-white text-xs rounded font-medium hover:bg-accent/80 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2">
            {facts.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">No project facts yet</p>
            ) : (
              facts.map((f, i) => (
                <div key={i} className="bg-surface border border-border rounded-lg p-3">
                  <p className="text-sm text-text">{f.fact}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                      {f.category}
                    </span>
                    <span className="text-[10px] text-muted">
                      confidence: {(f.confidence * 100).toFixed(0)}%
                    </span>
                    {f.sources.length > 0 && (
                      <span className="text-[10px] text-muted">
                        {f.sources.length} source(s)
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
