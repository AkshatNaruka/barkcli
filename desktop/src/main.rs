//! Bark — desktop shell for barkcli.
//!
//! The window is the *same web app* the browser gets. The shell's only job is
//! lifecycle: find the project, spawn `barkcli serve --app` on a private port,
//! open the window when it is ready, and make sure the server dies with us.

use std::ffi::OsString;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopProject {
    path: String,
    name: String,
}

impl From<&Path> for DesktopProject {
    fn from(path: &Path) -> Self {
        Self {
            path: path.display().to_string(),
            name: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("project")
                .to_string(),
        }
    }
}

struct ServerRuntime {
    child: Option<Child>,
    project: PathBuf,
    port: u16,
    token: String,
}

struct ServerState {
    runtime: Mutex<ServerRuntime>,
    bin: PathBuf,
}

#[derive(Clone, Copy)]
struct WindowGeometry {
    width: f64,
    height: f64,
    x: f64,
    y: f64,
}

fn main() {
    let smoke = std::env::args().any(|arg| arg == "--smoke");
    let project = match resolve_project() {
        Some(p) => p,
        None => {
            let message = "Bark needs a project folder (one containing .board/ or .git/).\n\
                           Pass --project <dir> or set BARKCLI_PROJECT.";
            if smoke {
                eprintln!("{}", message);
                std::process::exit(1);
            }
            fatal(message);
        }
    };

    if smoke {
        if let Err(e) = run_smoke(&project) {
            eprintln!("{}", e);
            std::process::exit(1);
        }
        return;
    }

    remember_project(&project);

    let bin = barkcli_bin().unwrap_or_else(|| {
        fatal("Could not find the `barkcli` binary. Build it first: cargo build -p barkcli");
    });

    let port = free_port();
    let token = random_token();
    // Chat is the landing surface. Without an explicit fragment the webview
    // can restore an older hash from its session history, which would make a
    // fresh launch feel arbitrary.
    let url = format!("http://127.0.0.1:{}/?token={}#/chat", port, token);

    let mut child = spawn_server(&bin, &project, port, &token).unwrap_or_else(|e| {
        fatal(&format!("Failed to start barkcli: {}", e));
    });

    // Typical start is < 1s. Blocking here (before the event loop) is
    // deliberate: the first window the user sees is already the app.
    if let Err(e) = wait_for_server(&mut child, port, Duration::from_secs(20)) {
        fatal(&e);
    }

    let title = format!("Bark — {}", DesktopProject::from(project.as_path()).name);
    let geometry = load_window_geometry();
    let app_bin = bin.clone();

    tauri::Builder::default()
        .manage(ServerState {
            runtime: Mutex::new(ServerRuntime {
                child: Some(child),
                project: project.clone(),
                port,
                token: token.clone(),
            }),
            bin: app_bin,
        })
        .invoke_handler(tauri::generate_handler![
            current_project,
            open_project_dialog,
            switch_project,
            recent_projects,
            reveal_project,
            open_provider_login,
            open_terminal,
            open_logs,
            notify,
        ])
        .on_menu_event(|app, event| {
            let _ = app.emit("bark-menu", event.id().as_ref());
        })
        .setup(move |app| {
            let parsed = url.parse().expect("valid local url");
            let mut window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
                .title(title)
                .inner_size(1440.0, 900.0)
                .min_inner_size(1040.0, 680.0)
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .background_color(tauri::window::Color(10, 9, 8, 255));

            if let Some(saved) = geometry {
                // Sizes and positions are logical points, matching the builder API.
                window = window
                    .inner_size(saved.width.max(1040.0), saved.height.max(680.0))
                    .position(saved.x, saved.y);
            } else {
                window = window.center();
            }
            window.build()?;

            // Native macOS menu. Every custom item has an id the webview
            // listens for; standard edit/window items keep their system
            // behavior and shortcuts.
            let item = |id: &str, text: &str, accelerator: Option<&str>| {
                MenuItem::with_id(app, id, text, true, accelerator)
            };
            let app_menu = SubmenuBuilder::new(app, "Bark")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .separator()
                .quit()
                .build()?;
            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&item("open-project", "Open Project…", Some("CmdOrCtrl+O"))?)
                .item(&item("new-chat", "New Chat", Some("CmdOrCtrl+Shift+N"))?)
                .item(&item("new-intent", "New Intent", Some("CmdOrCtrl+N"))?)
                .separator()
                .item(&item("quick-open", "Quick Open…", Some("CmdOrCtrl+P"))?)
                .item(&item("command-runner", "Run Command…", Some("CmdOrCtrl+Shift+R"))?)
                .item(&item("command-palette", "Command Palette…", Some("CmdOrCtrl+K"))?)
                .item(&item("settings", "Settings…", Some("CmdOrCtrl+,"))?)
                .separator()
                .item(&item("open-terminal", "Open Terminal", Some("CmdOrCtrl+Shift+T"))?)
                .item(&item("reveal-project", "Reveal Project in Finder", None)?)
                .separator()
                .close_window()
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&item("toggle-workbench", "Toggle Workbench", Some("CmdOrCtrl+J"))?)
                .separator()
                .fullscreen()
                .build()?;
            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;
            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&item("help", "Bark Help", None)?)
                .build()?;
            let menu = MenuBuilder::new(app)
                .items(&[
                    &app_menu,
                    &file_menu,
                    &edit_menu,
                    &view_menu,
                    &window_menu,
                    &help_menu,
                ])
                .build()?;
            app.set_menu(menu)?;

            if let Some(win) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                win.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                        remember_window_state(&handle);
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Bark")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                remember_window_state(app);
                if let Some(state) = app.try_state::<ServerState>() {
                    if let Some(mut child) = state.runtime.lock().unwrap().child.take() {
                        stop_child(&mut child);
                    }
                }
            }
        });
}

