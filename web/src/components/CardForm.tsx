import React, { useState } from "react";
import type {
  Card,
  CardContext,
  CardLink,
  Column,
  ChecklistItem,
  LinkType,
} from "../lib/types";

interface Props {
  card?: Card;
  columns: Column[];
  defaultColumn?: string;
  defaultDueDate?: string;
  authors?: string[];
  allCards?: Card[];
  context?: CardContext | null;
  onSave: (data: Partial<Card>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onOpenFile?: (path: string, line?: number) => void;
}

const inputCls =
  "w-full px-3 py-2 rounded-lg bg-surface border border-border text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-muted transition-colors";

type Tab = "details" | "acceptance" | "links" | "code" | "spec";

export function CardForm({
  card,
  columns,
  defaultColumn,
  defaultDueDate,
  authors = [],
  allCards = [],
  context = null,
  onSave,
  onCancel,
  onDelete,
  onOpenFile,
}: Props) {
  const [tab, setTab] = useState<Tab>("details");
  const [title, setTitle] = useState(card?.title || "");
  const [desc, setDesc] = useState(card?.description || "");
  const [column, setColumn] = useState(card?.column || defaultColumn || columns[0]?.id || "");
  const [priority, setPriority] = useState(card?.priority || "medium");
  const [labels, setLabels] = useState((card?.labels || []).join(", "));
  const [assignee, setAssignee] = useState(card?.assignee || "");
  const [dueDate, setDueDate] = useState(card?.due_date?.slice(0, 10) || defaultDueDate || "");
  const [remindAt, setRemindAt] = useState(card?.remind_at ? toLocalInput(card.remind_at) : "");
  const [effort, setEffort] = useState(card?.effort?.toString() || "");
  const [area, setArea] = useState(card?.area || "");
  const [specId, setSpecId] = useState((card as any)?.spec_id || "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(card?.checklist || []);
  const [newItem, setNewItem] = useState("");
  const [showAuthors, setShowAuthors] = useState(false);

  // Acceptance criteria
  const [acceptance, setAcceptance] = useState<string[]>(card?.acceptance_criteria || []);
  const [newAc, setNewAc] = useState("");

  // Links
  const [links, setLinks] = useState<CardLink[]>(card?.links || []);
  const [linkTarget, setLinkTarget] = useState("");
  const [linkType, setLinkType] = useState<LinkType>("child");

  const filteredAuthors = authors.filter((a) =>
    assignee ? a.toLowerCase().includes(assignee.toLowerCase()) : true
  ).slice(0, 5);

  const linkableCards = allCards.filter(
    (c) =>
      c.id !== card?.id &&
      !links.some(
        (l) =>
          l.target === c.id &&
          (l.ty === linkType || (linkType === "child" && l.ty === "parent") || (linkType === "parent" && l.ty === "child"))
      )
  );

  const addLink = () => {
    if (!linkTarget) return;
    const ty: LinkType = linkType;
    // mirror convention: `--as child` on id → id's parent is target
    const primary: LinkType = ty === "child" ? "parent" : ty === "parent" ? "child" : ty;
    const next: CardLink = { ty: primary, target: linkTarget };
    if (!links.some((l) => l.ty === primary && l.target === linkTarget)) {
      setLinks([...links, next]);
    }
    setLinkTarget("");
  };

  const removeLink = (idx: number) => {
    setLinks(links.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const parsedEffort = effort ? parseInt(effort, 10) : undefined;
    onSave({
      title: title.trim(),
      description: desc.trim(),
      column,
      priority,
      labels: labels.split(",").map((s) => s.trim()).filter(Boolean),
      assignee: assignee.trim() || undefined,
      due_date: dueDate ? `${dueDate}T00:00:00Z` : undefined,
      remind_at: remindAt ? `${remindAt}:00Z` : undefined,
      effort: Number.isFinite(parsedEffort) ? parsedEffort : undefined,
      area: area.trim() || undefined,
      checklist,
      acceptance_criteria: acceptance,
      links,
      spec_id: specId.trim() || undefined,
    } as any);
  };

  const addChecklistItem = () => {
    if (!newItem.trim()) return;
    setChecklist([...checklist, { text: newItem.trim(), done: false }]);
    setNewItem("");
  };

  const toggleChecklistItem = (idx: number) => {
    setChecklist(checklist.map((item, i) => i === idx ? { ...item, done: !item.done } : item));
  };

  const removeChecklistItem = (idx: number) => {
    setChecklist(checklist.filter((_, i) => i !== idx));
  };

  const addAc = () => {
    if (!newAc.trim()) return;
    setAcceptance([...acceptance, newAc.trim()]);
    setNewAc("");
  };

  const removeAc = (idx: number) => {
    setAcceptance(acceptance.filter((_, i) => i !== idx));
  };

  const cardTitle = (id: string) =>
    allCards.find((c) => c.id === id)?.title || id;

  const tabCls = (t: Tab) =>
    `px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
      tab === t ? "bg-accent text-white" : "text-muted hover:text-text hover:bg-surface"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-card rounded-xl shadow-[var(--shadow)] w-full max-w-lg mx-4 p-6 border border-border max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-2 text-text">{card ? "Edit Card" : "New Card"}</h2>

        <div className="flex gap-1 mb-4 border-b border-border pb-3">
          <button type="button" className={tabCls("details")} onClick={() => setTab("details")}>Details</button>
          <button type="button" className={tabCls("acceptance")} onClick={() => setTab("acceptance")}>Acceptance</button>
          <button type="button" className={tabCls("links")} onClick={() => setTab("links")}>Links</button>
          <button type="button" className={tabCls("code")} onClick={() => setTab("code")}>Code</button>
          <button type="button" className={tabCls("spec")} onClick={() => setTab("spec")}>Spec</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {tab === "details" && (
            <>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Title *</label>
                <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
                  className={inputCls} placeholder="Card title" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Description</label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)}
                  className={`${inputCls} resize-none`} rows={2} placeholder="Optional description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Column</label>
                  <select value={column} onChange={(e) => setColumn(e.target.value)}
                    className={inputCls}>
                    {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)}
                    className={inputCls}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Labels (comma-separated)</label>
                <input value={labels} onChange={(e) => setLabels(e.target.value)}
                  className={inputCls} placeholder="bug, frontend, urgent" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="block text-xs font-medium text-muted mb-1">Assignee</label>
                  <input value={assignee} onChange={(e) => { setAssignee(e.target.value); setShowAuthors(true); }}
                    onFocus={() => setShowAuthors(true)} onBlur={() => setTimeout(() => setShowAuthors(false), 200)}
                    className={inputCls} placeholder="Username" />
                  {showAuthors && filteredAuthors.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-30 bg-card border border-border rounded-lg mt-1 overflow-hidden shadow-[var(--shadow)]">
                      {filteredAuthors.map((a) => (
                        <button key={a} type="button" onMouseDown={() => { setAssignee(a); setShowAuthors(false); }}
                          className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface">{a}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Due date</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Remind at</label>
                  <input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Effort (points)</label>
                  <input type="number" min={0} value={effort} onChange={(e) => setEffort(e.target.value)}
                    className={inputCls} placeholder="3" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Area</label>
                <input value={area} onChange={(e) => setArea(e.target.value)}
                  className={inputCls} placeholder="frontend, backend, ..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Spec ID</label>
                <input value={specId} onChange={(e) => setSpecId(e.target.value)}
                  className={inputCls} placeholder="auto: same as card id or spec" />
                <p className="text-[11px] text-muted mt-1">O(1) traceability — links card → spec → tasks. Auto-filled by <code>intake</code>/<code>plan</code>.</p>
              </div>

              {/* Checklist */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Checklist</label>
                <div className="space-y-1.5 mb-2 max-h-32 overflow-y-auto">
                  {checklist.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <button type="button" onClick={() => toggleChecklistItem(idx)}
                        className={`text-xs ${item.done ? "text-success" : "text-muted"} hover:text-text`}>
                        {item.done ? "☑" : "☐"}
                      </button>
                      <span className={`flex-1 text-xs ${item.done ? "text-muted line-through" : "text-text"}`}>{item.text}</span>
                      <button type="button" onClick={() => removeChecklistItem(idx)} className="text-muted hover:text-danger text-xs">✕</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newItem} onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
                    className={`${inputCls} !py-1.5 !text-xs`}
                    placeholder="Add checklist item" />
                  <button type="button" onClick={addChecklistItem} className="px-3 py-1.5 text-xs rounded bg-surface border border-border text-text hover:border-border-strong">Add</button>
                </div>
              </div>

              {/* Comments display (read-only in form) */}
              {card && card.comments.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Comments ({card.comments.length})</label>
                  <div className="space-y-2 max-h-24 overflow-y-auto">
                    {card.comments.map((c, i) => (
                      <div key={i} className="text-xs">
                        <span className="text-muted-strong font-medium">{c.author}</span>
                        <span className="text-muted ml-2">{c.at?.slice(0, 10)}</span>
                        <p className="text-text mt-0.5">{c.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "acceptance" && (
            <>
              <p className="text-xs text-muted">Acceptance criteria — what "done" means for this PBI.</p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {acceptance.map((ac, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-accent text-xs">☐</span>
                    <span className="flex-1 text-xs text-text">{ac}</span>
                    <button type="button" onClick={() => removeAc(idx)} className="text-muted hover:text-danger text-xs">✕</button>
                  </div>
                ))}
                {acceptance.length === 0 && (
                  <p className="text-xs text-muted">No criteria yet.</p>
                )}
              </div>
              <div className="flex gap-2">
                <input value={newAc} onChange={(e) => setNewAc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAc(); } }}
                  className={`${inputCls} !py-1.5 !text-xs`} placeholder="e.g. Users can log in" />
                <button type="button" onClick={addAc} className="px-3 py-1.5 text-xs rounded bg-surface border border-border text-text hover:border-border-strong">Add</button>
              </div>
            </>
          )}

          {tab === "links" && (
            <>
              <p className="text-xs text-muted">Work item links. A parent task links to its child tasks.</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {links.map((l, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-muted">{l.ty}</span>
                    <span className="flex-1 text-text truncate">{cardTitle(l.target)}</span>
                    <button type="button" onClick={() => removeLink(idx)} className="text-muted hover:text-danger">✕</button>
                  </div>
                ))}
                {links.length === 0 && <p className="text-xs text-muted">No links.</p>}
              </div>
              <div className="flex gap-2">
                <select value={linkType} onChange={(e) => setLinkType(e.target.value as LinkType)}
                  className={`${inputCls} !w-32 !py-1.5 !text-xs`}>
                  <option value="child">child</option>
                  <option value="parent">parent</option>
                  <option value="related">related</option>
                  <option value="blocked-by">blocked-by</option>
                </select>
                <select value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)}
                  className={`${inputCls} flex-1 !py-1.5 !text-xs`}>
                  <option value="">Select card…</option>
                  {linkableCards.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
                <button type="button" onClick={addLink} className="px-3 py-1.5 text-xs rounded bg-surface border border-border text-text hover:border-border-strong">Link</button>
              </div>
            </>
          )}

          {tab === "code" && (
            <>
              {!card ? (
                <p className="text-xs text-muted">Save the card first, then map it to code from the CLI: <code>barkcli context scan</code>.</p>
              ) : context && context.files.length > 0 ? (
                <>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {context.files.map((f) => (
                      <div key={f.path} className="flex items-center gap-2 text-xs">
                        <span className={`shrink-0 ${statusColor(f.status)}`}>{statusDot(f.status)}</span>
                        <button
                          type="button"
                          onClick={() => onOpenFile?.(f.path)}
                          className="flex-1 text-left font-mono text-text hover:text-accent truncate"
                          title="Open in editor"
                        >
                          {f.path}
                        </button>
                        {f.last_commit && <span className="text-muted shrink-0">@{f.last_commit}</span>}
                      </div>
                    ))}
                  </div>
                  {context.files.some((f) => f.symbols.length > 0) && (
                    <p className="text-xs text-muted">
                      Symbols:{" "}
                      {context.files.flatMap((f) => f.symbols).slice(0, 12).join(", ")}
                      {context.files.flatMap((f) => f.symbols).length > 12 ? "…" : ""}
                    </p>
                  )}
                  {context.sessions.length > 0 && (
                    <p className="text-xs text-muted">Sessions: {context.sessions.join(", ")}</p>
                  )}
                  {context.ai && (
                    <div className="rounded-lg bg-surface border border-border p-3">
                      <p className="text-xs font-medium text-muted mb-1">
                        AI context · {context.ai.model || "model"} · {context.ai.at?.slice(0, 10)} · {(context.ai.confidence * 100).toFixed(0)}%
                      </p>
                      <p className="text-xs text-text whitespace-pre-wrap">{context.ai.summary}</p>
                      {context.ai.next_steps.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-muted mt-2 mb-1">Next steps:</p>
                          <ul className="text-xs text-text space-y-0.5">
                            {context.ai.next_steps.map((s, i) => <li key={i}>• {s}</li>)}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted">Last synced: {context.last_sync_commit || "never"} · Run <code>barkcli context sync</code> or scan to update.</p>
                </>
              ) : (
                <p className="text-xs text-muted">
                  No code mapped yet. From the CLI: <code>barkcli context scan</code> (auto) or{" "}
                  <code>barkcli context link {card?.id} src/file.rs</code> (manual).
                </p>
              )}
            </>
          )}

          {tab === "spec" && (
            <SpecTab cardId={card?.id} specId={specId || (card as any)?.spec_id} />
          )}

          <div className="flex justify-between mt-2">
            {onDelete && (
              <button type="button" onClick={onDelete} className="px-3 py-2 text-sm text-danger hover:bg-danger-soft rounded-lg">Delete</button>
            )}
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-border text-text hover:bg-surface">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover font-medium">{card ? "Save" : "Add"}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function SpecTab({ cardId, specId }: { cardId?: string; specId?: string }) {
  const [spec, setSpec] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!specId) return;
    setLoading(true);
    import("../lib/api").then(({ fetchSpec }) => {
      fetchSpec(specId).then((s) => {
        setSpec(s);
        setLoading(false);
      });
    });
  }, [specId]);

  if (!specId) {
    return (
      <p className="text-xs text-muted">
        No spec linked. Set a Spec ID in Details, or run <code>barkcli intake "…"</code> to
        auto-create card + spec{cardId ? <> for <code>{cardId}</code></> : null}.
      </p>
    );
  }
  if (loading) return <p className="text-xs text-muted">Loading spec…</p>;
  if (!spec) {
    return (
      <p className="text-xs text-muted">
        Spec <code className="font-mono">{specId}</code> not found on this board.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-text">{spec.title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted font-mono">
          {spec.status}
        </span>
      </div>
      {spec.description && <p className="text-xs text-muted">{spec.description}</p>}
      <div className="space-y-1.5 max-h-56 overflow-y-auto">
        {(spec.requirements || []).map((r: any) => (
          <div key={r.id} className="rounded-lg bg-surface border border-border p-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-accent">◈</span>
              <span className="flex-1 text-text font-medium">{r.title}</span>
              <span className="text-[10px] text-muted font-mono">{r.status}</span>
            </div>
            {(r.acceptance_criteria || []).length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {r.acceptance_criteria.map((ac: string, i: number) => (
                  <li key={i} className="text-[11px] text-muted">☐ {ac}</li>
                ))}
              </ul>
            )}
            {(r.linked_tasks || []).length > 0 && (
              <p className="text-[10px] text-muted font-mono mt-1">
                tasks: {r.linked_tasks.join(", ")}
              </p>
            )}
            {r.stale && (
              <p className="text-[10px] text-warning mt-1">⚠ stale{r.stale_reason ? `: ${r.stale_reason}` : ""}</p>
            )}
          </div>
        ))}
        {(spec.requirements || []).length === 0 && (
          <p className="text-xs text-muted">No requirements yet.</p>
        )}
      </div>
    </div>
  );
}

function statusDot(status: string): string {
  switch (status) {
    case "changed": return "●";
    case "deleted": return "●";
    case "stale": return "●";
    case "clean": return "●";
    default: return "○";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "changed":
    case "deleted": return "text-danger";
    case "stale": return "text-warning";
    case "clean": return "text-success";
    default: return "text-muted";
  }
}

function toLocalInput(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : iso.slice(0, 16);
}
