import { describe, expect, it } from "vitest";
import type { ThreadEvent } from "./types";
import {
  answeredQuestionIds,
  buildAnswers,
  hasOptions,
  pendingQuestion,
} from "./threadQuestions";

function event(overrides: Partial<ThreadEvent> & Pick<ThreadEvent, "id" | "kind">): ThreadEvent {
  return {
    card_id: "card-1",
    author: "opencode",
    text: "",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const questionData = {
  kind: "question",
  pending: true,
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
};

describe("answeredQuestionIds", () => {
  it("collects parents of answer events", () => {
    const ids = answeredQuestionIds([
      event({ id: "q1", kind: "question" }),
      event({ id: "a1", kind: "answer", parent_event_id: "q1" }),
      event({ id: "a2", kind: "answer" }),
    ]);
    expect([...ids]).toEqual(["q1"]);
  });
});

describe("pendingQuestion", () => {
  it("returns null when the thread has no question", () => {
    expect(pendingQuestion([event({ id: "u1", kind: "user", text: "hi" })])).toBeNull();
  });

  it("returns the newest unanswered question with normalized content", () => {
    const pending = pendingQuestion([
      event({ id: "q1", kind: "question", data: questionData }),
      event({ id: "a1", kind: "answer", parent_event_id: "q1", text: "web" }),
      event({
        id: "q2",
        kind: "question",
        data: {
          kind: "question",
          pending: true,
          questions: [
            {
              header: "",
              question: "  Ship it?  ",
              options: ["yes", { label: "no", description: "  " }],
            },
          ],
        },
      }),
    ]);

    expect(pending).not.toBeNull();
    expect(pending!.eventId).toBe("q2");
    expect(pending!.kind).toBe("question");
    expect(pending!.questions).toHaveLength(1);
    expect(pending!.questions[0].question).toBe("Ship it?");
    expect(pending!.questions[0].header).toBe("Question 1");
    expect(pending!.questions[0].options.map((option) => option.label)).toEqual(["yes", "no"]);
    expect(pending!.questions[0].options[1].description).toBeUndefined();
    expect(pending!.title).toBe("Ship it?");
  });

  it("ignores a question that was explicitly marked resolved", () => {
    const pending = pendingQuestion([
      event({
        id: "q1",
        kind: "question",
        data: { ...questionData, pending: false },
      }),
    ]);
    expect(pending).toBeNull();
  });

  it("summarizes multiple questions with a count", () => {
    const pending = pendingQuestion([
      event({
        id: "q1",
        kind: "question",
        data: {
          kind: "question",
          questions: [
            { header: "A", question: "First?", options: [{ label: "x" }] },
            { header: "B", question: "Second?", options: [{ label: "y" }] },
          ],
        },
      }),
    ]);
    expect(pending!.title).toBe("First? (+1 more)");
  });

  it("returns credential requests with their keys", () => {
    const pending = pendingQuestion([
      event({
        id: "s1",
        kind: "question",
        data: {
          kind: "secret",
          pending: true,
          secrets: [
            { key: "OPENAI_API_KEY", label: "OpenAI", hint: "sk-…", reason: "Needs the model" },
            { key: "  ", label: "bogus" },
          ],
        },
      }),
    ]);

    expect(pending).not.toBeNull();
    expect(pending!.kind).toBe("secret");
    expect(pending!.secrets).toHaveLength(1);
    expect(pending!.secrets[0]).toEqual({
      key: "OPENAI_API_KEY",
      label: "OpenAI",
      hint: "sk-…",
      reason: "Needs the model",
    });
    expect(pending!.title).toBe("OPENAI_API_KEY");
  });

  it("skips a question whose payload has no usable content", () => {
    const pending = pendingQuestion([
      event({ id: "q0", kind: "question", data: { kind: "question", questions: [] } }),
      event({ id: "q1", kind: "question", data: questionData }),
    ]);
    expect(pending!.eventId).toBe("q1");
  });

  it("labels a credential with its key when no label is supplied", () => {
    const pending = pendingQuestion([
      event({
        id: "s1",
        kind: "question",
        data: { kind: "secret", secrets: [{ key: "GEMINI_API_KEY" }] },
      }),
    ]);
    expect(pending!.secrets[0].label).toBe("GEMINI_API_KEY");
  });
});

describe("hasOptions", () => {
  it("distinguishes options from free-form questions", () => {
    expect(
      hasOptions({ header: "A", question: "q", options: [{ label: "x" }], multiple: false })
    ).toBe(true);
    expect(hasOptions({ header: "A", question: "q", options: [], multiple: false })).toBe(false);
  });
});

describe("buildAnswers", () => {
  const questions = [
    { header: "One", question: "Single?", options: [{ label: "a" }], multiple: false },
    { header: "Two", question: "Many?", options: [{ label: "b" }], multiple: true },
  ];

  it("keeps picked options in ask order", () => {
    const answers = buildAnswers(questions, [
      { selected: ["a"], custom: "", customOn: false },
      { selected: ["b"], custom: "", customOn: false },
    ]);
    expect(answers).toEqual([["a"], ["b"]]);
  });

  it("appends a typed answer when the custom toggle is on", () => {
    const answers = buildAnswers(questions, [
      { selected: ["a"], custom: "  and c  ", customOn: true },
      { selected: [], custom: "", customOn: false },
    ]);
    expect(answers[0]).toEqual(["a", "and c"]);
  });

  it("uses a typed answer alone for a single-choice question", () => {
    const answers = buildAnswers(questions, [
      { selected: [], custom: "something else", customOn: false },
      { selected: [], custom: "", customOn: false },
    ]);
    expect(answers[0]).toEqual(["something else"]);
  });

  it("ignores the custom text for multi-select when the toggle is off", () => {
    const answers = buildAnswers(questions, [
      { selected: [], custom: "", customOn: false },
      { selected: ["b"], custom: "stray", customOn: false },
    ]);
    expect(answers[1]).toEqual(["b"]);
  });

  it("returns an empty answer for a missing draft", () => {
    expect(buildAnswers(questions, [])).toEqual([[], []]);
  });
});
