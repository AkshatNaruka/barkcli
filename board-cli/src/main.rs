mod version;
mod license;
mod ai;

const VERSION: &str = "0.2.0";
const GIT_HASH: &str = env!("GIT_HASH");

#[cfg(feature = "tui")]
fn run_tui(args: &[String]) {
    let name = args.first().map(|s| s.as_str());
    if let Err(e) = board_tui::run(name) {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}

#[cfg(feature = "serve")]
fn run_serve(args: &[String]) {
    let mut port = 4321u16;
    let mut board_name: Option<String> = None;
    let mut open_browser = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--port" | "-p" => { i += 1; port = args.get(i).and_then(|v| v.parse().ok()).unwrap_or(4321); }
            "--board" | "-b" => { i += 1; board_name = args.get(i).map(|s| s.to_string()); }
            "--open" | "-o" => open_browser = true,
            s if s.starts_with('-') => {}
            s => { if board_name.is_none() { board_name = Some(s.to_string()); } }
        }
        i += 1;
    }
    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    if let Err(e) = rt.block_on(board_server::run(port, board_name.as_deref(), open_browser)) {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}

fn print_version() {
    let pro = if license::is_licensed() { " pro" } else { "" };
    println!("board{} {} (git: {})", pro, VERSION, GIT_HASH);
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
                if prompt.is_empty() { eprintln!("usage: board ai \"your task description\""); std::process::exit(1); }
                if let Err(e) = ai::run(&prompt, board.dry_run, &board.model) {
                    eprintln!("error: {}", e); std::process::exit(1);
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
                            eprintln!("usage: board license activate <key>");
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
                    { if let Err(e) = board_tui::run(board_name) { eprintln!("error: {}", e); std::process::exit(1); } }
                } else {
                    #[cfg(feature = "serve")] {
                        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
                        if let Err(e) = rt.block_on(board_server::run(4321, board_name, true)) { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                }
                return;
            }
            _ => {}
        }
    }

struct AiArgs { dry_run: bool, model: String }

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

    // Everything else goes to board_core's flat CLI dispatch
    if let Err(e) = board_core::cli::run() {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}
