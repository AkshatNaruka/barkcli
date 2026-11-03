use anyhow::Result;
use comfy_table::{Cell, Color};

use crate::runtime::provider::ProviderRegistry;
use crate::util::{display, style};

/// `barkcli providers [probe|list] [--json]` — probe installed local agent CLIs.
pub fn run_providers(args: &[String]) -> Result<()> {
    let registry = ProviderRegistry::default();
    let statuses = registry.statuses();

    if args.iter().any(|arg| arg == "--json") {
        println!("{}", serde_json::to_string_pretty(&statuses)?);
        return Ok(());
    }

    let mut t = display::table();
    t.set_header(display::header(vec![
        "Provider",
        "Command",
        "Status",
        "Version",
        "Auth",
        "Capabilities",
    ]));

    for s in &statuses {
        let status_cell = if s.available {
            Cell::new("Available").fg(Color::Green)
        } else {
            Cell::new("Not Found").fg(Color::Yellow)
        };

        let auth_cell = match s.authenticated {
            Some(true) => Cell::new("Authenticated").fg(Color::Green),
            Some(false) => Cell::new("Unauthenticated").fg(Color::Yellow),
            None => Cell::new("—"),
        };

        let ver = s.version.clone().unwrap_or_else(|| "—".into());

        let mut caps = Vec::new();
        if s.capabilities.headless {
            caps.push("headless");
        }
        if s.capabilities.stream_json {
            caps.push("stream");
        }
        if s.capabilities.resume {
            caps.push("resume");
        }
        if s.capabilities.fork {
            caps.push("fork");
        }
        if s.capabilities.skills {
            caps.push("skills");
        }
        let caps_str = if caps.is_empty() {
            "—".into()
        } else {
            caps.join(", ")
        };

        t.add_row(vec![
            Cell::new(&s.name),
            Cell::new(&s.command),
            status_cell,
            Cell::new(ver),
            auth_cell,
            Cell::new(caps_str),
        ]);
    }

    println!("{t}");
    println!(
        "{} Local agent providers detected. Use in barkcli serve chat or autonomy loop with 'barkcli run'.",
        style::ok("Providers:")
    );

    Ok(())
}
