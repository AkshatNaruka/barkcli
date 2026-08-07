mod version;
mod license;
mod ai;
mod report;
mod changelog;
mod stats;
mod templates;
mod sprint;
mod sync;

const VERSION: &str = "0.2.0";
const GIT_HASH: &str = env!("GIT_HASH");

#[cfg(feature = "tui")]
fn run_tui(args: &[String]) {
    let name = args.first().map(|s| s.as_str());
    if let Err(e) = barkcli_tui::run(name) {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}

#[cfg(feature = "serve")]
fn run_serve(args: &[String]) {
    let mut port = 4321u16;
    let mut board_name: Option<String> = None;
    let mut open_browser = false;
    let mut host = "127.0.0.1".to_string();
    let mut token: Option<String> = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--port" | "-p" => { i += 1; port = args.get(i).and_then(|v| v.parse().ok()).unwrap_or(4321); }
            "--board" | "-b" => { i += 1; board_name = args.get(i).map(|s| s.to_string()); }
            "--host" => { i += 1; host = args.get(i).cloned().unwrap_or_else(|| "127.0.0.1".to_string()); }
            "--token" => { i += 1; token = args.get(i).map(|s| s.to_string()); }
            "--open" | "-o" => open_browser = true,
            s if s.starts_with('-') => {}
            s => { if board_name.is_none() { board_name = Some(s.to_string()); } }
        }
        i += 1;
    }
    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    if let Err(e) = rt.block_on(barkcli_server::run(port, board_name.as_deref(), open_browser, &host, token)) {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}