#[tauri::command]
fn current_project(state: State<'_, ServerState>) -> DesktopProject {
    let runtime = state.runtime.lock().unwrap();
    DesktopProject::from(runtime.project.as_path())
}

#[tauri::command]
fn open_project_dialog(state: State<'_, ServerState>) -> Option<DesktopProject> {
    let current = {
        let runtime = state.runtime.lock().unwrap();
        runtime.project.clone()
    };
    rfd::FileDialog::new()
        .set_title("Open a project in Bark")
        .set_directory(&current)
        .pick_folder()
        .map(|path| DesktopProject::from(path.as_path()))
}

#[tauri::command]
async fn switch_project(
    app: AppHandle,
    state: State<'_, ServerState>,
    path: String,
) -> Result<DesktopProject, String> {
    let bin = state.bin.clone();
    tauri::async_runtime::spawn_blocking(move || switch_project_blocking(&app, &bin, path))
        .await
        .map_err(|error| format!("project switch task failed: {error}"))?
}

fn switch_project_blocking(
    app: &AppHandle,
    bin: &Path,
    path: String,
) -> Result<DesktopProject, String> {
    let target = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("could not open that folder: {error}"))?;
    if !target.is_dir() {
        return Err("the selected path is not a folder".to_string());
    }

    let state = app.state::<ServerState>();
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "server state is locked".to_string())?;
    if runtime.project == target {
        return Ok(DesktopProject::from(target.as_path()));
    }

    let old_project = runtime.project.clone();
    let old_name = DesktopProject::from(old_project.as_path()).name;
    if let Some(mut child) = runtime.child.take() {
        stop_child(&mut child);
    }

    let new_port = free_port();
    let new_token = random_token();
    let mut child = match spawn_server(bin, &target, new_port, &new_token) {
        Ok(child) => child,
        Err(error) => {
            restart_old_project(&mut runtime, bin, &old_project);
            return Err(format!("could not start the new project: {error}"));
        }
    };
    if let Err(error) = wait_for_server(&mut child, new_port, Duration::from_secs(20)) {
        stop_child(&mut child);
        restart_old_project(&mut runtime, bin, &old_project);
        return Err(format!(
            "the new project did not start: {error}. Reopened {old_name}."
        ));
    }

    runtime.project = target.clone();
    runtime.port = new_port;
    runtime.token = new_token.clone();
    runtime.child = Some(child);
    drop(runtime);

    remember_project(&target);
    let opened = DesktopProject::from(target.as_path());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&format!("Bark — {}", opened.name));
    }

    // Let the command return before the webview leaves the old origin.
    let url = format!(
        "http://127.0.0.1:{}/?token={}#/workspace",
        new_port, new_token
    );
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(180));
        if let Some(window) = handle.get_webview_window("main") {
            if let Ok(parsed) = url.parse() {
                let _ = window.navigate(parsed);
            }
        }
    });

    Ok(opened)
}

