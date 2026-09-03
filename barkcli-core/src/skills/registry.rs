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
}

pub struct MatchContext {
    pub labels: Vec<String>,
    pub area: Option<String>,
    pub title: String,
    pub pipeline_phase: String, // intake | plan | dispatch | review
}

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
                if let Some(s) = self.skills.iter().find(|sk| sk.id == fid) {
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
        assert!(reg.skills.len() >= 4);
        assert!(reg.get("mvp").is_some());
        assert!(reg.get("planning").is_some());
        assert!(reg.get("scrum-master").is_some());
        assert!(reg.get("test").is_some());
    }

    #[test]
    fn matching_by_label() {
        let reg = SkillRegistry::load_all(None).unwrap();
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
        let reg = SkillRegistry::load_all(None).unwrap();
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
}
