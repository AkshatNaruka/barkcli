import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { QuietSelect } from "./components/QuietSelect";
import type {
  Board as BoardType,
  Card,
  CardContext,
  HistoryEntry,
  SessionEntry,
  ViewMode,
  Sprint,
  ProjectSnapshot,
} from "./lib/types";
import {
  fetchBoard,
  fetchBoards,
  fetchReviewQueue,
  fetchSprints,
  fetchCardContext,
  fetchHistory,
  fetchSessions,
  fetchProject,
  getCardHistory,
  cardPlanAndRun,
  saveBoard,
  connectWs,
  getGitInfo,
  openFileInEditor,
  onboardProject,
  type GitInfo,
} from "./lib/api";
import { isDesktop, isMac, onMenu, openProjectDialog, openTerminal, revealProject, switchProject } from "./lib/desktop";
import { isDemoMode } from "./lib/demo";
import { useRoute, useRouteState, navigate, updateRouteState, parseRouteState, type Route } from "./lib/hashnav";
import { APP_COMMANDS, commandForKey } from "./lib/commands";
import { ProjectsDashboard } from "./shell/ProjectsDashboard";
import { ProjectHub } from "./shell/ProjectHub";
import { ProjectNavbar } from "./shell/ProjectNavbar";
import { ProjectRequired } from "./shell/ProjectRequired";
import { BoardFilters } from "./components/BoardFilters";
import { Icon } from "./components/Icon";
import { BoardView } from "./components/BoardView";
import { TableView } from "./components/TableView";
import { ListView } from "./components/ListView";
import { SpecsView } from "./components/SpecsView";
import {
  ReviewQueueButton,
  ReviewQueuePanel,
} from "./components/ReviewQueuePanel";
import { CardForm } from "./components/CardForm";
import { CommandPalette } from "./components/CommandPalette";
import { QuickOpen } from "./components/QuickOpen";
import { CommandRunner } from "./components/CommandRunner";
import { ServerStatus } from "./components/ServerStatus";
import { GlobalStatusBar } from "./components/GlobalStatusBar";
const HistoryView = lazy(() => import("./components/HistoryView").then((m) => ({ default: m.HistoryView })));
const SkillsView = lazy(() => import("./components/SkillsView").then((m) => ({ default: m.SkillsView })));
import { ThreadsShell } from "./shell/ThreadsShell";
import { AccessibleDialog } from "./components/AccessibleDialog";
const ReviewSurface = lazy(() => import("./shell/ReviewSurface").then((module) => ({ default: module.ReviewSurface })));
import { InspectorRail } from "./shell/InspectorRail";
const OperationsView = lazy(() => import("./shell/OperationsView").then((m) => ({ default: m.OperationsView })));
import { BrainSurface } from "./shell/BrainSurface";
import { AgentsSurface } from "./shell/AgentsSurface";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CustomizePanel } from "./shell/CustomizePanel";
import { GlobalSettingsModal } from "./components/GlobalSettingsModal";
import { GlobalUsageModal } from "./components/GlobalUsageModal";
import { GlobalDocsModal } from "./components/GlobalDocsModal";
import { useTheme } from "./lib/theme";
import { SURFACES } from "./lib/surfaces";
import { AppRail } from "./shell/AppRail";

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

function DemoBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("bark:dismiss-demo-banner") === "1";
    } catch {
      return false;
    }
  });

  if (!isDemoMode() || dismissed) return null;

  return (
    <div role="status" className="demo-banner">
      <div className="demo-banner-copy">
        <span className="demo-banner-tag">STATIC DEMO</span>
        <p>
          This web preview is an interactive overview with simulated data. To run real agents in isolated worktrees with acceptance test gates, run the real app via CLI:
          <code>curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh</code>
        </p>
      </div>
      <div className="demo-banner-actions">
        <a
          href="https://github.com/AkshatNaruka/barkcli"
          target="_blank"
          rel="noreferrer"
        >
          Try Real App
        </a>
        <button
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem("bark:dismiss-demo-banner", "1");
            } catch {}
          }}
          className="demo-banner-dismiss"
          title="Dismiss demo banner"
          aria-label="Dismiss demo banner"
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}

