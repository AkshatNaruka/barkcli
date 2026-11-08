import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GlobalSettingsModal } from "./GlobalSettingsModal";
import { GlobalUsageModal } from "./GlobalUsageModal";
import { GlobalDocsModal } from "./GlobalDocsModal";

vi.mock("./SettingsView", () => ({
  SettingsView: () => <div data-testid="settings-view">Settings View Mock</div>,
}));

vi.mock("./UsageView", () => ({
  UsageView: () => <div data-testid="usage-view">Usage View Mock</div>,
}));

vi.mock("./DocsView", () => ({
  DocsView: () => <div data-testid="docs-view">Docs View Mock</div>,
}));

describe("Global modals", () => {
  it("renders GlobalSettingsModal when open and fires onClose on close button click", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<GlobalSettingsModal open={false} onClose={onClose} />);
    expect(screen.queryByTestId("settings-view")).toBeNull();

    rerender(<GlobalSettingsModal open={true} onClose={onClose} />);
    expect(screen.getByTestId("settings-view")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: "Close" });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders GlobalUsageModal when open and fires onClose on close button click", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<GlobalUsageModal open={false} onClose={onClose} />);
    expect(screen.queryByTestId("usage-view")).toBeNull();

    rerender(<GlobalUsageModal open={true} onClose={onClose} />);
    expect(screen.getByTestId("usage-view")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Usage & Limits" })).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: "Close" });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders GlobalDocsModal when open and fires onClose on close button click", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<GlobalDocsModal open={false} onClose={onClose} />);
    expect(screen.queryByTestId("docs-view")).toBeNull();

    rerender(<GlobalDocsModal open={true} onClose={onClose} />);
    expect(screen.getByTestId("docs-view")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Documentation & Guides" })).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: "Close" });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
