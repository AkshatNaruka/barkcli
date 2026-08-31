use std::fs;
use std::path::Path;
use barkcli_core::util::style;

pub const RELEASE_BASE: &str = "https://barkcli.vercel.app/downloads";
pub const GITHUB_REPO: &str = "AkshatNaruka/barkcli";
pub const GITHUB_API_LATEST: &str = "https://api.github.com/repos/AkshatNaruka/barkcli/releases/latest";

pub struct Release {
    pub tag_name: String,
}

pub fn do_update() {
    println!("barkcli {} (git: {})", env!("CARGO_PKG_VERSION"), env!("GIT_HASH"));
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => { eprintln!("Cannot determine binary path: {}", e); std::process::exit(1); }
    };
    let target = get_target_triple();
    let release = match get_latest_release() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to check for updates: {}", e);
            eprintln!("Try building from source: cargo install barkcli");
            eprintln!("Or: cargo install --git https://github.com/{GITHUB_REPO} barkcli");
            std::process::exit(1);
        }
    };
    let version = env!("CARGO_PKG_VERSION");
    if release.tag_name == format!("v{}", version) {
        println!("Already up to date (v{}).", version);
        return;
    }
    println!("Updating to {}...", release.tag_name);

    let archive = archive_name_for_target(&target);
    // Primary: GitHub Releases, Fallback: Vercel mirror
    let github_url = format!(
        "https://github.com/{}/releases/download/{}/{}",
        GITHUB_REPO, release.tag_name, archive
    );
    let vercel_url = format!("{}/{}", RELEASE_BASE, archive);

    let result = download_and_replace(&github_url, &exe)
        .or_else(|e| {
            eprintln!("GitHub download failed ({}), trying Vercel mirror...", e);
            download_and_replace(&vercel_url, &exe)
        });

    match result {
        Ok(()) => println!("Updated to {}. Restart to use it.", release.tag_name),
        Err(e) => { eprintln!("Update failed: {}", e); std::process::exit(1); }
    }
}

fn archive_name_for_target(target: &str) -> String {
    if target.contains("windows") {
        format!("barkcli-{}.zip", target)
    } else {
        format!("barkcli-{}.tar.gz", target)
    }
}

pub fn get_target_triple() -> String {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let os_str = match os {
        "macos" => "apple-darwin",
        "linux" => "unknown-linux-gnu",
        "windows" => "pc-windows-msvc",
        _ => os,
    };
    let arch_str = match arch {
        "x86_64" => "x86_64",
        "aarch64" => "aarch64",
        _ => arch,
    };
    format!("{}-{}", arch_str, os_str)
}

pub fn get_latest_release() -> Result<Release, String> {
    // Try GitHub API first (primary)
    if let Ok(body) = curl_get(GITHUB_API_LATEST) {
        if let Some(tag) = extract_tag_name(&body) {
            if tag.starts_with('v') {
                return Ok(Release { tag_name: tag });
            }
        }
    }
    // Fallback: Vercel version file (mirror)
    if let Ok(body) = curl_get(&format!("{}/version", RELEASE_BASE)) {
        let tag_name = body.trim().to_string();
        if tag_name.starts_with('v') && !tag_name.contains('<') {
            return Ok(Release { tag_name });
        }
    }
    // Fallback: GitHub redirects /releases/latest (HEAD request via curl -I)
    if let Ok(body) = curl_get("https://github.com/AkshatNaruka/barkcli/releases/latest") {
        // GitHub will redirect to /releases/tag/vX.Y.Z — body contains that URL if we fail to follow correctly
        // Try to extract vX.Y.Z from body
        if let Some(idx) = body.find("/tag/v") {
            let substr = &body[idx + 5..];
            let end = substr.find('"').or_else(|| substr.find('\'')).or_else(|| substr.find('<')).unwrap_or(substr.len());
            let ver = &substr[..end.min(16)];
            if !ver.is_empty() && ver.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                return Ok(Release { tag_name: format!("v{}", ver) });
            }
        }
    }
    Err("No release published yet. Try: cargo install barkcli".into())
}

