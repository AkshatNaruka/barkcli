use anyhow::Result;
use comfy_table::Cell;

use crate::agent::toolchain::get_toolchain_packages;
use crate::util::{display, style};

/// `barkcli tools` — Inspect installed external agent tools and installation status.
pub fn run_tools(_args: &[String]) -> Result<()> {
    let pkgs = get_toolchain_packages();
    let mut t = display::table();
    t.set_header(display::header(vec!["Tool", "Role", "Status", "Version / Path", "License", "Install Command"]));

    for p in &pkgs {
        let status_cell = if p.installed {
            Cell::new(style::ok("Installed"))
        } else {
            Cell::new(style::warn("Not Found"))
        };

        let ver_or_path = match (&p.version, &p.binary_path) {
            (Some(v), Some(path)) => format!("{v} ({path})"),
            (None, Some(path)) => path.clone(),
            _ => "—".to_string(),
        };

        let role_str = match p.role {
            crate::agent::ToolRole::AgentRunner => "Agent Backend",
            crate::agent::ToolRole::SecurityGate => "Security Gate",
            crate::agent::ToolRole::BrowserAutomation => "Browser Automation",
        };

        t.add_row(vec![
            Cell::new(style::accent(&p.name)),
            Cell::new(role_str),
            status_cell,
            Cell::new(ver_or_path),
            Cell::new(format!("{} ({})", p.license, p.author)),
            Cell::new(&p.install_command),
        ]);
    }

    println!("{t}");
    println!(
        "{} Integrate external tools seamlessly with barkcli (fx as backend, deepsec as gate, agent-browser for UI testing).",
        style::ok("Toolchain:")
    );
    Ok(())
}
