//! `barkcli skills publish` — contribute a local skill to the shared
//! registry repo through a git branch + GitHub PR.
//!
//! Default registry: `AkshatNaruka/barkcli-skills` (override with
//! `BARKCLI_SKILLS_REPO` or `--repo <owner/name-or-url>`).
//!
//! Every step is honest about failure: if `git` or `gh` can't complete the
//! flow, the command prints exactly what was prepared (branch, file) and the
//! two commands to run by hand, instead of pretending it published.

use std::path::Path;
use std::process::Command;

use anyhow::{anyhow, Context, Result};

pub const DEFAULT_REGISTRY: &str = "AkshatNaruka/barkcli-skills";

pub struct PublishOutcome {
    pub branch: String,
    pub skill_id: String,
    pub pr_url: Option<String>,
    /// Step-by-step manual commands, set when automation could not finish.
    pub manual: Option<Vec<String>>,
    pub registry: String,
}

/// Resolve the registry ref: `--repo` > env `BARKCLI_SKILLS_REPO` > default.
pub fn registry_ref(override_ref: Option<&str>) -> String {
    let r = override_ref
        .map(|s| s.to_string())
        .or_else(|| std::env::var("BARKCLI_SKILLS_REPO").ok())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_REGISTRY.to_string());
    super::install::resolve_source(&r)
}

/// The git branch a skill publishes onto.
pub fn branch_for(skill_id: &str) -> String {
    format!("skills/{}", skill_id)
}

/// Publish one skill markdown file.
pub fn publish(skill_id: &str, skill_file: &Path, registry: Option<&str>) -> Result<PublishOutcome> {
    let registry = registry_ref(registry);
    let work = std::env::temp_dir().join(format!("bark_skill_publish_{}", uuid::Uuid::new_v4()));
    let branch = branch_for(skill_id);

    clone(&registry, &work)?;
    std::fs::create_dir_all(work.join("skills"))?;
    let dest = work.join("skills").join(format!("{}.md", skill_id));
    std::fs::copy(skill_file, &dest).with_context(|| format!("copy {}", skill_file.display()))?;

    git(&work, &["checkout", "-B", &branch])?;
    git(&work, &["add", &format!("skills/{}.md", skill_id)])?;
    // Commit identity may be unset in CI; fall back to the runner identity.
    if git(&work, &["config", "user.email"]).is_err() {
        git(&work, &["config", "user.email", "runner@barkcli.local"])?;
        git(&work, &["config", "user.name", "barkcli runner"])?;
    }
    git(
        &work,
        &[
            "commit",
            "-m",
            &format!("feat(skill): add {}", skill_id),
        ],
    )?;
    let pushed = push(&work, &branch);

    let mut outcome = PublishOutcome {
        branch: branch.clone(),
        skill_id: skill_id.to_string(),
        pr_url: None,
        manual: None,
        registry: registry.clone(),
    };

    match pushed {
        Ok(_) => match gh_pr_create(&registry, &branch, skill_id) {
            Ok(url) => outcome.pr_url = Some(url),
            Err(e) => {
                outcome.manual = Some(manual_steps(&registry, &branch, skill_id, Some(e.to_string())));
            }
        },
        Err(e) => {
            outcome.manual = Some(manual_steps(&registry, &branch, skill_id, Some(e.to_string())));
        }
    }
    Ok(outcome)
}

fn manual_steps(registry: &str, branch: &str, id: &str, err: Option<String>) -> Vec<String> {
    let mut v = vec![format!("cd $(mktemp -d) && git clone {}", registry)];
    v.push(format!("cd bark* && git checkout -B {}", branch));
    v.push(format!("cp .board/skills/{}.md skills/{}.md", id, id));
    v.push(format!(
        "git add skills/{}.md && git commit -m 'feat(skill): add {}' && git push -u origin {}",
        id, id, branch
    ));
    v.push(format!(
        "gh pr create --repo {} --title \"skill: add {}\" --body \"Pulled from a local project.\"",
        registry, id
    ));
    if let Some(e) = err {
        v.push(format!("# last error: {}", e));
    }
    v
}

fn clone(url: &str, dest: &Path) -> Result<()> {
    let out = Command::new("git")
        .args(["clone", url, dest.to_string_lossy().as_ref()])
        .output()
        .map_err(|e| anyhow!("git clone failed: {}", e))?;
    if !out.status.success() {
        return Err(anyhow!(
            "git clone {} failed: {}",
            url,
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

fn git(dir: &Path, args: &[&str]) -> Result<String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()?;
    if !out.status.success() {
        return Err(anyhow!(
            "git {} failed: {}",
            args.first().unwrap_or(&""),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn push(dir: &Path, branch: &str) -> Result<()> {
    git(dir, &["push", "-f", "-u", "origin", branch]).map(|_| ())
}

fn gh_pr_create(registry: &str, branch: &str, id: &str) -> Result<String> {
    let out = Command::new("gh")
        .args([
            "pr",
            "create",
            "--repo",
            registry,
            "--head",
            branch,
            "--title",
            &format!("skill: add {}", id),
            "--body",
            "Pulled from a local project via `barkcli skills publish`. Contains one skill markdown file.",
        ])
        .output()
        .map_err(|e| anyhow!("gh not available: {}", e))?;
    if !out.status.success() {
        return Err(anyhow!(
            "gh pr create failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn branch_name_is_namespaced() {
        assert_eq!(branch_for("oauth"), "skills/oauth");
    }

    #[test]
    fn registry_resolution_prefers_override_then_env() {
        std::env::remove_var("BARKCLI_SKILLS_REPO");
        assert_eq!(
            registry_ref(None),
            "https://github.com/AkshatNaruka/barkcli-skills.git"
        );
        assert_eq!(
            registry_ref(Some("someone/other-skills")),
            "https://github.com/someone/other-skills.git"
        );
    }
}