fn restart_old_project(runtime: &mut ServerRuntime, bin: &Path, old_project: &Path) {
    let port = free_port();
    let token = random_token();
    let Ok(mut child) = spawn_server(bin, old_project, port, &token) else {
        return;
    };
    if wait_for_server(&mut child, port, Duration::from_secs(20)).is_ok() {
        runtime.project = old_project.to_path_buf();
        runtime.port = port;
        runtime.token = token;
        runtime.child = Some(child);
    } else {
        stop_child(&mut child);
    }
}

#[tauri::command]
fn recent_projects(state: State<'_, ServerState>) -> Vec<DesktopProject> {
    let current = {
        let runtime = state.runtime.lock().unwrap();
        DesktopProject::from(runtime.project.as_path())
    };
    let mut projects = load_state()
        .and_then(|state| state.get("recent").cloned())
        .and_then(|value| serde_json::from_value::<Vec<DesktopProject>>(value).ok())
        .unwrap_or_default();
    projects.retain(|project| project.path != current.path);
    projects.insert(0, current);
    projects.truncate(8);
    projects
}

#[tauri::command]
fn reveal_project(state: State<'_, ServerState>, path: Option<String>) -> bool {
    let target = path.unwrap_or_else(|| {
        let runtime = state.runtime.lock().unwrap();
        runtime.project.display().to_string()
    });
    Command::new("open")
        .arg(target)
        .spawn()
        .map(|mut child| {
            let _ = child.wait();
            true
        })
        .unwrap_or(false)
}

/// Open the official provider login in Terminal. Only allowlisted commands are
/// accepted; the web app never supplies a shell string.
#[tauri::command]
fn open_terminal(state: State<'_, ServerState>, path: Option<String>) -> bool {
    let project = state.runtime.lock().unwrap().project.clone();
    let target = path
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .unwrap_or(project);
    Command::new("open")
        .args(["-a", "Terminal", target.to_string_lossy().as_ref()])
        .spawn()
        .map(|mut child| {
            let _ = child.wait();
            true
        })
        .unwrap_or(false)
}

#[tauri::command]
fn open_logs() -> bool {
    let Some(home) = std::env::var_os("HOME") else {
        return false;
    };
    let path = PathBuf::from(home).join("Library/Logs/barkcli/server.log");
    if !path.is_file() {
        return false;
    }
    Command::new("open")
        .arg(path)
        .spawn()
        .map(|mut child| {
            let _ = child.wait();
            true
        })
        .unwrap_or(false)
}

#[tauri::command]
fn notify(title: String, body: String) -> bool {
    let escape = |value: &str| {
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace(['\n', '\r'], " ")
    };
    let script = format!(
        "display notification \"{}\" with title \"{}\"",
        escape(&body),
        escape(&title)
    );
    Command::new("osascript")
        .args(["-e", script.as_str()])
        .spawn()
        .map(|mut child| {
            let _ = child.wait();
            true
        })
        .unwrap_or(false)
}

#[tauri::command]
fn open_provider_login(provider: String) -> bool {
    let command = match provider.as_str() {
        "opencode" => "opencode auth login",
        "claude-code" | "claude" => "claude auth login",
        "codex" => "codex login",
        _ => return false,
    };
    let script = format!(
        "tell application \"Terminal\" to do script \"{}\"",
        command.replace('\\', "\\\\").replace('"', "\\\"")
    );
    Command::new("osascript")
        .args(["-e", script.as_str()])
        .spawn()
        .map(|mut child| {
            let _ = child.wait();
            true
        })
        .unwrap_or(false)
}

#[cfg(unix)]
unsafe fn libc_kill(pid: i32) {
    // Avoid a libc dependency for one call.
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    kill(pid, 15);
}

