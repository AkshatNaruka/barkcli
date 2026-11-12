import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { buildAnswers, type PendingQuestion, type QuestionPrompt } from "../lib/threadQuestions";

interface Draft {
  selected: string[];
  custom: string;
  customOn: boolean;
}

const RECOMMENDED = /\(recommended\)/i;

function emptyDraft(): Draft {
  return { selected: [], custom: "", customOn: false };
}

function isRecommended(label: string): boolean {
  return RECOMMENDED.test(label);
}

/**
 * The in-thread question dock.
 *
 * A question is not a modal: the agent's reply stays readable above it and the
 * composer keeps working. One tab per question, options in the order the agent
 * recommended them, and a free-form answer that never fights the picked ones.
 */
export function QuestionDock({
  question,
  busy = false,
  error,
  onSubmit,
  onDismiss,
}: {
  question: PendingQuestion;
  busy?: boolean;
  error?: string | null;
  onSubmit: (payload: {
    answers?: string[][];
    secrets?: Array<{ key: string; value: string }>;
  }) => Promise<void> | void;
  onDismiss?: () => void;
}) {
  const [tab, setTab] = useState(0);
  const [drafts, setDrafts] = useState<Draft[]>(() => question.questions.map(emptyDraft));
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTab(0);
    setDrafts(question.questions.map(emptyDraft));
    setSecrets({});
    setRevealed({});
    setLocalError(null);
  }, [question.eventId, question.questions.length]);

  // A question replaces the composer as the next thing the user must do, so it
  // takes focus: number keys pick an option and ⌘↵ sends without a click.
  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, [question.eventId]);

  const active = question.questions[tab];
  const answers = useMemo(() => buildAnswers(question.questions, drafts), [question.questions, drafts]);
  const questionsReady =
    question.kind === "secret" ||
    question.questions.every((_, index) => (answers[index] || []).length > 0);
  const secretsReady =
    question.kind !== "secret" ||
    question.secrets.every((item) => (secrets[item.key] || "").trim().length > 0);
  const canSubmit = !busy && questionsReady && secretsReady;

  const patchDraft = (index: number, patch: Partial<Draft>) => {
    setDrafts((current) =>
      current.map((draft, position) => (position === index ? { ...draft, ...patch } : draft))
    );
  };

  const pick = (prompt: QuestionPrompt, index: number, label: string) => {
    const draft = drafts[index] || emptyDraft();
    if (prompt.multiple) {
      const selected = draft.selected.includes(label)
        ? draft.selected.filter((item) => item !== label)
        : [...draft.selected, label];
      patchDraft(index, { selected });
      return;
    }
    patchDraft(index, { selected: draft.selected.includes(label) ? [] : [label] });
  };

  const submit = async () => {
    if (!canSubmit) {
      setLocalError(
        question.kind === "secret"
          ? "Enter a value for every credential."
          : "Answer each question before sending."
      );
      return;
    }
    setLocalError(null);
    if (question.kind === "secret") {
      await onSubmit({
        secrets: question.secrets.map((item) => ({
          key: item.key,
          value: (secrets[item.key] || "").trim(),
        })),
      });
      return;
    }
    await onSubmit({ answers });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
      return;
    }
    if (typing) return;
    if (question.kind === "question" && /^[1-9]$/.test(event.key)) {
      const option = active?.options[Number(event.key) - 1];
      if (option) {
        event.preventDefault();
        pick(active, tab, option.label);
      }
    }
  };

  const remaining = question.questions.filter((_, index) => (answers[index] || []).length === 0).length;

  return (
    <div
      ref={containerRef}
      className="question-dock"
      role="group"
      aria-label="Agent question"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="question-dock-head">
        <div className="flex min-w-0 items-center gap-2">
          <span className="question-dock-icon" aria-hidden="true">
            <Icon name={question.kind === "secret" ? "key" : "comment"} size={14} />
          </span>
          <div className="min-w-0">
            <strong className="question-dock-title">
              {question.kind === "secret" ? "Credential needed" : "Agent question"}
            </strong>
            <p className="question-dock-subtitle">{question.title}</p>
          </div>
        </div>
        {onDismiss ? (
          <button
            type="button"
            className="bark-icon-button shrink-0"
            onClick={onDismiss}
            aria-label="Dismiss question"
            title="Dismiss (the question stays in the thread)"
          >
            <Icon name="x" size={12} />
          </button>
        ) : null}
      </div>

      {question.kind === "question" && question.questions.length > 1 ? (
        <div className="question-dock-tabs" role="tablist" aria-label="Questions">
          {question.questions.map((prompt, index) => {
            const done = (answers[index] || []).length > 0;
            return (
              <button
                key={`${prompt.header}:${index}`}
                type="button"
                role="tab"
                aria-selected={tab === index}
                aria-controls={`question-panel-${index}`}
                className={`question-dock-tab ${tab === index ? "is-active" : ""} ${done ? "is-done" : ""}`}
                onClick={() => setTab(index)}
              >
                <span className="truncate">{prompt.header}</span>
                {done ? <Icon name="check" size={11} className="shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {question.kind === "secret" ? (
        <div className="question-dock-body">
          {question.secrets.map((item) => (
            <label key={item.key} className="question-dock-field">
              <span className="question-dock-field-label">
                {item.label}
                <code className="question-dock-key">{item.key}</code>
              </span>
              {item.reason ? <span className="question-dock-hint">{item.reason}</span> : null}
              <div className="question-dock-secret">
                <input
                  type={revealed[item.key] ? "text" : "password"}
                  value={secrets[item.key] || ""}
                  onChange={(event) =>
                    setSecrets((current) => ({ ...current, [item.key]: event.target.value }))
                  }
                  placeholder={item.hint || "Paste the value"}
                  autoComplete="off"
                  spellCheck={false}
                  className="bark-input font-mono text-xs"
                  aria-label={item.label}
                />
                <button
                  type="button"
                  className="bark-button text-xs px-2.5 py-1.5"
                  onClick={() =>
                    setRevealed((current) => ({ ...current, [item.key]: !current[item.key] }))
                  }
                  title={revealed[item.key] ? "Hide value" : "Reveal value"}
                  aria-label={revealed[item.key] ? "Hide value" : "Reveal value"}
                >
                  <Icon name={revealed[item.key] ? "eyeOff" : "eye"} size={13} />
                </button>
              </div>
            </label>
          ))}
          <p className="question-dock-note">
            Saved to this machine's settings and injected into the agent's environment. The value is
            never written to the thread or sent to the model.
          </p>
        </div>
      ) : active ? (
        <div className="question-dock-body" id={`question-panel-${tab}`} role="tabpanel">
          <p className="question-dock-question">{active.question}</p>
          {active.multiple ? (
            <span className="question-dock-meta">Select all that apply</span>
          ) : null}
          <div className="question-dock-options" role="listbox" aria-multiselectable={active.multiple}>
            {active.options.map((option, optionIndex) => {
              const draft = drafts[tab] || emptyDraft();
              const picked = draft.selected.includes(option.label);
              return (
                <button
                  key={option.label}
                  type="button"
                  role="option"
                  aria-selected={picked}
                  className={`question-dock-option ${picked ? "is-picked" : ""} ${
                    isRecommended(option.label) && !picked ? "is-recommended" : ""
                  }`}
                  onClick={() => pick(active, tab, option.label)}
                >
                  <span className="question-dock-option-index" aria-hidden="true">
                    {optionIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="question-dock-option-label">{option.label}</span>
                    {option.description ? (
                      <span className="question-dock-option-desc">{option.description}</span>
                    ) : null}
                  </span>
                  <span className={`question-dock-check ${picked ? "is-on" : ""}`} aria-hidden="true">
                    {picked ? <Icon name="check" size={11} /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="question-dock-custom">
            <button
              type="button"
              className={`question-dock-custom-toggle ${drafts[tab]?.customOn ? "is-on" : ""}`}
              aria-pressed={Boolean(drafts[tab]?.customOn)}
              onClick={() => patchDraft(tab, { customOn: !drafts[tab]?.customOn })}
            >
              <span className={`question-dock-check ${drafts[tab]?.customOn ? "is-on" : ""}`} aria-hidden="true">
                {drafts[tab]?.customOn ? <Icon name="check" size={11} /> : null}
              </span>
              Type your own answer
            </button>
            {drafts[tab]?.customOn ? (
              <input
                autoFocus
                value={drafts[tab]?.custom || ""}
                onChange={(event) => patchDraft(tab, { custom: event.target.value })}
                placeholder="Your answer…"
                className="bark-input text-xs"
                aria-label="Your own answer"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {(localError || error) && (
        <p className="question-dock-error" role="alert">
          {localError || error}
        </p>
      )}

      <div className="question-dock-foot">
        <span className="question-dock-progress">
          {question.kind === "secret"
            ? `${question.secrets.length} credential${question.secrets.length === 1 ? "" : "s"}`
            : remaining > 0
              ? `${remaining} of ${question.questions.length} unanswered`
              : "Ready to send"}
        </span>
        <div className="flex items-center gap-2">
          {onDismiss ? (
            <button type="button" className="bark-button text-xs" onClick={onDismiss} disabled={busy}>
              Skip
            </button>
          ) : null}
          {question.kind === "question" && question.questions.length > 1 && tab < question.questions.length - 1 ? (
            <button
              type="button"
              className="bark-button text-xs"
              onClick={() => setTab((current) => Math.min(current + 1, question.questions.length - 1))}
              disabled={busy}
            >
              Next
            </button>
          ) : null}
          <button
            type="button"
            className="bark-primary text-xs"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {busy ? "Sending…" : "Send answer"}
          </button>
        </div>
      </div>
    </div>
  );
}
