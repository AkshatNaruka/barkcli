mod version;
mod license;
mod ai;
mod report;
mod changelog;
mod stats;
mod templates;
mod sprint;
mod sync;
mod listener;

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
const DEFAULT_SERVE_PORT: u16 = 4321;

#[cfg(feature = "serve")]
fn run_serve(args: &[String]) {
    let mut port = DEFAULT_SERVE_PORT;
    let mut port_explicit: Option<u16> = None;
    let mut board_name: Option<String> = None;
    let mut open_browser = false;
    let mut host = "127.0.0.1".to_string();
    let mut token: Option<String> = None;
    let mut daemon = false;
    let mut want_stop = false;
    let mut want_kill = false;
    let mut want_status = false;
    let mut force = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--port" | "-p" => {
                i += 1;
                if let Some(v) = args.get(i).and_then(|s| s.parse::<u16>().ok()) {
                    port = v;
                    port_explicit = Some(v);
                } else {
                    eprintln!("warning: invalid --port value, using {}", DEFAULT_SERVE_PORT);
                }
            }
            "--board" | "-b" => { i += 1; board_name = args.get(i).map(|s| s.to_string()); }
            "--host" => { i += 1; host = args.get(i).cloned().unwrap_or_else(|| "127.0.0.1".to_string()); }
            "--token" => { i += 1; token = args.get(i).map(|s| s.to_string()); }
            "--open" | "-o" => open_browser = true,
            "--daemon" | "-d" => daemon = true,
            "--stop" => want_stop = true,
            "--kill" => want_kill = true,
            "--force" => force = true,
            "--status" => want_status = true,
            "--help" | "-h" => { print_serve_help(); return; }
            s if s.starts_with('-') => {}
            s => { if board_name.is_none() { board_name = Some(s.to_string()); } }
        }
        i += 1;
    }

    // `--kill` implies force-kill; `--stop --force` also force-kills.
    if want_kill {
        stop_daemon_with_opts(port_explicit, true, true);
        return;
    }
    if want_stop {
        stop_daemon_with_opts(port_explicit, force, force);
        return;
    }
    if want_status {
        check_daemon_status();
        return;
    }

    if daemon {
        run_daemon(port, board_name.as_deref(), open_browser, &host, token);
        return;
    }

    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    if let Err(e) = rt.block_on(barkcli_server::run(port, board_name.as_deref(), open_browser, &host, token)) {
        eprintln!("error: {}", e);
        eprintln!("hint: if the port is in use, stop the old server first:");
        eprintln!("      barkcli serve --status");
        eprintln!("      barkcli serve --stop --port {}", port);
        std::process::exit(1);
    }
}

#[cfg(feature = "serve")]
fn print_serve_help() {
    println!("Usage: barkcli serve [OPTIONS] [BOARD]");
    println!();
    println!("Browser kanban server. Default: http://localhost:{} (unique to barkcli —", DEFAULT_SERVE_PORT);
    println!("avoids collisions with Next.js/Vite on :3000).");
    println!();
    println!("Options:");
    println!("  -p, --port <PORT>   Server port (default: {})", DEFAULT_SERVE_PORT);
    println!("  -b, --board <NAME>  Board name");
    println!("      --host <HOST>   Bind address (default: 127.0.0.1)");
    println!("      --token <TOKEN> Require auth token");
    println!("  -o, --open          Open browser after starting");
    println!("  -d, --daemon        Run in background");
    println!("      --stop [--port <PORT>] [--force]");
    println!("                      Stop daemon gracefully (SIGTERM, then SIGKILL after 5s).");
    println!("                      With --port, also kills whatever is listening on that port");
    println!("                      even when no PID file exists (e.g. --port 3000).");
    println!("      --kill [--port <PORT>]");
    println!("                      Force-kill daemon (SIGKILL) + any process on the port.");
    println!("                      Use when --stop says nothing is running but the port is busy.");
    println!("      --status        Show PID, port, URL and how to stop it");
    println!("  -h, --help          Show this help");
    println!();
    println!("Examples:");
    println!("  barkcli serve --daemon                  # background on :{}", DEFAULT_SERVE_PORT);
    println!("  barkcli serve --status                  # is it running? which PID/port?");
    println!("  barkcli serve --stop                    # graceful stop via PID file");
    println!("  barkcli serve --stop --port 3000        # kill stale server squatting on :3000");
    println!("  barkcli serve --kill                    # force-kill when graceful stop hangs");
    println!("  barkcli serve --kill --port 4321        # force-kill occupant of :4321");
}

