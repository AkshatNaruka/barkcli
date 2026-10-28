use std::path::PathBuf;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::loader;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SkillSource {
    Builtin,
    Project,
    User,
}

impl std::fmt::Display for SkillSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SkillSource::Builtin => write!(f, "builtin"),
            SkillSource::Project => write!(f, "project"),
            SkillSource::User => write!(f, "user"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub triggers: Vec<String>,
    pub source: SkillSource,
    pub path: Option<PathBuf>,
    /// Always route this skill when it is enabled, regardless of triggers.
    #[serde(default)]
    pub always: bool,
    /// Disabled skills stay installed but never reach an agent prompt.
    #[serde(default = "skill_enabled_default")]
    pub enabled: bool,
}

fn skill_enabled_default() -> bool {
    true
}

pub struct MatchContext {
    pub labels: Vec<String>,
    pub area: Option<String>,
    pub title: String,
    pub pipeline_phase: String, // intake | plan | dispatch | review
}

#[derive(Debug, Clone)]
pub struct SkillRegistry {
    pub skills: Vec<Skill>,
}

impl SkillRegistry {
    pub fn load_all(board_name: Option<&str>) -> Result<Self> {
        let mut skills: Vec<Skill> = Vec::new();

        // 1. Builtins
        skills.extend(super::builtin::builtin_skills());

        // 2. User: ~/.board/skills/*.md
        if let Some(home) = std::env::var_os("HOME") {
            let dir = PathBuf::from(home).join(".board").join("skills");
            if dir.is_dir() {
                for entry in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
                    let p = entry.path();
                    if p.extension().and_then(|e| e.to_str()) == Some("md") {
                        if let Some(s) = loader::load_from_path(&p, SkillSource::User) {
                            upsert(&mut skills, s);
                        }
                    }
                }
            }
        }

