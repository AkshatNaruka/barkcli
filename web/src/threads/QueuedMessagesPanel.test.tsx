import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueuedMessagesPanel, type QueuedMessage } from "./QueuedMessagesPanel";

describe("QueuedMessagesPanel", () => {
  const sampleMessages: QueuedMessage[] = [
    {
      id: "q-1",
      text: "combine board and specs if possible , as we dont want extra specs tab",
      createdAt: new Date().toISOString(),
    },
    {
      id: "q-2",
      text: "add proper modern highly used charts library for analytics",
      createdAt: new Date().toISOString(),
    },
  ];

  it("renders queued messages with badge count and helper text", () => {
    render(
      <QueuedMessagesPanel
        messages={sampleMessages}
        onSendNow={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("Queued Messages")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Sends after agent finishes working")).toBeInTheDocument();
    expect(screen.getByText(/combine board and specs/i)).toBeInTheDocument();
    expect(screen.getByText(/add proper modern highly used charts/i)).toBeInTheDocument();
  });

  it("invokes sendNow, edit, and delete callbacks", () => {
    const onSendNow = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <QueuedMessagesPanel
        messages={[sampleMessages[0]]}
        onSendNow={onSendNow}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByLabelText("Send queued message now"));
    expect(onSendNow).toHaveBeenCalledWith("q-1");

    fireEvent.click(screen.getByLabelText("Edit queued message"));
    expect(onEdit).toHaveBeenCalledWith("q-1");

    fireEvent.click(screen.getByLabelText("Remove queued message"));
    expect(onDelete).toHaveBeenCalledWith("q-1");
  });

  it("collapses and expands when clicking the header", () => {
    render(
      <QueuedMessagesPanel
        messages={[sampleMessages[0]]}
        onSendNow={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText(/combine board and specs/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Queued Messages"));
    expect(screen.queryByText(/combine board and specs/i)).not.toBeInTheDocument();
  });
});
