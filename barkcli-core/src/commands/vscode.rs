use std::process::Command;

use anyhow::{bail, Result};

use crate::util::style;

const EXTENSION_ID: &str = "barkcli.barkcli-vscode";
const GITHUB_REPO: &str = "AkshatNaruka/barkcli";

/// The VSIX filename uses the extension's own version (0.1.0), not the CLI version.
const VSIX_NAME: &str = "barkcli-vscode-0.1.0.vsix";

/// Detect which VS Code CLI is available, if any.
fn detect_vscode_cli() -> Option<&'static str> {
    if Command::new("code").arg("--version").output().is_ok() {
        Some("code")
    } else if Command::new("code-insiders").arg("--version").output().is_ok() {
        Some("code-insiders")
    } else {
        None
    }
}

/// Check if the barkcli extension is already installed.
fn is_extension_installed(vscode_cmd: &str) -> bool {
    Command::new(vscode_cmd)
        .args(["--list-extensions"])
        .output()
        .map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.lines().any(|l| l.eq_ignore_ascii_case(EXTENSION_ID))
        })
        .unwrap_or(false)
}

/// Try downloading from a URL, return true on success.
fn try_download(url: &str, output_path: &str) -> bool {
    Command::new("curl")
        .args(["-fsSL", "--retry", "2", "--retry-delay", "1", url, "-o", output_path])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn run(args: &[String]) -> Result<()> {
    let force = args.iter().any(|a| a == "--force" || a == "-f");

    // 1. Detect VS Code CLI
    let vscode_cmd = detect_vscode_cli().ok_or_else(|| {
        anyhow::anyhow!(
            "VS Code CLI not found. Install VS Code and make sure 'code' is on your PATH.\n\
             On macOS: open Visual Studio Code → Cmd+Shift+P → 'Shell Command: Install code'"
        )
    })?;

    println!("{} Using {}", style::ok("Detected"), vscode_cmd);

    // 2. Check if already installed
    if !force && is_extension_installed(vscode_cmd) {
        println!(
            "{} Extension '{}' is already installed.",
            style::ok("OK"),
            EXTENSION_ID
        );
        println!("  Use --force to reinstall.");
        return Ok(());
    }

    // 3. Build download URLs (GitHub primary, Vercel fallback)
    let cli_version = env!("CARGO_PKG_VERSION");
    let github_url = format!(
        "https://github.com/{}/releases/download/v{}/{}",
        GITHUB_REPO, cli_version, VSIX_NAME
    );
    let vercel_url = format!(
        "https://barkcli.vercel.app/downloads/{}",
        VSIX_NAME
    );

    println!(
        "{} Downloading VS Code extension...",
        style::accent("Downloading")
    );

    // 4. Download to temp dir
    let tmp_dir = std::env::temp_dir().join("barkcli-vsix-install");
    let _ = std::fs::create_dir_all(&tmp_dir);
    let vsix_path = tmp_dir.join(VSIX_NAME);
    let vsix_str = vsix_path.to_str().unwrap_or_default();

    println!("  Trying GitHub Releases...");
    let downloaded = try_download(&github_url, vsix_str)
        || {
            println!("  GitHub failed, trying Vercel mirror...");
            try_download(&vercel_url, vsix_str)
        };

    if !downloaded {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        bail!(
            "Failed to download VSIX from:\n  {}\n  {}\nCheck your internet connection.",
            github_url,
            vercel_url
        );
    }

    println!(
        "{} Downloaded {}",
        style::ok("OK"),
        style::muted(VSIX_NAME)
    );

    // 5. Install extension
    println!(
        "{} Installing extension...",
        style::accent("Installing")
    );

    let install_output = Command::new(vscode_cmd)
        .args(["--install-extension", vsix_str])
        .output()
        .map_err(|e| anyhow::anyhow!("failed to run {}: {}", vscode_cmd, e))?;

    // 6. Cleanup
    let _ = std::fs::remove_dir_all(&tmp_dir);

    if install_output.status.success() {
        let stdout = String::from_utf8_lossy(&install_output.stdout);
        if !stdout.trim().is_empty() {
            println!("  {}", stdout.trim());
        }
        println!();
        println!(
            "{} VS Code extension installed successfully!",
            style::ok("Done")
        );
        println!();
        println!("Open any .board file in VS Code to use the kanban editor:");
        println!("  code .board/tasks.board");
        println!();
        println!("To reinstall: barkcli vscode-install --force");
    } else {
        let stderr = String::from_utf8_lossy(&install_output.stderr);
        bail!(
            "Extension installation failed.\n{}",
            stderr.trim()
        );
    }

    Ok(())
}
