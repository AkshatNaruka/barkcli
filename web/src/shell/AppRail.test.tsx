import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRail } from "./AppRail";

vi.mock("../lib/desktop", () => ({
  isDesktop: () => true,
  currentProject: vi.fn(async () => ({ name: "test", path: "/test" })),
  recentProjects: vi.fn(async () => []),
  openProjectDialog: vi.fn(),
  switchProject: vi.fn(),
}));

describe("AppRail footer buttons", () => {
  it("renders the 5 global footer buttons and dispatches global commands", async () => {
    const onCommand = vi.fn();
    const onCustomize = vi.fn();
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(
      <AppRail
        surface="chat"
        onNavigate={onNavigate}
        onCommand={onCommand}
        onCustomize={onCustomize}
        onAllProjects={vi.fn()}
        onOpenProject={vi.fn()}
        onNew={vi.fn()}
        projectRoot="/test"
      />
    );

    const docsBtn = screen.getByRole("button", { name: "Documentation and guides" });
    const searchBtn = screen.getByRole("button", { name: "Search or command" });
    const usageBtn = screen.getByRole("button", { name: "Usage and limits" });
    const appearanceBtn = screen.getByRole("button", { name: "Appearance" });
    const settingsBtn = screen.getByRole("button", { name: "Settings" });

    expect(docsBtn).toBeInTheDocument();
    expect(searchBtn).toBeInTheDocument();
    expect(usageBtn).toBeInTheDocument();
    expect(appearanceBtn).toBeInTheDocument();
    expect(settingsBtn).toBeInTheDocument();

    await user.click(docsBtn);
    expect(onCommand).toHaveBeenCalledWith("docs");

    await user.click(searchBtn);
    expect(onCommand).toHaveBeenCalledWith("command-palette");

    await user.click(usageBtn);
    expect(onCommand).toHaveBeenCalledWith("usage");

    await user.click(appearanceBtn);
    expect(onCustomize).toHaveBeenCalled();

    await user.click(settingsBtn);
    expect(onCommand).toHaveBeenCalledWith("settings");
  });
});