#[cfg(feature = "serve")]
fn serve_pid_path() -> std::path::PathBuf {
    barkcli_core::storage::board_dir::find_board_dir()
        .map(|d| d.join("server.pid"))
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default().join(".board").join("server.pid"))
}

#[cfg(feature = "serve")]
fn serve_info_path() -> std::path::PathBuf {
    serve_pid_path().with_file_name("server.json")
}

#[cfg(feature = "serve")]
fn read_pid_file() -> Option<u32> {
    std::fs::read_to_string(serve_pid_path())
        .ok()?
        .trim()
        .parse::<u32>()
        .ok()
}

#[cfg(feature = "serve")]
fn read_info_port() -> Option<u16> {
    let text = std::fs::read_to_string(serve_info_path()).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    v.get("port")?.as_u64().and_then(|p| u16::try_from(p).ok())
}

#[cfg(feature = "serve")]
fn read_info_host() -> Option<String> {
    let text = std::fs::read_to_string(serve_info_path()).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    v.get("host")?.as_str().map(|s| s.to_string())
}

#[cfg(feature = "serve")]
fn process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

#[cfg(feature = "serve")]
fn process_name(pid: u32) -> String {
    std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

#[cfg(feature = "serve")]
fn is_barkcli_process(pid: u32) -> bool {
    let name = process_name(pid).to_lowercase();
    if name.contains("barkcli") {
        return true;
    }
    // `cargo run -- serve` shows up as `cargo`/`barkcli`; check full args as fallback.
    let args = std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "args="])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase())
        .unwrap_or_default();
    args.contains("barkcli") && args.contains("serve")
}

/// PIDs listening on a TCP port (via lsof). Empty when lsof is missing or port is free.
#[cfg(feature = "serve")]
fn pids_on_port(port: u16) -> Vec<u32> {
    let out = std::process::Command::new("lsof")
        .args([format!("-tiTCP:{}", port), "-sTCP:LISTEN".to_string()])
        .output();
    match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .split_whitespace()
            .filter_map(|s| s.parse::<u32>().ok())
            .collect(),
        _ => Vec::new(),
    }
}

#[cfg(feature = "serve")]
fn send_signal(pid: u32, sig: i32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(pid as i32, sig);
    }
    #[cfg(not(unix))]
    let _ = (pid, sig);
}

