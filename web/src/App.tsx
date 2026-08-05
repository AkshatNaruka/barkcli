import React, { useState, useEffect, useCallback, useRef } from "react";
import type { Board as BoardType, Card, ViewMode } from "./lib/types";
import { fetchBoard, saveBoard, connectWs, getGitInfo, getCardHistory, type GitInfo } from "./lib/api";
import { BoardView } from "./components/BoardView";
import { TableView } from "./components/TableView";
import { CalendarView } from "./components/CalendarView";
import { ListView } from "./components/ListView";
import { CardForm } from "./components/CardForm";
import { CommandPalette } from "./components/CommandPalette";
import { Toast } from "./components/Toast";
import { ThemeDropdown } from "./components/ThemeDropdown";

function CardHistoryModal({ cardId, entries, onClose }: { cardId: string; entries: any[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-2xl max-w-md w-full mx-4 max-h-[400px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-text font-mono text-sm">History: {cardId}</h3>
          <button onClick={onClose} className="text-muted hover:text-text">✕</button>
        </div>
        <div className="p-4 space-y-2">
          {entries.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">No history entries</p>
          ) : (
            entries.map((e: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs border-b border-border/50 pb-2 last:border-0">
                <span className="text-muted font-mono shrink-0 mt-0.5">{e.at?.slice(11, 19) || "?"}</span>
                <span className="text-muted-strong bg-surface px-1 rounded font-mono text-[10px]">{e.op}</span>
                <span className="text-muted-strong">
                  {e.old_value && <span className="text-muted">{e.old_value} → </span>}
                  {e.new_value || e.card || ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [board, setBoard] = useState<BoardType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("board");
  const [loading, setLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [form, setForm] = useState<{ card?: Card; columnId?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [historyCard, setHistoryCard] = useState<{ id: string; entries: any[] } | null>(null);

  // When we save, the extension writes the file which triggers a reload
  // message. We already have the fresh state — skip that round trip so
  // drag/drop and edits feel instant (no skeleton flash, no re-render).
  const skipReloadRef = useRef(false);

  const loadBoard = useCallback(async (showSkeleton: boolean) => {
    if (!showSkeleton && skipReloadRef.current) {
      skipReloadRef.current = false;
      return;
    }
    if (showSkeleton) setLoading(true);
    const b = await fetchBoard();
    if (b) { setBoard(b); setError(null); }
    else { setError("Failed to load board data"); }
    if (showSkeleton) setLoading(false);
  }, []);

  useEffect(() => {
    loadBoard(true);
    const cleanWs = connectWs(() => loadBoard(false));
    return cleanWs;
  }, [loadBoard]);

  useEffect(() => { getGitInfo().then(setGitInfo).catch(() => {}); }, []);

  const doSave = useCallback(async (b: BoardType) => {
    setBoard(b);
    saveBoard(b);
    skipReloadRef.current = true;
    setTimeout(() => { skipReloadRef.current = false; }, 500);
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleAddCard = useCallback(async (data: Partial<Card>, columnId: string) => {
    if (!boardRef.current) return;
    const b = { ...boardRef.current };
    const id = slugify(data.title || "untitled", b.cards.map((c) => c.id));
    const now = new Date().toISOString();
    const card: Card = {
      id, title: data.title || "Untitled", column: columnId,
      description: data.description || "",
      priority: data.priority || "medium",
      labels: data.labels || [], assignee: data.assignee,
      checklist: [], comments: [], due_date: data.due_date,
      blocked_by: undefined, attachments: [], pinned: false,
      created_at: now, updated_at: now,
    };
    b.cards = [...b.cards, card];
    await doSave(b);
    notify(`Card "${card.title}" added`);
  }, [doSave, notify]);

  const handleUpdateCard = useCallback(async (id: string, data: Partial<Card>) => {
    if (!boardRef.current) return;
    const b = { ...boardRef.current };
    b.cards = b.cards.map((c) =>
      c.id === id ? { ...c, ...data, updated_at: new Date().toISOString() } : c
    );
    await doSave(b);
  }, [doSave]);

  const handleDeleteCard = useCallback(async (id: string) => {
    if (!boardRef.current) return;
    const b = { ...boardRef.current };
    const card = b.cards.find((c) => c.id === id);
    b.cards = b.cards.filter((c) => c.id !== id);
    await doSave(b);
    if (card) notify(`Card "${card.title}" deleted`);
  }, [doSave, notify]);

  const handleMoveCard = useCallback(async (id: string, column: string) => {
    if (!boardRef.current) return;
    const b = { ...boardRef.current };
    b.cards = b.cards.map((c) =>
      c.id === id ? { ...c, column, updated_at: new Date().toISOString() } : c
    );
    await doSave(b);
  }, [doSave]);

  const handleTogglePin = useCallback(async (id: string) => {
    if (!boardRef.current) return;
    const b = { ...boardRef.current };
    b.cards = b.cards.map((c) =>
      c.id === id ? { ...c, pinned: !c.pinned, updated_at: new Date().toISOString() } : c
    );
    await doSave(b);
  }, [doSave]);

  const handleCopyCommitMsg = useCallback((card: Card) => {
    navigator.clipboard.writeText(`[${card.id}] ${card.title}`).then(() => {
      notify(`Copied: [${card.id}] ${card.title}`);
    });
  }, [notify]);

  const handleShowHistory = useCallback(async (cardId: string) => {
    const entries = await getCardHistory(cardId);
    setHistoryCard({ id: cardId, entries });
  }, []);

  if (error && !board) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="text-danger bg-danger-soft p-6 rounded-lg max-w-md text-center">
          <h2 className="font-bold text-lg mb-2">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="space-y-4 w-80">
          <div className="h-8 bg-surface rounded animate-pulse" />
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex-1 space-y-3">
                <div className="h-6 bg-surface rounded animate-pulse" />
                <div className="h-20 bg-surface rounded animate-pulse" />
                <div className="h-16 bg-surface rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Breadcrumb */}
          <span className="text-xs text-muted font-mono select-none">~/project</span>
          <span className="text-muted select-none">/</span>
          <h1 className="text-sm font-semibold text-text truncate">{board?.title || "Board"}</h1>
          <span className="text-[10px] text-muted bg-surface border border-border px-1.5 py-0.5 rounded-full shrink-0">
            {board?.cards.length || 0} cards
          </span>
          {gitInfo && (
            <span className="hidden md:inline text-[10px] text-muted font-mono border-l border-border pl-2.5 ml-1 truncate max-w-[220px]">
              {gitInfo.branch} · {gitInfo.lastCommit}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View tabs */}
          <div className="flex bg-surface rounded-md p-0.5 mr-1">
            {(["board", "table", "calendar", "list"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 text-xs rounded font-medium capitalize transition-colors ${
                  view === v ? "bg-card text-text shadow-sm" : "text-muted hover:text-text"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <ThemeDropdown />
          <button
            onClick={() => setPaletteOpen(true)}
            className="text-xs text-muted hover:text-text px-2 py-1.5 rounded border border-border hover:border-border-strong transition-colors"
            title="Command palette (⌘K)"
          >
            ⌘K
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {board && view === "board" && (
          <BoardView
            board={board}
            onMoveCard={handleMoveCard}
            onTogglePin={handleTogglePin}
            onAddCard={() => setForm({ columnId: board.columns[0]?.id || "todo" })}
            onAddToColumn={(colId) => setForm({ columnId: colId })}
            onEditCard={(card) => setForm({ card })}
            onDeleteCard={handleDeleteCard}
            onShowHistory={handleShowHistory}
            onCopyCommitMsg={handleCopyCommitMsg}
          />
        )}
        {board && view === "table" && (
          <TableView
            board={board}
            onEditCard={(card) => setForm({ card })}
            onDeleteCard={handleDeleteCard}
            onMoveCard={handleMoveCard}
          />
        )}
        {board && view === "calendar" && (
          <CalendarView board={board} onEditCard={(card) => setForm({ card })} />
        )}
        {board && view === "list" && (
          <ListView
            board={board}
            onEditCard={(card) => setForm({ card })}
            onDeleteCard={handleDeleteCard}
            onMoveCard={handleMoveCard}
          />
        )}
      </main>

      {/* Modals */}
      {form && board && (
          <CardForm
            card={form.card}
            columns={board.columns}
            defaultColumn={form.columnId}
            authors={gitInfo?.authors || []}
          onSave={(data) => {
            if (form.card) {
              handleUpdateCard(form.card.id, data);
            } else if (form.columnId) {
              handleAddCard(data, form.columnId);
            }
            setForm(null);
          }}
          onCancel={() => setForm(null)}
          onDelete={form.card ? () => { handleDeleteCard(form.card!.id); setForm(null); } : undefined}
        />
      )}
      {paletteOpen && board && (
        <CommandPalette
          board={board}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(colId, cardId) => {
            // Could implement card focus navigation
          }}
          onAddCard={(colId) => { setForm({ columnId: colId }); setPaletteOpen(false); }}
          onEditCard={(card) => { setForm({ card }); setPaletteOpen(false); }}
        />
      )}

      {/* Toasts */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      {historyCard && (
        <CardHistoryModal cardId={historyCard.id} entries={historyCard.entries} onClose={() => setHistoryCard(null)} />
      )}
    </div>
  );
}

function slugify(text: string, existing: string[]): string {
  let slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) slug = "card";
  let id = slug;
  let i = 2;
  while (existing.includes(id)) { id = `${slug}-${i}`; i++; }
  return id;
}
