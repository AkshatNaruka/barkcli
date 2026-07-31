use anyhow::Result;
use crossterm::event::{KeyCode, KeyEvent};

use crate::app::{App, AppMode, EditField};

pub fn handle_key(app: &mut App, key: KeyEvent) -> Result<()> {
    match app.mode {
        AppMode::BoardPicker => handle_picker_key(app, key),
        AppMode::Normal => handle_normal_key(app, key),
        AppMode::FilterInput => handle_filter_key(app, key),
        AppMode::AddingTitle => handle_adding_key(app, key),
        AppMode::EditingCard => handle_editing_key(app, key),
        AppMode::ViewingDetail => handle_detail_key(app, key),
        AppMode::ConfirmDelete => handle_confirm_key(app, key),
    }
}

fn handle_picker_key(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Up | KeyCode::Char('k') => {
            app.card_focus = app.card_focus.saturating_sub(1);
        }
        KeyCode::Down | KeyCode::Char('j') => {
            let max = app.all_boards.len().saturating_sub(1);
            if app.card_focus < max {
                app.card_focus += 1;
            }
        }
        KeyCode::Enter => {
            if app.card_focus < app.all_boards.len() {
                let name = &app.all_boards[app.card_focus];
                if let Ok(board) = board_core::storage::board_file::read_board(name) {
                    app.board = board;
                    app.board_name = name.clone();
                    app.mode = AppMode::Normal;
                    app.card_focus = 0;
                    app.focused_column = 0;
                }
            }
        }
        KeyCode::Char('q') | KeyCode::Esc => {
            app.should_quit = true;
        }
        _ => {}
    }
    Ok(())
}

fn handle_normal_key(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Left | KeyCode::Char('h') => {
            if app.focused_column > 0 {
                app.focused_column -= 1;
                app.card_focus = 0;
            }
        }
        KeyCode::Right | KeyCode::Char('l') => {
            if app.focused_column < app.board.columns.len().saturating_sub(1) {
                app.focused_column += 1;
                app.card_focus = 0;
            }
        }
        KeyCode::Up | KeyCode::Char('k') => {
            if app.card_focus > 0 {
                app.card_focus -= 1;
            }
        }
        KeyCode::Down | KeyCode::Char('j') => {
            let count = app.focused_column_card_count();
            if count > 0 && app.card_focus < count.saturating_sub(1) {
                app.card_focus += 1;
            }
        }
        KeyCode::Enter => {
            if app.selected_card().is_some() {
                app.mode = AppMode::ViewingDetail;
            }
        }
        KeyCode::Char('H') | KeyCode::Char('m') => {
            if let Some((idx, _)) = app.selected_card() {
                if app.focused_column > 0 {
                    app.move_card_to_column(idx, app.focused_column - 1)?;
                    app.card_focus = 0;
                }
            }
        }
        KeyCode::Char('L') => {
            if let Some((idx, _)) = app.selected_card() {
                if app.focused_column < app.board.columns.len().saturating_sub(1) {
                    app.move_card_to_column(idx, app.focused_column + 1)?;
                    app.card_focus = 0;
                }
            }
        }
        KeyCode::Char('a') => {
            app.mode = AppMode::AddingTitle;
            app.edit_buffer.clear();
        }
        KeyCode::Char('e') => {
            if let Some((idx, _)) = app.selected_card() {
                let card = &app.board.cards[idx];
                app.edit_card_idx = Some(idx);
                app.edit_buffer = card.title.clone();
                app.edit_field = EditField::Title;
                app.mode = AppMode::EditingCard;
            }
        }
        KeyCode::Char('d') => {
            if app.selected_card().is_some() {
                app.mode = AppMode::ConfirmDelete;
            }
        }
        KeyCode::Char('/') => {
            app.mode = AppMode::FilterInput;
            app.filter.clear();
            app.edit_buffer.clear();
        }
        KeyCode::Char('q') | KeyCode::Esc => {
            app.should_quit = true;
        }
        _ => {}
    }
    Ok(())
}

fn handle_filter_key(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Enter => {
            app.filter = app.edit_buffer.clone();
            app.card_focus = 0;
            app.mode = AppMode::Normal;
        }
        KeyCode::Esc => {
            app.filter.clear();
            app.edit_buffer.clear();
            app.mode = AppMode::Normal;
        }
        KeyCode::Char(c) => {
            app.edit_buffer.push(c);
        }
        KeyCode::Backspace => {
            app.edit_buffer.pop();
        }
        _ => {}
    }
    Ok(())
}

