use anyhow::{bail, Result};

pub fn run_agent_loop_cmd(args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli agent-loop <run|tools|status> [card-id]");
    };
    match sub.as_str() {
        "run" => run(&args[1..]),
        "tools" => tools(),
        "status" => status(&args[1..]),
        _ => bail!("unknown agent-loop subcommand '{}'", sub),
    }
}

fn run(args: &[String]) -> Result<()> {
    // Flags: --card <id> --provider <id> --prompt <text>
    let mut card_id: Option<String> = None;
    let mut provider_id = "human".to_string();
    let mut prompt = String::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--card" => {
                i += 1;
                card_id = args.get(i).cloned();
            }
            "--provider" => {
                i += 1;
                provider_id = args.get(i).cloned().unwrap_or(provider_id);
            }
            "--prompt" => {
                i += 1;
                prompt = args.get(i).cloned().unwrap_or_default();
            }
            s if !s.starts_with('-') => {
                if card_id.is_none() {
                    card_id = Some(s.to_string());
                } else if prompt.is_empty() {
                    prompt = s.to_string();
                }
            }
            _ => {}
        }
        i += 1;
    }
    let card_id = card_id.ok_or_else(|| anyhow::anyhow!("usage: barkcli agent-loop run <card-id> --prompt \"...\" --provider human"))?;
    if prompt.is_empty() {
        prompt = format!("Work on card {}", card_id);
    }
    let registry = crate::runtime::ProviderRegistry::standard();
    let provider = registry.get(&provider_id).ok_or_else(|| anyhow::anyhow!("unknown provider '{}'", provider_id))?;
    let mut agent_loop = crate::agent::agent_loop::AgentLoop::new(card_id.clone(), provider);
    let sink: crate::runtime::provider::EventSink = std::sync::Arc::new(|event| {
        eprintln!("agent-loop event: {}", event.summary());
    });
    let turn = agent_loop.run_turn(&prompt, sink)?;
    println!(
        "Turn {} completed: {} step(s), status={}",
        turn.id,
        turn.steps.len(),
        turn.status
    );
    crate::util::metrics::inc("agent_loop_turn");
    Ok(())
}

fn tools() -> Result<()> {
    let registry = crate::agent::agent_loop::default_registry();
    for name in registry.list() {
        if let Some(tool) = registry.get(&name) {
            println!("  {} — {} (approval={})", name, tool.description, tool.requires_approval);
        }
    }
    Ok(())
}

fn status(args: &[String]) -> Result<()> {
    if args.is_empty() {
        bail!("usage: barkcli agent-loop status <card-id>");
    }
    let card_id = &args[0];
    let events = crate::threads::read_events(card_id).unwrap_or_default();
    println!("Thread '{}': {} event(s)", card_id, events.len());
    if let Some(last) = events.last() {
        println!("  last: {} by {} at {}", last.kind.as_str(), last.author, last.created_at);
    }
    Ok(())
}
