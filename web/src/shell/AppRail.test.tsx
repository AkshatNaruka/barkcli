import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRail } from "./AppRail";

vi.mock("../lib/desktop", () => ({
  isDesktop: () => true,
  currentProject: vi.fn(async () => ({ name: "test", path: "/test" })),
  recentProjects: vi.fn(async () => []),
  openProjectDialog: vi.fn(),
  switchProject: vi.fn(),
  projectSummaries: vi.fn(async () => []),
  isScratchPath: (path?: string | null) => /(?:^|\/)\.barkcli\/scratch\/?$/.test(path || ""),
}));

describe("AppRail footer buttons", () => {  it("renders the 4 global footer buttons and dispatches global commands", async () => {
    const onCommand = vi.fn();
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(
      <AppRail
        surface="chat"
        onNavigate={onNavigate}
        onCommand={onCommand}
        onAllProjects={vi.fn()}
        onOpenProject={vi.fn()}
        onNew={vi.fn()}
        projectRoot="/test"
      />
    );

    const docsBtn = screen.getByRole("button", { name: "Documentation and guides" });
    const searchBtn = screen.getByRole("button", { name: "Search or command" });
    const usageBtn = screen.getByRole("button", { name: "Usage and limits" });
    const settingsBtn = screen.getByRole("button", { name: "Settings" });

    expect(docsBtn).toBeInTheDocument();
    expect(searchBtn).toBeInTheDocument();
    expect(usageBtn).toBeInTheDocument();
    expect(settingsBtn).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Appearance" })).not.toBeInTheDocument();

    await user.click(docsBtn);
    expect(onCommand).toHaveBeenCalledWith("docs");

    await user.click(searchBtn);
    expect(onCommand).toHaveBeenCalledWith("command-palette");

    await user.click(usageBtn);
    expect(onCommand).toHaveBeenCalledWith("usage");

    await user.click(settingsBtn);
    expect(onCommand).toHaveBeenCalledWith("settings");
  });

  it("splits global surfaces from the project tools it scopes", () => {
    render(
      <AppRail
        surface="chat"
        onNavigate={vi.fn()}
        onCommand={vi.fn()}
        onAllProjects={vi.fn()}
        onOpenProject={vi.fn()}
        onNew={vi.fn()}
        projectName="barkcli"
        projectRoot="/work/barkcli"
        projectReady
      />
    );

    const globalNav = screen.getByRole("navigation", { name: "App destinations" });
    expect(within(globalNav).getByRole("button", { name: "Build" })).toBeInTheDocument();
    expect(within(globalNav).getByRole("button", { name: "Review" })).toBeInTheDocument();
    // Projects is a destination like any other, so it is customizable too.
    expect(within(globalNav).getByRole("button", { name: "Projects" })).toBeInTheDocument();
    // Project tools live in their own group, next to the project switcher.
    expect(within(globalNav).queryByRole("button", { name: "Board" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Project surfaces" })).toBeInTheDocument();
    expect(screen.getByTitle("barkcli — switch project")).toBeInTheDocument();
  });
});
