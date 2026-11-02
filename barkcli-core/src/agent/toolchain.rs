//! External Toolchain & Agent Package Manager.
//!
//! Tracks third-party agent CLIs (`fx`, `deepsec`, `agent-browser`),
//! their local availability, licensing attribution, and installation recipes.

use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ToolRole {
    AgentRunner,
    SecurityGate,
    BrowserAutomation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPackage {
    pub id: String,
    pub name: String,
    pub description: String,
    pub role: ToolRole,
    pub binary_name: String,
    pub installed: bool,
    pub version: Option<String>,
    pub binary_path: Option<String>,
    pub author: String,
    pub license: String,
    pub repository: String,
    pub doc_url: String,
    pub install_command: String,
}

impl ToolPackage {
    pub fn refresh_status(&mut self) {
        if let Some(path) = resolve_binary_path(&self.binary_name) {
            self.installed = true;
            self.binary_path = Some(path);
            self.version = probe_binary_version(&self.binary_name);
        } else {
            self.installed = false;
            self.binary_path = None;
            self.version = None;
        }
    }
}

/// Retrieve all supported external tools with their live detection state.
pub fn get_toolchain_packages() -> Vec<ToolPackage> {
    let mut packages = vec![
        ToolPackage {
            id: "fx".into(),
            name: "fx".into(),
            description: "Unix-like minimalist coding agent built in Zig with ~10µs cold start.".into(),
            role: ToolRole::AgentRunner,
            binary_name: "fx".into(),
            installed: false,
            version: None,
            binary_path: None,
            author: "Vercel Labs".into(),
            license: "Apache-2.0".into(),
            repository: "https://github.com/vercel-labs/fx".into(),
            doc_url: "https://fx.sh".into(),
            install_command: "curl -fsSL https://fx.sh/install | sh".into(),
        },
        ToolPackage {
            id: "deepsec".into(),
            name: "deepsec".into(),
            description: "Agentic security harness checking branches for vulnerabilities and leaks before merge.".into(),
            role: ToolRole::SecurityGate,
            binary_name: "deepsec".into(),
            installed: false,
            version: None,
            binary_path: None,
            author: "Vercel Labs".into(),
            license: "Apache-2.0".into(),
            repository: "https://github.com/vercel-labs/deepsec".into(),
            doc_url: "https://github.com/vercel-labs/deepsec#readme".into(),
            install_command: "npm i -g deepsec".into(),
        },
        ToolPackage {
            id: "agent-browser".into(),
            name: "agent-browser".into(),
            description: "Fast, headless, ref-based browser automation CLI designed for AI agents.".into(),
            role: ToolRole::BrowserAutomation,
            binary_name: "agent-browser".into(),
            installed: false,
            version: None,
            binary_path: None,
            author: "Vercel Labs".into(),
            license: "Apache-2.0".into(),
            repository: "https://github.com/vercel-labs/agent-browser".into(),
            doc_url: "https://github.com/vercel-labs/agent-browser#readme".into(),
            install_command: "npm i -g @vercel/agent-browser".into(),
        },
    ];

    for pkg in &mut packages {
        pkg.refresh_status();
    }

    packages
}

fn resolve_binary_path(binary: &str) -> Option<String> {
    let out = Command::new("which").arg(binary).output().ok()?;
    if out.status.success() {
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !path.is_empty() {
            return Some(path);
        }
    }
    None
}

fn probe_binary_version(binary: &str) -> Option<String> {
    let out = Command::new(binary).arg("--version").output().ok()?;
    if out.status.success() {
        let ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !ver.is_empty() {
            return Some(ver.lines().next().unwrap_or(&ver).to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packages_list_contains_all_three() {
        let pkgs = get_toolchain_packages();
        assert_eq!(pkgs.len(), 3);
        assert!(pkgs.iter().any(|p| p.id == "fx"));
        assert!(pkgs.iter().any(|p| p.id == "deepsec"));
        assert!(pkgs.iter().any(|p| p.id == "agent-browser"));
    }

    #[test]
    fn packages_have_valid_licenses_and_attribution() {
        let pkgs = get_toolchain_packages();
        for p in pkgs {
            assert!(!p.author.is_empty());
            assert!(!p.license.is_empty());
            assert!(p.license == "Apache-2.0" || p.license == "MIT");
            assert!(!p.install_command.is_empty());
        }
    }
}
