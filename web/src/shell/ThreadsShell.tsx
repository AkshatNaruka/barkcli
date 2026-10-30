import React, { useEffect, useRef, useState } from "react";
import type { ThreadDetail, Card, ProjectSnapshot } from "../lib/types";
import { navigate, updateRouteState, useRouteState } from "../lib/hashnav";
import { readLocal, writeLocal, storageScope } from "../lib/drafts";
import { ThreadPane } from "../threads/ThreadPane";
import { InspectorPane } from "./InspectorPane";
import { UniversalComposer } from "./UniversalComposer";
import { PaneResizeHandle } from "../components/PaneResizeHandle";
import { ThreadActionsMenu, type ThreadActionTarget } from "./ThreadActionsMenu";
import { SurfacesPanel } from "./SurfacesPanel";
import { openProjectTool, type ProjectTool } from "../lib/commands";
import { PANEL_TO_TAB, TAB_TO_PANEL, type WorkbenchTab } from "../lib/workbench";

interface ThreadsShellProps {
  boardName: string | null;
  projectRoot?: string;
  project?: ProjectSnapshot | null;
  boards?: string[];
  onSwitchBoard?: (name: string) => void;
  onOpenCardForm?: (card: Card) => void;
  onOpenPalette?: () => void;
  onCustomize?: () => void;
  onConsumeSeed?: () => void;
  surfacesOpen: boolean;
  onToggleSurfaces: () => void;
  seed?: { text: string; nonce: number; mode?: "chat" | "plan_first" | "plan_and_run" } | null;
}

export function ThreadsShell({ boardName, projectRoot = "current-project", project, seed, onConsumeSeed, surfacesOpen, onToggleSurfaces }: ThreadsShellProps) {
  const location = useRouteState();
  const selectedId = location.thread || null;
  const scope = storageScope(projectRoot, boardName);
  const [activeThread, setActiveThread] = useState<ThreadDetail | null>(null);
  const [threadRevision, setThreadRevision] = useState(0);
  const [threadMenu, setThreadMenu] = useState<{ target: ThreadActionTarget; x: number; y: number } | null>(null);
  const [width, setWidth] = useState(() => Math.min(560, Math.max(360, Number(readLocal("bark:workbench-width")) || 420)));
  const [available, setAvailable] = useState(() => window.innerWidth - 248);
  const container = useRef<HTMLDivElement>(null);
  const showWorkbench = Boolean(location.panel && selectedId);
  const focused = showWorkbench && available < width + 600;
  const activeTab: WorkbenchTab | undefined = location.panel ? PANEL_TO_TAB[location.panel] : undefined;
  useEffect(() => { setActiveThread(null); }, [selectedId]);
  useEffect(() => {
    const onUpdated = (event: Event) => {
      if ((event as CustomEvent<string>).detail === selectedId) {
        setThreadRevision((revision) => revision + 1);
      }
    };
    window.addEventListener("bark-thread-updated", onUpdated);
    return () => window.removeEventListener("bark-thread-updated", onUpdated);
  }, [selectedId]);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const openPanel = (panel: WorkbenchTab) => updateRouteState({ panel: TAB_TO_PANEL[panel] });
  const selectTool = (tool: ProjectTool) => {
    openProjectTool(tool);
    if (surfacesOpen) onToggleSurfaces();
  };
  useEffect(() => {
    const openThread = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) navigate("chat", { thread: id, board: boardName || undefined });
    };
    window.addEventListener("bark-open-thread", openThread);
    try {
      const queued = window.sessionStorage.getItem("bark:thread");
      if (queued) { window.sessionStorage.removeItem("bark:thread"); navigate("chat", { thread: queued, board: boardName || undefined }); }
    } catch { /* storage is optional */ }
    return () => window.removeEventListener("bark-open-thread", openThread);
  }, [boardName]);
  const created = (id: string) => {
    onConsumeSeed?.(); navigate("chat", { thread: id, board: boardName || undefined });
  };
  return <div ref={container} className={`threads-shell ${focused ? "artifact-focused" : ""}`}>
    <div className="thread-document" hidden={focused}>
      {selectedId ? <ThreadPane key={`${scope}:${selectedId}:${threadRevision}`} threadId={selectedId} boardName={boardName || undefined} scope={scope} project={project}
        inspectorOpen={surfacesOpen} onThreadChange={setActiveThread}
        onOpenInspector={onToggleSurfaces} onReview={() => { if (!surfacesOpen) onToggleSurfaces(); updateRouteState({ panel: "changes" }); }}
        onRefreshInbox={() => window.dispatchEvent(new Event("bark-threads-changed"))}
        onThreadMenu={(target, x, y) => setThreadMenu({ target, x, y })} /> : <UniversalComposer
          key={`${scope}:${seed?.nonce || "new"}`} isOpen inline scope={scope} boardName={boardName || undefined}
          initialText={seed?.text} initialMode={seed?.mode} onClose={() => {}} onCreated={created} />}
    </div>
    {surfacesOpen && <div className={`surfaces-frame ${focused ? "is-focused" : ""}`} style={focused ? undefined : { width: showWorkbench ? width : 320 }}>
      {!focused && showWorkbench && <PaneResizeHandle label="Workbench width" width={width} min={360} max={560} reverse onChange={(next) => { setWidth(next); writeLocal("bark:workbench-width", String(next)); }} />}
      {showWorkbench ? (
        <InspectorPane card={activeThread?.card} events={activeThread?.events || []} threadId={selectedId || undefined}
          onBack={() => updateRouteState({ panel: undefined, file: undefined })}
          onClose={onToggleSurfaces} />
      ) : (
        <SurfacesPanel boardName={boardName || project?.active_board || null} activePanel={activeTab} showThread={Boolean(selectedId)}
          onSelectThread={openPanel} onOpenProjectTool={selectTool}
          onOpenProjectHub={() => { navigate("hub"); if (surfacesOpen) onToggleSurfaces(); }}
          onClose={onToggleSurfaces} />
      )}
    </div>}
    {threadMenu && <ThreadActionsMenu
      target={threadMenu.target}
      boardName={boardName}
      position={{ x: threadMenu.x, y: threadMenu.y }}
      onClose={() => setThreadMenu(null)}
      onChanged={() => {
        window.dispatchEvent(new Event("bark-threads-changed"));
        setThreadRevision((revision) => revision + 1);
      }}
      onForked={(threadId) => {
        window.dispatchEvent(new Event("bark-threads-changed"));
        setThreadMenu(null);
        navigate("chat", { board: boardName || undefined, thread: threadId });
      }}
      onDeleted={() => {
        window.dispatchEvent(new Event("bark-threads-changed"));
        setThreadMenu(null);
        navigate("chat", { board: boardName || undefined, draft: "1" });
      }}
    />}
  </div>;
}
