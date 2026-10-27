import React, { useState, useEffect, useCallback } from "react";
import type { ThreadSummary, ThreadDetail, Card } from "../lib/types";
import { fetchThreads, fetchThread } from "../lib/api";
import { InboxPane } from "./InboxPane";
import { ThreadPane } from "../threads/ThreadPane";
import { InspectorPane } from "./InspectorPane";
import { UniversalComposer } from "./UniversalComposer";

interface ThreadsShellProps {
  boardName: string | null;
  onOpenCardForm?: (card: Card) => void;
  /** A card the user asked about from another surface; opens the composer. */
  seed?: { text: string; nonce: number } | null;
}

export function ThreadsShell({ boardName, seed }: ThreadsShellProps) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ThreadDetail | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitialText, setComposerInitialText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOpenComposer = (text?: string) => {
    setComposerInitialText(text || "");
    setComposerOpen(true);
  };

  // Board cards can hand a prompt to the composer ("Ask agent").
  useEffect(() => {
    if (!seed) return;
    setComposerInitialText(seed.text);
    setComposerOpen(true);
  }, [seed]);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchThreads(boardName || undefined);
      setThreads(list);
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [boardName, selectedId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedId) {
      setActiveThread(null);
      return;
    }
    fetchThread(selectedId, boardName || undefined).then((detail) => {
      setActiveThread(detail);
    });
  }, [selectedId, boardName]);

  // Global keyboard shortcut: Cmd+N opens Universal Composer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setComposerOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleThreadCreated = (newId: string) => {
    loadThreads().then(() => {
      setSelectedId(newId);
    });
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-bg">
      {/* Pane 1: Inbox */}
      <InboxPane
        threads={threads}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        onNew={() => handleOpenComposer()}
        loading={loading}
      />

      {/* Pane 2: Thread Timeline */}
      <ThreadPane
        threadId={selectedId}
        boardName={boardName || undefined}
        onSelectCard={(c) => {
          if (activeThread) {
            setActiveThread({ ...activeThread, card: c });
          }
        }}
        onOpenInspector={() => setInspectorOpen(!inspectorOpen)}
        onRefreshInbox={loadThreads}
        onNewIntent={handleOpenComposer}
      />

      {/* Pane 3: Inspector */}
      {inspectorOpen && (
        <InspectorPane
          card={activeThread?.card}
          events={activeThread?.events || []}
          onClose={() => setInspectorOpen(false)}
        />
      )}

      {/* Universal Composer Modal */}
      <UniversalComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={handleThreadCreated}
        boardName={boardName || undefined}
        initialText={composerInitialText}
      />
    </div>
  );
}