function CardHistoryModal({ cardId, entries, onClose }: { cardId: string; entries: any[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-2xl max-w-md w-full mx-4 max-h-[400px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-text font-mono text-sm">History: {cardId}</h3>
          <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close"><Icon name="x" size={14} /></button>
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
          <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close"><Icon name="x" size={14} /></button>
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
  const location = useRouteState();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectSnapshot | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const projectReady = !projectLoading && Boolean(projectInfo?.root);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [commandRunnerOpen, setCommandRunnerOpen] = useState(false);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [reviewCount, setReviewCount] = useState<number>(0);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<{
    text: string;
    nonce: number;
    mode?: "chat" | "plan_first" | "plan_and_run";
  } | null>(null);
  const { railOrder, hidden } = useTheme();
  const visibleSurfaces = useMemo(
    () => railOrder.filter((id) => !hidden.includes(id)),
    [railOrder, hidden]
  );
  const [form, setForm] = useState<{ card?: Card; columnId?: string; dueDate?: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; action?: { label: string; onClick: () => void } } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() => {
    const initial = parseRouteState(window.location.hash);
    return initial.route === "chat" && Boolean(initial.panel);
  });
  const toggleInspector = useCallback(() => {
    setInspectorOpen((open) => {
      const next = !open;
      if (!next && parseRouteState(window.location.hash).panel) {
        updateRouteState({ panel: undefined, file: undefined });
      }
      return next;
    });
  }, []);
  useEffect(() => {
    if (route !== "chat") {
      setInspectorOpen(false);
      return;
    }
    if (location.panel) {
      setInspectorOpen(true);
    }
  }, [route, location.panel]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const boardRef = useRef(board);
  boardRef.current = board;

  // Window title follows the active surface.
  useEffect(() => {
    const label = SURFACES.find((s) => s.id === route)?.label.toLowerCase() ?? route;
    document.title = `barkcli · ${label}`;
  }, [route]);

  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [historyCard, setHistoryCard] = useState<{ id: string; entries: any[] } | null>(null);
  const [activityCard, setActivityCard] = useState<{ id: string; history: HistoryEntry[]; sessions: SessionEntry[] } | null>(null);
  const [cardContexts, setCardContexts] = useState<Record<string, CardContext | null>>({});
  const [boardList, setBoardList] = useState<string[]>([]);
  const [boardName, setBoardName] = useState<string | null>(() => parseRouteState(window.location.hash).board || null);
  useEffect(() => { if (location.board) setBoardName(location.board); }, [location.board]);
  useEffect(() => { if (composeSeed) navigate("chat", { board: boardName || undefined, draft: "1" }); }, [composeSeed?.nonce]);
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
    fetchReviewQueue(boardName || undefined)
      .then(({ items }) => setReviewCount(items.length))
      .catch(() => {});
    const cleanWs = connectWs((version) => {
      if (seenReloadVersionsRef.current.has(version)) return;
      seenReloadVersionsRef.current.add(version);
      if (skipReloadRef.current) return; // our own debounced save
      loadBoard(boardName, false);
      fetchReviewQueue(boardName || undefined)
        .then(({ items }) => setReviewCount(items.length))
        .catch(() => {});
    });
    return cleanWs;
  }, [boardName, loadBoard]);

  // Opening a folder is setup, not a checklist the user has to remember. The
  // server runs the deterministic, idempotent steps; no AI writes cards here.
  const onboardedRef = useRef(false);
  useEffect(() => {
    if (!isDesktop() || onboardedRef.current) return;
    onboardedRef.current = true;
    onboardProject().then((result) => {
      if (!result) return;
      fetchBoards().then((list) => {
        setBoardList(list);
        if (!boardNameRef.current && list[0]) setBoardName(list[0]);
        else void loadBoard(boardNameRef.current, false);
      }).catch(() => {});
    }).catch(() => {});
  }, [loadBoard]);

  useEffect(() => {
    getGitInfo().then(setGitInfo).catch(() => {});
  }, []);
  useEffect(() => {
    setProjectLoading(true);
    fetchProject()
      .then((project) => {
        setProjectName(project?.name || null);
        setProjectInfo(project);
        setProjectRoot(project?.root || null);
      })
      .catch(() => {
        setProjectName(null);
        setProjectInfo(null);
        setProjectRoot(null);
      })
      .finally(() => setProjectLoading(false));
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

  // Desktop commands can fail (TCC, missing app, bad path). Do not swallow
  // that: tell the user which action failed and keep the app usable.
  useEffect(() => {
    const onDesktopError = (event: Event) => {
      const detail = (event as CustomEvent<{ command: string; message: string }>).detail;
      if (!detail) return;
      notify(`Desktop action failed: ${detail.command.replace(/_/g, " ")}. ${detail.message}`);
    };
    window.addEventListener("bark-desktop-error", onDesktopError);
    return () => window.removeEventListener("bark-desktop-error", onDesktopError);
  }, [notify]);

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

  const handleOpenProject = useCallback(async () => {
    if (!isDesktop()) {
      notify("Open a folder from the Bark desktop app, or run `barkcli serve` in another project.");
      return;
    }
    const project = await openProjectDialog();
    if (!project) return;
    const opened = await switchProject(project.path);
    if (!opened) {
      notify("Could not open that project. Choose a folder with a .board/ or .git/ directory — the current project is still open.");
    }
  }, [notify]);

  const openOperationsTab = useCallback((tab: string) => {
    try {
      window.sessionStorage.setItem("bark:ops-tab", tab);
    } catch {
      /* storage is optional */
    }
    window.dispatchEvent(new CustomEvent("bark-operations-tab", { detail: tab }));
    navigate("operations", { tool: tab });
  }, []);

  const handleAskFile = useCallback(
    (path: string) => {
      setComposeSeed({ text: `@${path} `, nonce: Date.now(), mode: "chat" });
      setRoute("chat");
    },
    [setRoute]
  );

  const executeCommand = useCallback((id: string) => {
    switch (id) {
      case "open-project": void handleOpenProject(); break;
      case "new-chat": setComposeSeed({ text: "", nonce: Date.now(), mode: "chat" }); navigate("chat", { draft: "1" }); break;
      case "new-intent": setComposeSeed({ text: "", nonce: Date.now() }); navigate("chat", { draft: "1" }); break;
      case "quick-open": setQuickOpenOpen(true); break;
      case "command-runner": setCommandRunnerOpen(true); break;
      case "command-palette": setPaletteOpen((open) => !open); break;
      case "open-terminal":
        void openTerminal().then((opened) => { if (!opened && isDesktop()) notify("Could not open Terminal for this project."); });
        break;
      case "reveal-project":
        void revealProject().then((opened) => { if (!opened && isDesktop()) notify("Could not reveal this project in Finder."); });
        break;
      case "toggle-terminal-drawer":
        window.dispatchEvent(new CustomEvent("bark-toggle-terminal-drawer"));
        break;
      case "toggle-workbench":
        if (route !== "chat") notify("Surfaces are available on a thread. Open Build to use them.");
        else toggleInspector();
        break;
      case "toggle-sidebar":
        if (window.innerWidth < 900) setSidebarOpen((open) => !open);
        else setListCollapsed((collapsed) => !collapsed);
        break;
      case "settings": setSettingsOpen(true); break;
      case "usage": setUsageOpen(true); break;
      case "docs": setDocsOpen(true); break;
      case "projects": navigate("projects"); break;
      case "appearance": setCustomizeOpen(true); break;
      case "customize-sidebar": setCustomizeOpen(true); break;
      case "help": setHelpOpen(true); break;
    }
  }, [handleOpenProject, notify, openOperationsTab, route, toggleInspector]);

  // The app opens on Chat/Threads by default like T3 Code.
  useEffect(() => {
    if (!window.location.hash) navigate("chat");
  }, []);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void onMenu(executeCommand).then((unlisten) => { if (disposed) unlisten(); else cleanup = unlisten; });
    const command = (event: Event) => executeCommand((event as CustomEvent<string>).detail);
    window.addEventListener("bark-command", command);
    return () => { disposed = true; cleanup?.(); window.removeEventListener("bark-command", command); };
  }, [executeCommand]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore unmodified shortcuts while typing, but keep global ⌘ commands
      // available (⌘K, ⌘P, ⌘⇧R, ⌘O, ⌘,).
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement).isContentEditable;
      if (e.isComposing) return;
      if ((e.metaKey || e.ctrlKey) && ["1", "2"].includes(e.key)) { e.preventDefault(); navigate(e.key === "1" ? "chat" : "review"); return; }
      if (typing && !(e.metaKey || e.ctrlKey)) return;
      if (typing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        return; // let the focused field undo its own text
      }

      const command = commandForKey(e);
      if (command) { e.preventDefault(); executeCommand(command); return; }
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
       if (e.key === "/" && !typing) {
         const composer = document.querySelector<HTMLTextAreaElement>('[data-testid="thread-composer"]');
         if (composer) {
           e.preventDefault();
           composer.focus();
         }
       }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [route, board, boardName, loadBoard, notify, visibleSurfaces, executeCommand]);

  const switchBoard = useCallback((name: string) => {
    if (name === boardName) return;
    setBoardName(name);
    updateRouteState({ board: name, thread: undefined, run: undefined, panel: undefined, file: undefined });
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

  if (error && !board && route !== "projects") {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="text-danger bg-danger-soft p-6 rounded-lg max-w-md text-center">
          <h2 className="font-bold text-lg mb-2">Error</h2>
          <p>{error}</p><button className="bark-button mt-4" onClick={() => { updateRouteState({ board: undefined, thread: undefined, run: undefined, panel: undefined }); setBoardName(null); void loadBoard(null, true); }}>Open default board</button><button className="bark-button mt-4 ml-2" onClick={() => void loadBoard(boardName, true)}>Retry</button>
        </div>
      </div>
    );
  }

  if (loading && route !== "projects") {
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
    <div className={`${isDesktop() && isMac() ? "bark-desktop-shell" : "h-screen"} flex bg-bg`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <AppRail
        surface={route}
        onNavigate={(next) => { setSidebarOpen(false); navigate(next, { board: boardName || undefined }); }}
        onCustomize={() => setCustomizeOpen(true)}
        counts={{ chat: 0, board: boardOpen, agents: projectInfo?.counts.agents || 0, review: reviewCount }}
        projectName={projectName}
        projectRoot={projectInfo?.root || projectRoot || ""}
        projectReady={projectReady}
        onAllProjects={() => { setSidebarOpen(false); navigate("projects"); }}
        onOpenProject={() => void handleOpenProject()}
        onCommand={executeCommand}
        onNew={() => executeCommand("new-intent")}
      />
      <div id="workspace-main" className="flex-1 flex flex-col min-w-0">
        <DemoBanner />
        {route !== "projects" && (projectReady || projectInfo?.root || projectRoot) && (
          <ProjectNavbar
            projectName={projectName || projectInfo?.name || null}
            projectRoot={projectInfo?.root || projectRoot || ""}
            boardName={boardName || boardList[0] || null}
            project={projectInfo}
            currentRoute={route}
            cardsCount={board?.cards?.length || 0}
            agentsCount={projectInfo?.counts.agents || 0}
            onOpenProject={() => void handleOpenProject()}
            onNewThread={() => {
              setComposeSeed({ text: "", nonce: Date.now() });
              navigate("chat", { board: boardName || undefined });
            }}
          />
        )}
      <div className="flex-1 flex min-h-0">
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-hidden min-w-0">
          <ErrorBoundary>
          {route === "projects" && (
            <ProjectsDashboard
              currentRoot={projectInfo?.root}
              currentName={projectName || projectInfo?.name}
              currentBoard={board}
              currentBoardName={boardName}
              currentBoards={boardList}
              currentAgents={projectInfo?.counts.agents}
              onOpenFolder={() => void handleOpenProject()}
              onNotify={notify}
            />
          )}
          {route === "chat" && projectReady && (
            <ThreadsShell
              boardName={boardName}
              projectRoot={projectInfo?.root || ""}
              project={projectInfo}
              onConsumeSeed={() => setComposeSeed(null)}
              boards={boardList}
              onSwitchBoard={switchBoard}
              onOpenPalette={() => setPaletteOpen(true)}
              onCustomize={() => setCustomizeOpen(true)}
              seed={composeSeed}
              onOpenCardForm={(card) => handleOpenForm({ card })}
              surfacesOpen={inspectorOpen}
              onToggleSurfaces={toggleInspector}
              listOpen={sidebarOpen}
              onCloseList={() => setSidebarOpen(false)}
              listCollapsed={listCollapsed}
            />
          )}

          {route === "chat" && projectLoading && <div className="surface-loading" role="status">Opening project…</div>}
          {route === "chat" && !projectLoading && !projectReady && <ProjectRequired onOpen={() => void handleOpenProject()} />}
          {route === "hub" && (
            <ProjectHub
              projectName={projectName || projectInfo?.name || null}
              projectRoot={projectInfo?.root || projectRoot}
              boardName={boardName || boardList[0] || null}
              project={projectInfo}
              board={board}
              boards={boardList}
              hideHeader={true}
              onSwitchBoard={switchBoard}
              onOpenProject={() => void handleOpenProject()}
              onNewThread={() => {
                setComposeSeed({ text: "", nonce: Date.now() });
                navigate("chat", { board: boardName || undefined });
              }}
            />
          )}

          {route === "board" && board && (
            <BoardPage
              board={board}
              boardName={boardName}
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

          {route === "review" && (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-[12px] text-muted">Loading review…</div>}>
              <ReviewSurface boardName={boardName || boardList[0] || null} />
            </Suspense>
          )}

          {route === "agents" && (
            <AgentsSurface
              boardName={boardName}
              projectName={projectName || projectInfo?.name || null}
              projectRoot={projectInfo?.root || projectRoot || ""}
              board={board}
              sprints={sprints}
              onSprintChanged={() => fetchSprints(boardName || undefined).then(setSprints)}
              onEditCard={(card) => handleOpenForm({ card })}
            />
          )}

          {route === "brain" && <BrainSurface boardName={boardName} />}

          {route === "skills" && (
            <div className="h-full overflow-y-auto">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-[12px] text-muted">Loading skills…</div>}>
                <SkillsView />
              </Suspense>
            </div>
          )}

          {route === "operations" && (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-[12px] text-muted">Loading operations…</div>}>
            <OperationsView
              board={board}
              boardName={boardName}
              projectName={projectName || projectInfo?.name || null}
              projectRoot={projectInfo?.root || projectRoot || ""}
              sprints={sprints}
              onOpenFile={(path, line) => openFileInEditor(path, line)}
              onEditCard={(card) => handleOpenForm({ card })}
              onAddCard={(date) =>
                board && handleOpenForm({ columnId: board.columns[0]?.id || "todo", dueDate: date })
              }
              onSaveBoard={doSave}
              onNewIntent={() => {
                setComposeSeed({ text: "", nonce: Date.now() });
                setRoute("chat");
              }}
              onOpenBoard={() => setRoute("board")}
              onOpenBrain={() => setRoute("brain")}
            />
            </Suspense>
          )}

          {route === "history" && (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-[12px] text-muted">Loading history…</div>}>
            <HistoryView
              boardName={boardName || boardList[0] || null}
              board={board}
              onEditCard={(card) => handleOpenForm({ card })}
            />
            </Suspense>
          )}
          </ErrorBoundary>
        </main>
      </div>
      <GlobalStatusBar project={projectInfo} boardName={boardName} />

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
      {paletteOpen && (
        <CommandPalette
          board={board}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(colId, cardId) => { setRoute("board"); }}
          onAddCard={(colId) => { setForm({ columnId: colId }); setPaletteOpen(false); }}
          onEditCard={(card) => { setForm({ card }); setPaletteOpen(false); }}
          onCustomize={() => setCustomizeOpen(true)}
          onCommand={executeCommand}
          onQuickOpen={() => { setPaletteOpen(false); setQuickOpenOpen(true); }}
          onCommandRunner={() => { setPaletteOpen(false); setCommandRunnerOpen(true); }}
          onOpenProject={() => { setPaletteOpen(false); void handleOpenProject(); }}
        />
      )}
      <QuickOpen
        open={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
        onAskBark={handleAskFile}
      />
      <CommandRunner
        open={commandRunnerOpen}
        onClose={() => setCommandRunnerOpen(false)}
      />
      <CustomizePanel open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
      <GlobalSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        board={board}
        onSaveBoard={doSave}
      />
      <GlobalUsageModal
        open={usageOpen}
        onClose={() => setUsageOpen(false)}
      />
      <GlobalDocsModal
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
      />

      {/* Toasts */}
      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
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
  boardName,
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
  boardName?: string | null;
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
  const [queueOpen, setQueueOpen] = useState(false);
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
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-2 pb-0 shrink-0">
        <div className="flex bg-surface rounded-md p-0.5">
          {(["board", "table", "list", "specs"] as ViewMode[]).map((v) => (
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
        <ReviewQueueButton boardName={boardName} onOpen={() => setQueueOpen(true)} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter cards…"
          aria-label="Filter cards"
          className="min-w-0 flex-1 max-w-xs bg-surface border border-border rounded-md px-2.5 py-1 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent"
        />
        <BoardFilters chips={chips} onToggle={toggleChip} onClear={() => setChips([])} hidden={hidden} />
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
        {view === "specs" && (
          <div className="h-full overflow-y-auto p-4 bg-bg">
            <SpecsView boardName={boardName ?? null} />
          </div>
        )}
      </div>
      <ReviewQueuePanel
        open={queueOpen}
        boardName={boardName}
        onClose={() => setQueueOpen(false)}
        onSelectCard={(cardId) => {
          const card = board.cards.find((candidate) => candidate.id === cardId);
          if (card) onEditCard(card);
          setQueueOpen(false);
        }}
      />
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
  return <AccessibleDialog label="Bark help" onClose={onClose}>
    <div className="flex items-center justify-between mb-4"><h2 className="font-medium">Bark help</h2><button className="bark-icon-button" onClick={onClose} aria-label="Close help"><Icon name="x" size={15} /></button></div>
    <div className="help-loop">
      <h3>How Bark works</h3>
      <ol>
        <li><strong>Describe the outcome.</strong> Bark proposes a plan before it builds.</li>
        <li><strong>Build in isolation.</strong> The agent works in its own worktree, not your checkout.</li>
        <li><strong>Checks are the gate.</strong> A change only merges when the project checks pass.</li>
        <li><strong>Review the evidence.</strong> Inspect the diff, plan, and checks, then merge.</li>
      </ol>
      <p>Bark is local-first. Your code and agent sessions stay on this machine.</p>
    </div>
    <h3 className="help-shortcuts-title">Keyboard shortcuts</h3>
    <div className="space-y-3">{APP_COMMANDS.filter((command) => command.shortcut).map((command) => <div className="flex justify-between gap-5 text-sm" key={command.id}><span>{command.label}</span><kbd className="text-muted text-xs whitespace-nowrap">⌘{command.modifiers?.includes("shift") ? "⇧" : ""}{command.shortcut!.toUpperCase()}</kbd></div>)}<div className="flex justify-between gap-5 text-sm"><span>Submit prompt</span><kbd className="text-muted text-xs">⌘Return</kbd></div><div className="flex justify-between gap-5 text-sm"><span>Build / Review</span><kbd className="text-muted text-xs">⌘1 / ⌘2</kbd></div></div>
  </AccessibleDialog>;
}