fn extract_tag_name(json: &str) -> Option<String> {
    // Very small JSON parser for "tag_name": "v0.2.0"
    let key = "\"tag_name\"";
    let idx = json.find(key)?;
    let after = &json[idx + key.len()..];
    let colon = after.find(':')?;
    let after_colon = after[colon + 1..].trim_start();
    // Expect quoted string
    if !after_colon.starts_with('"') {
        return None;
    }
    let end = after_colon[1..].find('"')?;
    Some(after_colon[1..1 + end].to_string())
}

pub fn download_and_replace(url: &str, target_exe: &Path) -> Result<(), String> {
    let tmp_dir = std::env::temp_dir().join(        format!("barkcli_update_{}", std::process::id()));
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("mkdir failed: {}", e))?;

    let is_zip = url.ends_with(".zip");
    let archive_name = if is_zip { "release.zip" } else { "release.tar.gz" };
    let archive_path = tmp_dir.join(archive_name);
    let status = std::process::Command::new("curl")
        .args(["-sSL", "-o"])
        .arg(&archive_path)
        .arg(url)
        .status()
        .map_err(|e| format!("curl not found: {}. Install curl to use `barkcli update`.", e))?;

    if !status.success() {
        return Err("download failed".into());
    }

    // Extract: tar.gz vs zip
    let extract_status = if is_zip {
        // Try unzip, then tar, then PowerShell Expand-Archive
        let unzip = std::process::Command::new("unzip")
            .args(["-o"])
            .arg(&archive_path)
            .arg("-d")
            .arg(&tmp_dir)
            .status();
        if let Ok(s) = unzip {
            if s.success() { Ok(s) } else {
                // Fallback to tar (Windows tar can handle zip)
                std::process::Command::new("tar")
                    .args(["-xf"])
                    .arg(&archive_path)
                    .arg("-C")
                    .arg(&tmp_dir)
                    .status()
                    .map_err(|e| format!("unzip/tar not found: {}. Install unzip or tar.", e))
            }
        } else {
            std::process::Command::new("tar")
                .args(["-xf"])
                .arg(&archive_path)
                .arg("-C")
                .arg(&tmp_dir)
                .status()
                .map_err(|e| format!("unzip/tar not found: {}. Install unzip or tar.", e))
        }
    } else {
        std::process::Command::new("tar")
            .args(["-xzf"])
            .arg(&archive_path)
            .arg("-C")
            .arg(&tmp_dir)
            .status()
            .map_err(|e| format!("tar not found: {}. Install tar to use `barkcli update`.", e))
    };

    let status = extract_status.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("extraction failed".into());
    }

    let new_binary = find_binary(&tmp_dir).ok_or("barkcli binary not found in release archive")?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&new_binary)
            .map_err(|e| format!("metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&new_binary, perms).map_err(|e| format!("chmod: {}", e))?;
    }

    let backup = target_exe.with_extension("old");
    fs::rename(target_exe, &backup).map_err(|e| format!("backup: {}", e))?;
    fs::rename(&new_binary, target_exe).map_err(|e| {
        let _ = fs::rename(&backup, target_exe);
        format!("replace: {}", e)
    })?;
    let _ = fs::remove_file(&backup);
    let _ = fs::remove_dir_all(&tmp_dir);

    Ok(())
}

fn find_binary(dir: &Path) -> Option<std::path::PathBuf> {
    let mut stack = vec![dir.to_path_buf()];
    while let Some(path) = stack.pop() {
        if path.is_dir() {
            if let Ok(entries) = fs::read_dir(&path) {
                for entry in entries.filter_map(|e| e.ok()) {
                    stack.push(entry.path());
                }
            }
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name == "barkcli" || name == "barkcli.exe" {
                return Some(path);
            }
        }
    }
    None
}

fn curl_get(url: &str) -> Result<String, String> {
    let output = std::process::Command::new("curl")
        .args([
            "-sSL",
            "-H",
            "Accept: application/json",
            "-H",
            "User-Agent: barkcli-cli",
            url,
        ])
        .output()
        .map_err(|e| format!("curl not found: {}. Install curl.", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("HTTP request failed: {}", err.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into())
}
