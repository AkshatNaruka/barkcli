//! Discover skills already present in a developer's project and personal
//! agent folders, then import them into `.board/skills`.
//!
//! Bark does not need a proprietary pack format: any markdown file with
//! YAML-ish frontmatter can become a skill. Discovery is intentionally
//! read-only; importing is a separate, explicit action.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use super::loader;
use super::registry::{Skill, SkillRegistry, SkillSource};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub triggers: Vec<String>,
    pub always: bool,
    pub source: String,
    pub path: String,
    pub already_installed: bool,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedSkill {
    pub id: String,
    pub path: String,
}

pub fn discover(root: &Path) -> Vec<DiscoveredSkill> {
    let registry = SkillRegistry::load_all(None).unwrap_or(SkillRegistry { skills: vec![] });
    let installed = registry
        .skills
        .iter()
        .filter(|skill| skill.source == SkillSource::Project)
        .map(|skill| skill.id.clone())
        .collect::<std::collections::BTreeSet<_>>();

    let mut found = BTreeMap::<String, DiscoveredSkill>::new();
    for (base, source) in discovery_roots(root) {
        for path in markdown_files(&base) {
            let Some(skill) = loader::load_from_path(&path, source.clone()) else {
                continue;
            };
            let id = skill.id.clone();
            let entry = DiscoveredSkill {
                id: id.clone(),
                name: skill.name,
                description: skill.description,
                triggers: skill.triggers,
                always: skill.always,
                source: source.to_string(),
                path: path.to_string_lossy().to_string(),
                already_installed: installed.contains(&id),
                enabled: skill.enabled,
            };
            // Project-local candidates win over personal ones with the same id.
            found.entry(id).or_insert(entry);
        }
    }
    let mut skills = found.into_values().collect::<Vec<_>>();
    skills.sort_by(|a, b| {
        b.already_installed
            .cmp(&a.already_installed)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    skills
}

/// Copy a discovered markdown file into `.board/skills/<id>.md`.
pub fn import(root: &Path, source_path: &Path) -> Result<ImportedSkill> {
    let canonical = source_path
        .canonicalize()
        .with_context(|| format!("skill not found: {}", source_path.display()))?;
    let allowed = discovery_roots(root)
        .into_iter()
        .map(|(base, _)| base.canonicalize().unwrap_or(base))
        .any(|base| canonical.starts_with(&base));
    if !allowed {
        bail!("refusing to import a skill outside a discovery path");
    }
    if canonical.extension().and_then(|ext| ext.to_str()) != Some("md") {
        bail!("only Markdown skill files can be imported");
    }

    let raw = std::fs::read_to_string(&canonical)
        .with_context(|| format!("reading {}", canonical.display()))?;
    let mut skill = loader::parse_skill(
        &raw,
        canonical
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("skill.md"),
        SkillSource::Project,
    );
    if skill.id.trim().is_empty() || skill.id == "SKILL" {
        if let Some(parent) = canonical.parent().and_then(Path::file_name) {
            skill.id = parent.to_string_lossy().to_string();
        }
    }
    if skill.id.trim().is_empty() {
        bail!("could not determine a skill id");
    }
    if skill.id.contains('/') || skill.id.contains('\\') || skill.id.contains("..") {
        bail!("invalid skill id");
    }

    let board_dir = crate::storage::board_dir::find_board_dir()?;
    let dir = board_dir.join("skills");
    std::fs::create_dir_all(&dir)?;
    let destination = dir.join(format!("{}.md", skill.id));
    let document = if raw.trim_start().starts_with("---") {
        raw.clone()
    } else {
        format!(
            "---\nid: {}\nname: {}\ndescription: {}\ntriggers: [{}]\n---\n\n{}\n",
            skill.id,
            skill.name,
            skill.description,
            skill.triggers.join(", "),
            raw.trim()
        )
    };
    std::fs::write(&destination, document)?;
    super::manage::set_enabled(&skill.id, true).ok();

    Ok(ImportedSkill {
        id: skill.id,
        path: destination.to_string_lossy().to_string(),
    })
}

/// Parse and return the imported skill body for callers that want a preview.
pub fn preview(source_path: &Path) -> Result<Skill> {
    let raw = std::fs::read_to_string(source_path)
        .with_context(|| format!("reading {}", source_path.display()))?;
    Ok(loader::parse_skill(
        &raw,
        source_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("skill.md"),
        SkillSource::Project,
    ))
}

fn discovery_roots(root: &Path) -> Vec<(PathBuf, SkillSource)> {
    let mut roots = vec![
        (root.join(".board/skills"), SkillSource::Project),
        (root.join("skills"), SkillSource::Project),
        (root.join(".claude/skills"), SkillSource::Project),
        (root.join(".opencode/skills"), SkillSource::Project),
        (root.join(".github/skills"), SkillSource::Project),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        roots.push((home.join(".board/skills"), SkillSource::User));
        roots.push((home.join(".claude/skills"), SkillSource::User));
        roots.push((home.join(".config/opencode/skills"), SkillSource::User));
    }
    roots
        .into_iter()
        .filter(|(path, _)| path.is_dir())
        .collect()
}

fn markdown_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect(dir, &mut files, 0);
    files.sort();
    files
}

fn collect(dir: &Path, files: &mut Vec<PathBuf>, depth: usize) {
    if depth > 4 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with('.')
            {
                continue;
            }
            collect(&path, files, depth + 1);
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
            files.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_finds_claude_style_skill_and_dedupes() {
        let root = std::env::temp_dir().join(format!("bark_skills_disc_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".claude/skills/release")).unwrap();
        std::fs::write(
            root.join(".claude/skills/release/SKILL.md"),
            "---\nname: Release captain\ndescription: Ship safely\ntriggers: [release]\n---\n\nSteps\n",
        )
        .unwrap();
        let found = discover(&root);
        assert!(found.iter().any(|skill| skill.id == "release"));
        assert_eq!(
            found.iter().filter(|skill| skill.id == "release").count(),
            1
        );
        let _ = std::fs::remove_dir_all(root);
    }
}
