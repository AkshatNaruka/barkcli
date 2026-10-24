//! Integration test: installing skills from a git repo into a project,
//! with `skills.lock` pinning (rev + sha256), idempotent re-install, and
//! update-on-new-revision (separate process: mutates process CWD).

use anyhow::Result;

use barkcli_core::skills::{install, lock};

fn temp_root(tag: &str, n: u32) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "bark_skills_{}_{}_{}",
        tag,
        std::process::id(),
        n
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn git(dir: &std::path::Path, args: &[&str]) -> Result<String> {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_AUTHOR_NAME", "Registry Test")
        .env("GIT_AUTHOR_EMAIL", "reg@test.local")
        .env("GIT_COMMITTER_NAME", "Registry Test")
        .env("GIT_COMMITTER_EMAIL", "reg@test.local")
        .output()?;
    if !out.status.success() {
        anyhow::bail!(
            "git {:?}: {}",
            args,
            String::from_utf8_lossy(&out.stderr)
        );
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Seed a source "registry" repo with two skill files + a README (which must
/// NOT be picked up as a skill) and commit. Returns (path, rev).
fn seed_registry() -> Result<(std::path::PathBuf, String, String)> {
    let dir = temp_root("registry", 1);
    std::fs::create_dir_all(dir.join("skills"))?;
    std::fs::write(
        dir.join("skills/oauth.md"),
        "---\nid: oauth\ntitle: oauth\ndescription: Rotate OAuth client secrets\ndescription: Rotate OAuth client secrets near expiry\ntriggers: [oauth, token]\n---\n\nRotate the client secret, update the vault, rerun the integration tests.\n",
    )?;
    std::fs::write(
        dir.join("skills/git-hygiene.md"),
        "---\nid: git-hygiene\ntitle: git-hygiene\ndescription: Keep main clean and branches short-lived\ntriggers: [git, hygiene]\n---\n\nRebase before merge, delete stale worktrees, never commit secrets.\n",
    )?;
    std::fs::write(dir.join("README.md"), "# test registry\n")?;
    git(&dir, &["init", "-b", "master"])?;
    git(
        &dir,
        &[
            "-c",
            "user.name=Registry Test",
            "-c",
            "user.email=reg@test.local",
            "add",
            "-A",
        ],
    )?;
    git(
        &dir,
        &[
            "-c",
            "user.name=Registry Test",
            "-c",
            "user.email=reg@test.local",
            "commit",
            "-m",
            "seed",
        ],
    )?;
    let rev = git(&dir, &["rev-parse", "HEAD"])?;
    Ok((dir, rev, "seed".into()))
}

#[test]
fn skills_install_from_local_repo_pins_lockfile() -> Result<()> {
    // ── source registry ──
    let (registry, rev, _) = seed_registry()?;
    assert!(rev.len() >= 12, "rev should be a full sha, got {rev}");

    // ── target project ──
    let project = temp_root("project", 2);
    std::fs::create_dir_all(project.join(".board")).unwrap();
    std::env::set_current_dir(&project).unwrap();

    // 1. First install: both skills land and are pinned.
    let res = install::install_from_source(registry.to_str().unwrap(), Some("skills")).unwrap();
    assert_eq!(res.installed, vec!["git-hygiene", "oauth"]);
    assert!(res.updated.is_empty());

    let installed = project.join(".board/skills/oauth.md");
    assert!(installed.exists(), "skill file must be copied");
    assert_eq!(
        std::fs::read_to_string(&installed).unwrap(),
        std::fs::read_to_string(registry.join("skills/oauth.md")).unwrap()
    );
    assert!(
        !project.join(".board/skills/README.md").exists(),
        "READMEs are never installed as skills"
    );

    let l = lock::load().expect("skills.lock must parse");
    assert_eq!(l.skills.len(), 2, "both skills pinned, got {:?}", l.skills);
    let entry = l.get("oauth").expect("oauth pinned");
    assert_eq!(entry.rev, rev, "lock pins the source HEAD");
    assert_eq!(entry.origin_path, "skills/oauth.md");
    let sha = lock::file_sha256(&installed).unwrap();
    assert_eq!(entry.sha256, sha, "lock records the installed file hash");
    assert!(
        project.join("skills.lock").exists(),
        "skills.lock lives at the repo root (committable)"
    );

    // 2. Idempotent re-install at the same rev: no new/changed ids.
    let res2 = install::install_from_source(registry.to_str().unwrap(), None).unwrap();
    assert!(res2.installed.is_empty(), "nothing new: {:?}", res2.installed);
    assert!(res2.updated.is_empty(), "nothing changed: {:?}", res2.updated);

    // 3. Source rev bump: content change is detected and re-pinned.
    std::fs::write(
        registry.join("skills/oauth.md"),
        "---\nid: oauth\ntitle: oauth\ndescription: Rotate OAuth client secrets\ndescription: Rotate OAuth client secrets near expiry\ntriggers: [oauth, token]\n---\n\nRotate the client secret, update the vault, rerun the integration tests.\n\n## v2\nNow also clears the refresh-token cache.\n",
    )?;
    git(&registry, &["add", "-A"])?;
    git(
        &registry,
        &[
            "-c",
            "user.name=Registry Test",
            "-c",
            "user.email=reg@test.local",
            "commit",
            "-m",
            "bump oauth",
        ],
    )?;
    let rev2 = git(&registry, &["rev-parse", "HEAD"])?;
    assert_ne!(rev2, rev);

    let res3 = install::install_from_source(registry.to_str().unwrap(), None).unwrap();
    assert_eq!(res3.updated, vec!["oauth"], "oauth must be an update");
    assert!(res3.installed.is_empty());
    assert_eq!(res3.rev, rev2, "re-pinned to the new rev");

    let l3 = lock::load().unwrap();
    let e3 = l3.get("oauth").unwrap();
    assert_eq!(e3.rev, rev2);
    assert_ne!(e3.sha256, sha, "hash tracks the new content");
    // git-hygiene unchanged → still pinned against rev2 now (upserted).
    assert_eq!(l3.get("git-hygiene").unwrap().rev, rev2);
    Ok(())
}
