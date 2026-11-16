import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Board as BoardType, Card, ThreadSummary } from "../lib/types";
import { THEMES, useTheme } from "../lib/theme.tsx";
import { navigate } from "../lib/hashnav";
import { SURFACES } from "../lib/surfaces";
import { Icon, type IconName } from "./Icon";
import { APP_COMMANDS, PROJECT_TOOLS, openProjectTool, type AppCommand } from "../lib/commands";
import { AccessibleDialog } from "./AccessibleDialog";
import { fetchThreads } from "../lib/api";
import { relativeTime } from "../lib/threads";
import { isMac } from "../lib/desktop";

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
  group: string;
  label: string;
  hint?: string;
  shortcut?: string;
  icon: IconName;
  /** Extra searchable text that is not shown in the row. */
  keywords?: string;
  run: () => void;
}

const GROUP_ORDER = ["Threads", "Commands", "Tools", "Go to", "Cards", "Appearance"];

function shortcutLabel(command: AppCommand): string | undefined {
  if (!command.shortcut) return undefined;
  const modifiers = command.modifiers || "";
  const parts: string[] = [];
  if (modifiers.includes("mod")) parts.push(isMac() ? "⌘" : "Ctrl");
  if (modifiers.includes("alt")) parts.push(isMac() ? "⌥" : "Alt");
  if (modifiers.includes("shift")) parts.push(isMac() ? "⇧" : "Shift");
  parts.push(command.shortcut.toUpperCase());
  return parts.join(isMac() ? "" : "+");
}

