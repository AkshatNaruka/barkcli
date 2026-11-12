//! Structured questions from an agent, in the middle of a thread turn.
//!
//! Provider CLIs are spawned headless, so they cannot open a prompt. Instead
//! every chat/build prompt tells the agent to end its turn with one fenced
//! block when it is blocked on a decision or a missing credential:
//!
//! ```text
//! ```bark-question
//! {"questions":[{"header":"Scope","question":"Which package?","options":[{"label":"web","description":"…"}]}]}
//! ```
//! ```
//!
//! The server lifts that block out of the reply, records a `question` thread
//! event with the structured payload, and the thread dock asks the user. The
//! answer is written back as a normal follow-up turn, which keeps the design
//! provider-agnostic and resumable: nothing is lost if the app is closed while
//! the question is open.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const QUESTION_FENCE: &str = "bark-question";
pub const SECRET_FENCE: &str = "bark-secret";

const MAX_QUESTIONS: usize = 6;
const MAX_OPTIONS: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
    pub label: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuestionPrompt {
    #[serde(default)]
    pub header: String,
    pub question: String,
    #[serde(default)]
    pub options: Vec<QuestionOption>,
    #[serde(default)]
    pub multiple: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SecretRequest {
    pub key: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub hint: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QuestionRequest {
    Questions(Vec<QuestionPrompt>),
    Secrets(Vec<SecretRequest>),
}

impl QuestionRequest {
    /// Payload stored on the `question` thread event. `kind` and `pending` are
    /// what the thread dock keys off; `questions`/`secrets` are the content.
    pub fn payload(&self) -> Value {
        match self {
            Self::Questions(questions) => serde_json::json!({
                "kind": "question",
                "source": "agent",
                "pending": true,
                "questions": questions,
            }),
            Self::Secrets(secrets) => serde_json::json!({
                "kind": "secret",
                "source": "agent",
                "pending": true,
                "secrets": secrets,
            }),
        }
    }

    /// One-line description for the thread event body and the inbox preview.
    pub fn summary(&self) -> String {
        match self {
            Self::Questions(questions) => {
                let first = questions
                    .first()
                    .map(|item| item.question.trim())
                    .unwrap_or_default();
                if questions.len() <= 1 {
                    first.to_string()
                } else {
                    format!("{first} (+{} more)", questions.len() - 1)
                }
            }
            Self::Secrets(secrets) => {
                let keys: Vec<&str> = secrets.iter().map(|item| item.key.as_str()).collect();
                format!("Needs credentials: {}", keys.join(", "))
            }
        }
    }

    pub fn is_empty(&self) -> bool {
        match self {
            Self::Questions(items) => items.is_empty(),
            Self::Secrets(items) => items.is_empty(),
        }
    }
}

/// True when the buffer may contain (or is still receiving) a question block.
/// Streaming deltas stop being shown at that point so raw JSON never flashes
/// in the transcript.
pub fn contains_marker(buffer: &str) -> bool {
    buffer.contains("```bark-") || buffer.contains("<bark-")
}

/// Split an agent reply into `(visible text, question request)`.
///
/// A malformed block is left in the visible text: swallowing an agent's reply
/// because its JSON was invalid would be worse than showing the raw block.
pub fn extract(text: &str) -> (String, Option<QuestionRequest>) {
    let mut visible = text.to_string();
    let mut found: Option<QuestionRequest> = None;

    for fence in [QUESTION_FENCE, SECRET_FENCE] {
        while let Some((start, end, body)) = find_fenced(&visible, fence) {
            if let Some(request) = parse_body(fence, &body) {
                if !request.is_empty() {
                    if found.is_none() {
                        found = Some(request);
                    }
                    visible.replace_range(start..end, "");
                    continue;
                }
            }
            break;
        }
        // Tag form: <bark-question>…</bark-question>
        let open = format!("<{fence}>");
        let close = format!("</{fence}>");
        if let Some(start) = visible.find(&open) {
            if let Some(relative) = visible[start + open.len()..].find(&close) {
                let body_start = start + open.len();
                let body_end = body_start + relative;
                let end = body_end + close.len();
                if let Some(request) = parse_body(fence, &visible[body_start..body_end]) {
                    if !request.is_empty() {
                        if found.is_none() {
                            found = Some(request);
                        }
                        visible.replace_range(start..end, "");
                    }
                }
            }
        }
    }

    let visible = visible.trim_end().to_string();
    (visible, found)
}

/// `start..end` covers the whole fenced block, `body` is the JSON inside it.
fn find_fenced(text: &str, fence: &str) -> Option<(usize, usize, String)> {
    let opener = format!("```{fence}");
    let start = text.find(&opener)?;
    let after_opener = start + opener.len();
    // The opener line may carry a trailing attribute; the JSON starts on the
    // next line inside the fence.
    let body_start = text[after_opener..]
        .find('\n')
        .map(|offset| after_opener + offset + 1)?;
    let closing = text[body_start..].find("```")?;
    let body_end = body_start + closing;
    let end = body_end + 3;
    Some((start, end, text[body_start..body_end].to_string()))
}

fn parse_body(fence: &str, body: &str) -> Option<QuestionRequest> {
    let value: Value = serde_json::from_str(body.trim()).ok()?;
    if fence == SECRET_FENCE {
        let secrets: Vec<SecretRequest> = serde_json::from_value(
            value.get("secrets").cloned().or_else(|| value.get("keys").cloned())?,
        )
        .ok()?;
        return Some(QuestionRequest::Secrets(normalize_secrets(secrets)));
    }

    let raw = value.get("questions").cloned()?;
    let questions: Vec<QuestionPrompt> = serde_json::from_value(raw).ok()?;
    Some(QuestionRequest::Questions(normalize_questions(questions)))
}

fn normalize_questions(questions: Vec<QuestionPrompt>) -> Vec<QuestionPrompt> {
    let mut out = Vec::new();
    for item in questions.into_iter().take(MAX_QUESTIONS) {
        let question = item.question.trim().to_string();
        if question.is_empty() {
            continue;
        }
        let mut options: Vec<QuestionOption> = Vec::new();
        for option in item.options.into_iter().take(MAX_OPTIONS) {
            let label = option.label.trim().to_string();
            if label.is_empty() || options.iter().any(|existing| existing.label == label) {
                continue;
            }
            options.push(QuestionOption {
                label,
                description: option.description.trim().to_string(),
            });
        }
        let header = item.header.trim().to_string();
        out.push(QuestionPrompt {
            header: if header.is_empty() {
                format!("Question {}", out.len() + 1)
            } else {
                header.chars().take(30).collect()
            },
            question,
            options,
            multiple: item.multiple,
        });
    }
    out
}

fn normalize_secrets(secrets: Vec<SecretRequest>) -> Vec<SecretRequest> {
    let mut out = Vec::new();
    for (index, item) in secrets.into_iter().take(MAX_QUESTIONS).enumerate() {
        let key = crate::settings::normalize_env_key(&item.key);
        if key.is_empty() || out.iter().any(|existing: &SecretRequest| existing.key == key) {
            continue;
        }
        let label = item.label.trim().to_string();
        out.push(SecretRequest {
            label: if label.is_empty() {
                format!("Credential {}", index + 1)
            } else {
                label
            },
            hint: item.hint.trim().to_string(),
            reason: item.reason.trim().to_string(),
            key,
        });
    }
    out
}

/// The continuation prompt sent to the agent after the user answers.
pub fn answers_to_text(questions: &[QuestionPrompt], answers: &[Vec<String>]) -> String {
    let mut lines = String::from("Answers to your questions:\n");
    for (index, question) in questions.iter().enumerate() {
        let value = answers
            .get(index)
            .map(|answer| {
                answer
                    .iter()
                    .map(|item| item.trim().to_string())
                    .filter(|item| !item.is_empty())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();
        let value = if value.is_empty() {
            "Unanswered".to_string()
        } else {
            format!("\"{value}\"")
        };
        lines.push_str(&format!("{}. \"{}\" = {value}\n", index + 1, question.question));
    }
    lines.push_str("\nContinue with these answers in mind. Do not ask again unless something genuinely new is blocked.");
    lines
}

/// Continuation prompt after credentials were supplied. Values never appear
/// here; they are already in the agent's environment.
pub fn secrets_to_text(keys: &[String]) -> String {
    format!(
        "The requested credentials are now available as environment variables on this machine: {}.\nRead them from the environment when needed and never print or commit their values. Continue.",
        keys.join(", ")
    )
}

/// Prompt contract appended to every agent prompt that supports the flow.
pub fn contract() -> &'static str {
    r#"## Asking the user (Bark thread dock)

If — and only if — you are blocked on a decision or a missing credential, end your reply with exactly one fenced block and nothing after it.

Decision:
```bark-question
{"questions":[{"header":"Short label","question":"Complete question","options":[{"label":"Choice","description":"What it means"}],"multiple":false}]}
```

Credential:
```bark-secret
{"secrets":[{"key":"OPENAI_API_KEY","label":"OpenAI API key","hint":"sk-…","reason":"Why it is needed"}]}
```

Rules:
- 1–4 questions. 2–5 options each, each with a one-line description.
- Put the option you recommend first and end its label with " (Recommended)".
- Never add a free-form option; the dock adds "Type your own answer" automatically.
- Set `"multiple": true` only when several choices can apply.
- Never ask for a secret in plain text, and never print a secret value.
- Do not emit a block when you can proceed with a sensible default."#
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_a_question_block_and_keeps_the_reply() {
        let text = "I can do this two ways.\n```bark-question\n{\"questions\":[{\"header\":\"Scope\",\"question\":\"Which packages?\",\"options\":[{\"label\":\"web (Recommended)\",\"description\":\"Only the web app\"},{\"label\":\"all\",\"description\":\"Every package\"}],\"multiple\":true}]}\n```";
        let (visible, request) = extract(text);
        assert_eq!(visible, "I can do this two ways.");
        match request {
            Some(QuestionRequest::Questions(questions)) => {
                assert_eq!(questions.len(), 1);
                assert_eq!(questions[0].header, "Scope");
                assert!(questions[0].multiple);
                assert_eq!(questions[0].options[0].label, "web (Recommended)");
            }
            other => panic!("expected questions, got {other:?}"),
        }
    }

    #[test]
    fn extracts_a_secret_block() {
        let text = "```bark-secret\n{\"secrets\":[{\"key\":\"openai api key\",\"label\":\"OpenAI\",\"hint\":\"sk-…\"}]}\n```";
        let (visible, request) = extract(text);
        assert_eq!(visible, "");
        match request {
            Some(QuestionRequest::Secrets(secrets)) => {
                assert_eq!(secrets[0].key, "OPENAI_API_KEY");
                assert_eq!(secrets[0].label, "OpenAI");
            }
            other => panic!("expected secrets, got {other:?}"),
        }
    }

    #[test]
    fn supports_tag_form() {
        let text = "Need one thing.\n<bark-question>{\"questions\":[{\"question\":\"Ship it?\",\"options\":[]}]}</bark-question>";
        let (visible, request) = extract(text);
        assert_eq!(visible, "Need one thing.");
        assert!(matches!(request, Some(QuestionRequest::Questions(_))));
    }

    #[test]
    fn malformed_json_is_left_visible() {
        let text = "```bark-question\nnot json\n```";
        let (visible, request) = extract(text);
        assert_eq!(visible, text);
        assert!(request.is_none());
    }

    #[test]
    fn blank_questions_are_dropped() {
        let text = "```bark-question\n{\"questions\":[{\"question\":\"   \"},{\"question\":\"Real?\",\"options\":[{\"label\":\"\"},{\"label\":\"yes\"}]}]}\n```";
        let (_, request) = extract(text);
        match request {
            Some(QuestionRequest::Questions(questions)) => {
                assert_eq!(questions.len(), 1);
                assert_eq!(questions[0].options.len(), 1);
                assert_eq!(questions[0].header, "Question 1");
            }
            other => panic!("expected questions, got {other:?}"),
        }
    }

    #[test]
    fn marker_detection_covers_both_forms() {
        assert!(contains_marker("text ```bark-question"));
        assert!(contains_marker("<bark-secret>"));
        assert!(!contains_marker("plain answer"));
    }

    #[test]
    fn answer_text_quotes_each_question() {
        let questions = vec![QuestionPrompt {
            header: "A".into(),
            question: "Which?".into(),
            options: vec![],
            multiple: false,
        }];
        let text = answers_to_text(&questions, &[vec!["web".into(), "api".into()]]);
        assert!(text.contains("\"Which?\" = \"web, api\""));
    }

    #[test]
    fn empty_answer_is_marked_unanswered() {
        let questions = vec![QuestionPrompt {
            header: "A".into(),
            question: "Which?".into(),
            options: vec![],
            multiple: false,
        }];
        let text = answers_to_text(&questions, &[vec![]]);
        assert!(text.contains("= Unanswered"));
    }

    #[test]
    fn payload_marks_pending_and_kind() {
        let request = QuestionRequest::Secrets(vec![SecretRequest {
            key: "OPENAI_API_KEY".into(),
            label: "OpenAI".into(),
            hint: String::new(),
            reason: String::new(),
        }]);
        let payload = request.payload();
        assert_eq!(payload["kind"], "secret");
        assert_eq!(payload["pending"], true);
        assert_eq!(payload["secrets"][0]["key"], "OPENAI_API_KEY");
    }

    #[test]
    fn contract_mentions_both_blocks_and_auto_option() {
        let contract = contract();
        assert!(contract.contains("bark-question"));
        assert!(contract.contains("bark-secret"));
        assert!(contract.contains("Type your own answer"));
    }
}
