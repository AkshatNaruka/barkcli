use anyhow::{bail, Result};

pub fn run_gate_cmd(args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli gate <status|clean|check> [path]");
    };
    match sub.as_str() {
        "status" => status(),
        "clean" => clean(),
        "check" => check(&args[1..]),
        _ => bail!("unknown gate subcommand '{}'", sub),
    }
}

fn status() -> Result<()> {
    let cfg = crate::agent::gate::load_gate_config();
    println!("Gate config: retry_flaky={} cache_enabled={} timeout_secs={}", cfg.retry_flaky, cfg.cache_enabled, cfg.timeout_secs);
    let board_dir = crate::storage::board_dir::find_board_dir().ok();
    if let Some(dir) = board_dir {
        let cache = dir.join("gate-cache");
        let count = std::fs::read_dir(&cache).map(|d| d.count()).unwrap_or(0);
        println!("Gate cache entries: {}", count);
    }
    Ok(())
}

fn clean() -> Result<()> {
    let board_dir = crate::storage::board_dir::find_board_dir()?;
    let cache = board_dir.join("gate-cache");
    if cache.exists() {
        let count = std::fs::read_dir(&cache).map(|d| d.count()).unwrap_or(0);
        std::fs::remove_dir_all(&cache).ok();
        println!("Cleared {} gate cache entries.", count);
    } else {
        println!("Gate cache empty.");
    }
    Ok(())
}

fn check(args: &[String]) -> Result<()> {
    let path = args.first().map(std::path::PathBuf::from).unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let verdict = crate::agent::gate::check_worktree(&path, None)?;
    println!("{} ({} step(s), {}ms, cached={})", verdict.summary, verdict.steps.len(), verdict.duration_ms, verdict.cached);
    for s in &verdict.steps {
        println!("  {} [{}] attempts={} {}ms", s.name, if s.success { "pass" } else { "fail" }, s.attempts, s.duration_ms);
        for line in s.tail.iter().rev().take(5) {
            println!("    {}", line);
        }
    }
    if verdict.passed {
        crate::util::metrics::inc("gate_passed");
        Ok(())
    } else {
        crate::util::metrics::inc("gate_failed");
        std::process::exit(1);
    }
}