/// A double-clicked `.app` has no terminal. Surface startup failures in a
/// native dialog, while still printing to stderr for `open`/CLI launches.
fn fatal(message: &str) -> ! {
    eprintln!("{}", message);
    let _ = rfd::MessageDialog::new()
        .set_title("Bark")
        .set_level(rfd::MessageLevel::Error)
        .set_description(message)
        .show();
    std::process::exit(1);
}

/// SIGTERM first so `serve --app` removes its pid files, then force-kill if it
/// does not exit within four seconds.
fn stop_child(child: &mut Child) {
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

/// Headless launch used by `desktop/scripts/smoke-app.sh`.
///
/// Starts the same sidecar with the same environment as a normal launch,
/// prints one JSON line with the private port/token, then stays alive long
/// enough for the script to probe the API before stopping the sidecar.
fn run_smoke(project: &Path) -> Result<(), String> {
    let bin = barkcli_bin().ok_or_else(|| {
        "Could not find the `barkcli` binary. Build it first: cargo build -p barkcli".to_string()
    })?;
    let port = free_port();
    let token = random_token();
    let mut child = spawn_server(&bin, project, port, &token)
        .map_err(|e| format!("Failed to start barkcli: {}", e))?;

    if let Err(e) = wait_for_server(&mut child, port, Duration::from_secs(20)) {
        stop_child(&mut child);
        return Err(e);
    }

    println!(
        "{}",
        serde_json::json!({
            "status": "ready",
            "port": port,
            "token": token,
            "pid": child.id(),
        })
    );
    let _ = std::io::stdout().flush();

    let seconds = std::env::var("BARKCLI_SMOKE_SECS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(30);
    std::thread::sleep(Duration::from_secs(seconds));
    stop_child(&mut child);
    Ok(())
}

/// Finder launches inherit launchd's minimal PATH. Agents installed in
/// `~/.opencode/bin`, `~/.local/bin`, Homebrew, etc. must still be visible to
/// provider probing and to AI runs.
fn augmented_path() -> OsString {
    let mut dirs: Vec<PathBuf> = Vec::new();

    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        for rel in [
            ".opencode/bin",
            ".local/bin",
            ".cargo/bin",
            ".bun/bin",
            ".volta/bin",
            ".npm-global/bin",
            "Library/pnpm",
            ".local/share/mise/shims",
        ] {
            push_unique(&mut dirs, home.join(rel));
        }
    }

    for dir in [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ] {
        push_unique(&mut dirs, PathBuf::from(dir));
    }

    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            push_unique(&mut dirs, dir);
        }
    }

    std::env::join_paths(&dirs).unwrap_or_else(|_| std::env::var_os("PATH").unwrap_or_default())
}

fn push_unique(dirs: &mut Vec<PathBuf>, dir: PathBuf) {
    if !dir.as_os_str().is_empty() && !dirs.contains(&dir) {
        dirs.push(dir);
    }
}

/// The UI the sidecar should serve. In a bundle this is
/// `Contents/Resources/web/dist`; in development it is the repo's `web/dist`.
/// Passing it explicitly stops a project-local `web/dist` from overriding the
/// app the user launched.
fn bundled_web_dist() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(macos) = exe.parent() {
            if let Some(contents) = macos.parent() {
                let bundled = contents.join("Resources").join("web").join("dist");
                if bundled.is_dir() {
                    return Some(bundled);
                }
            }
            let sibling = macos.join("..").join("web").join("dist");
            if sibling.is_dir() {
                return Some(sibling);
            }
        }
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../web/dist");
    if dev.is_dir() {
        return Some(dev);
    }
    None
}

fn log_file() -> Option<fs::File> {
    let home = std::env::var_os("HOME")?;
    let dir = PathBuf::from(home)
        .join("Library")
        .join("Logs")
        .join("barkcli");
    fs::create_dir_all(&dir).ok()?;
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("server.log"))
        .ok()
}

