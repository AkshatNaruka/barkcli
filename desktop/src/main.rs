//! Bark — desktop shell for barkcli.
//!
//! The window is the *same web app* the browser gets. The shell's only job is
//! lifecycle: find the project, spawn `barkcli serve --app` on a private port,
//! open the window when it is ready, and make sure the server dies with us.

use std::fs;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct ServerState {
    child: Mutex<Option<Child>>,
}

fn main() {
    let project = match resolve_project() {
        Some(p) => p,
        None => {
            eprintln!(
                "Bark needs a project folder (one containing .board/ or .git/).\n\
                 Pass --project <dir> or set BARKCLI_PROJECT."
            );
            std::process::exit(1);
        }
    };
    remember_project(&project);

    let bin = barkcli_bin().unwrap_or_else(|| {
        eprintln!("Could not find the `barkcli` binary. Build it first: cargo build -p barkcli");
        std::process::exit(1);
    });

    let port = free_port();
    let token = random_token();
    let url = format!("http://127.0.0.1:{}/?token={}", port, token);

    let mut child = spawn_server(&bin, &project, port, &token).unwrap_or_else(|e| {
        eprintln!("Failed to start barkcli: {}", e);
        std::process::exit(1);
    });

    // Typical start is < 1s. Blocking here (before the event loop) is
    // deliberate: the first window the user sees is already the app.
    if let Err(e) = wait_for_server(&mut child, port, Duration::from_secs(20)) {
        eprintln!("{}", e);
        std::process::exit(1);
    }

    let title = format!(
        "Bark — {}",
        project
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("project")
    );

    tauri::Builder::default()
        .manage(ServerState {
            child: Mutex::new(Some(child)),
        })
        .setup(move |app| {
            let parsed = url.parse().expect("valid local url");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
                .title(title)
                .inner_size(1440.0, 900.0)
                .min_inner_size(1040.0, 680.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Bark")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ServerState>() {
                    if let Some(mut child) = state.child.lock().unwrap().take() {
                        // SIGTERM first so --app can remove its pid files.
                        #[cfg(unix)]
                        unsafe {
                            libc_kill(child.id() as i32);
                        }
                        let deadline = Instant::now() + Duration::from_secs(4);
                        while Instant::now() < deadline {
                            if let Ok(Some(_)) = child.try_wait() {
                                return;
                            }
                            std::thread::sleep(Duration::from_millis(50));
                        }
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}

#[cfg(unix)]
unsafe fn libc_kill(pid: i32) {
    // Avoid a libc dependency for one call.
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    kill(pid, 15);
}

fn spawn_server(
    bin: &Path,
    project: &Path,
    port: u16,
    token: &str,
) -> std::io::Result<Child> {
    let port_arg = port.to_string();
    let mut cmd = Command::new(bin);
    cmd.args([
        "serve",
        "--app",
        "--host",
        "127.0.0.1",
        "--port",
        port_arg.as_str(),
        "--token",
        token,
    ])
    .current_dir(project)
    // Keep the pipes drained; a full stdout buffer would stall the server.
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    let mut child = cmd.spawn()?;

    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                eprintln!("[barkcli] {}", line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                eprintln!("[barkcli] {}", line);
            }
        });
    }

    Ok(child)
}

fn wait_for_server(child: &mut Child, port: u16, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        // A second live server makes `--app` exit(3) instead of splitting
        // state; surface that immediately instead of waiting out the timeout.
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "barkcli exited before the app was ready ({}). Is another server running?",
                status
            ));
        }
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", port).parse().unwrap(),
            Duration::from_millis(150),
        )
        .is_ok()
        {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(80));
    }
    Err(format!("barkcli did not become ready on port {}", port))
}

fn free_port() -> u16 {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(4321)
}

fn random_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}{:x}", std::process::id(), nanos)
}

/// Find the barkcli binary: explicit env, next to the app (bundled sidecar),
/// the dev build output, or PATH.
fn barkcli_bin() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("BARKCLI_BIN") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../target/debug/barkcli");

    // In development, always use the workspace build. Tauri copies the
    // sidecar next to the binary at build time, which goes stale the moment
    // `barkcli` is rebuilt — that is exactly how a fixed server kept running
    // as an old one during this milestone.
    if cfg!(debug_assertions) && dev.is_file() {
        return Some(dev);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let sibling = dir.join("barkcli");
            if sibling.is_file() {
                return Some(sibling);
            }
        }
    }

    if dev.is_file() {
        return Some(dev);
    }

    let out = Command::new("which").arg("barkcli").output().ok()?;
    if out.status.success() {
        let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !p.is_empty() {
            return Some(PathBuf::from(p));
        }
    }
    None
}

fn resolve_project() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("BARKCLI_PROJECT") {
        let p = PathBuf::from(p);
        if p.is_dir() {
            return Some(p);
        }
    }

    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|a| a == "--project") {
        if let Some(p) = args.get(i + 1) {
            let p = PathBuf::from(p);
            if p.is_dir() {
                return Some(p);
            }
        }
    }

    if let Some(saved) = load_state() {
        let path = PathBuf::from(saved);
        if path.is_dir() {
            return Some(path);
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        if let Some(p) = find_upwards(&cwd) {
            return Some(p);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if let Some(p) = find_upwards(dir) {
                return Some(p);
            }
        }
    }

    // Last resort: native folder picker (first launch of a bundled app).
    rfd::FileDialog::new()
        .set_title("Open a barkcli project")
        .pick_folder()
}

fn find_upwards(start: &Path) -> Option<PathBuf> {
    let mut cur = start.canonicalize().ok()?;
    loop {
        if cur.join(".board").is_dir() || cur.join(".git").is_dir() {
            return Some(cur);
        }
        if !cur.pop() {
            return None;
        }
    }
}

fn state_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("barkcli")
            .join("app.json"),
    )
}

fn load_state() -> Option<String> {
    let text = fs::read_to_string(state_path()?).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value.get("project")?.as_str().map(|s| s.to_string())
}

fn remember_project(project: &Path) {
    let Some(path) = state_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let payload = serde_json::json!({ "project": project.display().to_string() });
    let _ = fs::write(path, serde_json::to_string_pretty(&payload).unwrap_or_default());
}