fn print_version() {
    let pro = if license::is_licensed() { " pro" } else { "" };
    println!("barkcli{} {} (git: {})", pro, VERSION, GIT_HASH);
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let rest = &args[1..];

    if let Some(first) = rest.first() {
        match first.as_str() {
            "--version" | "-V" | "version" => { print_version(); return; }
            "update" | "upgrade" => { version::do_update(); return; }
            "ai" => {
                if !license::check_pro("ai") { std::process::exit(1); }
                let (board, rest) = parse_ai_args(&rest[1..]);
                let prompt = rest.join(" ").trim().to_string();
                if prompt.is_empty() { eprintln!("usage: barkcli ai \"your task description\""); std::process::exit(1); }
                if let Err(e) = ai::run(&prompt, board.dry_run, &board.model) {
                    eprintln!("error: {}", e); std::process::exit(1);
                }
                return;
            }
            "report" => {
                if !license::check_pro("report") { std::process::exit(1); }
                let since = rest.get(1).filter(|s| !s.starts_with('-')).map(|s| s.as_str()).unwrap_or("7 days ago");
                let json = rest.iter().any(|s| s == "--json");
                let sprint = rest.iter().position(|s| s == "--sprint")
                    .and_then(|i| rest.get(i + 1)).map(|s| s.to_string());
                let result = match sprint {
                    Some(name) => report::run_sprint_report(&name, json),
                    None => report::run(since, json),
                };
                if let Err(e) = result { eprintln!("error: {}", e); std::process::exit(1); }
                return;
            }
            "changelog" => {
                if !license::check_pro("changelog") { std::process::exit(1); }
                let since = rest.get(1).filter(|s| !s.starts_with('-')).map(|s| s.as_str());
                if let Err(e) = changelog::run(since) { eprintln!("error: {}", e); std::process::exit(1); }
                return;
            }
            "stats" => {
                if !license::check_pro("stats") { std::process::exit(1); }
                if let Err(e) = stats::run() { eprintln!("error: {}", e); std::process::exit(1); }
                return;
            }
            "template" => {
                if !license::check_pro("template") { std::process::exit(1); }
                match rest.get(1).map(|s| s.as_str()) {
                    Some("list") => { templates::list_templates(); }
                    Some("install") => {
                        if let Some(name) = rest.get(2) {
                            if let Err(e) = templates::install_template(None, name) { eprintln!("error: {}", e); std::process::exit(1); }
                        } else { eprintln!("usage: barkcli template install <name>"); std::process::exit(1); }
                    }
                    _ => templates::list_templates(),
                }
                return;
            }
            "sprint" => {
                if !license::check_pro("sprint") { std::process::exit(1); }
                match rest.get(1).map(|s| s.as_str()) {
                    Some("start") => {
                        let def = "current".to_string();
                        let name = rest.get(2).unwrap_or(&def);
                        let mut start_date = None;
                        let mut end_date = None;
                        let mut i = 3;
                        while i < rest.len() {
                            match rest[i].as_str() {
                                "--start" => { i += 1; start_date = rest.get(i).map(|s| s.as_str()); }
                                "--ends" | "--end" | "-e" => { i += 1; end_date = rest.get(i).map(|s| s.as_str()); }
                                _ => {}
                            }
                            i += 1;
                        }
                        if let Err(e) = sprint::start(name, start_date, end_date) { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                    Some("end") => {
                        let def = "current".to_string();
                        let name = rest.get(2).unwrap_or(&def);
                        if let Err(e) = sprint::end(name) { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                    Some("list") | Some("ls") => {
                        if let Err(e) = sprint::list() { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                    _ => { eprintln!("usage: barkcli sprint start <name> [--ends YYYY-MM-DD] / barkcli sprint end <name> / barkcli sprint list"); std::process::exit(1); }
                }
                return;
            }
            "sync" => {
                if !license::check_pro("sync") { std::process::exit(1); }
                if rest.iter().any(|s| s == "--push") {
                    if let Err(e) = sync::push() { eprintln!("error: {}", e); std::process::exit(1); }
                } else if rest.iter().any(|s| s == "--pull") {
                    if let Err(e) = sync::pull() { eprintln!("error: {}", e); std::process::exit(1); }
                } else {
                    eprintln!("usage: barkcli sync --push | --pull");
                    std::process::exit(1);
                }
                return;
            }
            "license" => {
                match rest.get(1).map(|s| s.as_str()) {
                    Some("activate") => {
                        if let Some(key) = rest.get(2) {
                            if let Err(e) = license::activate(key) {
                                eprintln!("error: {}", e);
                                std::process::exit(1);
                            }
                        } else {
                            eprintln!("usage: barkcli license activate <key>");
                            std::process::exit(1);
                        }
                    }
                    Some("status") => { license::status(); }
                    _ => {
                        license::status();
                    }
                }
                return;
            }

            "agent" => {
                if !license::check_pro("agent") { std::process::exit(1); }
                match rest.get(1).map(|s| s.as_str()) {
                    Some("propose") => {
                        if let Err(e) = run_agent_cmd(&rest[1..]) { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                    Some("watch") => {
                        if let Err(e) = run_agent_cmd(&rest[1..]) { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                    Some("sync") => {
                        // free tier: git-only context sync
                        if let Err(e) = run_agent_cmd(&rest[1..]) { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                    Some("config") => {
                        if let Err(e) = run_agent_cmd(&rest[1..]) { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                    _ => { eprintln!("usage: barkcli agent <propose|watch|sync|config>"); std::process::exit(1); }
                }
                return;
            }
            "context" => {
                match rest.get(1).map(|s| s.as_str()) {
                    Some("refresh") => {
                        if !license::check_pro("agent") { std::process::exit(1); }
                        if let Err(e) = barkcli_core::cli::run_dispatch("context", &rest[1..]) { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                    _ => {
                        // all other context subcommands are free
                        if let Err(e) = barkcli_core::cli::run() { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                }
                return;
            }
            "tui" => {
                #[cfg(feature = "tui")] run_tui(&rest[1..]);
                return;
            }
            "serve" => {
                #[cfg(feature = "serve")] run_serve(&rest[1..]);
                return;
            }
            "open" => {
                let board_name = rest.get(1).map(|s| s.as_str());
                if atty::is(atty::Stream::Stdout) {
                    #[cfg(feature = "tui")]
                    { if let Err(e) = barkcli_tui::run(board_name) { eprintln!("error: {}", e); std::process::exit(1); } }
                } else {
                    #[cfg(feature = "serve")] {
                        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
                        if let Err(e) = rt.block_on(barkcli_server::run(4321, board_name, true, "127.0.0.1", None)) { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                }
                return;
            }
            _ => {}
        }
    }

struct AiArgs { dry_run: bool, model: String }

fn run_agent_cmd(args: &[String]) -> anyhow::Result<()> {
    barkcli_core::cli::run_dispatch("agent", args)
}

fn parse_ai_args(args: &[String]) -> (AiArgs, Vec<String>) {
    let mut opts = AiArgs { dry_run: false, model: "gpt-4o-mini".into() };
    let mut rest = vec![];
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--dry-run" => opts.dry_run = true,
            "--model" => { i += 1; if let Some(v) = args.get(i) { opts.model = v.clone(); } }
            s if !s.starts_with('-') => rest.push(s.to_string()),
            _ => {}
        }
        i += 1;
    }
    (opts, rest)
}

    // Everything else goes to the flat CLI dispatch
    if let Err(e) = barkcli_core::cli::run() {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}
