import React, { useState, useEffect, useCallback, useRef } from "react";
import type {
  Board as BoardType,
  Card,
  CardContext,
  HistoryEntry,
  SessionEntry,
  ViewMode,
  Sprint,
} from "./lib/types";
import {
  fetchBoard,
  fetchBoards,
  fetchSprints,
  fetchCardContext,
  fetchHistory,
  fetchSessions,
  getCardHistory,
  saveBoard,
  connectWs,
  getGitInfo,
  openFileInEditor,
  type GitInfo,
} from "./lib/api";
import { useRoute, navigate, type Route } from "./lib/hashnav";
import { BoardView } from "./components/BoardView";
import { TableView } from "./components/TableView";
import { CalendarView } from "./components/CalendarView";
import { ListView } from "./components/ListView";
import { CardForm } from "./components/CardForm";
import { CommandPalette } from "./components/CommandPalette";
import { Toast } from "./components/Toast";
import { ThemeDropdown } from "./components/ThemeDropdown";
import { Dashboard } from "./components/Dashboard";
import { ReportsView } from "./components/ReportsView";
import { CodeView } from "./components/CodeView";
import { ActivityView } from "./components/ActivityView";
import { SprintView } from "./components/SprintView";
import { SettingsView } from "./components/SettingsView";
import { AgentPromptView } from "./components/AgentPromptView";

const NAV_ITEMS: { route: Route; label: string }[] = [
  { route: "dashboard", label: "Dashboard" },
  { route: "board", label: "Board" },
  { route: "calendar", label: "Calendar" },
  { route: "reports", label: "Reports" },
  { route: "code", label: "Code" },
  { route: "activity", label: "Activity" },
  { route: "sprints", label: "Sprints" },
  { route: "settings", label: "Settings" },
  { route: "agent-prompt", label: "AI Agent" },
];

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

