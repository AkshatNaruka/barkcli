pub mod app;
pub mod components;
pub mod theme;
pub mod ui;
mod handlers;

use anyhow::Result;
use ratatui::{
    backend::CrosstermBackend,
    Terminal,
};
use crossterm::{
    event::{DisableMouseCapture, EnableMouseCapture},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use std::io;

use crate::app::App;

/// Check if stdout is a TTY (for CI-aware mode).
pub fn is_tty() -> bool {
    use std::io::IsTerminal;
    std::io::stdout().is_terminal()
}

/// Check if colors should be disabled (CI/non-TTY mode).
pub fn colors_enabled() -> bool {
    if std::env::var("NO_COLOR").is_ok() {
        return false;
    }
    if std::env::var("BARKCLI_NO_COLOR").is_ok() {
        return false;
    }
    is_tty()
}

pub fn run(board_name: Option<&str>) -> Result<()> {
    let mut app = if let Some(name) = board_name {
        App::from_board_name(name)?
    } else {
        let boards = barkcli_core::storage::board_file::list_board_files()?;
        if boards.is_empty() {
            eprintln!("No boards found. Create one with `board create <name>`");
            return Ok(());
        }
        if boards.len() == 1 {
            App::from_board_name(&boards[0])?
        } else {
            App::for_picker(boards)
        }
    };

    // CI-aware mode: use the minimal monochrome theme when not a TTY
    if !colors_enabled() {
        app.theme = crate::app::Theme::minimal();
    }

    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let res = app.run(&mut terminal);

    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    if let Err(e) = res {
        eprintln!("error: {}", e);
    }
    Ok(())
}
