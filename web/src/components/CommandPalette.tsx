import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Board as BoardType, Card, ThreadSummary } from "../lib/types";
import { THEMES, useTheme } from "../lib/theme.tsx";
import { navigate } from "../lib/hashnav";
import { SURFACES } from "../lib/surfaces";
import { APP_COMMANDS, PROJECT_TOOLS, openProjectTool } from "../lib/commands";
import { AccessibleDialog } from "./AccessibleDialog";
import { fetchThreads } from "../lib/api";
import { relativeTime, threadStatus } from "../lib/threads";

interface Props {
  board?: BoardType | null;
  boardName?: string | null;
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

interface Row {
  key: string;
  /** Used for ordering only; rows are rendered as one flat list. */
  section: string;
  label: string;
  description?: string;
  /** Extra searchable text that is not shown in the row. */
  keywords?: string;
  run: () => void;
}

const SECTION_ORDER = ["Threads", "Commands", "Tools", "Go to", "Cards", "Appearance"];

function rank(row: Row, query: string): number {
  const label = row.label.toLowerCase();
  if (label.startsWith(query)) return 0;
  if (label.includes(query)) return 1;
  if (`${row.description || ""} ${row.keywords || ""}`.toLowerCase().includes(query)) return 2;
  return -1;
}

function pick(rows: Row[], query: string, limit: number): Row[] {
  if (!query) return rows.slice(0, limit);
  return rows
    .map((row) => ({ row, score: rank(row, query) }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => left.score - right.score)
    .slice(0, limit)
    .map((item) => item.row);
}

export function CommandPalette({
  board,
  boardName,
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
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const { setTheme } = useTheme();

  // Threads are the first thing the palette is for, so they load with it and
  // stay in step with the sidebar.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchThreads(boardName || undefined)
        .then((next) => { if (!cancelled) setThreads(next); })
        .catch(() => {});
    };
    load();
    window.addEventListener("bark-threads-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("bark-threads-changed", load);
    };
  }, [boardName]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const close = (action: () => void) => () => { onClose(); action(); };

    const threadRows: Row[] = threads.map((thread) => {
      const description = [
        thread.project_name,
        threadStatus(thread).label,
        relativeTime(thread.last_seen || thread.updated_at),
      ].filter(Boolean).join(" · ");
      return {
        key: `thread:${thread.id}`,
        section: "Threads",
        label: thread.title || thread.id,
        description,
        keywords: `${thread.id} ${thread.backend || ""} ${thread.column} ${thread.status_group}`,
        run: close(() => navigate("chat", { thread: thread.id })),
      };
    });

    const commandRows: Row[] = APP_COMMANDS
      // Opening the palette from inside the palette is a no-op.
      .filter((command) => command.id !== "command-palette" && onCommand)
      .map((command) => ({
        key: `command:${command.id}`,
        section: "Commands",
        label: command.label,
        description: command.hint,
        keywords: command.id,
        run: close(() => {
          if (command.id === "quick-open" && onQuickOpen) return onQuickOpen();
          if (command.id === "command-runner" && onCommandRunner) return onCommandRunner();
          if (command.id === "open-project" && onOpenProject) return onOpenProject();
          onCommand?.(command.id);
        }),
      }));

    const projectRow: Row = {
      key: "projects",
      section: "Commands",
      label: "All projects",
      description: "Switch to another project on this machine",
      keywords: "workspace switch",
      run: close(() => navigate("projects")),
    };

    const surfaceLabels = new Set(SURFACES.map((surface) => surface.label.toLowerCase()));
    const toolRows: Row[] = PROJECT_TOOLS
      // Board, Review, History… already exist as surfaces; don't list them twice.
      .filter((tool) => !surfaceLabels.has(tool.label.toLowerCase()))
      .map((tool) => ({
        key: `tool:${tool.id}`,
        section: "Tools",
        label: tool.label,
        description: tool.hint,
        keywords: `${tool.id} ${tool.keywords || ""} ${tool.group}`,
        run: close(() => openProjectTool(tool)),
      }));

    const goRows: Row[] = SURFACES.map((surface) => ({
      key: `go:${surface.id}`,
      section: "Go to",
      label: surface.label,
      description: surface.hint,
      keywords: `${surface.id} go to`,
      run: close(() => navigate(surface.id)),
    }));

    const columnName = (id: string) =>
      board?.columns.find((column) => column.id === id)?.name || id;
    const cardRows: Row[] = (board?.cards || []).map((card) => ({
      key: `card:${card.id}`,
      section: "Cards",
      label: card.title,
      description: `Card · ${columnName(card.column)}`,
      keywords: `${card.id} ${card.column} ${card.priority} ${(card.labels || []).join(" ")}`,
      run: close(() => onEditCard(card)),
    }));

    const appearanceRows: Row[] = [
      ...THEMES.map((theme) => ({
        key: `theme:${theme.id}`,
        section: "Appearance",
        label: `${theme.label} theme`,
        description: theme.hint,
        keywords: `theme ${theme.id} color`,
        run: close(() => setTheme(theme.id)),
      })),
      {
        key: "appearance",
        section: "Appearance",
        label: "Customize appearance",
        description: "Accent, layout, and sidebar density",
        keywords: "theme accent layout sidebar",
        run: close(onCustomize),
      },
    ];

    const newCardRows: Row[] = board
      ? [
          {
            key: "new-card",
            section: "Commands",
            label: "New card",
            description: `Add a card to ${board.columns[0]?.name || "the board"}`,
            keywords: "add task",
            run: close(() => onAddCard(board.columns[0]?.id || "todo")),
          },
          ...board.columns.map((column) => ({
            key: `add:${column.id}`,
            section: "Commands",
            label: `Add to ${column.name}`,
            description: "New card in this column",
            keywords: `new card ${column.id}`,
            run: close(() => onAddCard(column.id)),
          })),
        ]
      : [];

    if (!q) {
      // Nothing typed yet: recent threads plus the handful of actions people
      // actually reach for.
      return [
        ...pick(threadRows, "", 4),
        ...pick([...commandRows, projectRow, ...newCardRows], "", 7),
      ];
    }

    return [
      ...pick(threadRows, q, 6),
      ...pick([...commandRows, projectRow, ...newCardRows], q, 8),
      ...pick(toolRows, q, 6),
      ...pick(goRows, q, 6),
      ...pick(cardRows, q, 5),
      ...pick(appearanceRows, q, 4),
    ].sort((left, right) => SECTION_ORDER.indexOf(left.section) - SECTION_ORDER.indexOf(right.section));
  }, [
    query,
    threads,
    board,
    onClose,
    onAddCard,
    onEditCard,
    onCustomize,
    onCommand,
    onQuickOpen,
    onCommandRunner,
    onOpenProject,
    setTheme,
  ]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  // Keep the keyboard cursor visible when the list is taller than the panel.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!list || !row) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top) list.scrollTop -= listRect.top - rowRect.top + 6;
    else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom + 6;
  }, [active, rows.length]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (rows.length ? (current + 1) % rows.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (rows.length ? (current - 1 + rows.length) % rows.length : 0));
      return;
    }
    if (event.key === "Home" && rows.length) {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === "End" && rows.length) {
      event.preventDefault();
      setActive(rows.length - 1);
      return;
    }
    if (event.key === "Enter" && rows[active]) {
      event.preventDefault();
      rows[active].run();
    }
  };

  return (
    <AccessibleDialog label="Search or command" onClose={onClose} className="command-palette">
      <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
        <div className="shrink-0 px-4 pb-2 pt-3.5">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search threads, tools, or commands"
            aria-label="Search or command"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={rows[active] ? `command-palette-row-${active}` : undefined}
            className="w-full bg-transparent text-[15px] tracking-[-0.01em] text-text placeholder:text-muted/50 focus:outline-none"
          />
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Results"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        >
          {rows.length === 0 && (
            <div className="px-3 py-10 text-center">
              <p className="text-[13px] text-muted-strong">
                No matches{query.trim() ? ` for “${query.trim()}”` : ""}.
              </p>
              <p className="mt-1 text-[12px] text-muted/60">
                Try a thread title, a tool, or a command like “theme”.
              </p>
            </div>
          )}

          {rows.map((row, index) => (
            <div
              key={row.key}
              id={`command-palette-row-${index}`}
              role="option"
              aria-selected={index === active}
              data-active={index === active ? "true" : undefined}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={row.run}
              className={`flex cursor-pointer items-baseline gap-4 rounded-lg px-3 py-2.5 transition-colors ${
                index === active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
              }`}
            >
              <span className="min-w-0 truncate text-[13.5px] font-semibold leading-5 tracking-[-0.01em] text-text">
                {row.label}
              </span>
              {row.description && (
                <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-muted">
                  {row.description}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex h-8 shrink-0 items-center justify-between border-t border-white/[0.04] px-4 text-[10.5px] text-muted/45">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>
            {rows.length} {rows.length === 1 ? "result" : "results"}
          </span>
        </div>
      </div>
    </AccessibleDialog>
  );
}
