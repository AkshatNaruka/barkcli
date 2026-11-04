import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { openInEditor } from "../lib/api";
import type { ThreadEvent } from "../lib/types";

export interface StepItem {
  id: string;
  kind: "search" | "find" | "analyze" | "command" | "inspect" | "edit" | "gate" | "generic";
  query?: string;
  scope?: string;
  file?: string;
  ext?: string;
  lineRange?: string;
  lineStart?: number;
  command?: string;
  text: string;
}

interface StepExplorerProps {
  running?: boolean;
  events?: ThreadEvent[];
  intent?: string;
  activeTurnId?: string | null;
  onOpenFile?: (path: string, line?: number) => void;
}

export function parseStepEvent(event: ThreadEvent): StepItem {
  const data = event.data || {};
  const rawText = event.text || "";
  const name = (data.name || event.kind || "").toLowerCase();
  const input = data.input || {};

  // Check if it's a file analysis or read
  const filePath = input.path || input.file || (typeof data.path === "string" ? data.path : null);
  const lineStart = input.line_start || input.start_line || input.line;
  const lineEnd = input.line_end || input.end_line;
  const lineRange = lineStart && lineEnd ? `#L${lineStart}-${lineEnd}` : lineStart ? `#L${lineStart}` : "";

  // 1. Explicit file read or analyze
  if (
    filePath ||
    name.includes("read") ||
    name.includes("inspect_file") ||
    rawText.toLowerCase().startsWith("analyzed")
  ) {
    const cleanPath = filePath || rawText.replace(/^analyzed\s+/i, "").split(/\s+/)[0] || "file";
    const ext = cleanPath.split(".").pop()?.toLowerCase() || "";
    return {
      id: event.id,
      kind: "analyze",
      file: cleanPath,
      ext,
      lineRange: lineRange || (rawText.match(/#L\d+(?:-\d+)?/)?.[0] ?? ""),
      lineStart: lineStart ? Number(lineStart) : undefined,
      text: rawText || `Analyzed ${cleanPath} ${lineRange}`,
    };
  }

  // 2. Search / grep in codebase
  if (name.includes("search") || rawText.toLowerCase().startsWith("ran search")) {
    const query = input.query || input.pattern || rawText.replace(/^ran search\s+/i, "").split(" in ")[0] || "query";
    const scope = input.scope || input.target || (rawText.includes(" in ") ? rawText.split(" in ")[1]?.replace(/›$/, "").trim() : "codebase");
    return {
      id: event.id,
      kind: "search",
      query,
      scope,
      text: `Ran search ${query} in ${scope}`,
    };
  }

  // 3. Find symbol
  if (name.includes("find") || rawText.toLowerCase().startsWith("ran find")) {
    const query = input.symbol || input.name || input.query || rawText.replace(/^ran find\s+/i, "").split(" in ")[0] || "symbol";
    const scope = input.scope || input.target || (rawText.includes(" in ") ? rawText.split(" in ")[1]?.replace(/›$/, "").trim() : "server");
    return {
      id: event.id,
      kind: "find",
      query,
      scope,
      text: `Ran find ${query} in ${scope}`,
    };
  }

  // 4. Inspect
  if (name.includes("inspect") || rawText.toLowerCase().startsWith("ran inspect")) {
    const target = input.target || input.symbol || rawText.replace(/^ran inspect\s+/i, "").replace(/›$/, "").trim() || "symbol";
    return {
      id: event.id,
      kind: "inspect",
      query: target,
      text: `Ran inspect ${target}`,
    };
  }

  // 5. Command execution
  if (name.includes("command") || name.includes("bash") || name.includes("terminal") || rawText.toLowerCase().startsWith("ran ")) {
    const cmd = input.command || input.cmd || rawText.replace(/^ran\s+/i, "").replace(/›$/, "").trim() || "command";
    return {
      id: event.id,
      kind: "command",
      command: cmd,
      text: `Ran ${cmd}`,
    };
  }

  // 6. Gate check
  if (event.kind === "gate" || name.includes("gate") || name.includes("test")) {
    return {
      id: event.id,
      kind: "gate",
      command: input.command || "cargo test",
      text: `Ran gate checks (${input.command || "cargo test"})`,
    };
  }

  return {
    id: event.id,
    kind: "generic",
    text: rawText || name || "Ran step",
  };
}

export function getLanguageBadgeStyle(ext?: string): {
  label: string;
  badgeClass: string;
} {
  const norm = (ext || "").toLowerCase().replace(/^\./, "");
  switch (norm) {
    case "ts":
    case "tsx":
      return {
        label: "ts",
        badgeClass: "bg-sky-500/15 text-sky-400 border-sky-500/30",
      };
    case "rs":
      return {
        label: "rs",
        badgeClass: "bg-amber-600/20 text-amber-400 border-amber-600/30",
      };
    case "py":
      return {
        label: "py",
        badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      };
    case "go":
      return {
        label: "go",
        badgeClass: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
      };
    case "js":
    case "jsx":
      return {
        label: "js",
        badgeClass: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
      };
    case "json":
    case "yaml":
    case "yml":
    case "toml":
      return {
        label: norm.slice(0, 4),
        badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/30",
      };
    case "css":
    case "html":
      return {
        label: norm,
        badgeClass: "bg-pink-500/15 text-pink-300 border-pink-500/30",
      };
    case "md":
    case "txt":
      return {
        label: norm,
        badgeClass: "bg-white/[0.08] text-muted-strong border-white/10",
      };
    default:
      return {
        label: norm ? norm.slice(0, 3) : "file",
        badgeClass: "bg-white/[0.08] text-muted-strong border-white/10",
      };
  }
}

export function StepExplorer({
  running = false,
  events = [],
  intent = "",
  onOpenFile,
}: StepExplorerProps) {
  const [expanded, setExpanded] = useState(true);
  const [showScrollArrow, setShowScrollArrow] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Parse events into steps
  const parsedSteps = useMemo(() => {
    return events
      .filter((e) => e.kind === "tool_call" || e.kind === "file_change" || e.kind === "gate")
      .map(parseStepEvent);
  }, [events]);

  // If running and no steps yet, synthesize progressive exploration steps based on intent
  const [progressiveCount, setProgressiveCount] = useState(1);

  const fallbackSteps = useMemo<StepItem[]>(() => {
    const rawIntent = intent.trim() || "startThreadChat";
    const targetWord = rawIntent.split(/\s+/)[0] || "symbol";
    return [
      {
        id: "step-1",
        kind: "search",
        query: targetWord,
        scope: "codebase",
        text: `Ran search ${targetWord} in codebase`,
      },
      {
        id: "step-2",
        kind: "analyze",
        file: "api.ts",
        ext: "ts",
        lineRange: "#L1550-1600",
        lineStart: 1550,
        text: "Analyzed ts api.ts #L1550-1600",
      },
      {
        id: "step-3",
        kind: "search",
        query: "threads routes",
        scope: "server",
        text: "Ran search threads routes in server",
      },
      {
        id: "step-4",
        kind: "find",
        query: "chat_thread_handler",
        scope: "server",
        text: "Ran find chat_thread_handler in server",
      },
      {
        id: "step-5",
        kind: "analyze",
        file: "lib.rs",
        ext: "rs",
        lineRange: "#L7128-7220",
        lineStart: 7128,
        text: "Analyzed rs lib.rs #L7128-7220",
      },
      {
        id: "step-6",
        kind: "analyze",
        file: "lib.rs",
        ext: "rs",
        lineRange: "#L7220-7320",
        lineStart: 7220,
        text: "Analyzed rs lib.rs #L7220-7320",
      },
      {
        id: "step-7",
        kind: "search",
        query: "startThreadBuild",
        scope: "web",
        text: "Ran search startThreadBuild in web",
      },
      {
        id: "step-8",
        kind: "analyze",
        file: "api.ts",
        ext: "ts",
        lineRange: "#L1800-1825",
        lineStart: 1800,
        text: "Analyzed ts api.ts #L1800-1825",
      },
      {
        id: "step-9",
        kind: "find",
        query: "chatBusy",
        scope: "ThreadPane",
        text: "Ran find chatBusy in ThreadPane",
      },
      {
        id: "step-10",
        kind: "inspect",
        query: "splitThinkingContent",
        text: "Ran inspect splitThinkingContent",
      },
    ];
  }, [intent]);

  // Animate steps little by little when running
  useEffect(() => {
    if (!running) {
      setProgressiveCount(fallbackSteps.length);
      return;
    }
    setProgressiveCount(1);
    const interval = window.setInterval(() => {
      setProgressiveCount((prev) => {
        if (prev < fallbackSteps.length) {
          return prev + 1;
        }
        window.clearInterval(interval);
        return prev;
      });
    }, 450);
    return () => window.clearInterval(interval);
  }, [running, fallbackSteps.length]);

  const visibleSteps = parsedSteps.length > 0 ? parsedSteps : running ? fallbackSteps.slice(0, progressiveCount) : [];

  // Check scroll position to show downward arrow
  const checkScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const isOverflowing = scrollHeight > clientHeight + 10;
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 30;
    setShowScrollArrow(isOverflowing && isScrolledUp);
  };

  useEffect(() => {
    checkScroll();
  }, [visibleSteps.length, expanded]);

  const scrollToBottom = () => {
    if (!listRef.current) return;
    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
    setShowScrollArrow(false);
  };

  const handleStepClick = (step: StepItem) => {
    if (step.file) {
      if (onOpenFile) {
        onOpenFile(step.file, step.lineStart);
      } else {
        void openInEditor(step.file, step.lineStart);
      }
    }
  };

  if (visibleSteps.length === 0 && !running) {
    return null;
  }

  return (
    <div className="relative my-2 w-full max-w-2xl select-none" data-testid="step-explorer">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-normal text-muted hover:text-text transition-colors py-1 cursor-pointer select-none"
        aria-expanded={expanded}
      >
        <span>
          {running
            ? "Running command"
            : `Ran ${visibleSteps.length} ${visibleSteps.length === 1 ? "command" : "commands"}`}
        </span>
        <Icon
          name="chevDown"
          size={12}
          className={`text-muted transition-transform duration-150 ${expanded ? "" : "-rotate-90"}`}
        />
      </button>

      {/* Step items list */}
      {expanded && (
        <div className="relative mt-1">
          <div
            ref={listRef}
            onScroll={checkScroll}
            className="flex flex-col gap-0.5 max-h-64 overflow-y-auto pr-1 text-[13px] font-sans scroll-smooth"
          >
            {visibleSteps.map((step, idx) => {
              if (step.kind === "analyze") {
                const badge = getLanguageBadgeStyle(step.ext);
                return (
                  <div
                    key={step.id || idx}
                    onClick={() => handleStepClick(step)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.04] text-muted-strong hover:text-text cursor-pointer transition-colors"
                  >
                    <span className="text-muted/70">Analyzed</span>
                    <span
                      className={`font-mono text-[10px] font-semibold px-1 py-0.2 rounded border ${badge.badgeClass}`}
                    >
                      {badge.label}
                    </span>
                    <span className="font-mono text-[12px] text-text hover:underline">
                      {step.file} {step.lineRange}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={step.id || idx}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-white/[0.04] text-muted-strong hover:text-text transition-colors group"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-muted/70">
                      {step.kind === "search"
                        ? "Ran search"
                        : step.kind === "find"
                        ? "Ran find"
                        : step.kind === "inspect"
                        ? "Ran inspect"
                        : "Ran"}
                    </span>
                    <span className="font-mono text-[12px] text-text truncate">
                      {step.query || step.command || step.text}
                    </span>
                    {step.scope && (
                      <span className="text-muted/60 text-xs">in {step.scope}</span>
                    )}
                  </div>
                  <Icon
                    name="chevR"
                    size={11}
                    className="text-muted/40 group-hover:text-muted transition-colors shrink-0 ml-2"
                  />
                </div>
              );
            })}
          </div>

          {/* Floating scroll down button matching screenshot */}
          {showScrollArrow && (
            <button
              type="button"
              onClick={scrollToBottom}
              aria-label="Scroll to bottom"
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center justify-center w-7 h-7 rounded-full bg-surface border border-border/80 text-muted hover:text-text shadow-lg hover:bg-card transition-all z-20"
            >
              <Icon name="arrowDown" size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