fn pipe_logs<R: std::io::Read + Send + 'static>(reader: R, label: &'static str) {
    let mut log = log_file();
    std::thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            eprintln!("[barkcli:{}] {}", label, line);
            if let Some(file) = log.as_mut() {
                let _ = writeln!(file, "{} {}", label, line);
            }
        }
    });
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
    .env("PATH", augmented_path())
    // Keep the pipes drained; a full stdout buffer would stall the server.
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    if let Some(dist) = bundled_web_dist() {
        cmd.env("BARKCLI_WEB_DIST", dist);
    }

    let mut child = cmd.spawn()?;

    if let Some(stdout) = child.stdout.take() {
        pipe_logs(stdout, "stdout");
    }
    if let Some(stderr) = child.stderr.take() {
        pipe_logs(stderr, "stderr");
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

    if let Some(saved) = load_project() {
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

fn load_state() -> Option<serde_json::Value> {
    let text = fs::read_to_string(state_path()?).ok()?;
    serde_json::from_str(&text).ok()
}

fn load_project() -> Option<String> {
    load_state()?
        .get("project")?
        .as_str()
        .map(|s| s.to_string())
}

fn load_window_geometry() -> Option<WindowGeometry> {
    let state = load_state()?;
    let window = state.get("window")?;
    let width = window.get("width")?.as_f64()?;
    let height = window.get("height")?.as_f64()?;
    let x = window.get("x")?.as_f64()?;
    let y = window.get("y")?.as_f64()?;
    if !width.is_finite() || !height.is_finite() || !x.is_finite() || !y.is_finite() {
        return None;
    }
    Some(WindowGeometry {
        width,
        height,
        x,
        y,
    })
}

fn update_state(update: impl FnOnce(&mut serde_json::Map<String, serde_json::Value>)) {
    let Some(path) = state_path() else { return };
    let mut value = fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let Some(map) = value.as_object_mut() else { return };
    update(map);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, serde_json::to_string_pretty(&value).unwrap_or_default());
}

fn remember_project(project: &Path) {
    let entry = DesktopProject::from(project);
    let path = entry.path.clone();
    let value = serde_json::to_value(&entry).unwrap_or_else(|_| serde_json::json!({}));
    update_state(|state| {
        state.insert("project".into(), serde_json::Value::String(path.clone()));
        let mut recent = state
            .get("recent")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        recent.retain(|item| item.get("path").and_then(|path| path.as_str()) != Some(path.as_str()));
        recent.insert(0, value);
        recent.truncate(8);
        state.insert("recent".into(), serde_json::Value::Array(recent));
    });
}

fn remember_window_state(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(size) = window.inner_size() else { return };
    let Ok(position) = window.outer_position() else { return };
    let scale = window.scale_factor().unwrap_or(1.0);
    if scale <= 0.0 {
        return;
    }
    update_state(|state| {
        state.insert(
            "window".into(),
            serde_json::json!({
                "width": size.width as f64 / scale,
                "height": size.height as f64 / scale,
                "x": position.x as f64 / scale,
                "y": position.y as f64 / scale,
            }),
        );
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn augmented_path_prepends_agent_bins_and_keeps_existing() {
        let parts: Vec<PathBuf> = std::env::split_paths(&augmented_path()).collect();

        assert!(parts.contains(&PathBuf::from("/opt/homebrew/bin")));
        assert!(parts.contains(&PathBuf::from("/usr/local/bin")));

        if let Some(home) = std::env::var_os("HOME") {
            assert!(parts.contains(&PathBuf::from(&home).join(".opencode/bin")));
            assert!(parts.contains(&PathBuf::from(&home).join(".local/bin")));
        }

        if let Some(existing) = std::env::var_os("PATH") {
            for dir in std::env::split_paths(&existing) {
                assert!(parts.contains(&dir), "missing inherited PATH entry: {:?}", dir);
            }
        }

        let mut deduped = parts.clone();
        deduped.dedup();
        assert_eq!(parts, deduped, "augmented PATH contains duplicates");
    }

    #[test]
    fn dev_web_dist_is_the_repo_build() {
        let expected = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../web/dist");
        if !expected.is_dir() {
            // `cargo test` in the desktop crate is allowed before the web
            // build; the bundle verifier is the gate that requires it.
            return;
        }
        let dist = bundled_web_dist().expect("web/dist should exist for dev builds");
        assert!(dist.ends_with("web/dist"));
    }
}
