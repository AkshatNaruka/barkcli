import React, { useState, useEffect, useCallback } from "react";
import type { CheckpointEntry, DiffCard, DiffMoved, BlameEntry } from "../lib/types";
import { fetchCheckpoints, saveCheckpoint, restoreCheckpoint, undo, fetchDiff, fetchBlame, validateBoards, doctorBoards, exportBoard, saveSnapshot } from "../lib/api";

export function TimelineView({ boardName }: { boardName: string | null }) {
  const [tab, setTab] = useState<"undo" | "diff" | "checkpoints" | "validate">("checkpoints");
  const [checkpoints, setCheckpoints] = useState<CheckpointEntry[]>([]);
  const [diff, setDiff] = useState<{ added: DiffCard[]; removed: DiffCard[]; moved: DiffMoved[] } | null>(null);
  const [blameCardId, setBlameCardId] = useState("");
  const [blameEntries, setBlameEntries] = useState<BlameEntry[]>([]);
  const [validateResult, setValidateResult] = useState<any>(null);
  const [doctorResult, setDoctorResult] = useState<any>(null);
  const [newLabel, setNewLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadCheckpoints = useCallback(async () => {
    setLoading(true);
    const data = await fetchCheckpoints(boardName || undefined);
    setCheckpoints(data);
    setLoading(false);
  }, [boardName]);

  const loadDiff = useCallback(async () => {
    setLoading(true);
    const data = await fetchDiff(boardName || undefined);
    setDiff(data);
    setLoading(false);
  }, [boardName]);

  useEffect(() => {
    if (tab === "checkpoints") loadCheckpoints();
    if (tab === "diff") loadDiff();
  }, [tab, loadCheckpoints, loadDiff]);

  const handleSaveCheckpoint = async () => {
    const label = newLabel || new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    await saveCheckpoint(label, boardName || undefined);
    setNewLabel("");
    notify("Checkpoint saved");
    loadCheckpoints();
  };

  const handleRestore = async (id: string) => {
    await restoreCheckpoint(id, boardName || undefined);
    notify(`Restored checkpoint: ${id}`);
  };

  const handleUndo = async () => {
    const result = await undo(boardName || undefined);
    if (result.ok) {
      notify(`Undid: ${result.undid}`);
    } else {
      notify("Nothing to undo");
    }
  };

  const handleBlame = async () => {
    if (!blameCardId.trim()) return;
    const entries = await fetchBlame(blameCardId, boardName || undefined);
    setBlameEntries(entries);
  };

  const handleValidate = async () => {
    setLoading(true);
    const result = await validateBoards();
    setValidateResult(result);
    setLoading(false);
  };

  const handleDoctor = async () => {
    setLoading(true);
    const result = await doctorBoards();
    setDoctorResult(result);
    notify(`Fixed ${result.fixed} issue(s)`);
    setLoading(false);
  };

  const handleExport = async (format: string) => {
    const content = await exportBoard(boardName || undefined, format);
    if (content) {
      const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${boardName || "board"}.${format === "json" ? "json" : "board"}`;
      a.click();
      URL.revokeObjectURL(url);
      notify(`Exported as ${format}`);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 gap-4 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-lg font-semibold text-text">Timeline & Tools</h2>
        <div className="flex gap-2">
          <button onClick={() => handleExport("yaml")} className="px-2 py-1 bg-surface border border-border rounded text-xs text-text hover:border-border-strong">
            Export YAML
          </button>
          <button onClick={() => handleExport("json")} className="px-2 py-1 bg-surface border border-border rounded text-xs text-text hover:border-border-strong">
            Export JSON
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 shrink-0 w-fit">
        {(["checkpoints", "undo", "diff", "validate"] as const).map(t => (
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

      {/* Checkpoints Tab */}
      {tab === "checkpoints" && (
        <div className="flex-1 overflow-y-auto space-y-3">
          <div className="flex gap-2 shrink-0">
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="Checkpoint label (optional)"
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-muted"
            />
            <button
              onClick={handleSaveCheckpoint}
              className="px-4 py-2 bg-accent text-white text-xs rounded-lg font-medium hover:bg-accent/80"
            >
              Save Checkpoint
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-surface rounded animate-pulse" />)}
            </div>
          ) : checkpoints.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No checkpoints yet</p>
          ) : (
            <div className="space-y-2">
              {checkpoints.map(c => (
                <div key={c.id} className="bg-surface border border-border rounded-lg p-3 flex items-center justify-between group">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.kind === "auto" ? "bg-accent/10 text-accent" : "bg-surface text-muted"}`}>
                        {c.kind}
                      </span>
                      <span className="text-xs font-medium text-text font-mono">{c.id}</span>
                    </div>
                    <p className="text-[10px] text-muted mt-1">{c.saved_at}</p>
                  </div>
                  <button
                    onClick={() => handleRestore(c.id)}
                    className="text-xs text-accent hover:text-accent/80 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Undo Tab */}
      {tab === "undo" && (
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="bg-surface border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text mb-2">Undo Last Change</h3>
            <p className="text-xs text-muted mb-3">Revert the board to its state before the last operation.</p>
            <button
              onClick={handleUndo}
              className="px-4 py-2 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs rounded-lg font-medium hover:bg-yellow-500/20"
            >
              Undo
            </button>
          </div>

          <div className="bg-surface border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text mb-2">Named Snapshot</h3>
            <p className="text-xs text-muted mb-3">Save a named snapshot you can restore later.</p>
            <div className="flex gap-2">
              <input
                type="text"
                id="snapshot-label"
                placeholder="Snapshot name"
                className="flex-1 bg-card border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-muted"
              />
              <button
                onClick={async () => {
                  const input = document.getElementById("snapshot-label") as HTMLInputElement;
                  if (input?.value.trim()) {
                    await saveSnapshot(input.value, boardName || undefined);
                    notify("Snapshot saved");
                    input.value = "";
                  }
                }}
                className="px-3 py-1.5 bg-accent text-white text-xs rounded font-medium hover:bg-accent/80"
              >
                Save
              </button>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text mb-2">Blame</h3>
            <p className="text-xs text-muted mb-3">See the change history for a specific card.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={blameCardId}
                onChange={e => setBlameCardId(e.target.value)}
                placeholder="Card ID"
                className="flex-1 bg-card border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-muted"
              />
              <button
                onClick={handleBlame}
                disabled={!blameCardId.trim()}
                className="px-3 py-1.5 bg-accent text-white text-xs rounded font-medium hover:bg-accent/80 disabled:opacity-50"
              >
                Show
              </button>
            </div>
            {blameEntries.length > 0 && (
              <div className="mt-3 space-y-1">
                {blameEntries.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted font-mono text-[10px]">{e.at?.slice(0, 19)}</span>
                    <span className="text-text">{e.op}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Diff Tab */}
      {tab === "diff" && (
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-12 bg-surface rounded animate-pulse" />)}
            </div>
          ) : !diff ? (
            <p className="text-sm text-muted text-center py-8">No diff available</p>
          ) : (
            <div className="space-y-3">
              {diff.added.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-green-400 mb-2">Added ({diff.added.length})</h4>
                  {diff.added.map(c => (
                    <div key={c.id} className="bg-green-500/5 border border-green-500/20 rounded p-2 mb-1">
                      <span className="text-xs text-text">+ {c.title}</span>
                      <span className="text-[10px] text-muted ml-2 font-mono">[{c.id}] in {c.column}</span>
                    </div>
                  ))}
                </div>
              )}
              {diff.removed.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-400 mb-2">Removed ({diff.removed.length})</h4>
                  {diff.removed.map(c => (
                    <div key={c.id} className="bg-red-500/5 border border-red-500/20 rounded p-2 mb-1">
                      <span className="text-xs text-text">- {c.title}</span>
                      <span className="text-[10px] text-muted ml-2 font-mono">[{c.id}]</span>
                    </div>
                  ))}
                </div>
              )}
              {diff.moved.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-yellow-400 mb-2">Moved ({diff.moved.length})</h4>
                  {diff.moved.map(c => (
                    <div key={c.id} className="bg-yellow-500/5 border border-yellow-500/20 rounded p-2 mb-1">
                      <span className="text-xs text-text">~ {c.title}</span>
                      <span className="text-[10px] text-muted ml-2">{c.from} → {c.to}</span>
                    </div>
                  ))}
                </div>
              )}
              {diff.added.length === 0 && diff.removed.length === 0 && diff.moved.length === 0 && (
                <p className="text-sm text-muted text-center py-8">No changes since last operation</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Validate Tab */}
      {tab === "validate" && (
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="bg-surface border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text mb-2">Validate Boards</h3>
            <p className="text-xs text-muted mb-3">Check all board files for structural errors.</p>
            <button
              onClick={handleValidate}
              disabled={loading}
              className="px-4 py-2 bg-surface border border-border text-xs rounded-lg font-medium text-text hover:border-border-strong disabled:opacity-50"
            >
              {loading ? "Validating..." : "Validate All"}
            </button>
            {validateResult && (
              <div className="mt-3 space-y-2">
                <p className={`text-xs font-medium ${validateResult.all_valid ? "text-green-400" : "text-yellow-400"}`}>
                  {validateResult.all_valid ? "All boards valid" : "Some boards have errors"}
                </p>
                {validateResult.boards?.map((b: any) => (
                  <div key={b.name} className="flex items-center gap-2 text-xs">
                    <span className={b.valid ? "text-green-400" : "text-red-400"}>
                      {b.valid ? "OK" : "ERR"}
                    </span>
                    <span className="text-text font-mono">{b.name}</span>
                    {b.errors?.length > 0 && (
                      <span className="text-muted">- {b.errors.join("; ")}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text mb-2">Doctor (Auto-fix)</h3>
            <p className="text-xs text-muted mb-3">Validate and automatically fix common issues.</p>
            <button
              onClick={handleDoctor}
              disabled={loading}
              className="px-4 py-2 bg-accent text-white text-xs rounded-lg font-medium hover:bg-accent/80 disabled:opacity-50"
            >
              {loading ? "Fixing..." : "Run Doctor"}
            </button>
            {doctorResult && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-accent">
                  Fixed {doctorResult.fixed} issue(s)
                </p>
                {doctorResult.boards?.map((b: any) => (
                  <div key={b.name} className="text-xs text-muted">
                    <span className="font-mono">{b.name}</span>: {b.errors_before} errors → {b.errors_after} errors
                    {b.fixed?.length > 0 && (
                      <span className="text-green-400 ml-1">({b.fixed.join(", ")})</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 bg-accent text-white px-3 py-2 rounded-lg text-xs shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
