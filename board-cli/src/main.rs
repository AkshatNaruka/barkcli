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
            s if s.starts_with('-') => { /* skip unknown flags */ }
            s => {
                // First non-flag argument is the board name
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

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let rest = &args[1..];

    if let Some(first) = rest.first() {
        match first.as_str() {
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
