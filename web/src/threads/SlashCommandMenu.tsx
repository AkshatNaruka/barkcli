import React, { useEffect, useRef } from "react";
import {
  type SlashCommand,
  type SlashCategory,
  matchSlashCommands,
} from "../lib/slashCommands";

interface SlashCommandMenuProps {
  query: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

const CATEGORY_ORDER: SlashCategory[] = ["Modes", "Agents", "Skills", "Actions"];

/**
 * The "/" palette: one flat, single-line row per command — name, then a muted
 * inline description — anchored to the top of the composer. No headers, icons,
 * or key hints; the list itself is the whole surface.
 */
export function SlashCommandMenu({
  query,
  selectedIndex,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const commands = matchSlashCommands(query);

  useEffect(() => {
    const activeItem = containerRef.current?.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`
    );
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (commands.length === 0) {
    return (
      <div
        className="slash-palette absolute bottom-full left-0 right-0 z-50 mb-2 rounded-[14px] border border-border/70 bg-card py-3 text-[12px] text-muted shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
        role="menu"
      >
        <span className="px-4">No slash commands matching &ldquo;{query}&rdquo;</span>
      </div>
    );
  }

  // Category order still decides precedence; the list itself is rendered flat.
  const ordered = CATEGORY_ORDER.flatMap((category) =>
    commands.filter((command) => command.category === category)
  );
  for (const command of commands) {
    if (!ordered.includes(command)) ordered.push(command);
  }

  return (
    <div
      ref={containerRef}
      className="slash-palette absolute bottom-full left-0 right-0 z-50 mb-2 max-h-[min(46vh,376px)] overflow-y-auto overscroll-contain rounded-[14px] border border-border/70 bg-card p-2 shadow-[0_18px_50px_rgba(0,0,0,0.55)] select-none"
      role="listbox"
      aria-label="Slash commands"
    >
      {ordered.map((command, itemIndex) => {
        const isSelected = itemIndex === selectedIndex;

        return (
          <button
            key={command.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            data-index={itemIndex}
            onClick={() => onSelect(command)}
            title={command.syntax}
            className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors cursor-pointer ${
              isSelected
                ? "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-text"
                : "text-text hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
            }`}
          >
            <span className="shrink-0 font-mono text-[12.5px] font-medium text-text">
              {command.name}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
              {command.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