function rank(row: Row, query: string): number {
  const label = row.label.toLowerCase();
  if (label.startsWith(query)) return 0;
  if (label.includes(query)) return 1;
  if (`${row.hint || ""} ${row.keywords || ""}`.toLowerCase().includes(query)) return 2;
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

/** Bold the matched run of text, the way the reference palette does. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-transparent font-semibold text-text">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
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

    const threadRows: Row[] = threads.map((thread) => ({
      key: `thread:${thread.id}`,
      group: "Threads",
      label: thread.title || thread.id,
      hint: [thread.project_name, relativeTime(thread.last_seen || thread.updated_at)]
        .filter(Boolean)
        .join(" · "),
      icon: "comment",
      keywords: `${thread.id} ${thread.backend || ""} ${thread.column} ${thread.status_group}`,
      run: close(() => navigate("chat", { thread: thread.id })),
    }));

    const commandRows: Row[] = APP_COMMANDS
      // Opening the palette from inside the palette is a no-op.
      .filter((command) => command.id !== "command-palette" && onCommand)
      .map((command) => ({
        key: `command:${command.id}`,
        group: "Commands",
        label: command.label,
        icon: command.icon,
        shortcut: shortcutLabel(command),
        run: close(() => {
          if (command.id === "quick-open" && onQuickOpen) return onQuickOpen();
          if (command.id === "command-runner" && onCommandRunner) return onCommandRunner();
          if (command.id === "open-project" && onOpenProject) return onOpenProject();
          onCommand?.(command.id);
        }),
      }));

    const projectRow: Row = {
      key: "projects",
      group: "Commands",
      label: "All projects",
      icon: "grid",
      keywords: "workspace switch",
      run: close(() => navigate("projects")),
    };

    const surfaceLabels = new Set(SURFACES.map((surface) => surface.label.toLowerCase()));
    const toolRows: Row[] = PROJECT_TOOLS
      // Board, Review, History… already exist as surfaces; don't list them twice.
      .filter((tool) => !surfaceLabels.has(tool.label.toLowerCase()))
      .map((tool) => ({
        key: `tool:${tool.id}`,
        group: "Tools",
        label: tool.label,
        hint: tool.hint,
        icon: tool.icon,
        keywords: `${tool.id} ${tool.keywords || ""} ${tool.group}`,
        run: close(() => openProjectTool(tool)),
      }));

    const goRows: Row[] = SURFACES.map((surface) => ({
      key: `go:${surface.id}`,
      group: "Go to",
      label: surface.label,
      hint: surface.hint,
      icon: surface.icon,
      keywords: `${surface.id} go to`,
      run: close(() => navigate(surface.id)),
    }));

    const columnName = (id: string) =>
      board?.columns.find((column) => column.id === id)?.name || id;
    const cardRows: Row[] = (board?.cards || []).map((card) => ({
      key: `card:${card.id}`,
      group: "Cards",
      label: card.title,
      hint: columnName(card.column),
      icon: "board",
      keywords: `${card.id} ${card.column} ${card.priority} ${(card.labels || []).join(" ")}`,
      run: close(() => onEditCard(card)),
    }));

    const appearanceRows: Row[] = [
      ...THEMES.map((theme) => ({
        key: `theme:${theme.id}`,
        group: "Appearance",
        label: `${theme.label} theme`,
        hint: theme.hint,
        icon: (theme.id === "light" ? "sun" : theme.id === "system" ? "monitor" : "moon") as IconName,
        keywords: `theme ${theme.id} color`,
        run: close(() => setTheme(theme.id)),
      })),
      {
        key: "appearance",
        group: "Appearance",
        label: "Customize appearance",
        icon: "palette" as IconName,
        keywords: "theme accent layout sidebar",
        run: close(onCustomize),
      },
    ];

    const newCardRows: Row[] = board
      ? [
          {
            key: "new-card",
            group: "Commands",
            label: "New card",
            icon: "plus" as IconName,
            keywords: "add task",
            run: close(() => onAddCard(board.columns[0]?.id || "todo")),
          },
          ...board.columns.map((column) => ({
            key: `add:${column.id}`,
            group: "Commands",
            label: `Add to ${column.name}`,
            icon: "board" as IconName,
            keywords: `new card ${column.id}`,
            run: close(() => onAddCard(column.id)),
          })),
        ]
      : [];

    if (!q) {
      // Nothing typed yet: recent threads plus the handful of actions people
      // actually reach for, no empty groups.
      return [
        ...pick(threadRows, "", 4),
        ...pick([...commandRows, projectRow, ...newCardRows], "", 9),
      ];
    }

    return [
      ...pick(threadRows, q, 6),
      ...pick([...commandRows, projectRow, ...newCardRows], q, 8),
      ...pick(toolRows, q, 6),
      ...pick(goRows, q, 6),
      ...pick(cardRows, q, 5),
      ...pick(appearanceRows, q, 4),
    ].sort((left, right) => GROUP_ORDER.indexOf(left.group) - GROUP_ORDER.indexOf(right.group));
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

  const groups = useMemo(() => {
    const out: Array<{ name: string; items: Array<{ row: Row; index: number }> }> = [];
    rows.forEach((row, index) => {
      let group = out.find((candidate) => candidate.name === row.group);
      if (!group) {
        group = { name: row.group, items: [] };
        out.push(group);
      }
      group.items.push({ row, index });
    });
    return out;
  }, [rows]);

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
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3">
          <Icon name="search" size={14} className="text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search threads, tools, or commands…"
            aria-label="Search or command"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={rows[active] ? `command-palette-row-${active}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text placeholder:text-muted/60 focus:outline-none"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted">
            esc
          </kbd>
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Results"
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {rows.length === 0 && (
            <div className="px-3 py-10 text-center">
              <p className="text-[12px] text-muted-strong">
                No matches{query.trim() ? ` for “${query.trim()}”` : ""}.
              </p>
              <p className="mt-1 text-[11px] text-muted/60">
                Try a thread title, a tool, or a command like “theme”.
              </p>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.name} role="group" aria-label={group.name}>
              <div className="px-2 pb-1 pt-2.5 font-mono text-[9px] uppercase tracking-wider text-muted/50">
                {group.name}
              </div>
              {group.items.map(({ row, index }) => (
                <div
                  key={row.key}
                  id={`command-palette-row-${index}`}
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active ? "true" : undefined}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={row.run}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] transition-colors ${
                    index === active
                      ? "bg-accent-soft text-text"
                      : "text-muted-strong hover:bg-white/[0.04] hover:text-text"
                  }`}
                >
                  <Icon name={row.icon} size={13} className="shrink-0 text-muted/80" />
                  <span className="min-w-0 flex-1 truncate">
                    <Highlight text={row.label} query={query} />
                  </span>
                  {row.hint && (
                    <span className="max-w-[40%] shrink-0 truncate font-mono text-[9.5px] text-muted/55">
                      {row.hint}
                    </span>
                  )}
                  {row.shortcut && (
                    <kbd className="shrink-0 rounded border border-border px-1 py-0.5 font-mono text-[9px] text-muted/70">
                      {row.shortcut}
                    </kbd>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex h-9 shrink-0 items-center justify-between border-t border-border/70 px-3 font-mono text-[9px] text-muted/60">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>
            {rows.length} {rows.length === 1 ? "result" : "results"}
          </span>
        </div>
      </div>
    </AccessibleDialog>
  );
}
