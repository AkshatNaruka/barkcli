import React, { useEffect, useRef } from "react";
import { Icon } from "../components/Icon";
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
        className="absolute bottom-full left-0 mb-2 w-full max-w-[540px] rounded-xl border border-border/80 bg-[#12141a]/95 backdrop-blur-md p-3 text-[12px] text-muted shadow-2xl z-50"
        role="menu"
      >
        <div className="flex items-center gap-2">
          <Icon name="search" size={13} className="text-muted/60" />
          <span>No slash commands matching &ldquo;{query}&rdquo;</span>
        </div>
      </div>
    );
  }

  // Flattened index mapping
  let currentIndex = 0;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 mb-2 w-full max-w-[560px] max-h-[340px] overflow-y-auto rounded-xl border border-border-strong bg-[#12141a]/95 backdrop-blur-md p-1.5 shadow-2xl z-50 select-none custom-scrollbar"
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="px-2.5 py-1 mb-1 border-b border-border/40 flex items-center justify-between text-[10.5px] font-mono text-muted/80">
        <span>COMMAND PALETTE</span>
        <span>↑↓ navigate · ↵ or Tab select · esc close</span>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const catCommands = commands.filter((cmd) => cmd.category === category);
        if (catCommands.length === 0) return null;

        return (
          <div key={category} className="mb-1.5 last:mb-0">
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted/60">
              {category}
            </div>
            <div className="flex flex-col gap-0.5">
              {catCommands.map((command) => {
                const itemIndex = currentIndex++;
                const isSelected = itemIndex === selectedIndex;

                return (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-index={itemIndex}
                    onClick={() => onSelect(command)}
                    className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-accent/15 text-text border border-accent/30"
                        : "hover:bg-surface/80 text-muted-strong hover:text-text border border-transparent"
                    }`}
                  >
                    <div
                      className={`mt-0.5 p-1 rounded-md shrink-0 ${
                        isSelected ? "bg-accent/30 text-accent-text" : "bg-surface text-muted"
                      }`}
                    >
                      <Icon name={command.icon} size={13} />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[12px] font-semibold ${
                            isSelected ? "text-accent-text" : "text-text"
                          }`}
                        >
                          {command.name}
                        </span>
                        {command.aliases && command.aliases.length > 0 && (
                          <span className="text-[10px] font-mono text-muted/50">
                            ({command.aliases.join(", ")})
                          </span>
                        )}
                        <span className="ml-auto font-mono text-[10px] text-muted/60 shrink-0">
                          {command.syntax}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted line-clamp-1 mt-0.5">
                        {command.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
