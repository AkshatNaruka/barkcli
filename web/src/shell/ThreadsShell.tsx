import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadSummary, ThreadDetail, Card } from "../lib/types";
import { fetchThreads, fetchThread } from "../lib/api";
import { InboxPane } from "./InboxPane";
import { ThreadPane } from "../threads/ThreadPane";
import { InspectorPane } from "./InspectorPane";
import { UniversalComposer } from "./UniversalComposer";

interface ThreadsShellProps {
  boardName: string | null;
  boards?: string[];
  onSwitchBoard?: (name: string) => void;
  onOpenCardForm?: (card: Card) => void;
  onOpenPalette?: () => void;
  onCustomize?: () => void;
  /** A card the user asked about from another surface; opens the composer. */
  seed?: {
    text: string;
    nonce: number;
    mode?: "chat" | "plan_first" | "plan_and_run";
  } | null;
}

const WORKBENCH_KEY = "barkcli:chat-workbench";

export function ThreadsShell({
  boardName,
  boards = [],
  onSwitchBoard,
  seed,
  onOpenPalette,
  onCustomize,
}: ThreadsShellProps) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ThreadDetail | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(WORKBENCH_KEY);
    if (saved != null) return saved === "1";
    return window.innerWidth >= 1240;
  });
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitialText, setComposerInitialText] = useState("");
  const [composerMode, setComposerMode] = useState<
    "chat" | "plan_first" | "plan_and_run"
  >("plan_first");
  const [loading, setLoading] = useState(false);
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(max-width: 1180px)").matches;
  });
  const loadedBoard = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 1180px)");
    const onChange = () => setNarrow(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const handleOpenComposer = useCallback(
    (text?: string, mode: "chat" | "plan_first" | "plan_and_run" = "plan_first") => {
      setComposerInitialText(text || "");
      setComposerMode(mode);
      setComposerOpen(true);
    },
    []
  );

  useEffect(() => {
    if (!seed) return;
    setComposerInitialText(seed.text);
    setComposerMode(seed.mode || "plan_first");
    setComposerOpen(true);
  }, [seed]);

  useEffect(() => {
    window.localStorage.setItem(WORKBENCH_KEY, inspectorOpen ? "1" : "0");
  }, [inspectorOpen]);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchThreads(boardName || undefined);
      setThreads(list);
      setSelectedId((current) => {
        if (current && list.some((thread) => thread.id === current)) return current;
        return list[0]?.id || null;
      });
    } finally {
      setLoading(false);
    }
  }, [boardName]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // A board switch is a new navigator, not a stale selection.
  useEffect(() => {
    if (loadedBoard.current === boardName) return;
    loadedBoard.current = boardName;
    setSelectedId(null);
    setActiveThread(null);
  }, [boardName]);

  useEffect(() => {
    if (!selectedId) {
      setActiveThread(null);
      return;
    }
    let cancelled = false;
    fetchThread(selectedId, boardName || undefined).then((detail) => {
      if (!cancelled) setActiveThread(detail);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, boardName]);

  const handleSelectCard = useCallback((card: Card) => {
    setActiveThread((current) => (current ? { ...current, card } : current));
  }, []);

  // Keyboard: new intent, workbench toggle. The global shell owns the rest.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setComposerOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setInspectorOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const toggle = () => setInspectorOpen((open) => !open);
    window.addEventListener("bark-toggle-workbench", toggle);
    return () => window.removeEventListener("bark-toggle-workbench", toggle);
  }, []);

  const handleThreadCreated = (newId: string) => {
    setSelectedId(newId);
    loadThreads();
  };

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-bg">
      <InboxPane
        threads={threads}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNew={() => handleOpenComposer()}
        onNewChat={() => handleOpenComposer(undefined, "chat")}
        loading={loading}
        boardName={boardName}
        boards={boards}
        onSwitchBoard={onSwitchBoard}
        onOpenPalette={onOpenPalette}
        onCustomize={onCustomize}
      />

      <ThreadPane
        threadId={selectedId}
        boardName={boardName || undefined}
        inspectorOpen={inspectorOpen}
        onSelectCard={handleSelectCard}
        onOpenInspector={() => setInspectorOpen((open) => !open)}
        onReview={() => setInspectorOpen(true)}
        onRefreshInbox={loadThreads}
        onNewIntent={handleOpenComposer}
      />

      {inspectorOpen && narrow && (
        <>
          <button
            type="button"
            aria-label="Close workbench"
            onClick={() => setInspectorOpen(false)}
            className="fixed inset-0 z-30 bg-black/45"
          />
          <div className="fixed inset-y-0 right-0 z-40 flex shadow-2xl">
            <InspectorPane
              card={activeThread?.card}
              events={activeThread?.events || []}
              threadId={selectedId || undefined}
              onClose={() => setInspectorOpen(false)}
            />
          </div>
        </>
      )}

      {inspectorOpen && !narrow && (
        <InspectorPane
          card={activeThread?.card}
          events={activeThread?.events || []}
          threadId={selectedId || undefined}
          onClose={() => setInspectorOpen(false)}
        />
      )}

      <UniversalComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={handleThreadCreated}
        boardName={boardName || undefined}
        initialText={composerInitialText}
        initialMode={composerMode}
      />
    </div>
  );
}
