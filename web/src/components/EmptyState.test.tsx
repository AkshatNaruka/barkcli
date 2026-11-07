import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState title="Nothing here" description="Add something to begin." />);
    expect(screen.getByText("Nothing here")).toBeDefined();
    expect(screen.getByText("Add something to begin.")).toBeDefined();
  });

  it("renders action button and calls handler", () => {
    const onClick = vi.fn();
    render(<EmptyState title="Empty" actionLabel="Create" onAction={onClick} />);
    const btn = screen.getByRole("button", { name: "Create" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it("renders hint and compact mode", () => {
    render(<EmptyState title="Empty" hint="Tip" compact />);
    expect(screen.getByText("Tip")).toBeDefined();
  });

  it("has polite live region", () => {
    render(<EmptyState title="Empty" />);
    const node = screen.getByRole("status");
    expect(node.getAttribute("aria-live")).toBe("polite");
  });
});