        // 3. Project: .board/skills/*.md and skills/*.md
        if let Ok(board_dir) = crate::storage::board_dir::find_board_dir() {
            // .board/skills
            let proj_dir = board_dir.join("skills");
            if proj_dir.is_dir() {
                for entry in std::fs::read_dir(&proj_dir).into_iter().flatten().flatten() {
                    let p = entry.path();
                    if p.extension().and_then(|e| e.to_str()) == Some("md") {
                        if let Some(s) = loader::load_from_path(&p, SkillSource::Project) {
                            upsert(&mut skills, s);
                        }
                    }
                }
            }
            // repo root skills/*.md (optional)
            if let Some(root) = board_dir.parent() {
                let alt = root.join("skills");
                if alt.is_dir() {
                    for entry in std::fs::read_dir(&alt).into_iter().flatten().flatten() {
                        let p = entry.path();
                        if p.extension().and_then(|e| e.to_str()) == Some("md") {
                            if let Some(s) = loader::load_from_path(&p, SkillSource::Project) {
                                if !skills.iter().any(|sk| sk.id == s.id) {
                                    skills.push(s);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Also board-scoped .board/skills/<board>/*.md if board_name provided (future)
        let _ = board_name;

        // User preference: installed but disabled skills are invisible to
        // matching/prompt injection. State lives in .board/skills-state.json.
        let disabled = super::manage::disabled_ids();
        if !disabled.is_empty() {
            for s in &mut skills {
                if disabled.iter().any(|id| id == &s.id) {
                    s.enabled = false;
                }
            }
        }

        Ok(Self { skills })
    }

    pub fn list(&self) -> &[Skill] {
        &self.skills
    }

    pub fn get(&self, id: &str) -> Option<&Skill> {
        self.skills.iter().find(|s| s.id == id)
    }

    /// Return top matching skills for context (max 3, sorted by overlap score)
    pub fn matching(&self, ctx: &MatchContext) -> Vec<&Skill> {
        // Build token set from ctx
        let mut tokens: Vec<String> = Vec::new();
        for l in &ctx.labels {
            tokens.push(l.to_lowercase());
        }
        if let Some(ref a) = ctx.area {
            tokens.push(a.to_lowercase());
        }
        tokens.extend(crate::code::symbols::tokens_of(&ctx.title));
        tokens.push(ctx.pipeline_phase.to_lowercase());

        let mut scored: Vec<(&Skill, usize)> = self
            .skills
            .iter()
            .filter(|s| s.enabled)
            .map(|s| {
                let score = s
                    .triggers
                    .iter()
                    .filter(|t| tokens.iter().any(|tok| tok == &t.to_lowercase()))
                    .count();
                (s, score)
            })
            .filter(|(_, sc)| *sc > 0)
            .collect();

        // If no trigger overlap, for pipeline phases provide sensible defaults:
        if scored.is_empty() {
            let fallback = match ctx.pipeline_phase.as_str() {
                "intake" => vec!["mvp"],
                "plan" => vec!["planning", "mvp"],
                "dispatch" | "monitor" => vec!["scrum-master"],
                "review" => vec!["test"],
                _ => vec![],
            };
            for fid in fallback {
                if let Some(s) = self.skills.iter().find(|sk| sk.id == fid && sk.enabled) {
                    scored.push((s, 1));
                }
            }
        }

        scored.sort_by(|a, b| b.1.cmp(&a.1));
        scored.into_iter().take(3).map(|(s, _)| s).collect()
    }

    /// Render matching skills as markdown for prompt injection (SPEC-003 R4)
    pub fn render_for_prompt(&self, ctx: &MatchContext) -> Option<String> {
        let matched = self.matching(ctx);
        if matched.is_empty() {
            return None;
        }
        let mut out = String::from("## Project Skills (matched)\n");
        for s in matched {
            out.push_str(&format!("### {} ({})\n{}\n\n", s.name, s.id, s.content));
        }
        Some(out)
    }
}

fn upsert(skills: &mut Vec<Skill>, new_skill: Skill) {
    if let Some(pos) = skills.iter().position(|s| s.id == new_skill.id) {
        skills[pos] = new_skill;
    } else {
        skills.push(new_skill);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_all_has_four_builtins() {
        let reg = SkillRegistry::load_all(None).unwrap();
        assert!(reg.skills.len() >= 10);
        assert!(reg.get("mvp").is_some());
        assert!(reg.get("planning").is_some());
        assert!(reg.get("scrum-master").is_some());
        assert!(reg.get("test").is_some());
        assert!(reg.get("tdd").is_some());
        assert!(reg.get("code-review").is_some());
        assert!(reg.get("security-audit").is_some());
        assert!(reg.get("performance-engineer").is_some());
        assert!(reg.get("database-architect").is_some());
        assert!(reg.get("architecture-review").is_some());
    }

    #[test]
    fn matching_by_label() {
        let reg = SkillRegistry {
            skills: crate::skills::builtin::builtin_skills(),
        };
        let ctx = MatchContext {
            labels: vec!["feature".into()],
            area: None,
            title: "Add OAuth".into(),
            pipeline_phase: "intake".into(),
        };
        let m = reg.matching(&ctx);
        assert!(m.iter().any(|s| s.id == "mvp"));
    }

    #[test]
    fn render_not_empty() {
        let reg = SkillRegistry {
            skills: crate::skills::builtin::builtin_skills(),
        };
        let ctx = MatchContext {
            labels: vec![],
            area: None,
            title: "Plan auth".into(),
            pipeline_phase: "plan".into(),
        };
        let r = reg.render_for_prompt(&ctx);
        assert!(r.is_some());
        assert!(r.unwrap().contains("Project Skills"));
    }

    #[test]
    fn disabled_skills_never_reach_a_prompt() {
        let mut skills = crate::skills::builtin::builtin_skills();
        for skill in &mut skills {
            skill.enabled = false;
        }
        let reg = SkillRegistry { skills };
        let ctx = MatchContext {
            labels: vec!["feature".into()],
            area: None,
            title: "Ship release".into(),
            pipeline_phase: "dispatch".into(),
        };
        assert!(reg.matching(&ctx).is_empty());
        assert!(reg.render_for_prompt(&ctx).is_none());

        // A single enabled skill can still match on its trigger.
        let mut skills = crate::skills::builtin::builtin_skills();
        for skill in &mut skills {
            skill.enabled = skill.id == "mvp";
        }
        let reg = SkillRegistry { skills };
        let matched = reg.matching(&ctx);
        assert_eq!(matched.len(), 1);
        assert_eq!(matched[0].id, "mvp");
    }
}
