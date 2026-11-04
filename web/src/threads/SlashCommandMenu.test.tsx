import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { matchSlashCommands, SLASH_COMMANDS } from "../lib/slashCommands";
import { SlashCommandMenu } from "./SlashCommandMenu";

describe("slashCommands library", () => {
  it("matches all slash commands when query is '/' or empty", () => {
    expect(matchSlashCommands("/").length).toBe(SLASH_COMMANDS.length);
    expect(matchSlashCommands("").length).toBe(SLASH_COMMANDS.length);
  });

  it("filters commands by prefix or alias", () => {
    const buildMatches = matchSlashCommands("/b");
    expect(buildMatches.some((cmd) => cmd.name === "/build")).toBe(true);

    const testMatches = matchSlashCommands("/test");
    expect(testMatches.some((cmd) => cmd.name === "/gate")).toBe(true);

    const tddMatches = matchSlashCommands("/tdd");
    expect(tddMatches.some((cmd) => cmd.name === "/tdd")).toBe(true);
  });

  it("filters commands by description keyword", () => {
    const worktreeMatches = matchSlashCommands("worktree");
    expect(worktreeMatches.some((cmd) => cmd.name === "/build" || cmd.name === "/diff")).toBe(true);
  });
});

describe("SlashCommandMenu component", () => {
  it("renders command menu with categories and commands", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <SlashCommandMenu
        query="/pl"
        selectedIndex={0}
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    expect(screen.getByRole("listbox", { name: /slash commands/i })).toBeInTheDocument();
    expect(screen.getByText("/plan")).toBeInTheDocument();
  });

  it("calls onSelect when a command is clicked", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <SlashCommandMenu
        query="/build"
        selectedIndex={0}
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    const buildButton = screen.getByRole("option", { name: /\/build/i });
    await userEvent.click(buildButton);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: "/build", actionType: "mode" })
    );
  });

  it("shows empty state when no commands match", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <SlashCommandMenu
        query="/nonexistentxyz"
        selectedIndex={0}
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    expect(screen.getByText(/no slash commands matching/i)).toBeInTheDocument();
  });
});
