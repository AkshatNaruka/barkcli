import React, { useEffect, useState, useMemo } from "react";
import type { Board as BoardType, Card } from "../lib/types";
import { THEMES, useTheme } from "../lib/theme.tsx";
import { navigate } from "../lib/hashnav";
import { SURFACES } from "../lib/surfaces";
import { Icon, type IconName } from "./Icon";
import { APP_COMMANDS, PROJECT_TOOLS, openProjectTool } from "../lib/commands";
import { AccessibleDialog } from "./AccessibleDialog";

interface Props {
  board: BoardType;
  onClose: () => void;
  onNavigate: (colId: string, cardId: string) => void;
  onAddCard: (colId: string) => void;
  onEditCard: (card: Card) => void;
  onCustomize: () => void;
  onCommand?: (id: string) => void;
  onQuickOpen?: () => void;
  onCommandRunner?: () => void;
  onOpenProject?: () => void;
}

export function CommandPalette({
  board,
  onClose,
  onAddCard,
  onEditCard,
  onCustomize,
  onCommand,
  onQuickOpen,
  onCommandRunner,
  onOpenProject,
}: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { setTheme, railOrder, hidden, railStyle, setRailStyle } = useTheme();

  const views = SURFACES;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: { label: string; icon: IconName; action: () => void }[] = [];

    for (const command of APP_COMMANDS) {
      if (onCommand && (!q || command.label.toLowerCase().includes(q))) items.push({ label: command.label, icon: command.icon, action: () => { onClose(); onCommand(command.id); } });
    }
    for (const tool of PROJECT_TOOLS) {
      if (q && `${tool.label} ${tool.keywords || ""} ${tool.id}`.toLowerCase().includes(q)) items.push({ label: tool.label, icon: tool.icon, action: () => { openProjectTool(tool); onClose(); } });
    }
    if (!q) return items.slice(0, 7);
    // Every supported tool remains searchable regardless of navigation visibility.
    for (const v of views) {
      if (`go to ${v.label}`.toLowerCase().includes(q) || v.id.includes(q)) {
        items.push({
          label: `Go to ${v.label}`,
          icon: v.icon,
          action: () => {
            navigate(v.id);
            onClose();
          },
        });
      }
    }

    if ("customize appearance theme accent layout".includes(q)) {
      items.push({
        label: "Customize appearance",
        icon: "palette",
        action: () => {
          onCustomize();
          onClose();
        },
      });
    }
    for (const t of THEMES) {
      if (`theme ${t.label}`.toLowerCase().includes(q) || `theme ${t.id}`.includes(q)) {
        items.push({
          label: `${t.label} theme`,
          icon: t.id === "light" ? "sun" : t.id === "system" ? "monitor" : "moon",
          action: () => {
            setTheme(t.id);
            onClose();
          },
        });
      }
    }

    if ("sync brain".includes(q)) {
      items.push({
        label: "Sync brain",
        icon: "refresh",
        action: () => {
          fetch("/api/mind").then(() => {}).catch(() => {});
          navigate("brain");
          onClose();
        },
      });
    }

    if (onQuickOpen && "quick open file search go to file".includes(q)) {
      items.push({
        label: "Quick open file",
        icon: "search",
        action: onQuickOpen,
      });
    }
    if (onCommandRunner && "run command tests build terminal shell".includes(q)) {
      items.push({
        label: "Run a project command",
        icon: "terminal",
        action: onCommandRunner,
      });
    }
    if (onOpenProject && "open project folder switch workspace".includes(q)) {
      items.push({
        label: "Open project folder",
        icon: "layers",
        action: onOpenProject,
      });
    }

    // Cards
    for (const card of board.cards) {
      if (card.title.toLowerCase().includes(q)) {
        items.push({
          label: `${card.title}: ${card.column}`,
          icon: "board",
          action: () => {
            onEditCard(card);
            onClose();
          },
        });
      }
    }

    // Commands
    if ("new card".includes(q)) {
      items.push({
        label: "New card",
        icon: "board",
        action: () => {
          onAddCard(board.columns[0]?.id || "todo");
          onClose();
        },
      });
    }
    for (const col of board.columns) {
      if (`add to ${col.name}`.toLowerCase().includes(q)) {
        items.push({
          label: `Add to ${col.name}`,
          icon: "board",
          action: () => {
            onAddCard(col.id);
            onClose();
          },
        });
      }
    }

    return items.slice(0, 12);
  }, [
    query,
    onCommand,
    board,
    onClose,
    onAddCard,
    onEditCard,
    onCustomize,
    onQuickOpen,
    onCommandRunner,
    onOpenProject,
    setTheme,
    views,
    railStyle,
    setRailStyle,
  ]);

  useEffect(() => {
    setActive(0);
  }, [query, results.length]);

  return (
    <AccessibleDialog label="Search or command" onClose={onClose} className="command-palette">
      <div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 bg-transparent text-text text-sm outline-none placeholder:text-muted border-b border-border"
          placeholder="Search threads, tools, or commands…"
          aria-label="Search or command"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((current) => (results.length ? (current + 1) % results.length : 0));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((current) =>
                results.length ? (current - 1 + results.length) % results.length : 0
              );
            }
            if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              results[active].action();
            }
          }}
        />
        <div className="max-h-64 overflow-y-auto">
          {results.length === 0 && query.trim() && <p className="text-muted text-sm p-3">No results</p>}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={r.action}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-left px-4 py-2.5 text-sm border-b border-border/50 last:border-b-0 transition-colors flex items-center gap-2.5 ${
                i === active ? "bg-accent-soft text-text" : "text-text hover:bg-surface"
              }`}
            >
              <span className="text-muted">
                <Icon name={r.icon} size={14} />
              </span>
              {r.label}
            </button>
          ))}

        </div>
      </div>
    </AccessibleDialog>
  );
}
