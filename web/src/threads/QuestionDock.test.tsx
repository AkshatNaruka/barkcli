import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionDock } from "./QuestionDock";
import type { PendingQuestion } from "../lib/threadQuestions";

function singleChoice(): PendingQuestion {
  return {
    eventId: "q1",
    kind: "question",
    questions: [
      {
        header: "Scope",
        question: "Which packages should change?",
        options: [
          { label: "web (Recommended)", description: "Only the web app" },
          { label: "all", description: "Every package" },
        ],
        multiple: false,
      },
    ],
    secrets: [],
    title: "Which packages should change?",
  };
}

function multiSelect(): PendingQuestion {
  return {
    eventId: "q2",
    kind: "question",
    questions: [
      {
        header: "Targets",
        question: "Which targets?",
        options: [
          { label: "web" },
          { label: "api" },
        ],
        multiple: true,
      },
      {
        header: "When",
        question: "Ship now?",
        options: [
          { label: "now (Recommended)", description: "Merge today" },
          { label: "later" },
        ],
        multiple: false,
      },
    ],
    secrets: [],
    title: "Which targets? (+1 more)",
  };
}

function secretRequest(): PendingQuestion {
  return {
    eventId: "s1",
    kind: "secret",
    questions: [],
    secrets: [
      { key: "OPENAI_API_KEY", label: "OpenAI API key", hint: "sk-…", reason: "Needed to run the model" },
    ],
    title: "OPENAI_API_KEY",
  };
}

describe("QuestionDock", () => {
  it("renders options in order with the recommended one first", () => {
    render(<QuestionDock question={singleChoice()} onSubmit={() => {}} />);

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining("web (Recommended)"),
      expect.stringContaining("all"),
    ]);
    expect(options[0].className).toContain("is-recommended");
    expect(screen.getByText("Only the web app")).toBeTruthy();
    expect(screen.getByText("1 of 1 unanswered")).toBeTruthy();
  });

  it("keeps sending disabled until every question is answered", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<QuestionDock question={multiSelect()} onSubmit={onSubmit} />);

    const send = screen.getByRole("button", { name: /send answer/i });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("option", { name: /web/ }));
    await user.click(screen.getByRole("option", { name: /api/ }));
    expect((send as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("tab", { name: /when/i }));
    await user.click(screen.getByRole("option", { name: /now/ }));
    expect(screen.getByText("Ready to send")).toBeTruthy();
    expect((send as HTMLButtonElement).disabled).toBe(false);

    await user.click(send);
    expect(onSubmit).toHaveBeenCalledWith({ answers: [["web", "api"], ["now (Recommended)"]] });
  });

  it("lets a keyboard number pick an option", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<QuestionDock question={singleChoice()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("group", { name: /agent question/i }));
    await user.keyboard("2");

    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
  });

  it("toggles a multi-select option off again", async () => {
    const user = userEvent.setup();
    render(<QuestionDock question={multiSelect()} onSubmit={() => {}} />);

    const web = screen.getByRole("option", { name: /web/ });
    await user.click(web);
    expect(web.getAttribute("aria-selected")).toBe("true");
    await user.click(web);
    expect(web.getAttribute("aria-selected")).toBe("false");
  });

  it("submits a typed answer that the agent did not offer", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<QuestionDock question={singleChoice()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /type your own answer/i }));
    await user.type(screen.getByLabelText(/your own answer/i), "only the docs");
    await user.click(screen.getByRole("button", { name: /send answer/i }));

    expect(onSubmit).toHaveBeenCalledWith({ answers: [["only the docs"]] });
  });

  it("sends credentials without echoing them back to the caller", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<QuestionDock question={secretRequest()} onSubmit={onSubmit} />);

    const input = screen.getByLabelText("OpenAI API key");
    expect(input.getAttribute("type")).toBe("password");
    expect(screen.getByText(/never written to the thread/i)).toBeTruthy();

    await user.type(input, "  sk-test-value  ");
    await user.click(screen.getByRole("button", { name: /reveal value/i }));
    expect(screen.getByLabelText("OpenAI API key").getAttribute("type")).toBe("text");

    await user.click(screen.getByRole("button", { name: /send answer/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      secrets: [{ key: "OPENAI_API_KEY", value: "sk-test-value" }],
    });
  });

  it("does not submit while a credential is empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<QuestionDock question={secretRequest()} onSubmit={onSubmit} />);

    const send = screen.getByRole("button", { name: /send answer/i });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await user.click(send);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("skips without answering", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const onSubmit = vi.fn();
    render(<QuestionDock question={singleChoice()} onSubmit={onSubmit} onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: /^skip$/i }));
    expect(onDismiss).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows an error and stays open when the server rejects the answer", () => {
    render(
      <QuestionDock
        question={singleChoice()}
        onSubmit={() => {}}
        error="Could not send that answer."
      />
    );
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(/could not send that answer/i)).toBeTruthy();
  });

  it("switches to the next question with the Next button", async () => {
    const user = userEvent.setup();
    render(<QuestionDock question={multiSelect()} onSubmit={() => {}} />);

    expect(screen.getByText("Which targets?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByText("Ship now?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^next$/i })).toBeNull();
  });
});
