import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { QuietSelect } from "./components/QuietSelect";
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
  cardPlanAndRun,
  saveBoard,
  connectWs,
  getGitInfo,
  openFileInEditor,
  type GitInfo,
} from "./lib/api";
import { useRoute, type Route } from "./lib/hashnav";
import { Icon } from "./components/Icon";
import { BoardView } from "./components/BoardView";
import { TableView } from "./components/TableView";
import { ListView } from "./components/ListView";
import { CardForm } from "./components/CardForm";
import { CommandPalette } from "./components/CommandPalette";
import { ServerStatus } from "./components/ServerStatus";
import { HistoryView } from "./components/HistoryView";
import { SkillsView } from "./components/SkillsView";
import { ThreadsShell } from "./shell/ThreadsShell";
import { AppRail } from "./shell/AppRail";
import { InspectorRail } from "./shell/InspectorRail";
import { OperationsView } from "./shell/OperationsView";
import { BrainSurface } from "./shell/BrainSurface";
import { AgentsSurface } from "./shell/AgentsSurface";
import { CustomizePanel } from "./shell/CustomizePanel";
import { useTheme } from "./lib/theme";
import { SURFACES } from "./lib/surfaces";

function isBlockedCard(c: Card): boolean {
  return Boolean(c.blocked_by) || c.links.some((l) => l.ty === "blocked-by");
}

