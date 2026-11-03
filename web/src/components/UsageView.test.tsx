import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { UsageView } from "./UsageView";
import * as api from "../lib/api";

describe("UsageView", () => {
  it("renders header, summary cards, and provider headroom", async () => {
    await act(async () => {
      render(<UsageView />);
    });

    // Header
    expect(screen.getByRole("heading", { name: "Usage & Limits" })).toBeInTheDocument();
    expect(screen.getByText(/Global token consumption, cache savings/i)).toBeInTheDocument();

    // Summary cards
    expect(screen.getAllByText("Total Tokens")[0]).toBeInTheDocument();
    expect(screen.getByText("Cache Savings")).toBeInTheDocument();
    expect(screen.getByText("Estimated Cost")).toBeInTheDocument();
    expect(screen.getByText("Agent Activity")).toBeInTheDocument();

    // Provider limits
    expect(screen.getByText("Provider Limits & Headroom")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("OpenCode")).toBeInTheDocument();
  });

  it("toggles metric between tokens and cost", async () => {
    await act(async () => {
      render(<UsageView />);
    });
    const tokensBtn = screen.getAllByRole("button", { name: "Tokens" })[0];
    const costBtn = screen.getByRole("button", { name: "Cost ($)" });

    expect(tokensBtn).toBeInTheDocument();
    expect(costBtn).toBeInTheDocument();

    // Click Cost
    await act(async () => {
      fireEvent.click(costBtn);
    });
    expect(screen.getByText(/Cost Distribution/i)).toBeInTheDocument();
    expect(screen.getByText(/Standard API rate/i)).toBeInTheDocument();

    // Click Tokens back
    await act(async () => {
      fireEvent.click(tokensBtn);
    });
    expect(screen.getByText(/Token Distribution/i)).toBeInTheDocument();
    expect(screen.getByText(/Cache Read/i)).toBeInTheDocument();
  });

  it("switches time window filter", async () => {
    const fetchSpy = vi.spyOn(api, "fetchUsage");
    await act(async () => {
      render(<UsageView />);
    });

    const btn7d = screen.getByRole("button", { name: "7d" });
    await act(async () => {
      fireEvent.click(btn7d);
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("7d");
    });
  });

  it("filters models table via search query", async () => {
    await act(async () => {
      render(<UsageView />);
    });

    expect(screen.getByText("claude-3-7-sonnet")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Filter models or providers…/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "deepseek" } });
    });

    expect(screen.getByText("deepseek-coder")).toBeInTheDocument();
    expect(screen.queryByText("gpt-4o")).not.toBeInTheDocument();
  });

  it("toggles the Model Prices drawer", async () => {
    await act(async () => {
      render(<UsageView />);
    });

    const pricesBtn = screen.getByRole("button", { name: "Model Prices" });
    await act(async () => {
      fireEvent.click(pricesBtn);
    });

    expect(screen.getByText("Custom Model Price Overrides")).toBeInTheDocument();
    expect(screen.getByText(/\$3\.00\/M in · \$15\.00\/M out/)).toBeInTheDocument();
  });
});
