use std::fs;
use std::path::Path;

pub struct Release {
    pub tag_name: String,
}

pub fn do_update() {
    println!("board {} (git: {})", env!("CARGO_PKG_VERSION"), env!("GIT_HASH"));
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => { eprintln!("Cannot determine binary path: {}", e); std::process::exit(1); }
    };
    let target = get_target_triple();
    let release = match get_latest_release() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to check for updates: {}", e);
            eprintln!("Try building from source: cargo install board");
            std::process::exit(1);
        }
    };
    let version = env!("CARGO_PKG_VERSION");
    if release.tag_name == format!("v{}", version) {
        println!("Already up to date (v{}).", version);
        return;
    }
    println!("Updating to {}...", release.tag_name);
    let url = format!(
        "https://github.com/anomalyco/board/releases/download/{}/board-{}.tar.gz",
        release.tag_name, target
    );
    match download_and_replace(&url, &exe) {
        Ok(()) => println!("Updated to {}. Restart to use it.", release.tag_name),
        Err(e) => { eprintln!("Update failed: {}", e); std::process::exit(1); }
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
    let body = curl_get("https://api.github.com/repos/anomalyco/board/releases/latest")?;

    let tag_start = body
        .find("\"tag_name\":")
        .ok_or("invalid response from GitHub API")?;
    let tag_slice = &body[tag_start..];
    let tag_value_start = tag_slice.find('"').ok_or("invalid tag_name")? + 1;
    let tag_slice = &tag_slice[tag_value_start..];
    let tag_value_end = tag_slice.find('"').ok_or("invalid tag_name end")?;
    let tag_name = &tag_slice[..tag_value_end];

    Ok(Release {
        tag_name: tag_name.to_string(),
    })
}

pub fn download_and_replace(url: &str, target_exe: &Path) -> Result<(), String> {
    let tmp_dir = std::env::temp_dir().join(format!("board_update_{}", std::process::id()));
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("mkdir failed: {}", e))?;

    let tar_path = tmp_dir.join("release.tar.gz");
    let status = std::process::Command::new("curl")
        .args(["-sSL", "-o"])
        .arg(&tar_path)
        .arg(url)
        .status()
        .map_err(|e| format!("curl not found: {}. Install curl to use `board update`.", e))?;

    if !status.success() {
        return Err("download failed".into());
    }

    let status = std::process::Command::new("tar")
        .args(["-xzf"])
        .arg(&tar_path)
        .arg("-C")
        .arg(&tmp_dir)
        .status()
        .map_err(|e| format!("tar not found: {}. Install tar to use `board update`.", e))?;

    if !status.success() {
        return Err("extraction failed".into());
    }

    let new_binary = find_binary(&tmp_dir).ok_or("board binary not found in release archive")?;

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
            if name == "board" || name == "board.exe" {
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
            "User-Agent: board-cli",
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
