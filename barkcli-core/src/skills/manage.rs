//! User-managed skills: enable/disable state, create, and delete.
//!
//! Installed files live in `.board/skills/*.md` (project) or
//! `~/.board/skills/*.md` (user). The enabled/disabled preference is local to
//! the checkout and lives in `.board/skills-state.json`; disabled skills stay
//! on disk and visible in the UI, but `SkillRegistry::matching` skips them, so
//! they never reach an agent prompt.

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use super::loader;
use super::registry::{Skill, SkillRegistry, SkillSource};

const STATE_FILE: &str = "skills-state.json";

#[derive(Debug, Default, Serialize, Deserialize)]
struct SkillsState {
    #[serde(default)]
    disabled: Vec<String>,
}

fn state_path() -> Result<PathBuf> {
    Ok(crate::storage::board_dir::find_board_dir()?.join(STATE_FILE))
}

pub fn project_skills_dir() -> Result<PathBuf> {
    Ok(crate::storage::board_dir::find_board_dir()?.join("skills"))
}

fn read_state() -> SkillsState {
    state_path()
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// Ids the user switched off. Missing/malformed state means everything is on.
pub fn disabled_ids() -> Vec<String> {
    read_state().disabled
}

pub fn set_enabled(id: &str, enabled: bool) -> Result<()> {
    let path = state_path()?;
    let mut state = read_state();

    if enabled {
        state.disabled.retain(|existing| existing != id);
    } else if !state.disabled.iter().any(|existing| existing == id) {
        state.disabled.push(id.to_string());
    }

    let json = serde_json::to_string_pretty(&state)?;
    std::fs::write(&path, json).with_context(|| format!("writing {}", path.display()))?;
    Ok(())
}

/// Slug used when the caller does not supply an id. ASCII only, so skill files
/// stay portable and prompt-safe.
pub fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in input.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn one_line(value: &str, strip_commas: bool) -> String {
    let mut out: String = value
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    if strip_commas {
        out = out.replace(',', " ");
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Create a project skill in `.board/skills/<id>.md`.
pub fn create_project_skill(
    id: Option<&str>,
    name: &str,
    description: &str,
    triggers: &[String],
    content: &str,
) -> Result<Skill> {
    let name = one_line(name, false);
    if name.is_empty() {
        bail!("a skill needs a name");
    }
    if content.trim().is_empty() {
        bail!("a skill needs content");
    }

    let id = match id.map(str::trim).filter(|s| !s.is_empty()) {
        Some(explicit) => explicit.to_string(),
        None => slugify(&name),
    };
    if !valid_id(&id) {
        bail!("skill id must be 1–64 characters: letters, numbers, '-' or '_'");
    }
    // Never let a crafted id escape .board/skills.
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        bail!("invalid skill id");
    }

    let dir = project_skills_dir()?;
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}.md", id));

    let description = one_line(description, false);
    let triggers = triggers
        .iter()
        .map(|t| one_line(t, true))
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>();
    let triggers_line = triggers.join(", ");

    let document = format!(
        "---\nid: {}\nname: {}\ndescription: {}\ntriggers: [{}]\n---\n\n{}\n",
        id,
        name,
        description,
        triggers_line,
        content.trim()
    );

    std::fs::write(&path, document).with_context(|| format!("writing {}", path.display()))?;

    let skill = loader::load_from_path(&path, SkillSource::Project)
        .with_context(|| format!("reading back {}", path.display()))?;

    // Creating a skill is an explicit request to use it.
    set_enabled(&id, true).ok();
    Ok(skill)
}

/// Delete a project skill. Builtins, user skills, and repo-root skills are
/// intentionally read-only from the app.
pub fn delete_project_skill(id: &str) -> Result<()> {
    let registry = SkillRegistry::load_all(None)?;
    let skill = registry
        .get(id)
        .with_context(|| format!("skill '{}' not found", id))?;

    if skill.source != SkillSource::Project {
        bail!("only project skills in .board/skills can be deleted");
    }
    let path = skill
        .path
        .clone()
        .context("skill has no file on disk")?;
    let dir = project_skills_dir()?;
    let root = dir.canonicalize().unwrap_or(dir);
    let resolved = path.canonicalize().unwrap_or_else(|_| path.clone());
    if !resolved.starts_with(&root) {
        bail!("refusing to delete a skill outside .board/skills");
    }

    std::fs::remove_file(&resolved).with_context(|| format!("deleting {}", resolved.display()))?;
    set_enabled(id, true).ok();

    // Installed skills are pinned in skills.lock; drop the stale entry.
    if let Ok(mut lock) = super::lock::load() {
        let before = lock.skills.len();
        lock.skills.retain(|entry| entry.id != id);
        if lock.skills.len() != before {
            let _ = super::lock::save(&lock);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugifies_human_names() {
        assert_eq!(slugify("My Great Skill!"), "my-great-skill");
        assert_eq!(slugify("  TDD / tests  "), "tdd-tests");
        assert_eq!(slugify("already_slugged"), "already-slugged");
    }

    #[test]
    fn ids_are_prompt_safe() {
        assert!(valid_id("code-review"));
        assert!(valid_id("my_skill2"));
        assert!(!valid_id("../escape"));
        assert!(!valid_id("has space"));
        assert!(!valid_id(""));
    }

    #[test]
    fn descriptions_are_one_line() {
        assert_eq!(one_line("hello\nworld", false), "hello world");
        assert_eq!(one_line("a,b, c", true), "a b c");
    }
}