// ── Installable web app (Notion/Linear-style) ────────────────────────────
// Surfaces the browser's native install flow as a header button. Only shows
// when the page is actually installable (manifest + service worker + HTTPS):
// Chrome/Edge fire beforeinstallprompt; Safari installs via its share menu,
// so the button stays hidden there.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // suppress the browser's own mini-infobar
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!promptEvent || installed) return null;

  const install = async () => {
    const ev = promptEvent;
    setPromptEvent(null);
    try {
      await ev.prompt();
      await ev.userChoice;
    } catch {
      /* browser dismissed the dialog — nothing to do */
    }
  };

  return (
    <button
      onClick={install}
      className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-text bg-surface border border-border hover:border-border-strong rounded px-1.5 py-0.5 shrink-0 transition-colors"
      title="Install as an app — own window, dock icon, works offline"
    >
      <Icon name="download" size={11} />
      install
    </button>
  );
}

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
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<{ text: string; nonce: number } | null>(null);
  const { railOrder, hidden } = useTheme();
  const visibleSurfaces = useMemo(
    () => railOrder.filter((id) => !hidden.includes(id)),
    [railOrder, hidden]
  );
  const [form, setForm] = useState<{ card?: Card; columnId?: string; dueDate?: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; action?: { label: string; onClick: () => void } } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(
    () => window.localStorage.getItem("barkcli:inspector") !== "0"
  );
  const toggleInspector = useCallback(() => {
    setInspectorOpen((open) => {
      window.localStorage.setItem("barkcli:inspector", open ? "0" : "1");
      return !open;
    });
  }, []);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const boardRef = useRef(board);
  boardRef.current = board;

  // Window title follows the active surface.
  useEffect(() => {
    const label = SURFACES.find((s) => s.id === route)?.label.toLowerCase() ?? route;
    document.title = `barkcli · ${label}`;
  }, [route]);

  // A shared look may hide the surface this tab is currently on.
  useEffect(() => {
    if (!hidden.includes(route)) return;
    const next = visibleSurfaces[0];
    if (next) setRoute(next);
  }, [hidden, route, visibleSurfaces, setRoute]);

  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [historyCard, setHistoryCard] = useState<{ id: string; entries: any[] } | null>(null);
  const [activityCard, setActivityCard] = useState<{ id: string; history: HistoryEntry[]; sessions: SessionEntry[] } | null>(null);
  const [cardContexts, setCardContexts] = useState<Record<string, CardContext | null>>({});
  const [boardList, setBoardList] = useState<string[]>([]);
  const [boardName, setBoardName] = useState<string | null>(null);
  const [agentsActive, setAgentsActive] = useState(0);
  const boardNameRef = useRef<string | null>(null);
  boardNameRef.current = boardName;

  // Sidebar badges: live agent count (board/blocker counts derive from board state)
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        const agents = Array.isArray(d.agents) ? d.agents : [];
        setAgentsActive(agents.filter((a: any) => a.status === "Working").length);
      })
      .catch(() => {});
  }, [boardName, board]);

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

  const notify = useCallback((msg: string, action?: { label: string; onClick: () => void }) => {
    setToast({ message: msg, action });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Board → agent handoff. Plan & run dispatches immediately; Ask agent opens
  // the composer with the card as context so the user can steer first.
  const handlePlanCard = useCallback(
    async (card: Card) => {
      notify(`Dispatching an agent for “${card.title}”…`);
      const res = await cardPlanAndRun(card.id, undefined, boardName || undefined);
      notify(res ? "Agent dispatched — follow it in Agents" : "Could not dispatch an agent");
    },
    [boardName, notify]
  );

  const handleAskAgent = useCallback(
    (card: Card) => {
      const text = [
        `Help me with this card: “${card.title}” (${card.id}, ${card.column}).`,
        card.description ? `\n${card.description}` : "",
        "\nWhat should we do next?",
      ]
        .filter(Boolean)
        .join("\n");
      setComposeSeed({ text, nonce: Date.now() });
      setRoute("chat");
    },
    [setRoute]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        // Undo
        import("./lib/api").then(({ undo }) => {
          undo(boardName || undefined).then((r) => {
            if (r.ok) {
              notify(`Undid: ${r.undid}`, { label: "Reload", onClick: () => loadBoard(boardName, false) });
              loadBoard(boardName, false);
            } else {
              notify("Nothing to undo");
            }
          });
        });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setCustomizeOpen(true);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((p) => !p);
        return;
      }
      // 1–7 jump between the surfaces currently in the rail.
      const digit = Number(e.key);
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        Number.isInteger(digit) &&
        digit >= 1 &&
        digit <= visibleSurfaces.length
      ) {
        e.preventDefault();
        setRoute(visibleSurfaces[digit - 1]);
        return;
      }
      if (route === "board") {
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          if (board) handleOpenForm({ columnId: board.columns[0]?.id || "todo" });
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [route, board, boardName, loadBoard, notify, visibleSurfaces]);

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
      spec_id: (data as any).spec_id,
      pinned: false,
      created_at: now, updated_at: now,
    };
    b.cards = [...b.cards, card];
    await doSave(b);
    notify(`Card "${card.title}" added`);
    if ((data as any).auto_run) {
      cardPlanAndRun(id, data.assignee, boardName || undefined)
        .then((res) => {
          if (res && res.error) {
            notify(`Plan and run failed: ${res.error}`);
          } else {
            notify(`Plan proposed and agent dispatched for ${id}`);
          }
        })
        .catch((err) => notify(`Dispatch error: ${err.message || err}`));
    }
  }, [doSave, notify, boardName]);

  const handleUpdateCard = useCallback(async (id: string, data: Partial<Card>) => {
    if (!boardRef.current) return;
    const b = { ...boardRef.current };
    b.cards = b.cards.map((c) =>
      c.id === id ? { ...c, ...data, updated_at: new Date().toISOString() } : c
    );
    await doSave(b);
    if ((data as any).auto_run) {
      cardPlanAndRun(id, data.assignee, boardName || undefined)
        .then((res) => {
          if (res && res.error) {
            notify(`Plan and run failed: ${res.error}`);
          } else {
            notify(`Plan proposed and agent dispatched for ${id}`);
          }
        })
        .catch((err) => notify(`Dispatch error: ${err.message || err}`));
    }
  }, [doSave, notify, boardName]);

  const handleDeleteCard = useCallback(async (id: string) => {
    if (!boardRef.current) return;
    const b = { ...boardRef.current };
    const card = b.cards.find((c) => c.id === id);
    b.cards = b.cards.filter((c) => c.id !== id);
    await doSave(b);
    if (card) {
      notify(`Card "${card.title}" deleted`, {
        label: "Undo",
        onClick: () => {
          import("./lib/api").then(({ undo }) => {
            undo(boardName || undefined).then((r) => {
              if (r.ok) loadBoard(boardName, false);
            });
          });
        },
      });
    }
  }, [doSave, notify, boardName, loadBoard]);

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

  const boardOpen = board ? board.cards.filter((c) => c.column !== "done").length : 0;

  return (
    <div className="h-screen flex bg-bg">
      <AppRail
        surface={route}
        onNavigate={setRoute}
        onCustomize={() => setCustomizeOpen(true)}
        counts={{ chat: 0, board: boardOpen, agents: agentsActive }}
      />

      <div className="flex-1 flex flex-col min-w-0">
      {/* Chat owns the full three-pane workspace; other surfaces keep a slim
          context bar for the board switcher and global actions. */}
      {route !== "chat" && (
      <header className="flex items-center justify-between px-3 h-11 border-b border-border/80 shrink-0 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {boardList.length > 0 && (
            <QuietSelect
              value={boardName || boardList[0] || ""}
              onChange={(e) => switchBoard(e.target.value)}
              title="Switch board"
              className="bg-surface border border-border rounded-md px-2 py-1 max-w-[160px] text-[12px] hover:border-border-strong focus:border-accent"
            >
              {boardList.map((n) => (
                <option key={n} value={n}>{n}.board</option>
              ))}
            </QuietSelect>
          )}
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-[13px] font-medium text-text truncate">{board?.title || "Board"}</h1>
            <span className="text-[10px] text-muted/80 font-mono shrink-0">
              {board?.cards.length || 0}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden sm:flex items-center gap-2 text-[11px] text-muted hover:text-text px-2.5 py-1 rounded-md border border-border hover:border-border-strong transition-colors min-w-[170px]"
            title="Command palette (⌘K)"
          >
            <Icon name="search" size={12} />
            <span className="flex-1 text-left">Search or command…</span>
            <kbd className="text-[9px] font-mono bg-surface border border-border rounded px-1">⌘K</kbd>
          </button>
          {gitInfo && (
            <span className="hidden lg:inline text-[9.5px] text-muted font-mono truncate max-w-[200px]">
              {gitInfo.branch} · {gitInfo.lastCommit}
            </span>
          )}
          <ServerStatus />
          <InstallButton />
          <button
            onClick={() => setCustomizeOpen(true)}
            title="Appearance (⌘,)"
            aria-label="Appearance"
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.05] border border-transparent hover:border-border transition-colors"
          >
            <Icon name="palette" size={15} />
          </button>
        </div>
      </header>
      )}

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 overflow-hidden min-w-0">
          {route === "chat" && (
            <ThreadsShell
              boardName={boardName}
              boards={boardList}
              onSwitchBoard={switchBoard}
              onOpenPalette={() => setPaletteOpen(true)}
              onCustomize={() => setCustomizeOpen(true)}
              seed={composeSeed}
              onOpenCardForm={(card) => handleOpenForm({ card })}
            />
          )}

          {route === "board" && board && (
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
              onPlanCard={handlePlanCard}
              onAskAgent={handleAskAgent}
            />
          )}
          {route === "board" && !board && <SurfaceEmpty label="Loading board…" />}

          {route === "agents" && (
            <AgentsSurface
              boardName={boardName}
              board={board}
              sprints={sprints}
              onSprintChanged={() => fetchSprints(boardName || undefined).then(setSprints)}
              onEditCard={(card) => handleOpenForm({ card })}
            />
          )}

          {route === "brain" && <BrainSurface boardName={boardName} />}

          {route === "skills" && (
            <div className="h-full overflow-y-auto">
              <SkillsView />
            </div>
          )}

          {route === "operations" && (
            <OperationsView
              board={board}
              boardName={boardName}
              sprints={sprints}
              onOpenFile={(path, line) => openFileInEditor(path, line)}
              onEditCard={(card) => handleOpenForm({ card })}
              onAddCard={(date) =>
                board && handleOpenForm({ columnId: board.columns[0]?.id || "todo", dueDate: date })
              }
              onSaveBoard={doSave}
            />
          )}

          {route === "history" && (
            <HistoryView
              boardName={boardName || boardList[0] || null}
              board={board}
              onEditCard={(card) => handleOpenForm({ card })}
            />
          )}
        </main>

        {/* The thread view owns its own card inspector; elsewhere the app
            keeps one persistent "what is alive" rail. */}
        {route !== "chat" && (
          <InspectorRail
            boardName={boardName}
            collapsed={!inspectorOpen}
            onToggle={toggleInspector}
            onNavigate={setRoute}
          />
        )}
      </div>

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
          onCustomize={() => setCustomizeOpen(true)}
        />
      )}
      <CustomizePanel open={customizeOpen} onClose={() => setCustomizeOpen(false)} />

      {/* Toasts */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
          <span className="text-xs text-text">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => { toast.action!.onClick(); setToast(null); }}
              className="text-xs text-accent hover:text-accent/80 font-medium ml-2"
            >
              {toast.action.label}
            </button>
          )}
          <button onClick={() => setToast(null)} className="text-muted hover:text-text ml-1 text-xs">x</button>
        </div>
      )}
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
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      </div>
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
  onPlanCard,
  onAskAgent,
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
  onPlanCard: (card: Card) => void;
  onAskAgent: (card: Card) => void;
}) {
  const [view, setView] = useState<ViewMode>("board");
  const [filter, setFilter] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const toggleChip = (chip: string) =>
    setChips((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  const staleCutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const visible = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    return {
      ...board,
      cards: board.cards.filter((c) => {
        for (const chip of chips) {
          if (chip === "blocked" && !isBlockedCard(c)) return false;
          if (chip === "stale" && !(c.column !== "done" && new Date(c.updated_at).getTime() < staleCutoff)) return false;
          if (chip === "no-spec" && c.spec_id) return false;
          if (chip === "high" && c.priority !== "high") return false;
        }
        if (!q) return true;
        return (
          c.title.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.labels.some((l) => l.toLowerCase().includes(q)) ||
          (c.spec_id || "").toLowerCase().includes(q)
        );
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, filter, chips]);
  const hidden = board.cards.length - visible.cards.length;
  const CHIP_DEFS = [
    { id: "blocked", label: "Blocked", icon: "blocked" as const },
    { id: "stale", label: "Stale", icon: "clock" as const },
    { id: "no-spec", label: "No spec", icon: "link" as const },
    { id: "high", label: "High", icon: "flag" as const },
  ];
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-2 pb-0 shrink-0">
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
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title, id, label, spec…"
          className="flex-1 max-w-xs bg-surface border border-border rounded-md px-2.5 py-1 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent"
        />
        {CHIP_DEFS.map((chip) => {
          const on = chips.includes(chip.id);
          return (
            <button
              key={chip.id}
              onClick={() => toggleChip(chip.id)}
              title={`Quick filter: ${chip.label}`}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full transition-colors ${
                on
                  ? "text-accent bg-accent-soft font-medium"
                  : "text-muted hover:text-text hover:bg-surface"
              }`}
            >
              <Icon name={chip.icon} size={12} />
              {chip.label}
            </button>
          );
        })}
        {hidden > 0 && (
          <span className="text-[10px] text-muted font-mono">{hidden} hidden</span>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        {view === "board" && (
          <BoardView
            board={visible}
            onMoveCard={onMoveCard}
            onTogglePin={onTogglePin}
            onAddCard={onAddCard}
            onAddToColumn={onAddToColumn}
            onEditCard={onEditCard}
            onDeleteCard={onDeleteCard}
            onShowHistory={onShowHistory}
            onShowActivity={onShowActivity}
            onCopyCommitMsg={onCopyCommitMsg}
            onPlanCard={onPlanCard}
            onAskAgent={onAskAgent}
          />
        )}
        {view === "table" && (
          <TableView
            board={visible}
            onEditCard={onEditCard}
            onDeleteCard={onDeleteCard}
            onMoveCard={onMoveCard}
          />
        )}
        {view === "list" && (
          <ListView
            board={visible}
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

function SurfaceEmpty({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center text-[12px] text-muted">{label}</div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { keys: "Cmd/Ctrl + K", desc: "Command palette" },
    { keys: "Cmd/Ctrl + Z", desc: "Undo last change" },
    { keys: "1 – 7", desc: "Jump between surfaces" },
    { keys: "?", desc: "Toggle this help" },
    { keys: "N", desc: "New card (on Board)" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-2xl max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-text text-sm">Keyboard Shortcuts</h3>
          <button onClick={onClose} className="text-muted hover:text-text">x</button>
        </div>
        <div className="p-4 space-y-3">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between">
              <span className="text-xs text-text">{s.desc}</span>
              <kbd className="text-[10px] text-muted bg-surface border border-border rounded px-1.5 py-0.5 font-mono">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
