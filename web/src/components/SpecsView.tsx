import React, { useState, useEffect, useCallback } from "react";
import type { Spec, Requirement, SpecCoverage, SpecStatus } from "../lib/types";
import { fetchSpecs, createSpec, updateSpec, deleteSpec, addRequirement, fetchSpecCoverage, fetchSpec } from "../lib/api";
import { Lozenge } from "./Lozenge";
import { QuietSelect } from "./QuietSelect";
import { Icon } from "./Icon";

// Status lozenges: tone carries meaning, no borders, no glyph art
const STATUS_TONES: Record<string, "gray" | "blue" | "amber" | "green" | "red"> = {
  draft: "gray",
  "in-progress": "amber",
  implemented: "blue",
  verified: "green",
  deprecated: "red",
};

// Requirement state: the dot language (hollow = pending, filled = state)
const REQ_DOT: Record<string, string> = {
  pending: "ring-1 ring-inset ring-[var(--border-strong)]",
  "in-progress": "bg-warning",
  implemented: "bg-accent",
  verified: "bg-success",
  failed: "bg-danger",
};

export function SpecsView({ boardName }: { boardName: string | null }) {
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [coverage, setCoverage] = useState<SpecCoverage | null>(null);
  const [selectedSpec, setSelectedSpec] = useState<Spec | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [showAddReq, setShowAddReq] = useState(false);
  const [reqTitle, setReqTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [specsData, covData] = await Promise.all([
      fetchSpecs(boardName || undefined),
      fetchSpecCoverage(boardName || undefined),
    ]);
    setSpecs(specsData);
    setCoverage(covData);
    setLoading(false);
  }, [boardName]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    const spec = await createSpec(newTitle, newDesc || undefined, newPriority, undefined, boardName || undefined);
    if (spec) {
      setNewTitle("");
      setNewDesc("");
      setShowCreate(false);
      load();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSpec(id, boardName || undefined);
    if (selectedSpec?.id === id) setSelectedSpec(null);
    load();
  };

  const handleStatusChange = async (specId: string, status: SpecStatus) => {
    await updateSpec(specId, { status }, boardName || undefined);
    load();
    if (selectedSpec?.id === specId) {
      const updated = await fetchSpec(specId, boardName || undefined);
      if (updated) setSelectedSpec(updated);
    }
  };

  const handleAddReq = async () => {
    if (!reqTitle.trim() || !selectedSpec) return;
    const updated = await addRequirement(selectedSpec.id, reqTitle, undefined, undefined, boardName || undefined);
    if (updated) {
      setSelectedSpec(updated);
      setReqTitle("");
      setShowAddReq(false);
      load();
    }
  };

  const handleReqStatusChange = async (reqId: string, status: string) => {
    if (!selectedSpec) return;
    // Update requirement status via the API
    const res = await fetch(
      `/api/specs/${selectedSpec.id}/requirements/${reqId}?name=${boardName || ""}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    );
    if (res.ok) {
      const updated = await fetchSpec(selectedSpec.id, boardName || undefined);
      if (updated) setSelectedSpec(updated);
      load();
    }
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* Sidebar - Spec List */}
      <div className="w-72 border-r border-border flex flex-col shrink-0">
        <div className="p-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">Specs</h3>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="text-xs text-accent hover:text-accent-text transition-colors"
          >
            New
          </button>
        </div>

        {showCreate && (
          <div className="p-3 border-b border-border bg-surface/50 flex flex-col gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Spec title"
              className="w-full bg-card rounded px-2 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full bg-card rounded px-2 py-1.5 text-xs text-text placeholder:text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent"
              rows={2}
            />
            <div className="flex gap-2">
              <QuietSelect
                value={newPriority}
                onChange={e => setNewPriority(e.target.value)}
                className="flex-1 bg-card px-2 py-1 text-xs text-text"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </QuietSelect>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim()}
                className="px-3 py-1 bg-accent text-white text-xs rounded font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {/* Coverage Summary */}
        {coverage && (
          <div className="p-3 border-b border-border text-xs text-muted">
            <div className="flex justify-between">
              <span>Coverage</span>
              <span className={(coverage.coverage_percent || 0) >= 80 ? "text-success" : (coverage.coverage_percent || 0) >= 50 ? "text-warning" : "text-danger"}>
                {(coverage.coverage_percent || 0).toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-surface rounded-full h-1.5 mt-1">
              <div
                className="bg-accent h-1.5 rounded-full transition-all"
                style={{ width: `${coverage.coverage_percent || 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[10px]">
              <span>{coverage.implemented}/{coverage.total_requirements} implemented</span>
              <span>{coverage.stale} stale</span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-surface rounded animate-pulse" />
              ))}
            </div>
          ) : specs.length === 0 ? (
            <p className="text-xs text-muted text-center py-8">No specs yet</p>
          ) : (
            specs.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSpec(s)}
                className={`w-full text-left p-3 border-b border-border hover:bg-surface/50 transition-colors ${
                  selectedSpec?.id === s.id ? "bg-surface" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text truncate">{s.title}</span>
                  <Lozenge tone={STATUS_TONES[s.status] || "gray"}>{s.status}</Lozenge>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted">
                  <span>{s.requirements.length} reqs</span>
                  <span>{s.priority}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main - Spec Detail */}
      <div className="flex-1 overflow-y-auto">
        {!selectedSpec ? (
          <div className="flex items-center justify-center h-full text-sm text-muted">
            Select a spec to view details
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text">{selectedSpec.title}</h2>
                {selectedSpec.description && (
                  <p className="text-sm text-muted mt-1">{selectedSpec.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <QuietSelect
                  value={selectedSpec.status}
                  onChange={e => handleStatusChange(selectedSpec.id, e.target.value as SpecStatus)}
                  className="bg-surface px-2 py-1"
                >
                  <option value="draft">Draft</option>
                  <option value="in-progress">In Progress</option>
                  <option value="implemented">Implemented</option>
                  <option value="verified">Verified</option>
                  <option value="deprecated">Deprecated</option>
                </QuietSelect>
                <button
                  onClick={() => handleDelete(selectedSpec.id)}
                  className="text-xs text-muted hover:text-danger transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted">
              <span>Priority: {selectedSpec.priority}</span>
              <span>{selectedSpec.requirements.length} requirements</span>
              {selectedSpec.tags.length > 0 && (
                <span>{selectedSpec.tags.join(", ")}</span>
              )}
            </div>

            {/* Requirements */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-text">Requirements</h3>
                <button
                  onClick={() => setShowAddReq(!showAddReq)}
                  className="text-xs text-accent hover:text-accent-text transition-colors"
                >
                  Add requirement
                </button>
              </div>

              {showAddReq && (
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={reqTitle}
                    onChange={e => setReqTitle(e.target.value)}
                    placeholder="Requirement title"
                    className="flex-1 bg-surface rounded px-2 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    onClick={handleAddReq}
                    disabled={!reqTitle.trim()}
                    className="px-3 py-1 bg-accent text-white text-xs rounded font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {selectedSpec.requirements.length === 0 ? (
                  <p className="text-xs text-muted py-4 text-center">No requirements yet</p>
                ) : (
                  selectedSpec.requirements.map(req => (
                    <div
                      key={req.id}
                      className="bg-surface rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${REQ_DOT[req.status] || REQ_DOT.pending}`} title={req.status} />
                          <span className="text-xs font-medium text-text">{req.title}</span>
                          {req.stale && (
                            <Lozenge tone="amber" title={`Stale: ${req.stale_reason || "requirements changed"}`}>stale</Lozenge>
                          )}
                        </div>
                        <QuietSelect
                          value={req.status}
                          onChange={e => handleReqStatusChange(req.id, e.target.value)}
                          className="bg-card px-1.5 py-0.5 text-[10px]"
                        >
                          <option value="pending">Pending</option>
                          <option value="in-progress">In Progress</option>
                          <option value="implemented">Implemented</option>
                          <option value="verified">Verified</option>
                          <option value="failed">Failed</option>
                        </QuietSelect>
                      </div>
                      {req.description && (
                        <p className="text-[11px] text-muted mt-1 ml-5">{req.description}</p>
                      )}
                      {req.linked_code.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 ml-5">
                          <span className="text-[10px] text-muted">Code:</span>
                          {req.linked_code.map(p => (
                            <span key={p} className="text-[10px] text-accent-text bg-accent-soft px-1 rounded font-mono">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                      {req.linked_tasks.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 ml-5">
                          <span className="text-[10px] text-muted">Tasks:</span>
                          {req.linked_tasks.map(t => (
                            <span key={t} className="text-[10px] text-muted-strong bg-card px-1 rounded font-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
