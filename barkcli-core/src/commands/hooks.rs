use std::path::PathBuf;

use anyhow::{Context, Result};

use crate::storage::board_dir::find_board_dir;
use crate::util::style;

/// `barkcli hooks install [--agent opencode|claude-code|all]` — install agent
/// hooks that pipe session events into `barkcli session log`.
pub fn run_install(args: &[String]) -> Result<()> {
    let agents = parse_agents(args)?;
    let root = project_root()?;

    for agent in &agents {
        match agent.as_str() {
            "opencode" => install_opencode(&root)?,
            "claude-code" => install_claude(&root)?,
            other => anyhow::bail!("unknown agent '{}' (opencode | claude-code)", other),
        }
    }
    Ok(())
}

/// `barkcli hooks remove [--agent ...]` — remove installed hooks.
pub fn run_remove(args: &[String]) -> Result<()> {
    let agents = parse_agents(args)?;
    let root = project_root()?;

    for agent in &agents {
        match agent.as_str() {
            "opencode" => {
                let path = root.join(".opencode/plugins/barkcli.ts");
                if path.exists() {
                    std::fs::remove_file(&path).context("remove opencode plugin")?;
                    println!("{} {}", style::ok("Removed"), path.display());
                } else {
                    println!("{} no opencode plugin installed", style::muted("Skipped"));
                }
            }
            "claude-code" => {
                let path = root.join(".claude/settings.json");
                if path.exists() {
                    let mut settings: serde_json::Value = serde_json::from_str(
                        &std::fs::read_to_string(&path).context("read claude settings")?,
                    )
                    .unwrap_or(serde_json::json!({}));
                    if settings.get("hooks").is_some() {
                        settings.as_object_mut().unwrap().remove("hooks");
                        std::fs::write(&path, serde_json::to_string_pretty(&settings)?)
                            .context("write claude settings")?;
                        println!("{} hooks from {}", style::ok("Removed"), path.display());
                    } else {
                        println!("{} no claude hooks installed", style::muted("Skipped"));
                    }
                }
            }
            other => anyhow::bail!("unknown agent '{}' (opencode | claude-code)", other),
        }
    }
    Ok(())
}

/// `barkcli hooks status` — show what is installed.
pub fn run_status() -> Result<()> {
    let root = project_root()?;

    let opencode = root.join(".opencode/plugins/barkcli.ts").exists();
    let claude = claude_hooks_installed(&root.join(".claude/settings.json"));

    println!("{}", style::strong("Agent hooks:"));
    println!("  opencode:   {}", if opencode { style::ok("installed") } else { style::muted("not installed") });
    println!("  claude-code:{}", if claude { style::ok("installed") } else { style::muted("not installed") });
    Ok(())
}

// ─── Helpers ─────────────────────────────────────

fn parse_agents(args: &[String]) -> Result<Vec<String>> {
    let mut agents: Vec<String> = vec![];
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--agent" || args[i] == "-a" {
            i += 1;
            if let Some(v) = args.get(i) {
                agents.push(v.to_lowercase());
            }
        }
        i += 1;
    }
    if agents.is_empty() {
        agents = vec!["all".into()];
    }
    if agents.iter().any(|a| a == "all") {
        return Ok(vec!["opencode".into(), "claude-code".into()]);
    }
    Ok(agents)
}

fn project_root() -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    board_dir
        .parent()
        .map(|p| p.to_path_buf())
        .context("fatal: .board is at filesystem root")
}

fn install_opencode(root: &PathBuf) -> Result<()> {
    let dir = root.join(".opencode/plugins");
    std::fs::create_dir_all(&dir).context("create .opencode/plugins")?;
    let path = dir.join("barkcli.ts");
    std::fs::write(&path, OPENCODE_PLUGIN_TEMPLATE).context("write opencode plugin")?;
    println!("  {} {}", style::ok("Installed"), path.display());
    Ok(())
}

fn install_claude(root: &PathBuf) -> Result<()> {
    let dir = root.join(".claude");
    std::fs::create_dir_all(&dir).context("create .claude")?;
    let path = dir.join("settings.json");

    let mut settings: serde_json::Value = if path.exists() {
        serde_json::from_str(&std::fs::read_to_string(&path).context("read claude settings")?)
            .unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    settings["hooks"] = serde_json::json!({
        "Stop": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "barkcli session log --agent claude-code"
                    }
                ]
            }
        ]
    });

    std::fs::write(&path, serde_json::to_string_pretty(&settings)?).context("write claude settings")?;
    println!("  {} hooks into {}", style::ok("Installed"), path.display());
    Ok(())
}

fn claude_hooks_installed(path: &std::path::Path) -> bool {
    let Ok(content) = std::fs::read_to_string(path) else {
        return false;
    };
    serde_json::from_str::<serde_json::Value>(&content)
        .ok()
        .map(|v| v.get("hooks").is_some())
        .unwrap_or(false)
}

const OPENCODE_PLUGIN_TEMPLATE: &str = r#"// barkcli session capture plugin for OpenCode
// Installed by `barkcli hooks install --agent opencode`.
// Pipes user prompts into `barkcli session log` (agent session capture).
// Failures are silently ignored — this plugin must never break the agent.
import type { Plugin } from "@opencode-ai/plugin"

export const BarkcliPlugin: Plugin = async ({ directory }) => {
  const seen = new Set<string>()
  let model: string | null = null
  let pendingPrompts: string[] = []

  function call(payload: Record<string, unknown>) {
    try {
      const json = JSON.stringify(payload)
      const proc = Bun.spawn(
        ["sh", "-c", "if ! command -v barkcli >/dev/null 2>&1; then exit 0; fi; exec barkcli session log --agent opencode"],
        { cwd: directory, stdin: new Blob([json + "\n"]), stdout: "ignore", stderr: "ignore" },
      )
      proc.exited.catch(() => {})
    } catch {
      // never crash the agent
    }
  }

  function flush() {
    if (pendingPrompts.length === 0) return
    call({
      prompt: pendingPrompts.join("\n\n"),
      model: model ?? undefined,
      summary: pendingPrompts.length === 1 ? "single prompt" : `${pendingPrompts.length} prompts`,
    })
    pendingPrompts = []
  }

  return {
    event: async ({ event }) => {
      try {
        switch (event.type) {
          case "message.updated": {
            const msg = (event as any).properties?.info
            if (!msg) break
            if (msg.role === "assistant" && msg.modelID) model = msg.modelID
            if (msg.role === "user" && msg.text && !seen.has(msg.id)) {
              seen.add(msg.id)
              pendingPrompts.push(String(msg.text))
            }
            break
          }
          case "message.part.updated": {
            const part = (event as any).properties?.part
            if (!part?.messageID) break
            if (part.type === "text" && !seen.has(part.messageID)) {
              seen.add(part.messageID)
              pendingPrompts.push(String(part.text ?? ""))
            }
            break
          }
          case "session.status": {
            const props = (event as any).properties
            if (props?.status?.type !== "idle") break
            flush()
            break
          }
          case "server.instance.disposed": {
            flush()
            break
          }
        }
      } catch {
        // never crash the agent
      }
    },
  }
}
"#;