function ActivityModal({
  cardId,
  history,
  sessions,
  onClose,
}: {
  cardId: string;
  history: HistoryEntry[];
  sessions: SessionEntry[];
  onClose: () => void;
}) {
  const entries = [
    ...history.map((e) => ({
      at: e.at,
      kind: "history" as const,
      op: e.op,
      field: e.field,
      text: [e.old_value, e.new_value].filter(Boolean).join(" → "),
    })),
    ...sessions.map((s) => ({
      at: s.at,
      kind: "session" as const,
      op: "session",
      field: s.agent,
      text: s.summary || s.prompt || s.id,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-2xl max-w-md w-full mx-4 max-h-[500px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-text text-sm">Activity: {cardId}</h3>
          <button onClick={onClose} className="text-muted hover:text-text">✕</button>
        </div>
        <div className="p-4 space-y-2">
          {entries.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">No activity yet</p>
          ) : (
            entries.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-xs border-b border-border/50 pb-2 last:border-0">
                <span className="text-muted font-mono shrink-0 mt-0.5">{e.at?.slice(11, 19) || "?"}</span>
                {e.kind === "session" ? (
                  <span className="text-accent bg-accent/10 px-1 rounded font-mono text-[10px] shrink-0">session</span>
                ) : (
                  <span className="text-muted-strong bg-surface px-1 rounded font-mono text-[10px] shrink-0">{e.op}</span>
                )}
                <span className="text-muted-strong min-w-0">
                  {e.field && <span className="text-muted">{e.field} · </span>}
                  <span className="break-words">{e.text || ""}</span>
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
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useRoute();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [form, setForm] = useState<{ card?: Card; columnId?: string; dueDate?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const boardRef = useRef(board);
  boardRef.current = board;

  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [historyCard, setHistoryCard] = useState<{ id: string; entries: any[] } | null>(null);
  const [activityCard, setActivityCard] = useState<{ id: string; history: HistoryEntry[]; sessions: SessionEntry[] } | null>(null);
  const [cardContexts, setCardContexts] = useState<Record<string, CardContext | null>>({});
  const [boardList, setBoardList] = useState<string[]>([]);
  const [boardName, setBoardName] = useState<string | null>(null);
  const boardNameRef = useRef<string | null>(null);
  boardNameRef.current = boardName;

  // Debounced save: the latest board state is flushed 250ms after the last
  // edit. During the window we skip WS reloads caused by our own save.
  const pendingSaveRef = useRef<BoardType | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const skipReloadRef = useRef(false);
  const seenReloadVersionsRef = useRef<Set<number>>(new Set());

  const flushSave = useCallback(() => {
    const b = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!b) return;
    skipReloadRef.current = true;
    saveBoard(b, boardNameRef.current || undefined);
    window.setTimeout(() => { skipReloadRef.current = false; }, 1500);
  }, []);

  const doSave = useCallback((b: BoardType) => {
    setBoard(b);
    pendingSaveRef.current = b;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flushSave, 250);
  }, [flushSave]);

  const loadBoard = useCallback(async (name: string | null, showSkeleton: boolean) => {
    if (showSkeleton) setLoading(true);
    const b = await fetchBoard(name || undefined);
    if (b) { setBoard(b); setError(null); }
    else { setError("Failed to load board data"); }
    if (showSkeleton) setLoading(false);
  }, []);

  useEffect(() => {
    loadBoard(boardName, true);
    const cleanWs = connectWs((version) => {
      if (seenReloadVersionsRef.current.has(version)) return;
      seenReloadVersionsRef.current.add(version);
      if (skipReloadRef.current) return; // our own debounced save
      loadBoard(boardName, false);
    });
    return cleanWs;
  }, [boardName, loadBoard]);

  useEffect(() => {
    getGitInfo().then(setGitInfo).catch(() => {});
  }, []);
  useEffect(() => { fetchBoards().then(setBoardList).catch(() => {}); }, []);
  useEffect(() => {
    fetchSprints(boardName || undefined).then(setSprints).catch(() => {});
  }, [boardName]);

  // Flush pending save when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      const b = pendingSaveRef.current;
      if (b) { pendingSaveRef.current = null; saveBoard(b); }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
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

  const switchBoard = useCallback((name: string) => {
    if (name === boardName) return;
    setBoardName(name);
    setCardContexts({});
  }, [boardName]);

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
      checklist: data.checklist || [], comments: [], due_date: data.due_date,
      remind_at: data.remind_at,
      blocked_by: undefined, attachments: [],
      links: data.links || [], acceptance_criteria: data.acceptance_criteria || [],
      effort: data.effort, area: data.area,
      pinned: false,
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

  const handleShowActivity = useCallback(async (cardId: string) => {
    const [history, sessions] = await Promise.all([fetchHistory(cardId), fetchSessions()]);
    setActivityCard({ id: cardId, history, sessions });
  }, []);

  const handleOpenForm = useCallback((target: { card?: Card; columnId?: string; dueDate?: string }) => {
    if (target.card) {
      const id = target.card.id;
      if (cardContexts[id] === undefined) {
        fetchCardContext(id).then((c) =>
          setCardContexts((prev) => ({ ...prev, [id]: c }))
        );
      }
    }
    setForm(target);
  }, [cardContexts]);

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
      {/* Row 1: brand + board switcher + meta */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("dashboard")}
            className="flex items-center gap-1.5 text-sm font-bold text-text hover:text-accent transition-colors shrink-0"
          >
            <span className="w-5 h-5 rounded bg-accent text-white flex items-center justify-center text-[10px] font-mono">b</span>
            barkcli
          </button>
          <span className="w-px h-4 bg-border shrink-0" />
          {boardList.length > 0 && (
            <div className="relative shrink-0">
              <select
                value={boardName || boardList[0] || ""}
                onChange={(e) => switchBoard(e.target.value)}
                className="bg-surface border border-border rounded text-xs text-text px-2 py-1 pr-6 hover:border-border-strong focus:outline-none focus:border-accent cursor-pointer max-w-[180px]"
                title="Switch board"
              >
                {boardList.map((n) => (
                  <option key={n} value={n}>{n}.board</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-semibold text-text truncate">{board?.title || "Board"}</h1>
            <span className="text-[10px] text-muted bg-surface border border-border px-1.5 py-0.5 rounded-full shrink-0">
              {board?.cards.length || 0} cards
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {gitInfo && (
            <span className="hidden lg:inline text-[10px] text-muted font-mono border border-border rounded px-1.5 py-0.5 truncate max-w-[220px]">
              {gitInfo.branch} · {gitInfo.lastCommit}
            </span>
          )}
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

      {/* Row 2: hub navigation */}
      <nav className="flex items-center px-2 border-b border-border shrink-0 overflow-x-auto">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.route}
            onClick={() => setRoute(item.route)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              route === item.route
                ? "text-accent border-accent"
                : "text-muted hover:text-text border-transparent"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {board && route === "dashboard" && (
          <Dashboard board={board} sprints={sprints} gitInfo={gitInfo} onOpenCard={(id) => { setRoute("board"); }} />
        )}
        {board && route === "board" && (
          <BoardPage
            board={board}
            onMoveCard={handleMoveCard}
            onTogglePin={handleTogglePin}
            onAddCard={() => handleOpenForm({ columnId: board.columns[0]?.id || "todo" })}
            onAddToColumn={(colId) => handleOpenForm({ columnId: colId })}
            onEditCard={(card) => handleOpenForm({ card })}
            onDeleteCard={handleDeleteCard}
            onShowHistory={handleShowHistory}
            onShowActivity={handleShowActivity}
            onCopyCommitMsg={handleCopyCommitMsg}
          />
        )}
        {board && route === "calendar" && (
          <CalendarView
            board={board}
            sprints={sprints}
            onEditCard={(card) => handleOpenForm({ card })}
            onAddCard={(date) => handleOpenForm({ columnId: board.columns[0]?.id || "todo", dueDate: date })}
          />
        )}
        {board && route === "reports" && (
          <ReportsView board={board} sprints={sprints} />
        )}
        {board && route === "code" && (
          <CodeView board={board} onOpenFile={(path, line) => openFileInEditor(path, line)} onEditCard={(card) => handleOpenForm({ card })} />
        )}
        {route === "activity" && (
          <ActivityView boardName={board?.title || null} />
        )}
        {route === "sprints" && (
          <SprintView
            board={board}
            sprints={sprints}
            onSprintChanged={() => fetchSprints(boardName || undefined).then(setSprints)}
            onEditCard={(card) => handleOpenForm({ card })}
          />
        )}
        {board && route === "settings" && (
          <SettingsView
            board={board}
            onSaveBoard={doSave}
          />
        )}
        {route === "agent-prompt" && (
          <AgentPromptView />
        )}
      </main>

      {/* Modals */}
      {form && board && (
          <CardForm
            card={form.card}
            columns={board.columns}
            defaultColumn={form.columnId}
            defaultDueDate={form.dueDate}
            authors={gitInfo?.authors || []}
            allCards={board.cards}
            context={form.card ? cardContexts[form.card.id] : null}
            onOpenFile={(path) => openFileInEditor(path)}
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
          onNavigate={(colId, cardId) => { setRoute("board"); }}
          onAddCard={(colId) => { setForm({ columnId: colId }); setPaletteOpen(false); }}
          onEditCard={(card) => { setForm({ card }); setPaletteOpen(false); }}
        />
      )}

      {/* Toasts */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      {historyCard && (
        <CardHistoryModal cardId={historyCard.id} entries={historyCard.entries} onClose={() => setHistoryCard(null)} />
      )}
      {activityCard && (
        <ActivityModal
          cardId={activityCard.id}
          history={activityCard.history}
          sessions={activityCard.sessions}
          onClose={() => setActivityCard(null)}
        />
      )}
    </div>
  );
}

function BoardPage({
  board,
  onMoveCard,
  onTogglePin,
  onAddCard,
  onAddToColumn,
  onEditCard,
  onDeleteCard,
  onShowHistory,
  onShowActivity,
  onCopyCommitMsg,
}: {
  board: BoardType;
  onMoveCard: (id: string, col: string) => void;
  onTogglePin: (id: string) => void;
  onAddCard: () => void;
  onAddToColumn: (colId: string) => void;
  onEditCard: (card: Card) => void;
  onDeleteCard: (id: string) => void;
  onShowHistory: (cardId: string) => void;
  onShowActivity: (cardId: string) => void;
  onCopyCommitMsg: (card: Card) => void;
}) {
  const [view, setView] = useState<ViewMode>("board");
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-4 pt-2 pb-0 shrink-0">
        <div className="flex bg-surface rounded-md p-0.5">
          {(["board", "table", "list"] as ViewMode[]).map((v) => (
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
      </div>
      <div className="flex-1 overflow-hidden">
        {view === "board" && (
          <BoardView
            board={board}
            onMoveCard={onMoveCard}
            onTogglePin={onTogglePin}
            onAddCard={onAddCard}
            onAddToColumn={onAddToColumn}
            onEditCard={onEditCard}
            onDeleteCard={onDeleteCard}
            onShowHistory={onShowHistory}
            onShowActivity={onShowActivity}
            onCopyCommitMsg={onCopyCommitMsg}
          />
        )}
        {view === "table" && (
          <TableView
            board={board}
            onEditCard={onEditCard}
            onDeleteCard={onDeleteCard}
            onMoveCard={onMoveCard}
          />
        )}
        {view === "list" && (
          <ListView
            board={board}
            onEditCard={onEditCard}
            onDeleteCard={onDeleteCard}
            onMoveCard={onMoveCard}
          />
        )}
      </div>
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
