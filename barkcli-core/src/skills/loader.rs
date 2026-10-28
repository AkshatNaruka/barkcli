use super::registry::{Skill, SkillSource};
use std::path::Path;

pub fn parse_skill(content: &str, filename: &str, source: SkillSource) -> Skill {
    let (frontmatter, body) = split_frontmatter(content);
    let mut id = None;
    let mut name = None;
    let mut description = None;
    let mut triggers: Vec<String> = Vec::new();
    let mut always = false;

    for line in frontmatter.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            let k = k.trim();
            let v = v.trim().trim_matches('"').trim_matches('\'').trim();
            match k {
                "id" => id = Some(v.to_string()),
                "name" => name = Some(v.to_string()),
                "description" => description = Some(v.to_string()),
                "triggers" => {
                    // Expect [a, b] or "a,b"
                    let inner = v.trim_matches(|c| c == '[' || c == ']').trim();
                    triggers = inner
                        .split(',')
                        .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
                "always" => {
                    always = matches!(
                        v.to_ascii_lowercase().as_str(),
                        "true" | "yes" | "1" | "on"
                    );
                }
                _ => {}
            }
        }
    }

    let file_stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("skill")
        .to_string();

    let final_id = id.unwrap_or_else(|| {
        if file_stem.eq_ignore_ascii_case("skill") {
            Path::new(filename)
                .parent()
                .and_then(Path::file_name)
                .and_then(|name| name.to_str())
                .unwrap_or(&file_stem)
                .to_string()
        } else {
            file_stem.clone()
        }
    });
    let final_name = name.unwrap_or_else(|| file_stem.clone());
    let final_desc = description.unwrap_or_default();

    // If no triggers parsed, leave empty (will match only on explicit request)
    Skill {
        id: final_id,
        name: final_name,
        description: final_desc,
        content: body.trim().to_string(),
        triggers,
        source: source.clone(),
        path: None,
        always,
        enabled: true,
    }
}

fn split_frontmatter(content: &str) -> (String, String) {
    let t = content.trim();
    if t.starts_with("---") {
        if let Some(rest) = t.strip_prefix("---") {
            if let Some((fm, body)) = rest.split_once("---") {
                return (fm.to_string(), body.to_string());
            }
        }
    }
    (String::new(), t.to_string())
}

pub fn load_from_path(path: &Path, source: SkillSource) -> Option<Skill> {
    let content = std::fs::read_to_string(path).ok()?;
    let mut skill = parse_skill(&content, &path.file_name()?.to_string_lossy(), source);
    if skill.id.eq_ignore_ascii_case("skill") {
        if let Some(parent) = path.parent().and_then(Path::file_name) {
            skill.id = parent.to_string_lossy().to_string();
        }
    }
    skill.path = Some(path.to_path_buf());
    Some(skill)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_mvp() {
        let c = include_str!("builtin/mvp.md");
        let s = parse_skill(c, "mvp.md", SkillSource::Builtin);
        assert_eq!(s.id, "mvp");
        assert!(s.triggers.contains(&"feature".to_string()));
        assert!(!s.content.is_empty());
    }

    #[test]
    fn parse_no_frontmatter() {
        let c = "# Hello\nWorld";
        let s = parse_skill(c, "hello.md", SkillSource::Project);
        assert_eq!(s.id, "hello");
        assert_eq!(s.name, "hello");
    }
}
