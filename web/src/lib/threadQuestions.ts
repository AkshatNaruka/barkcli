import type { ThreadEvent } from "./types";

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionPrompt {
  header: string;
  question: string;
  options: QuestionOption[];
  multiple: boolean;
}

export interface SecretRequest {
  key: string;
  label: string;
  hint?: string;
  reason?: string;
}

export interface PendingQuestion {
  eventId: string;
  kind: "question" | "secret";
  questions: QuestionPrompt[];
  secrets: SecretRequest[];
  /** One-line summary shown in the dock header. */
  title: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeOptions(value: unknown): QuestionOption[] {
  if (!Array.isArray(value)) return [];
  const out: QuestionOption[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const label = item.trim();
      if (label) out.push({ label });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const label = asString((item as QuestionOption).label).trim();
    if (!label) continue;
    out.push({ label, description: asString((item as QuestionOption).description).trim() || undefined });
  }
  return out;
}

function normalizeQuestions(value: unknown): QuestionPrompt[] {
  if (!Array.isArray(value)) return [];
  const out: QuestionPrompt[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const question = asString((item as QuestionPrompt).question).trim();
    if (!question) continue;
    out.push({
      header: asString((item as QuestionPrompt).header).trim() || `Question ${out.length + 1}`,
      question,
      options: normalizeOptions((item as QuestionPrompt).options),
      multiple: (item as QuestionPrompt).multiple === true,
    });
  }
  return out;
}

function normalizeSecrets(value: unknown): SecretRequest[] {
  if (!Array.isArray(value)) return [];
  const out: SecretRequest[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const key = asString((item as SecretRequest).key).trim();
    if (!key) continue;
    out.push({
      key,
      label: asString((item as SecretRequest).label).trim() || key,
      hint: asString((item as SecretRequest).hint).trim() || undefined,
      reason: asString((item as SecretRequest).reason).trim() || undefined,
    });
  }
  return out;
}

/** Ids of question events that already have an `answer` reply. */
export function answeredQuestionIds(events: ThreadEvent[]): Set<string> {
  const answered = new Set<string>();
  for (const event of events) {
    if (event.kind === "answer" && event.parent_event_id) {
      answered.add(event.parent_event_id);
    }
  }
  return answered;
}

/**
 * The newest question that still needs the user. Questions are append-only, so
 * "pending" means: no `answer` event points at it yet.
 */
export function pendingQuestion(events: ThreadEvent[]): PendingQuestion | null {
  const answered = answeredQuestionIds(events);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind !== "question") continue;
    if (answered.has(event.id)) continue;
    const data = event.data || {};
    if (data.pending === false) continue;
    if (data.kind === "secret") {
      const secrets = normalizeSecrets(data.secrets);
      if (secrets.length === 0) continue;
      return {
        eventId: event.id,
        kind: "secret",
        questions: [],
        secrets,
        title: secrets.map((item) => item.key).join(", "),
      };
    }
    const questions = normalizeQuestions(data.questions);
    if (questions.length === 0) continue;
    return {
      eventId: event.id,
      kind: "question",
      questions,
      secrets: [],
      title:
        questions.length === 1
          ? questions[0].question
          : `${questions[0].question} (+${questions.length - 1} more)`,
    };
  }
  return null;
}

/** True when a question has options, so the dock can show numbered choices. */
export function hasOptions(question: QuestionPrompt): boolean {
  return question.options.length > 0;
}

/**
 * One answer per question, in ask order. Typed text and picked options are
 * merged by the server; credentials are sent separately so they are never
 * confused with a normal answer.
 */
export function buildAnswers(
  questions: QuestionPrompt[],
  drafts: Array<{ selected: string[]; custom: string; customOn: boolean }>
): string[][] {
  return questions.map((question, index) => {
    const draft = drafts[index];
    if (!draft) return [];
    const values = [...draft.selected];
    const custom = draft.custom.trim();
    if (draft.customOn && custom) values.push(custom);
    else if (!question.multiple && custom && values.length === 0) values.push(custom);
    return values.filter(Boolean);
  });
}