#[cfg(feature = "serve")]
fn wait_for_exit(pid: u32, timeout_ms: u64) -> bool {
    let steps = timeout_ms / 100;
    for _ in 0..steps {
        if !process_alive(pid) {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    !process_alive(pid)
}

#[cfg(feature = "serve")]
fn remove_serve_files() {
    let _ = std::fs::remove_file(serve_pid_path());
    let _ = std::fs::remove_file(serve_info_path());
}

#[cfg(feature = "serve")]
fn kill_one_pid(pid: u32, force: bool, label: &str) -> bool {
    if !process_alive(pid) {
        println!("{}: pid {} already exited", label, pid);
        return true;
    }
    if force {
        println!("Force-killing {} (pid {})...", label, pid);
        send_signal(pid, 9); // SIGKILL
    } else {
        println!("Stopping {} (pid {})...", label, pid);
        send_signal(pid, 15); // SIGTERM
        if wait_for_exit(pid, 5000) {
            println!("{} stopped", label);
            return true;
        }
        println!("Force killing {} (did not exit in 5s)...", label);
        send_signal(pid, 9); // SIGKILL
    }
    if wait_for_exit(pid, 2000) {
        println!("{} stopped", label);
        true
    } else {
        eprintln!("{} (pid {}) did not exit", label, pid);
        false
    }
}

/// Kill whatever is listening on `port`. Refuses to kill non-barkcli
/// processes unless `force` (from `--kill` or `--stop --force`) is set,
/// so `serve --stop --port 3000` never nukes an unrelated Next.js dev server by accident.
#[cfg(feature = "serve")]
fn kill_port_occupants(port: u16, force: bool) -> bool {
    let pids = pids_on_port(port);
    if pids.is_empty() {
        println!("Port {} is free (nothing listening)", port);
        return true;
    }
    let mut ok = true;
    for pid in pids {
        let name = process_name(pid);
        let ours = is_barkcli_process(pid);
        if !ours && !force {
            eprintln!(
                "Port {} is in use by pid {} ({}) — not a barkcli server.",
                port,
                pid,
                if name.is_empty() { "unknown" } else { &name }
            );
            eprintln!("Refusing to kill it. Re-run with --kill or --stop --force to override,");
            eprintln!("or stop that process yourself:  kill {}  /  lsof -tiTCP:{} | xargs kill", pid, port);
            ok = false;
            continue;
        }
        let label = format!("process on port {} ({})", port, if name.is_empty() { "unknown".into() } else { name });
        if !kill_one_pid(pid, force, &label) {
            ok = false;
        }
    }
    ok
}

#[cfg(feature = "serve")]
fn run_daemon(port: u16, board_name: Option<&str>, open_browser: bool, host: &str, token: Option<String>) {
    use std::fs;

    let pid_path = serve_pid_path();
    let info_path = serve_info_path();

    // Check if already running
    if let Some(pid) = read_pid_file() {
        if process_alive(pid) {
            let known_port = read_info_port().unwrap_or(DEFAULT_SERVE_PORT);
            eprintln!(
                "barkcli serve is already running (pid {}, port {}).",
                pid, known_port
            );
            eprintln!("  barkcli serve --status          # details");
            eprintln!("  barkcli serve --stop            # graceful stop");
            eprintln!("  barkcli serve --kill            # force-kill");
            return;
        } else {
            // Stale PID file — clean up so the next --status/--stop is accurate.
            remove_serve_files();
        }
    }

    // Refuse to start when the requested port is already taken, and say WHO has it.
    let occupants = pids_on_port(port);
    if !occupants.is_empty() {
        eprintln!("Cannot start: port {} is already in use:", port);
        for pid in &occupants {
            eprintln!("  pid {} ({})", pid, process_name(*pid));
        }
        eprintln!("Stop it first:");
        eprintln!("  barkcli serve --stop --port {}     # graceful (asks before killing non-barkcli)", port);
        eprintln!("  barkcli serve --kill --port {}     # force", port);
        eprintln!("Or pick another port:  barkcli serve --daemon --port <PORT>");
        std::process::exit(1);
    }

    // Fork process
    #[cfg(unix)]
    {
        match unsafe { libc::fork() } {
            -1 => {
                eprintln!("Failed to fork daemon process");
                std::process::exit(1);
            }
            0 => {
                // Child process — become session leader
                unsafe { libc::setsid(); }

                // Close stdin
                unsafe { libc::close(0); }

                // Write PID + info files (port/host so --status/--stop can find us)
                let _ = fs::create_dir_all(pid_path.parent().unwrap());
                let _ = fs::write(&pid_path, std::process::id().to_string());
                let info = serde_json::json!({
                    "pid": std::process::id(),
                    "port": port,
                    "host": host,
                    "started_at": chrono::Utc::now().to_rfc3339(),
                });
                let _ = fs::write(&info_path, serde_json::to_string_pretty(&info).unwrap_or_default());

                // Set up signal handler for cleanup
                unsafe {
                    libc::signal(libc::SIGTERM, libc::SIG_DFL);
                    libc::signal(libc::SIGINT, libc::SIG_DFL);
                }

                // Run the server
                let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
                let result = rt.block_on(barkcli_server::run(port, board_name, open_browser, host, token));

                // Cleanup PID file on exit
                remove_serve_files();

                if let Err(e) = result {
                    eprintln!("daemon error: {}", e);
                }
            }
            pid => {
                // Parent process
                println!("barkcli serve started in background (pid {}, http://localhost:{})", pid, port);
                println!("  barkcli serve --status   # verify it's up");
                println!("  barkcli serve --stop     # graceful stop");
                println!("  barkcli serve --kill     # force-kill if it hangs");
            }
        }
    }

    #[cfg(not(unix))]
    {
        eprintln!("Daemon mode is only supported on Unix systems");
        eprintln!("Run 'barkcli serve' directly instead");
        std::process::exit(1);
    }
}

#[cfg(feature = "serve")]
#[allow(dead_code)]
fn stop_daemon() {
    stop_daemon_with_opts(None, false, false);
}

/// Stop the daemon.
///
/// * `port_opt` — when Some, also kill whatever listens on that port even if
///   no PID file exists (covers stale `serve --port 3000` squatters).
/// * `force` — SIGKILL immediately (from `--kill` / `--stop --force`), and
///   allow killing non-barkcli port occupants.
#[cfg(feature = "serve")]
fn stop_daemon_with_opts(port_opt: Option<u16>, force: bool, allow_non_barkcli: bool) {
    let mut stopped_via_pid = false;
    let mut pid_port: Option<u16> = None;

    match read_pid_file() {
        Some(pid) => {
            if !process_alive(pid) {
                println!("Daemon not running (stale PID file for pid {})", pid);
                remove_serve_files();
            } else {
                pid_port = read_info_port();
                stopped_via_pid = kill_one_pid(pid, force, "Daemon");
                if stopped_via_pid {
                    remove_serve_files();
                }
            }
        }
        None => {
            println!("No daemon PID file found");
        }
    }

    // Determine which ports to sweep for orphaned listeners.
    let mut ports: Vec<u16> = Vec::new();
    if let Some(p) = port_opt {
        ports.push(p);
    } else if let Some(p) = pid_port.or_else(read_info_port) {
        ports.push(p);
    } else {
        ports.push(DEFAULT_SERVE_PORT);
    }

    let mut all_ok = stopped_via_pid;
    for port in ports {
        // Skip the sweep when we already stopped our PID and the port is now free.
        let occupants = pids_on_port(port);
        if occupants.is_empty() {
            if port_opt.is_some() || !stopped_via_pid {
                println!("Port {} is free (nothing listening)", port);
            }
            all_ok = all_ok || stopped_via_pid;
            continue;
        }
        println!("Found listener(s) on port {}: {:?}", port, occupants);
        if kill_port_occupants(port, force || allow_non_barkcli) {
            all_ok = true;
        } else {
            all_ok = false;
        }
        // Re-check: if the port is free now and it matches our PID file port, drop stale files.
        if pids_on_port(port).is_empty() && Some(port) == pid_port {
            remove_serve_files();
        }
    }

    if !all_ok && !stopped_via_pid {
        println!("Nothing stopped.");
        println!("  barkcli serve --status              # see PID + port");
        println!("  barkcli serve --kill                # force-kill daemon");
        println!("  barkcli serve --kill --port <PORT>  # force-kill occupant of a port (e.g. 3000)");
        println!("  lsof -tiTCP:<PORT> | xargs kill      # manual fallback");
    }
}

#[cfg(feature = "serve")]
fn check_daemon_status() {
    match read_pid_file() {
        None => {
            println!("No daemon running (no PID file)");
        }
        Some(pid) => {
            if process_alive(pid) {
                let port = read_info_port().unwrap_or(DEFAULT_SERVE_PORT);
                let host = read_info_host().unwrap_or_else(|| "127.0.0.1".to_string());
                let url_host = if host == "0.0.0.0" { "localhost" } else { host.as_str() };
                println!("Daemon running (pid {}, http://{}:{})", pid, url_host, port);
                println!("  barkcli serve --stop   # graceful stop");
                println!("  barkcli serve --kill   # force-kill");
            } else {
                println!("No daemon running (stale PID file for pid {})", pid);
                remove_serve_files();
            }
        }
    }

    // Always report port occupancy so an orphaned server is easy to spot,
    // even when the PID file is gone (the "hard to detect" complaint).
    let probe_port = read_info_port().unwrap_or(DEFAULT_SERVE_PORT);
    let occupants = pids_on_port(probe_port);
    if occupants.is_empty() {
        println!("Port {} is free", probe_port);
    } else {
        for pid in &occupants {
            let name = process_name(*pid);
            let ours = if is_barkcli_process(*pid) { " (barkcli)" } else { "" };
            println!(
                "Port {} in use by pid {} ({}){}",
                probe_port,
                pid,
                if name.is_empty() { "unknown" } else { &name },
                ours
            );
        }
        println!("  barkcli serve --stop --port {}   # stop it", probe_port);
        println!("  barkcli serve --kill --port {}   # force-kill it", probe_port);
    }

    // Common collision: user expects 4321 but something squats on 3000 (old README example).
    if probe_port != 3000 {
        let squatters = pids_on_port(3000);
        if !squatters.is_empty() {
            println!("Note: port 3000 is also in use:");
            for pid in &squatters {
                println!("  pid {} ({})", pid, process_name(*pid));
            }
            println!("  barkcli serve --stop --port 3000   # stop it (asks first for non-barkcli)");
            println!("  barkcli serve --kill --port 3000   # force-kill it");
        }
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
                match rest.get(1).map(|s| s.as_str()) {
                    Some("propose") | Some("watch") => {
                        if !license::check_pro("agent") { std::process::exit(1); }
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
                        // --dry-run prints the prompt without calling the LLM — free.
                        if !rest.iter().any(|s| s == "--dry-run") && !license::check_pro("agent") { std::process::exit(1); }
                        if let Err(e) = barkcli_core::cli::run_dispatch("context", &rest[1..]) { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                    _ => {
                        // all other context subcommands are free
                        if let Err(e) = barkcli_core::cli::run() { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                }
                return;
            }
            "spec" => {
                if let Err(e) = run_spec_cmd(&rest[1..]) {
                    eprintln!("error: {}", e);
                    std::process::exit(1);
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
            "mcp" => {
                if let Err(e) = barkcli_core::mcp::run_mcp_server() {
                    eprintln!("error: {}", e);
                    std::process::exit(1);
                }
                return;
            }
            "listener" => {
                let matches = listener::command().get_matches_from(
                    std::iter::once("listener".to_string()).chain(rest[1..].iter().cloned()),
                );
                if let Err(e) = listener::run(&matches) {
                    eprintln!("error: {}", e);
                    std::process::exit(1);
                }
                return;
            }
            "orchestrate" => {
                if let Err(e) = run_orchestrate_cmd(&rest[1..]) {
                    eprintln!("error: {}", e);
                    std::process::exit(1);
                }
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
                        if let Err(e) = rt.block_on(barkcli_server::run(DEFAULT_SERVE_PORT, board_name, true, "127.0.0.1", None)) { eprintln!("error: {}", e); std::process::exit(1); }
                    }
                }
                return;
            }
            _ => {}
        }
    }

fn run_spec_cmd(args: &[String]) -> anyhow::Result<()> {
    match args.first().map(|s| s.as_str()) {
        Some("list") | Some("ls") => {
            let board = args.iter().position(|s| s == "-b" || s == "--board")
                .and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            barkcli_core::commands::spec::list(board)
        }
        Some("show") => {
            let board = args.iter().position(|s| s == "-b" || s == "--board")
                .and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            let spec_id = args.get(2).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec show <id>"))?;
            barkcli_core::commands::spec::show(board, spec_id)
        }
        Some("create") | Some("new") => {
            let board = args.iter().position(|s| s == "-b" || s == "--board")
                .and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            let title = args.get(2).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec create <title>"))?;
            let mut description = None;
            let mut priority = None;
            let mut i = 3;
            while i < args.len() {
                match args[i].as_str() {
                    "-d" | "--description" => { i += 1; description = args.get(i).map(|s| s.as_str()); }
                    "-p" | "--priority" => { i += 1; priority = args.get(i).map(|s| s.as_str()); }
                    _ => {}
                }
                i += 1;
            }
            barkcli_core::commands::spec::create(board, title, description, priority)
        }
        Some("update") => {
            let board = args.iter().position(|s| s == "-b" || s == "--board")
                .and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            let spec_id = args.get(2).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec update <id> [options]"))?;
            let mut status = None;
            let mut priority = None;
            let mut description = None;
            let mut i = 3;
            while i < args.len() {
                match args[i].as_str() {
                    "-s" | "--status" => { i += 1; status = args.get(i).map(|s| s.as_str()); }
                    "-p" | "--priority" => { i += 1; priority = args.get(i).map(|s| s.as_str()); }
                    "-d" | "--description" => { i += 1; description = args.get(i).map(|s| s.as_str()); }
                    _ => {}
                }
                i += 1;
            }
            barkcli_core::commands::spec::update(board, spec_id, status, priority, description)
        }
        Some("delete") | Some("rm") => {
            let board = args.iter().position(|s| s == "-b" || s == "--board")
                .and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            let spec_id = args.get(2).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec delete <id>"))?;
            barkcli_core::commands::spec::delete(board, spec_id)
        }
        Some("add-req") => {
            let board = args.iter().position(|s| s == "-b" || s == "--board")
                .and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            let spec_id = args.get(2).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec add-req <spec-id> <title>"))?;
            let title = args.get(3).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec add-req <spec-id> <title>"))?;
            barkcli_core::commands::spec::add_requirement(board, spec_id, title)
        }
        Some("link-code") => {
            let board = args.iter().position(|s| s == "-b" || s == "--board")
                .and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            let spec_id = args.get(2).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec link-code <spec-id> <req-id> <path>"))?;
            let req_id = args.get(3).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec link-code <spec-id> <req-id> <path>"))?;
            let path = args.get(4).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec link-code <spec-id> <req-id> <path>"))?;
            barkcli_core::commands::spec::link_code(board, spec_id, req_id, path)
        }
        Some("link-task") => {
            let board = args.iter().position(|s| s == "-b" || s == "--board")
                .and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            let spec_id = args.get(2).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec link-task <spec-id> <req-id> <task-id>"))?;
            let req_id = args.get(3).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec link-task <spec-id> <req-id> <task-id>"))?;
            let task_id = args.get(4).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec link-task <spec-id> <req-id> <task-id>"))?;
            barkcli_core::commands::spec::link_task(board, spec_id, req_id, task_id)
        }
        Some("trace") => {
            let board = args.iter().position(|s| s == "-b" || s == "--board")
                .and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            let spec_id = args.get(2).ok_or_else(|| anyhow::anyhow!("usage: barkcli spec trace <id>"))?;
            barkcli_core::commands::spec::trace(board, spec_id)
        }
        Some("coverage") => {
            let board = args.iter().position(|s| s == "-b" || s == "--board")
                .and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            barkcli_core::commands::spec::coverage(board)
        }
        Some("scan-stale") => {
            let board = args.iter().position(|s| s == "-b" || s == "--board")
                .and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            let files: Vec<String> = args[2..].iter()
                .filter(|s| !s.starts_with('-'))
                .cloned()
                .collect();
            barkcli_core::commands::spec::scan_stale(board, &files)
        }
        _ => {
            eprintln!("usage: barkcli spec <list|show|create|update|delete|add-req|link-code|link-task|trace|coverage|scan-stale>");
            eprintln!();
            eprintln!("Commands:");
            eprintln!("  list              List all specs");
            eprintln!("  show <id>         Show spec details");
            eprintln!("  create <title>    Create a new spec");
            eprintln!("  update <id>       Update a spec");
            eprintln!("  delete <id>       Delete a spec");
            eprintln!("  add-req <spec> <title>  Add a requirement");
            eprintln!("  link-code <spec> <req> <path>   Link code to requirement");
            eprintln!("  link-task <spec> <req> <task>   Link task to requirement");
            eprintln!("  trace <id>        Show full traceability");
            eprintln!("  coverage          Show coverage stats");
            eprintln!("  scan-stale <files...>  Scan for stale requirements");
            std::process::exit(1);
        }
    }
}

struct AiArgs { dry_run: bool, model: String }

fn run_agent_cmd(args: &[String]) -> anyhow::Result<()> {
    barkcli_core::cli::run_dispatch("agent", args)
}

fn run_orchestrate_cmd(args: &[String]) -> anyhow::Result<()> {
    match args.first().map(|s| s.as_str()) {
        Some("start") => {
            let board_name = args.get(1).map(|s| s.as_str()).unwrap_or("default");
            let role_str = args.get(2).cloned().unwrap_or_else(|| "scrum-master".to_string());
            let role = barkcli_core::agent::AgentRole::from_str(&role_str)
                .ok_or_else(|| anyhow::anyhow!("Invalid role: {}", role_str))?;
            
            let board = barkcli_core::storage::board_file::read_board(board_name)?;
            let mut engine = barkcli_core::agent::OrchestrationEngine::new(board_name, role.clone(), board)?;
            
            println!("Starting orchestration for board '{}' with role '{}'", board_name, role);
            println!("Press Ctrl+C to stop");
            
            loop {
                match engine.run_cycle() {
                    Ok(result) => {
                        println!("\n--- Cycle {} ---", result.cycle_number);
                        println!("Tasks created: {}", result.tasks_created);
                        println!("Tasks dispatched: {}", result.tasks_dispatched);
                        println!("Tasks completed: {}", result.tasks_completed);
                        println!("Tasks failed: {}", result.tasks_failed);
                        for insight in &result.insights {
                            println!("  - {}", insight);
                        }
                    }
                    Err(e) => {
                        eprintln!("Cycle failed: {}", e);
                    }
                }
                
                std::thread::sleep(std::time::Duration::from_secs(30));
            }
        }
        Some("cycle") => {
            let board_name = args.get(1).map(|s| s.as_str()).unwrap_or("default");
            let role_str = args.get(2).cloned().unwrap_or_else(|| "scrum-master".to_string());
            let role = barkcli_core::agent::AgentRole::from_str(&role_str)
                .ok_or_else(|| anyhow::anyhow!("Invalid role: {}", role_str))?;
            
            let board = barkcli_core::storage::board_file::read_board(board_name)?;
            let mut engine = barkcli_core::agent::OrchestrationEngine::new(board_name, role, board)?;
            
            let result = engine.run_cycle()?;
            println!("Cycle {} completed", result.cycle_number);
            println!("Tasks created: {}", result.tasks_created);
            println!("Tasks dispatched: {}", result.tasks_dispatched);
            for insight in &result.insights {
                println!("  - {}", insight);
            }
        }
        Some("status") => {
            let board_name = args.get(1).map(|s| s.as_str()).unwrap_or("default");
            match barkcli_core::agent::OrchestrationEngine::load_state(board_name)? {
                Some(state) => {
                    println!("Orchestration Status: {}", state.status.display_name());
                    println!("Cycle count: {}", state.cycle_count);
                    println!("Tasks dispatched: {}", state.tasks_dispatched);
                    println!("Tasks completed: {}", state.tasks_completed);
                    println!("Tasks failed: {}", state.tasks_failed);
                }
                None => {
                    println!("No orchestration state found for board '{}'", board_name);
                }
            }
        }
        _ => {
            eprintln!("usage: barkcli orchestrate <start|cycle|status> [board-name] [role]");
            eprintln!("  start   - Start continuous orchestration loop");
            eprintln!("  cycle   - Run single orchestration cycle");
            eprintln!("  status  - Show orchestration status");
            eprintln!("  Roles: scrum-master, product-owner, tech-lead, project-manager");
            std::process::exit(1);
        }
    }
    Ok(())
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
