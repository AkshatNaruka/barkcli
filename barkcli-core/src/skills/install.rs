//! Install skills from any git repo into `.board/skills/`.
//!
//! `barkcli skills install <source>` — shallow-clones the source (or reuses
//! a local path as-is), picks up `**/*.md` skills, copies them into the
//! project, and upserts `skills.lock` with the pinned revision + hash.

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{anyhow, Context, Result};

use super::lock::{file_sha256, now_iso, load, save, LockEntry};
use super::loader::parse_skill;
use super::registry::SkillSource;

/// Turn a user-typed ref into a `git`-cloneable source: full URLs pass
/// through; an existing local directory stays local; `owner/repo` becomes a
/// GitHub URL.
pub fn resolve_source(r: &str) -> String {
    if r.starts_with("http://") || r.starts_with("https://") || r.starts_with("ssh://") || r.starts_with("git@") {
        let trimmed = r.trim_end_matches('/');
        return if trimmed.ends_with(".git") {
            trimmed.to_string()
        } else {
            format!("{}.git", trimmed)
        };
    }
    if Path::new(r).is_dir() {
        return r.trim_end_matches('/').to_string();
    }
    if git_repo_shorthand(r) {
        return format!("https://github.com/{}.git", r);
    }
    r.to_string()
}

/// `owner/repo` — exactly one slash, no scheme, no local path markers.
fn git_repo_shorthand(r: &str) -> bool {
    let mut parts = r.split('/');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(owner), Some(repo), None) => {
            !owner.is_empty() && !repo.is_empty() && !owner.contains('.') && !repo.ends_with(".md")
        }
        _ => false,
    }
}

pub struct InstallResult {
    pub source: String,
    pub rev: String,
    pub installed: Vec<String>, // skill ids
    pub updated: Vec<String>,   // ids whose content changed
}

/// Install skills from `repo_ref`. With `dir`, only skills under that
/// path in the source repo are considered.
pub fn install_from_source(repo_ref: &str, dir: Option<&str>) -> Result<InstallResult> {
    let source = resolve_source(repo_ref);
    let local = prepare_local_copy(&source)
        .with_context(|| format!("preparing source '{}'", source))?;
    let rev = head_rev(&local).unwrap_or_else(|_| "local".into());

    let mut skills_root = local.clone();
    if let Some(sub) = dir {
        skills_root = skills_root.join(sub);
    }
    if !skills_root.exists() {
        anyhow::bail!("directory '{}' not found in source '{}'", skills_root.display(), source);
    }

    let dest_dir = crate::storage::board_dir::find_board_dir()?.join("skills");
    std::fs::create_dir_all(&dest_dir)?;

    let mut files: Vec<PathBuf> = Vec::new();
    collect_md(&skills_root, 0, &mut files);
    if files.is_empty() {
        anyhow::bail!("no skill markdown files found in '{}' of '{}'", skills_root.display(), source);
    }

    let previous = load()?;
    let mut lock = previous.clone();
    let mut res = InstallResult {
        source: source.clone(),
        rev,
        installed: Vec::new(),
        updated: Vec::new(),
    };

    for file in files {
        let stem = file
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("skill")
            .to_string();
        if stem.to_lowercase().starts_with("readme") {
            continue;
        }
        let content = std::fs::read_to_string(&file).context("reading skill file")?;
        let parsed = parse_skill(
            &content,
            &file.file_name().unwrap().to_string_lossy(),
            SkillSource::Project,
        );
        // parse_skill already falls back to the file stem for the id.
        if parsed.id.is_empty() {
            continue;
        }
        let id = parsed.id;
        let dest = dest_dir.join(format!("{}.md", id));
        let sha_before = if dest.exists() { file_sha256(&dest).ok() } else { None };
        std::fs::write(&dest, &content)?;
        let sha_after = file_sha256(&dest)?;

        match sha_before {
            None => res.installed.push(id.clone()),
            Some(before) if before != sha_after => res.updated.push(id.clone()),
            _ => {} // unchanged, but still recorded under the new rev
        }
        lock.upsert(LockEntry {
            id: id.clone(),
            source: source.clone(),
            rev: res.rev.clone(),
            origin_path: file
                .strip_prefix(&local)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| id.clone()),
            sha256: sha_after,
            installed_at: now_iso(),
        });
    }

    save(&lock)?;
    res.installed.sort();
    res.updated.sort();
    Ok(res)
}

/// A shallow clone for remote sources; the path as-is for local dirs.
/// Returns the local directory holding the skills.
fn prepare_local_copy(source: &str) -> Result<PathBuf> {
    let p = Path::new(source);
    if p.is_dir() {
        return Ok(p.to_path_buf());
    }
    let tmp = std::env::temp_dir().join(format!(
        "bark_skill_install_{}",
        uuid::Uuid::new_v4()
    ));
    let out = Command::new("git")
        .args(["clone", "--depth", "1", source, tmp.to_string_lossy().as_ref()])
        .output()
        .map_err(|e| anyhow!("git clone failed: {}", e))?;
    if !out.status.success() {
        return Err(anyhow!(
            "git clone failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(tmp)
}

fn head_rev(dir: &Path) -> Result<String> {
    let out = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(dir)
        .output()?;
    if !out.status.success() {
        anyhow::bail!("rev-parse failed: {}", String::from_utf8_lossy(&out.stderr));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn collect_md(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth > 4 {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let p = entry.path();
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name == ".git" || name == ".board" {
            continue;
        }
        if p.is_dir() {
            collect_md(&p, depth + 1, out);
        } else if p.extension().and_then(|e| e.to_str()) == Some("md") {
            out.push(p);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_github_shorthand() {
        assert_eq!(
            resolve_source("AkshatNaruka/barkcli-skills"),
            "https://github.com/AkshatNaruka/barkcli-skills.git"
        );
        assert_eq!(
            resolve_source("AkshatNaruka/barkcli-skills"),
            "https://github.com/AkshatNaruka/barkcli-skills.git"
        );
        assert_eq!(
            resolve_source("https://github.com/a/b"),
            "https://github.com/a/b.git"
        );
        assert_eq!(resolve_source("git@github.com:a/b.git"), "git@github.com:a/b.git");
    }

    #[test]
    fn resolve_local_dir_wins() {
        let dir = std::env::temp_dir().join(format!("bark_resolve_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(resolve_source(dir.to_str().unwrap()), dir.to_str().unwrap().trim_end_matches('/'));
    }
}
