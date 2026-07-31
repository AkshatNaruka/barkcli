mod version;

const GIT_HASH: &str = env!("GIT_HASH");
const VERSION: &str = "0.1.0";
const REPO: &str = "anomalyco/board";

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
            "--port" | "-p" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    port = v.parse().unwrap_or(4321);
                }
            }
            "--board" | "-b" => {
                i += 1;
                board_name = args.get(i).map(|s| s.to_string());
            }
            "--open" | "-o" => {
                open_browser = true;
            }
            s if s.starts_with('-') => {}
            s => {
                if board_name.is_none() {
                    board_name = Some(s.to_string());
                }
            }
        }
        i += 1;
    }
    let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");
    if let Err(e) = rt.block_on(board_server::run(port, board_name.as_deref(), open_browser)) {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}

fn print_version() {
    println!("board {} (git: {})", VERSION, GIT_HASH);
}

fn do_update() {
    print_version();
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Cannot determine binary path: {}", e);
            std::process::exit(1);
        }
    };

    let target = version::get_target_triple();
    let release = match version::get_latest_release() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to check for updates: {}", e);
            eprintln!("Try building from source: cargo install board");
            std::process::exit(1);
        }
    };

    if release.tag_name == format!("v{}", VERSION) && GIT_HASH != "unknown" {
        println!("Already up to date (v{}).", VERSION);
        return;
    }

    println!("Updating to {}...", release.tag_name);
    let url = format!(
        "https://github.com/{}/releases/download/{}/board-{}.tar.gz",
        REPO, release.tag_name, target
    );

    match version::download_and_replace(&url, &exe) {
        Ok(()) => println!("Updated to {}. Restart to use the new version.", release.tag_name),
        Err(e) => {
            eprintln!("Update failed: {}", e);
            std::process::exit(1);
        }
    }
}

fn parse_board_arg(args: &[String]) -> Option<String> {
    let mut board = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--board" | "-b" => { i += 1; board = args.get(i).cloned(); }
            s if !s.starts_with('-') => { if board.is_none() { board = Some(s.to_string()); } }
            _ => {}
        }
        i += 1;
    }
    board
}

fn parse_diff_args(args: &[String]) -> (Option<String>, Option<String>) {
    let mut board = None;
    let mut git_ref = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--board" | "-b" => { i += 1; board = args.get(i).cloned(); }
            s if !s.starts_with('-') => {
                if board.is_none() { board = Some(s.to_string()); }
                else if git_ref.is_none() { git_ref = Some(s.to_string()); }
            }
            _ => {}
        }
        i += 1;
    }
    (board, git_ref)
}

fn parse_pr_args(args: &[String]) -> (Option<String>, Option<String>) {
    let mut board = None;
    let mut base = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--board" | "-b" => { i += 1; board = args.get(i).cloned(); }
            "--base" => { i += 1; base = args.get(i).cloned(); }
            s if !s.starts_with('-') => {
                if board.is_none() { board = Some(s.to_string()); }
            }
            _ => {}
        }
        i += 1;
    }
    (board, base)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let rest = &args[1..];

    if let Some(first) = rest.first() {
        match first.as_str() {
            "--version" | "-V" => {
                print_version();
                return;
            }
            "update" | "upgrade" => {
                do_update();
                return;
            }
            "version" => {
                print_version();
                return;
            }
            "log" => {
                let board_name = parse_board_arg(&rest[1..]);
                if let Err(e) = board_core::commands::git_ops::run_log(board_name.as_deref()) {
                    eprintln!("error: {}", e);
                    std::process::exit(1);
                }
                return;
            }
            "diff" => {
                let (board_name, ref_spec) = parse_diff_args(&rest[1..]);
                if let Err(e) = board_core::commands::git_ops::run_diff(board_name.as_deref(), ref_spec.as_deref()) {
                    eprintln!("error: {}", e);
                    std::process::exit(1);
                }
                return;
            }
            "pr-summary" => {
                let (board_name, base) = parse_pr_args(&rest[1..]);
                if let Err(e) = board_core::commands::git_ops::run_pr_summary(board_name.as_deref(), base.as_deref()) {
                    eprintln!("error: {}", e);
                    std::process::exit(1);
                }
                return;
            }
            "tui" => {
                #[cfg(feature = "tui")]
                run_tui(&rest[1..]);
                #[cfg(not(feature = "tui"))]
                eprintln!("error: tui feature not enabled");
                return;
            }
            "serve" => {
                #[cfg(feature = "serve")]
                run_serve(&rest[1..]);
                #[cfg(not(feature = "serve"))]
                eprintln!("error: serve feature not enabled");
                return;
            }
            "open" => {
                let board_name = rest.get(1).map(|s| s.as_str());
                if atty::is(atty::Stream::Stdout) {
                    #[cfg(feature = "tui")]
                    {
                        if let Err(e) = board_tui::run(board_name) {
                            eprintln!("error: {}", e);
                            std::process::exit(1);
                        }
                    }
                    #[cfg(not(feature = "tui"))]
                    eprintln!("error: tui feature not enabled");
                } else {
                    #[cfg(feature = "serve")]
                    {
                        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
                        if let Err(e) = rt.block_on(board_server::run(4321, board_name, true)) {
                            eprintln!("error: {}", e);
                            std::process::exit(1);
                        }
                    }
                    #[cfg(not(feature = "serve"))]
                    eprintln!("error: serve feature not enabled");
                }
                return;
            }
            _ => {
                if rest.len() >= 2 {
                    match rest[1].as_str() {
                        "tui" => {
                            #[cfg(feature = "tui")]
                            run_tui(&[first.clone()]);
                            #[cfg(not(feature = "tui"))]
                            eprintln!("error: tui feature not enabled");
                            return;
                        }
                        "serve" => {
                            #[cfg(feature = "serve")]
                            run_serve(&[first.clone()]);
                            #[cfg(not(feature = "serve"))]
                            eprintln!("error: serve feature not enabled");
                            return;
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    if let Err(e) = board_core::cli::run() {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}