fn handle_adding_key(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Enter => {
            let title = app.edit_buffer.trim().to_string();
            if !title.is_empty() {
                if let Ok(id) = app.add_card(&title) {
                    if let Some(idx) = app.board.cards.iter().position(|c| c.id == id) {
                        app.edit_card_idx = Some(idx);
                        let card = &app.board.cards[idx];
                        app.edit_buffer = card.title.clone();
                        app.edit_field = EditField::Title;
                        app.mode = AppMode::EditingCard;
                    } else {
                        app.mode = AppMode::Normal;
                    }
                } else {
                    app.mode = AppMode::Normal;
                }
            } else {
                app.mode = AppMode::Normal;
            }
        }
        KeyCode::Esc => {
            app.mode = AppMode::Normal;
        }
        KeyCode::Char(c) => {
            app.edit_buffer.push(c);
        }
        KeyCode::Backspace => {
            app.edit_buffer.pop();
        }
        _ => {}
    }
    Ok(())
}

fn handle_editing_key(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Tab => {
            app.edit_field = next_field(app.edit_field);
            let val = current_field_value(app);
            app.edit_buffer = val;
        }
        KeyCode::Enter => {
            if app.edit_field == EditField::Done {
                let buf = app.edit_buffer.clone();
                let parts: Vec<&str> = buf.splitn(5, '\n').collect();
                let title = parts.first().map(|s| s.trim()).unwrap_or("");
                let desc = parts.get(1).map(|s| s.trim()).unwrap_or("");
                let prio = parts.get(2).map(|s| s.trim()).unwrap_or("medium");
                let labels = parts.get(3).map(|s| s.trim()).unwrap_or("");
                let assignee = parts.get(4).map(|s| s.trim()).unwrap_or("");
                if let Some(idx) = app.edit_card_idx {
                    app.update_card(idx, title, desc, prio, labels, assignee)?;
                }
                app.mode = AppMode::Normal;
                app.edit_card_idx = None;
            } else {
                app.edit_field = next_field(app.edit_field);
                let val = current_field_value(app);
                app.edit_buffer = val;
            }
        }
        KeyCode::Esc => {
            app.mode = AppMode::Normal;
            app.edit_card_idx = None;
        }
        KeyCode::Char(c) => {
            app.edit_buffer.push(c);
        }
        KeyCode::Backspace => {
            app.edit_buffer.pop();
        }
        _ => {}
    }
    Ok(())
}

fn next_field(f: EditField) -> EditField {
    match f {
        EditField::Title => EditField::Description,
        EditField::Description => EditField::Priority,
        EditField::Priority => EditField::Labels,
        EditField::Labels => EditField::Assignee,
        EditField::Assignee => EditField::Done,
        EditField::Done => EditField::Title,
        EditField::Column => EditField::Title,
    }
}

fn current_field_value(app: &App) -> String {
    let idx = match app.edit_card_idx {
        Some(i) => i,
        None => return String::new(),
    };
    match app.edit_field {
        EditField::Title => app.board.cards.get(idx).map(|c| c.title.clone()).unwrap_or_default(),
        EditField::Description => app.board.cards.get(idx).and_then(|c| c.description.clone()).unwrap_or_default(),
        EditField::Priority => app.board.cards.get(idx).map(|c| c.priority.clone()).unwrap_or_default(),
        EditField::Labels => app.board.cards.get(idx).map(|c| c.labels.join(", ")).unwrap_or_default(),
        EditField::Assignee => app.board.cards.get(idx).and_then(|c| c.assignee.clone()).unwrap_or_default(),
        EditField::Done | EditField::Column => String::new(),
    }
}

fn handle_detail_key(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Esc | KeyCode::Char('q') => {
            app.mode = AppMode::Normal;
        }
        _ => {}
    }
    Ok(())
}

fn handle_confirm_key(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Char('y') | KeyCode::Enter => {
            if let Some((idx, _)) = app.selected_card() {
                let _ = app.remove_card(idx);
            }
            app.mode = AppMode::Normal;
        }
        KeyCode::Char('n') | KeyCode::Esc => {
            app.mode = AppMode::Normal;
        }
        _ => {}
    }
    Ok(())
}
