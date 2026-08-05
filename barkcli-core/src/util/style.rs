use std::io::IsTerminal;

use owo_colors::OwoColorize;

/// Whether stdout supports color (i.e. is a real terminal).
pub fn tty() -> bool {
    std::io::stdout().is_terminal() && std::io::stderr().is_terminal()
}

fn paint<F: Fn(String) -> String>(s: impl AsRef<str>, f: F) -> String {
    let s = s.as_ref().to_string();
    if tty() { f(s) } else { s }
}

/// Dimmed secondary text (IDs, timestamps, captions).
pub fn muted(s: impl AsRef<str>) -> String {
    paint(s, |x| x.dimmed().to_string())
}

/// Bold primary value.
pub fn strong(s: impl AsRef<str>) -> String {
    paint(s, |x| x.bold().to_string())
}

/// Success / positive feedback (green).
pub fn ok(s: impl AsRef<str>) -> String {
    paint(s, |x| x.green().to_string())
}

/// Error / destructive feedback (red).
pub fn err(s: impl AsRef<str>) -> String {
    paint(s, |x| x.red().to_string())
}

/// Accent / emphasis (cyan-blue, matches TUI accent).
pub fn accent(s: impl AsRef<str>) -> String {
    paint(s, |x| x.cyan().to_string())
}

/// Warning (yellow).
pub fn warn(s: impl AsRef<str>) -> String {
    paint(s, |x| x.yellow().to_string())
}

/// Priority coloring: high = red bold, medium = yellow, low = dim.
pub fn priority(p: &str) -> String {
    match p {
        "high" => paint(p, |x| x.red().bold().to_string()),
        "medium" => warn(p),
        "low" => muted(p),
        _ => p.to_string(),
    }
}

/// Column name in status tables: done = green, doing = yellow.
pub fn column(name: &str) -> String {
    match name {
        "done" | "completed" => ok(name),
        "doing" | "in-progress" => warn(name),
        _ => accent(name),
    }
}

/// Card title in list tables: plain unless pinned (yellow + pin).
pub fn title(s: &str, pinned: bool) -> String {
    if pinned {
        format!("{} 📌", warn(s))
    } else {
        s.to_string()
    }
}
