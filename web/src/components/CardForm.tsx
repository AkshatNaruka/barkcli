import React, { useState, useEffect, useRef } from "react";
import type {
  Card,
  CardContext,
  CardLink,
  Column,
  ChecklistItem,
  LinkType,
  ProviderStatus,
  RoleDef,
} from "../lib/types";
import { fetchProviders, fetchRoles } from "../lib/api";
import { Icon } from "./Icon";
import { QuietSelect } from "./QuietSelect";

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

// ── Field language: ghost fields (no borders), soft focus ring ─────────────
const field =
  "w-full bg-surface rounded-md px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow";
const fieldSm =
  "w-full bg-surface rounded-md px-2.5 py-1.5 text-xs text-text placeholder:text-muted/70 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow";
const fieldName =
  "block text-[11px] text-muted mb-1.5";
const secLabel =
  "block text-[11px] text-muted";
const iconGhost =
  "text-muted hover:text-danger transition-colors shrink-0";
const addRow =
  "inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent transition-colors";

type Reveal = "checklist" | "acceptance" | "links" | "more";

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
  const detectedType = card?.labels?.find((l) => l.startsWith("type:"))?.replace("type:", "") || "feature";
  const [itemType, setItemType] = useState<"task" | "feature" | "bug">(
    (["task", "feature", "bug"].includes(detectedType) ? detectedType : "feature") as any
  );
  const detectedBackend = card?.labels?.find((l) => l.startsWith("agent:"))?.replace("agent:", "") ||
    (["opencode", "board", "codex", "claude", "claude-code", "human"].includes(card?.assignee?.toLowerCase() || "") ? card?.assignee?.toLowerCase() : "opencode");
  const [backend, setBackend] = useState<string>(detectedBackend || "opencode");
  const [roles, setRoles] = useState<RoleDef[]>([
    { id: "builder", name: "Builder" } as RoleDef,
    { id: "product-owner", name: "Product Owner" } as RoleDef,
    { id: "reviewer", name: "Reviewer" } as RoleDef,
    { id: "indie-hacker", name: "Indie Hacker" } as RoleDef,
  ]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [role, setRole] = useState(
    card?.labels?.find((label) => label.startsWith("role:"))?.slice(5) || "builder"
  );

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

  const [acceptance, setAcceptance] = useState<string[]>(card?.acceptance_criteria || []);
  const [newAc, setNewAc] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchRoles().then((next) => {
      if (!cancelled && next.length > 0) setRoles(next);
    });
    fetchProviders().then((next) => {
      if (!cancelled) {
        setProviders(next.filter((provider) => provider.id !== "human"));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [links, setLinks] = useState<CardLink[]>(card?.links || []);
  const [linkTarget, setLinkTarget] = useState("");
  const [linkType, setLinkType] = useState<LinkType>("child");

  const [reveal, setReveal] = useState<Set<Reveal>>(() => {
    const r = new Set<Reveal>();
    if (checklist.length > 1 || card?.checklist?.length) r.add("checklist");
    if (acceptance.length > 0) r.add("acceptance");
    if (links.length > 0) r.add("links");
    if (card?.remind_at || card?.effort || card?.area || (card as any)?.spec_id) r.add("more");
    return r;
  });

  const titleRef = useRef<HTMLInputElement>(null);
  const newItemRef = useRef<HTMLInputElement>(null);
  const newAcRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);

  const toggleReveal = (k: Reveal) =>
    setReveal((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });

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
    // mirror convention: `--as child` on id → id's parent is target
    const primary: LinkType = linkType === "child" ? "parent" : linkType === "parent" ? "child" : linkType;
    const next: CardLink = { ty: primary, target: linkTarget };
    if (!links.some((l) => l.ty === primary && l.target === linkTarget)) {
      setLinks([...links, next]);
    }
    setLinkTarget("");
  };

  const removeLink = (idx: number) => {
    setLinks(links.filter((_, i) => i !== idx));
  };

  const buildCleanLabels = () => {
    const baseLabels = labels.split(",").map((s) => s.trim()).filter(Boolean);
    const filtered = baseLabels.filter(
      (l) => !l.startsWith("type:") && !l.startsWith("agent:") && !l.startsWith("role:")
    );
    filtered.push(`type:${itemType}`);
    filtered.push(`agent:${backend}`);
    if (role) filtered.push(`role:${role}`);
    return filtered;
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
      labels: buildCleanLabels(),
      assignee: assignee.trim() || backend,
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

  const handlePlanAndBuild = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const parsedEffort = effort ? parseInt(effort, 10) : undefined;
    onSave({
      title: title.trim(),
      description: desc.trim(),
      column: "doing",
      priority,
      labels: buildCleanLabels(),
      assignee: backend,
      due_date: dueDate ? `${dueDate}T00:00:00Z` : undefined,
      remind_at: remindAt ? `${remindAt}:00Z` : undefined,
      effort: Number.isFinite(parsedEffort) ? parsedEffort : undefined,
      area: area.trim() || undefined,
      checklist,
      acceptance_criteria: acceptance,
      links,
      spec_id: specId.trim() || undefined,
      auto_run: true,
    } as any);
  };

  const addChecklistItem = () => {
    if (!newItem.trim()) return;
    setChecklist([...checklist, { text: newItem.trim(), done: false }]);
    setNewItem("");
    newItemRef.current?.focus();
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
    newAcRef.current?.focus();
  };

  const removeAc = (idx: number) => {
    setAcceptance(acceptance.filter((_, i) => i !== idx));
  };

  const cardTitle = (id: string) =>
    allCards.find((c) => c.id === id)?.title || id;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(e);
  };

  const showChecklist = checklist.length > 0 || reveal.has("checklist");
  const showAcceptance = acceptance.length > 0 || reveal.has("acceptance");
  const showLinks = links.length > 0 || reveal.has("links");
  const showMore = reveal.has("more");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] backdrop-blur-[2px]" onClick={onCancel}>
      <div
        className="bg-card rounded-xl shadow-[var(--shadow)] w-full max-w-lg mx-4 p-5 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} onKeyDown={onKeyDown} className="flex flex-col gap-3">
          {/* Hero: title + description, placeholder-driven (Linear pattern) */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-base font-medium text-text placeholder:text-muted/60 focus:outline-none"
            placeholder={card ? "Title" : "Card title"}
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className={`${field} border-0 resize-none h-16`}
            rows={2}
            placeholder="Description…"
          />

          {/* Work Item Type & Agent Backend */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-surface/50 p-2.5 rounded-lg border border-border/40">
            <div>
              <span className={fieldName}>Item Type</span>
              <div className="inline-flex rounded-md p-0.5 bg-surface border border-border/60 text-xs">
                {(["task", "feature", "bug"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setItemType(t)}
                    className={`px-2.5 py-1 rounded capitalize text-xs font-medium transition-colors ${
                      itemType === t ? "bg-accent text-white" : "text-muted hover:text-text"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={fieldName}>Agent Backend</span>
              <QuietSelect
                value={backend}
                onChange={(e) => {
                  setBackend(e.target.value);
                  if (!assignee || ["opencode", "board", "codex", "claude", "claude-code", "human"].includes(assignee.toLowerCase())) {
                    setAssignee(e.target.value);
                  }
                }}
                className="w-full bg-surface px-2.5 py-1.5 text-xs text-text font-mono"
              >
                {providers.length === 0 ? (
                  <option value={backend}>{backend}</option>
                ) : (
                  providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                      {!provider.available ? " · not installed" : ""}
                    </option>
                  ))
                )}
                <option value="board">Board Runner Pool</option>
              </QuietSelect>
            </div>
          </div>

          {/* Meta: the four questions asked of every card */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <div>
              <span className={fieldName}>Column</span>
              <QuietSelect
                value={column}
                onChange={(e) => setColumn(e.target.value)}
                className="w-full bg-surface px-2.5 py-1.5 text-xs text-text"
              >
                {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </QuietSelect>
            </div>
            <div>
              <span className={fieldName}>Priority</span>
              <QuietSelect
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-surface px-2.5 py-1.5 text-xs text-text"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </QuietSelect>
            </div>
            <div>
              <span className={fieldName}>Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className={`${fieldSm} py-1.5`} />
            </div>
            <div className="relative">
              <span className={fieldName}>Assignee</span>
              <input
                value={assignee}
                onChange={(e) => { setAssignee(e.target.value); setShowAuthors(true); }}
                onFocus={() => setShowAuthors(true)}
                onBlur={() => setTimeout(() => setShowAuthors(false), 200)}
                className={fieldSm}
                placeholder="Unassigned"
              />
              {showAuthors && filteredAuthors.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 bg-card rounded-md mt-1 overflow-hidden shadow-[var(--shadow)]">
                  {filteredAuthors.map((a) => (
                    <button key={a} type="button" onMouseDown={() => { setAssignee(a); setShowAuthors(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-surface">{a}</button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <span className={fieldName}>Role</span>
              <QuietSelect
                value={role}
                onChange={(e) => setRole(e.target.value)}
                aria-label="Work role"
                className="w-full bg-surface px-2.5 py-1.5 text-xs text-text"
              >
                {roles.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </QuietSelect>
            </div>
            <div className="col-span-2">
              <span className={fieldName}>Labels</span>
              <input value={labels} onChange={(e) => setLabels(e.target.value)}
                className={fieldSm} placeholder="bug, web, server…" />
            </div>
          </div>

          {/* Rarely-needed fields behind one quiet disclosure */}
          <button type="button" onClick={() => toggleReveal("more")} className={`${addRow} self-start mt-0.5`}>
            <span className={`${reveal.has("more") ? "rotate-90" : ""} transition-transform flex`}>
              <Icon name="chevR" size={12} />
            </span>
            {reveal.has("more") ? "Less" : "More options"}
          </button>
          {showMore && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <div>
                <span className={fieldName}>Remind at</span>
                <input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)}
                  className={fieldSm} />
              </div>
              <div>
                <span className={fieldName}>Effort (points)</span>
                <input type="number" min={0} value={effort} onChange={(e) => setEffort(e.target.value)}
                  className={fieldSm} placeholder="—" />
              </div>
              <div>
                <span className={fieldName}>Area</span>
                <input value={area} onChange={(e) => setArea(e.target.value)}
                  className={fieldSm} placeholder="web, rust…" />
              </div>
              <div>
                <span className={fieldName}>Spec ID</span>
                <input value={specId} onChange={(e) => setSpecId(e.target.value)}
                  className={fieldSm} placeholder="auto from intake" />
              </div>
            </div>
          )}

          {/* ── Attached work: checklist ─────────────────────────────── */}
          {showChecklist && (
            <section>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon name="subtasks" size={12} className="text-muted" />
                <span className={secLabel}>Checklist{checklist.length > 0 ? ` · ${checklist.filter((c) => c.done).length}/${checklist.length}` : ""}</span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    <button type="button" onClick={() => toggleChecklistItem(idx)}
                      className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center shrink-0 transition-colors ${item.done ? "bg-success text-black" : "bg-transparent ring-1 ring-inset ring-[var(--border-strong)] hover:ring-muted"}`}>
                      {item.done && <Icon name="check" size={9} />}
                    </button>
                    <span className={`flex-1 text-xs truncate ${item.done ? "text-muted line-through" : "text-text"}`}>{item.text}</span>
                    <button type="button" onClick={() => removeChecklistItem(idx)} className={`${iconGhost} opacity-0 group-hover:opacity-100`}>
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <input
                ref={newItemRef}
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
                className={`${fieldSm} mt-1.5`}
                placeholder="Add item, Enter to save…"
              />
            </section>
          )}

          {/* ── Acceptance criteria ──────────────────────────────────── */}
          {showAcceptance && (
            <section>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon name="check" size={12} className="text-muted" />
                <span className={secLabel}>Acceptance{acceptance.length > 0 ? ` · ${acceptance.length}` : ""}</span>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {acceptance.map((ac, idx) => (
                  <div key={idx} className="flex items-start gap-2 group">
                    <span className="w-1.5 h-1.5 rounded-[2px] bg-accent mt-[5px] shrink-0" />
                    <span className="flex-1 text-xs text-text">{ac}</span>
                    <button type="button" onClick={() => removeAc(idx)} className={`${iconGhost} opacity-0 group-hover:opacity-100`}>
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <input
                ref={newAcRef}
                value={newAc}
                onChange={(e) => setNewAc(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAc(); } }}
                className={`${fieldSm} mt-1.5`}
                placeholder="e.g. Users can log in"
              />
            </section>
          )}

          {/* ── Links ────────────────────────────────────────────────── */}
          {showLinks && (
            <section>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon name="link" size={12} className="text-muted" />
                <span className={secLabel}>Linked cards{links.length > 0 ? ` · ${links.length}` : ""}</span>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {links.map((l, idx) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    <span className="text-[10px] text-muted shrink-0">{l.ty}</span>
                    <span className="flex-1 text-xs text-text truncate">{cardTitle(l.target)}</span>
                    <button type="button" onClick={() => removeLink(idx)} className={`${iconGhost} opacity-0 group-hover:opacity-100`}>
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-1.5">
                <QuietSelect
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value as LinkType)}
                  className="w-28 bg-surface px-2 py-1.5 text-xs text-text shrink-0"
                >
                  <option value="child">child</option>
                  <option value="parent">parent</option>
                  <option value="related">related</option>
                  <option value="blocked-by">blocked-by</option>
                </QuietSelect>
                <QuietSelect
                  value={linkTarget}
                  onChange={(e) => setLinkTarget(e.target.value)}
                  className="flex-1 min-w-0 bg-surface px-2 py-1.5 text-xs text-text"
                >
                  <option value="">Select card…</option>
                  {linkableCards.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </QuietSelect>
                <button type="button" onClick={addLink}
                  disabled={!linkTarget}
                  className="px-2.5 py-1.5 text-xs rounded-md bg-transparent text-accent hover:bg-accent-soft disabled:opacity-40 transition-colors shrink-0">
                  Link
                </button>
              </div>
            </section>
          )}

          {/* ── Attach-row: quiet expands for empty sections ────────── */}
          {!(showChecklist && showAcceptance && showLinks) && (
            <div className="flex gap-4">
              {!reveal.has("checklist") && checklist.length === 0 && (
                <button type="button" onClick={() => toggleReveal("checklist")} className={addRow}>
                  <Icon name="subtasks" size={12} /> Checklist
                </button>
              )}
              {!reveal.has("acceptance") && acceptance.length === 0 && (
                <button type="button" onClick={() => toggleReveal("acceptance")} className={addRow}>
                  <Icon name="check" size={12} /> Acceptance
                </button>
              )}
              {!reveal.has("links") && links.length === 0 && (
                <button type="button" onClick={() => toggleReveal("links")} className={addRow}>
                  <Icon name="link" size={12} /> Link
                </button>
              )}
            </div>
          )}

          {/* ── Comments (read-only in the form) ─────────────────────── */}
          {card && card.comments.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon name="comment" size={12} className="text-muted" />
                <span className={secLabel}>Comments · {card.comments.length}</span>
              </div>
              <div className="space-y-2 max-h-24 overflow-y-auto">
                {card.comments.map((c, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-muted-strong font-medium">{c.author}</span>
                    <span className="text-muted ml-2">{c.at?.slice(0, 10)}</span>
                    <p className="text-text mt-0.5">{c.text}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Code mapping (edit mode only; updates via CLI) ───────── */}
          {card && (
            <CodeSection context={context} cardId={card.id} onOpenFile={onOpenFile} />
          )}

          {/* ── Spec (only when linked) ──────────────────────────────── */}
          {(specId || (card as any)?.spec_id) && (
            <SpecTab cardId={card?.id} specId={specId || (card as any)?.spec_id} />
          )}

          {/* ── Footer ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
            {onDelete && card ? (
              <button type="button" onClick={onDelete} className="px-2.5 py-1.5 text-xs text-danger hover:bg-danger-soft rounded-md transition-colors">Delete</button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-muted hover:text-text rounded-md transition-colors">Cancel</button>
              <button type="submit" className="px-3 py-1.5 text-xs rounded-md border border-border text-text hover:bg-surface font-medium transition-colors">
                {card ? "Save" : "Save Draft"}
              </button>
              <button
                type="button"
                onClick={handlePlanAndBuild}
                className="px-3.5 py-1.5 text-xs rounded-md bg-accent text-white hover:bg-accent-hover font-medium transition-colors shadow-sm"
              >
                Plan & Implement
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function CodeSection({ context, cardId, onOpenFile }: { context: CardContext | null; cardId: string; onOpenFile?: (path: string, line?: number) => void }) {
  const hasFiles = Boolean(context && context.files.length > 0);
  return (
    <section>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon name="code" size={12} className="text-muted" />
        <span className={secLabel}>Code</span>
      </div>
      {hasFiles ? (
        <>
          <div className="space-y-1 max-h-44 overflow-y-auto">
            {context!.files.map((f) => (
              <div key={f.path} className="flex items-center gap-2 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor(f.status)}`} title={f.status} />
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
          {context!.files.some((f) => f.symbols.length > 0) && (
            <p className="text-[11px] text-muted mt-1.5">
              Symbols: {context!.files.flatMap((f) => f.symbols).slice(0, 12).join(", ")}
              {context!.files.flatMap((f) => f.symbols).length > 12 ? "…" : ""}
            </p>
          )}
          {context!.sessions.length > 0 && (
            <p className="text-[11px] text-muted mt-1">Sessions: {context!.sessions.join(", ")}</p>
          )}
          {context!.ai && (
            <div className="rounded-lg bg-surface p-3 mt-2">
              <p className="text-[11px] font-medium text-muted mb-1">
                AI context · {context!.ai.model || "model"} · {context!.ai.at?.slice(0, 10)} · {((context!.ai.confidence || 0) * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-text whitespace-pre-wrap">{context!.ai.summary}</p>
              {context!.ai.next_steps.length > 0 && (
                <ul className="text-xs text-text space-y-0.5 mt-1.5">
                  {context!.ai.next_steps.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}
            </div>
          )}
          <p className="text-[11px] text-muted mt-1.5">Last synced: {context!.last_sync_commit || "never"} · <code>barkcli context sync</code> to update.</p>
        </>
      ) : (
        <p className="text-[11px] text-muted">
          No code mapped. Run <code>barkcli context scan</code>, or link manually: <code>barkcli context link {cardId} src/file.rs</code>.
        </p>
      )}
    </section>
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

  return (
    <section>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon name="layers" size={12} className="text-muted" />
        <span className={secLabel}>Spec</span>
      </div>
      {loading && <p className="text-[11px] text-muted">Loading spec…</p>}
      {!loading && !spec && (
        <p className="text-[11px] text-muted">
          Spec <code className="font-mono">{specId}</code> isn't on this board yet. Create one with <code>barkcli intake "…"</code> or link it in Specs.
        </p>
      )}
      {!loading && spec && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text truncate">{spec.title}</span>
            <span className="text-[10px] text-muted">{spec.status}</span>
          </div>
          {spec.description && <p className="text-[11px] text-muted">{spec.description}</p>}
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {(spec.requirements || []).map((r: any) => (
              <div key={r.id} className="rounded-lg bg-surface p-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  <span className="flex-1 text-text font-medium truncate">{r.title}</span>
                  <span className="text-[10px] text-muted">{r.status}</span>
                </div>
                {(r.acceptance_criteria || []).length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {r.acceptance_criteria.map((ac: string, i: number) => (
                      <li key={i} className="text-[11px] text-muted flex gap-1.5">
                        <span className="w-1 h-1 rounded-[1px] bg-muted mt-[6px] shrink-0" />{ac}
                      </li>
                    ))}
                  </ul>
                )}
                {(r.linked_tasks || []).length > 0 && (
                  <p className="text-[10px] text-muted font-mono mt-1">tasks: {r.linked_tasks.join(", ")}</p>
                )}
                {r.stale && (
                  <p className="text-[10px] text-warning mt-1 inline-flex items-center gap-1">
                    <Icon name="warn" size={11} /> stale{r.stale_reason ? `: ${r.stale_reason}` : ""}
                  </p>
                )}
              </div>
            ))}
            {(spec.requirements || []).length === 0 && (
              <p className="text-[11px] text-muted">No requirements yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "changed":
    case "deleted": return "bg-danger";
    case "stale": return "bg-warning";
    case "clean": return "bg-success";
    default: return "bg-muted";
  }
}

function toLocalInput(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : iso.slice(0, 16);
}
