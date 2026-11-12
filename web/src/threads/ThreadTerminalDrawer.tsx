import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { runProjectCommand } from "../lib/api";
import { openTerminal, isDesktop } from "../lib/desktop";
import { loadTerminalSettings } from "../lib/appSettings";
import type { ProjectSnapshot } from "../lib/types";

interface TerminalEntry {
  id: string;
  command: string;
  output?: string;
  exitCode?: number;
  running?: boolean;
}

interface ThreadTerminalDrawerProps {
  project?: ProjectSnapshot | null;
  onClose?: () => void;
}

export function ThreadTerminalDrawer({ project, onClose }: ThreadTerminalDrawerProps) {
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isSplit, setIsSplit] = useState(false);
  // Settings → Terminal → Typography applies to this drawer (and to any other
  // console surface that reads the same cache), not just the preview swatch.
  const [terminalPrefs] = useState(loadTerminalSettings);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const caretClass =
    terminalPrefs.cursorStyle === "bar"
      ? "inline-block w-px h-3.5 bg-white -ml-0.5 pointer-events-none animate-pulse"
      : terminalPrefs.cursorStyle === "underline"
        ? "inline-block w-2 h-px bg-white -ml-0.5 mb-0.5 pointer-events-none animate-pulse"
        : "inline-block w-2 h-3.5 bg-white -ml-0.5 pointer-events-none animate-pulse";

  const hostname =
    (project as any)?.host ||
    (typeof window !== "undefined" &&
    window.location.hostname !== "127.0.0.1" &&
    window.location.hostname !== "localhost"
      ? window.location.hostname
      : "SE1HQ4D9X4NX9");

  const projectName = project?.name || "barkcli";
  const username = "akshatnaruka";
  const promptLabel = `${username}@${hostname} ${projectName} %`;

  useEffect(() => {
    // Focus terminal input when mounted
    setTimeout(() => inputRef.current?.focus(), 40);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return;

    if (trimmed === "clear") {
      setEntries([]);
      setCommand("");
      setHistoryIndex(-1);
      return;
    }

    const nextId = `term-${Date.now()}`;
    const nextEntry: TerminalEntry = {
      id: nextId,
      command: trimmed,
      running: true,
    };

    setEntries((prev) => [...prev, nextEntry]);
    setHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)]);
    setHistoryIndex(-1);
    setCommand("");

    try {
      const res = await runProjectCommand(trimmed);
      setEntries((prev) =>
        prev.map((item) =>
          item.id === nextId
            ? {
                ...item,
                running: false,
                output: res ? `${res.stdout || ""}${res.stderr ? (res.stdout ? "\n" : "") + res.stderr : ""}`.trim() : "Command completed",
                exitCode: res?.exit_code ?? 0,
              }
            : item
        )
      );
    } catch (err) {
      setEntries((prev) =>
        prev.map((item) =>
          item.id === nextId
            ? {
                ...item,
                running: false,
                output: String(err),
                exitCode: 1,
              }
            : item
        )
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(nextIdx);
      setCommand(history[nextIdx] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setCommand("");
      } else {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCommand(history[nextIdx] || "");
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      setEntries([]);
    } else if (e.ctrlKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      setCommand("");
      setHistoryIndex(-1);
    }
  };

  const handleExternalTerminal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDesktop()) {
      await openTerminal(project?.root);
    } else {
      window.dispatchEvent(new CustomEvent("bark-command", { detail: "open-terminal" }));
    }
  };

  return (
    <div
      className="thread-terminal-drawer relative flex flex-col border-t border-border/70 bg-[#0c0c0e] font-mono text-[12px] text-text select-text"
      style={{
        height: "190px",
        fontFamily: `"${terminalPrefs.fontFamily}", ui-monospace, monospace`,
        fontSize: `${terminalPrefs.fontSize}px`,
        lineHeight: terminalPrefs.lineHeight,
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Top right toolbar matching Screenshot 2 */}
      <div className="absolute right-3 top-2 z-10 flex items-center gap-1 rounded-md bg-[#18181b]/90 p-0.5 shadow-sm border border-border/50 backdrop-blur-sm select-none">
        {/* Split [||] */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsSplit((prev) => !prev);
          }}
          title={isSplit ? "Single pane" : "Split terminal (||)"}
          className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
            isSplit ? "bg-white/10 text-text" : "text-muted hover:bg-white/[0.06] hover:text-text"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
            <path d="M8 2.5v11" />
          </svg>
        </button>

        {/* External terminal [⎘] */}
        <button
          type="button"
          onClick={handleExternalTerminal}
          title="Open external macOS Terminal"
          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.06] hover:text-text transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
            <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
          </svg>
        </button>

        {/* New tab [+] */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEntries([]);
            setCommand("");
            setTimeout(() => inputRef.current?.focus(), 20);
          }}
          title="New terminal session (+)"
          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.06] hover:text-text transition-colors"
        >
          <Icon name="plus" size={12} />
        </button>

        {/* Trash [🗑] */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEntries([]);
            setTimeout(() => inputRef.current?.focus(), 20);
          }}
          title="Clear terminal output (Ctrl+L)"
          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-white/[0.06] hover:text-danger transition-colors"
        >
          <Icon name="trash" size={12} />
        </button>
      </div>

      {/* Terminal content area */}
      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5 ${
          isSplit ? "grid grid-cols-2 gap-4 space-y-0" : ""
        }`}
      >
        <div className="space-y-1.5 min-w-0">
          {entries.map((item) => (
            <div key={item.id} className="space-y-0.5">
              <div className="flex items-center gap-1.5 leading-snug">
                <span className="shrink-0 text-muted-strong font-medium">{promptLabel}</span>
                <span className="text-text font-semibold">{item.command}</span>
              </div>
              {item.running ? (
                <div className="text-muted animate-pulse opacity-80">Running…</div>
              ) : item.output ? (
                <pre
                  className={`whitespace-pre-wrap break-words font-mono leading-relaxed pl-1 ${
                    item.exitCode !== 0 ? "text-rose-400" : "text-zinc-300"
                  }`}
                >
                  {item.output}
                </pre>
              ) : null}
            </div>
          ))}

          {/* Interactive prompt row matching Screenshot 2 */}
          <form onSubmit={handleSubmit} className="flex items-center gap-1.5 leading-snug">
            <span className="shrink-0 text-text/90 font-medium">{promptLabel}</span>
            <div className="relative flex-1 flex items-center min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Terminal command input"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                className="w-full border-0 bg-transparent p-0 font-mono text-text caret-white outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0"
              />
              {!command && (
                <span className={caretClass} />
              )}
            </div>
          </form>
        </div>

        {isSplit && (
          <div className="border-l border-border/40 pl-3 space-y-1.5 min-w-0 text-muted">
            <div className="text-muted-strong font-medium">Mirror (read-only)</div>
            {entries.length === 0 ? (
              <p className="opacity-70">Run a command to mirror its output here.</p>
            ) : (
              entries.map((item) => (
                <div key={`mirror-${item.id}`} className="space-y-0.5">
                  <div className="flex items-center gap-1.5 leading-snug">
                    <span className="shrink-0 text-muted-strong font-medium">{promptLabel}</span>
                    <span className="text-text/80 font-semibold">{item.command}</span>
                  </div>
                  {item.output ? (
                    <pre className="whitespace-pre-wrap break-words font-mono leading-relaxed pl-1 opacity-80">
                      {item.output}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
