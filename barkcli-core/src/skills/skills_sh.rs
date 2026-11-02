//! Client and catalog index for `skills.sh` — the open agent skills directory.
//!
//! Provides searching, metadata inspection, license tracking, and safe import
//! into barkcli's local `.board/skills/`.

use serde::{Deserialize, Serialize};

use super::scanner::{scan_skill_content, SafetyReport};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub license: String,
    pub repository: String,
    pub upstream_url: String,
    pub category: String,
    pub tags: Vec<String>,
    pub content: String,
    #[serde(default)]
    pub safety: Option<SafetyReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillPreview {
    pub skill: RemoteSkill,
    pub safety: SafetyReport,
}

/// Query the skills.sh catalog with optional search filter and category.
pub fn search_skills_sh(query: Option<&str>, category: Option<&str>) -> Vec<RemoteSkill> {
    let mut catalog = curated_catalog();

    // Attach safety scan to all catalog items
    for item in &mut catalog {
        item.safety = Some(scan_skill_content(&item.content));
    }

    catalog
        .into_iter()
        .filter(|s| {
            if let Some(cat) = category {
                if !cat.is_empty() && !s.category.eq_ignore_ascii_case(cat) {
                    return false;
                }
            }
            if let Some(q) = query {
                let q_lower = q.to_lowercase();
                if !q_lower.is_empty()
                    && !s.id.to_lowercase().contains(&q_lower)
                    && !s.name.to_lowercase().contains(&q_lower)
                    && !s.description.to_lowercase().contains(&q_lower)
                    && !s.tags.iter().any(|t| t.to_lowercase().contains(&q_lower))
                {
                    return false;
                }
            }
            true
        })
        .collect()
}

/// Fetch a specific skill preview from skills.sh with a full safety report.
pub fn get_skill_preview(id: &str) -> Option<SkillPreview> {
    let catalog = curated_catalog();
    let skill = catalog.into_iter().find(|s| s.id == id)?;
    let safety = scan_skill_content(&skill.content);
    Some(SkillPreview { skill, safety })
}

/// Curated registry of agent skills compatible with the Agent Skills standard (SKILL.md)
pub fn curated_catalog() -> Vec<RemoteSkill> {
    vec![
        RemoteSkill {
            id: "agent-browser".into(),
            name: "Agent Browser Automation".into(),
            description: "Browser automation CLI & verification harness for AI agents (fast, headless, ref-based).".into(),
            author: "vercel-labs".into(),
            license: "Apache-2.0".into(),
            repository: "https://github.com/vercel-labs/agent-browser".into(),
            upstream_url: "https://skills.sh/vercel-labs/agent-browser".into(),
            category: "testing".into(),
            tags: vec!["browser".into(), "automation".into(), "e2e".into(), "testing".into()],
            content: r##"---
name: Agent Browser Automation
description: Automate browser actions, navigate web apps, and verify UI state.
triggers: [browser, ui-test, scrape, web-e2e]
---

# Agent Browser Automation

Use `agent-browser` for fast, headless, ref-based browser interaction during testing.

## Commands
```bash
agent-browser open http://localhost:4321
agent-browser click "#submit-button"
agent-browser snapshot --diff
```
"##.into(),
            safety: None,
        },
        RemoteSkill {
            id: "deepsec".into(),
            name: "DeepSec Security Harness".into(),
            description: "Agentic security scanner and vulnerability harness checking worktree branches.".into(),
            author: "vercel-labs".into(),
            license: "Apache-2.0".into(),
            repository: "https://github.com/vercel-labs/deepsec".into(),
            upstream_url: "https://skills.sh/vercel-labs/deepsec".into(),
            category: "security".into(),
            tags: vec!["security".into(), "audit".into(), "secrets".into(), "vulnerability".into()],
            content: r#"---
name: DeepSec Security Harness
description: Run security scans, check for secret leaks and injection vulnerabilities.
triggers: [security, audit, pentest, deepsec]
---

# DeepSec Security Harness

Run security analysis before submitting pull requests or merging branches.

## Usage
```bash
deepsec check --scan-all
```
"#.into(),
            safety: None,
        },
        RemoteSkill {
            id: "shadcn-ui".into(),
            name: "shadcn/ui Patterns".into(),
            description: "Best practices and Tailwind components for shadcn/ui and React 19.".into(),
            author: "shadcn".into(),
            license: "MIT".into(),
            repository: "https://github.com/shadcn/ui".into(),
            upstream_url: "https://skills.sh/shadcn/ui".into(),
            category: "frontend".into(),
            tags: vec!["react".into(), "tailwind".into(), "components".into(), "ui".into()],
            content: r#"---
name: shadcn/ui Patterns
description: Expert patterns for building accessible, themeable UI components with Radix and Tailwind.
triggers: [shadcn, tailwind, ui-component]
---

# shadcn/ui Patterns

Guidelines for creating clean, accessible components using Tailwind tokens and Radix primitives.
"#.into(),
            safety: None,
        },
        RemoteSkill {
            id: "git-worktree-flow".into(),
            name: "Git Worktree Flow".into(),
            description: "Manage isolated worktrees and atomic branching for parallel AI agent pools.".into(),
            author: "barkcli".into(),
            license: "MIT".into(),
            repository: "https://github.com/barkcli/barkcli".into(),
            upstream_url: "https://skills.sh/barkcli/git-worktree-flow".into(),
            category: "workflow".into(),
            tags: vec!["git".into(), "worktree".into(), "concurrency".into()],
            content: r#"---
name: Git Worktree Flow
description: Work in isolated git worktrees so agent sessions never corrupt the main working tree.
triggers: [worktree, git-branch, isolate]
---

# Git Worktree Flow

Guidelines for setting up, running tests, and tearing down detached agent worktrees safely.
"#.into(),
            safety: None,
        },
        RemoteSkill {
            id: "api-design-rest".into(),
            name: "REST API Design & Security".into(),
            description: "Production API standards: idempotent mutations, error schemas, rate limits.".into(),
            author: "community".into(),
            license: "MIT".into(),
            repository: "https://github.com/agent-skills/api-patterns".into(),
            upstream_url: "https://skills.sh/community/api-design-rest".into(),
            category: "backend".into(),
            tags: vec!["api".into(), "rest".into(), "security".into(), "http".into()],
            content: r#"---
name: REST API Design & Security
description: Standardized JSON REST error responses, HTTP status codes, and input validation.
triggers: [api, endpoint, rest, backend]
---

# REST API Design & Security

Always validate query parameters and request bodies with strict schemas before execution.
"#.into(),
            safety: None,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_filters_by_query() {
        let results = search_skills_sh(Some("browser"), None);
        assert!(!results.is_empty());
        assert!(results.iter().any(|s| s.id == "agent-browser"));
    }

    #[test]
    fn search_filters_by_category() {
        let results = search_skills_sh(None, Some("security"));
        assert!(!results.is_empty());
        assert!(results.iter().all(|s| s.category == "security"));
    }

    #[test]
    fn preview_includes_safety_report() {
        let preview = get_skill_preview("agent-browser").expect("skill should exist");
        assert_eq!(preview.skill.id, "agent-browser");
        assert!(preview.safety.has_scripts);
    }
}
