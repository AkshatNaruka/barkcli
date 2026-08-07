use anyhow::Result;
use chrono::Utc;
use crossterm::event::{KeyCode, KeyEvent};

use barkcli_core::models::card::LinkType;

use crate::app::{App, AppMode, EditField, LinkState, SortKey, Tab, Theme};

pub fn handle_key(app: &mut App, key: KeyEvent) -> Result<()> {
    match app.mode {
        AppMode::BoardPicker => handle_picker(app, key),
        AppMode::Normal => handle_normal(app, key),
        AppMode::FilterInput => handle_filter(app, key),
        AppMode::CommandPalette => handle_palette(app, key),
        AppMode::AddingTitle => handle_adding(app, key),
        AppMode::EditingCard => handle_editing(app, key),
        AppMode::ViewingDetail => handle_detail(app, key),
        AppMode::ConfirmDelete => handle_confirm(app, key),
        AppMode::CodeSearch => handle_code_search(app, key),
        AppMode::LinkTarget => handle_link_target(app, key),
        AppMode::LinkKind => handle_link_kind(app, key),
        AppMode::UnlinkTarget => handle_unlink_target(app, key),
    }
}

fn handle_picker(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Up | KeyCode::Char('k') => app.card_focus = app.card_focus.saturating_sub(1),
        KeyCode::Down | KeyCode::Char('j') => {
            if app.card_focus < app.all_boards.len().saturating_sub(1) {
                app.card_focus += 1;
            }
        }
        KeyCode::Enter => {
            if app.card_focus < app.all_boards.len() {
                let name = &app.all_boards[app.card_focus];
                if let Ok(b) = barkcli_core::storage::board_file::read_board(name) {
                    app.board = b;
                    app.board_name = name.clone();
                    app.sprints = barkcli_core::storage::sprints::read_sprints(name).unwrap_or_default();
                    app.context = barkcli_core::storage::context::read_context(name).unwrap_or_default();
                    app.mode = AppMode::Normal;
                    app.card_focus = 0;
                    app.focused_column = 0;
                }
            }
        }
        KeyCode::Char('q') | KeyCode::Esc => app.should_quit = true,
        _ => {}
    }
    Ok(())
}

fn switch_tab(app: &mut App, tab: Tab) {
    app.tab = tab;
    app.card_focus = 0;
    app.detail_card_id = None;
}

fn handle_normal(app: &mut App, key: KeyEvent) -> Result<()> {
    // Tab bar switching works everywhere.
    if let KeyCode::Char(c) = key.code {
        if let Some(tab) = Tab::from_key(c) {
            switch_tab(app, tab);
            return Ok(());
        }
    }
    if key.code == KeyCode::Tab {
        let next = match app.tab {
            Tab::Board => Tab::List,
            Tab::List => Tab::Tree,
            Tab::Tree => Tab::Agenda,
            Tab::Agenda => Tab::Reports,
            Tab::Reports => Tab::Code,
            Tab::Code => Tab::Board,
        };
        switch_tab(app, next);
        return Ok(());
    }

    match app.tab {
        Tab::Board => handle_board_keys(app, key),
        Tab::List => handle_list_keys(app, key),
        Tab::Tree => handle_tree_keys(app, key),
        Tab::Agenda => handle_agenda_keys(app, key),
        Tab::Reports => handle_reports_keys(app, key),
        Tab::Code => handle_code_keys(app, key),
    }
}

fn handle_board_keys(app: &mut App, key: KeyEvent) -> Result<()> {
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
            if app.card_focus > 0 { app.card_focus -= 1; }
        }
        KeyCode::Down | KeyCode::Char('j') => {
            let n = app.focused_column_card_count();
            if n > 0 && app.card_focus < n.saturating_sub(1) {
                app.card_focus += 1;
            }
        }
        KeyCode::Enter => {
            if app.selected_card().is_some() {
                let (idx, _) = app.selected_card().unwrap();
                app.detail_card_id = Some(app.board.cards[idx].id.clone());
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
                app.edit_card_idx = Some(idx);
                app.edit_buffer = app.board.cards[idx].title.clone();
                app.edit_field = EditField::Title;
                app.mode = AppMode::EditingCard;
            }
        }
        KeyCode::Char('d') => {
            if app.selected_card().is_some() { app.mode = AppMode::ConfirmDelete; }
        }
        KeyCode::Char('/') => {
            app.mode = AppMode::FilterInput;
            app.edit_buffer = app.filter.clone();
        }
        KeyCode::Char(':') => {
            app.mode = AppMode::CommandPalette;
            app.edit_buffer.clear();
            app.palette_matches.clear();
        }
        KeyCode::Char('q') | KeyCode::Esc => app.should_quit = true,
        KeyCode::Char('T') => {
            app.theme = match app.theme {
                Theme::Dark => Theme::Light,
                Theme::Light => Theme::Dark,
            };
        }
        _ => {}
    }
    Ok(())
}

fn handle_list_keys(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Up | KeyCode::Char('k') => {
            if app.card_focus > 0 { app.card_focus -= 1; }
        }
        KeyCode::Down | KeyCode::Char('j') => {
            let n = app.visible_cards().len();
            if n > 0 && app.card_focus < n.saturating_sub(1) {
                app.card_focus += 1;
            }
        }
        KeyCode::Enter => {
            if let Some((idx, _)) = app.selected_card() {
                app.detail_card_id = Some(app.board.cards[idx].id.clone());
                app.mode = AppMode::ViewingDetail;
            }
        }
        KeyCode::Char('p') => app.list_sort = SortKey::Priority,
        KeyCode::Char('t') => app.list_sort = SortKey::Title,
        KeyCode::Char('e') => app.list_sort = SortKey::Effort,
        KeyCode::Char('u') => app.list_sort = SortKey::Due,
        KeyCode::Char('a') => {
            app.mode = AppMode::AddingTitle;
            app.edit_buffer.clear();
        }
        KeyCode::Char('/') => {
            app.mode = AppMode::FilterInput;
            app.edit_buffer = app.filter.clone();
        }
        KeyCode::Char('q') | KeyCode::Esc => app.should_quit = true,
        KeyCode::Char('T') => {
            app.theme = match app.theme {
                Theme::Dark => Theme::Light,
                Theme::Light => Theme::Dark,
            };
        }
        _ => {}
    }
    Ok(())
}

fn handle_tree_keys(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Up | KeyCode::Char('k') => {
            if app.card_focus > 0 { app.card_focus -= 1; }
        }
        KeyCode::Down | KeyCode::Char('j') => {
            let n = app.visible_cards().len();
            if n > 0 && app.card_focus < n.saturating_sub(1) {
                app.card_focus += 1;
            }
        }
        KeyCode::Enter => {
            if let Some((idx, _)) = app.selected_card() {
                app.detail_card_id = Some(app.board.cards[idx].id.clone());
                app.mode = AppMode::ViewingDetail;
            }
        }
        KeyCode::Char('q') | KeyCode::Esc => app.should_quit = true,
        KeyCode::Char('T') => {
            app.theme = match app.theme {
                Theme::Dark => Theme::Light,
                Theme::Light => Theme::Dark,
            };
        }
        _ => {}
    }
    Ok(())
}

fn handle_agenda_keys(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Up | KeyCode::Char('k') => {
            if app.card_focus > 0 { app.card_focus -= 1; }
        }
        KeyCode::Down | KeyCode::Char('j') => {
            let n = app.visible_cards().len();
            if n > 0 && app.card_focus < n.saturating_sub(1) {
                app.card_focus += 1;
            }
        }
        KeyCode::Enter => {
            if let Some((idx, _)) = app.selected_card() {
                app.detail_card_id = Some(app.board.cards[idx].id.clone());
                app.mode = AppMode::ViewingDetail;
            }
        }
        KeyCode::Char('q') | KeyCode::Esc => app.should_quit = true,
        _ => {}
    }
    Ok(())
}

fn handle_reports_keys(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Esc => app.should_quit = true,
        _ => {}
    }
    Ok(())
}

fn handle_code_keys(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Char('/') => {
            app.mode = AppMode::CodeSearch;
            app.edit_buffer = app.code_query.clone();
        }
        KeyCode::Up | KeyCode::Char('k') => {
            if app.code_results.is_empty() { return Ok(()); }
            if app.card_focus > 0 { app.card_focus -= 1; }
        }
        KeyCode::Down | KeyCode::Char('j') => {
            if app.code_results.is_empty() { return Ok(()); }
            if app.card_focus < app.code_results.len().saturating_sub(1) {
                app.card_focus += 1;
            }
        }
        KeyCode::Enter => {
            if let Some(hit) = app.code_results.get(app.card_focus.min(app.code_results.len().saturating_sub(1))) {
                // Open the first card mapped to this file, if any.
                if let Some(card) = app
                    .context
                    .index
                    .get(&hit.path)
                    .and_then(|ids| ids.first())
                    .and_then(|id| app.card_by_id(id))
                {
                    let id = card.id.clone();
                    app.detail_card_id = Some(id);
                    app.mode = AppMode::ViewingDetail;
                }
            }
        }
        KeyCode::Char('q') | KeyCode::Esc => app.should_quit = true,
        _ => {}
    }
    Ok(())
}

fn handle_code_search(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Enter => {
            app.code_query = app.edit_buffer.clone();
            app.code_results.clear();
            app.card_focus = 0;
            app.run_code_search();
            app.mode = AppMode::Normal;
            app.tab = Tab::Code;
        }
        KeyCode::Esc => { app.mode = AppMode::Normal; }
        KeyCode::Char(c) => app.edit_buffer.push(c),
        KeyCode::Backspace => { app.edit_buffer.pop(); }
        _ => {}
    }
    Ok(())
}

fn handle_link_target(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Enter => {
            let target = app.edit_buffer.trim().to_string();
            let from = match &app.link_state {
                LinkState::Target { from } => from.clone(),
                _ => String::new(),
            };
            if target.is_empty() {
                app.mode = AppMode::ViewingDetail;
            } else if app.card_by_id(&target).is_none() {
                app.status_msg = Some(format!("card '{}' not found", target));
                app.mode = AppMode::ViewingDetail;
            } else {
                app.link_state = LinkState::Kind { from, target };
                app.edit_buffer.clear();
                app.mode = AppMode::LinkKind;
            }
        }
        KeyCode::Esc => {
            app.link_state = LinkState::None;
            app.mode = AppMode::ViewingDetail;
        }
        KeyCode::Char(c) => app.edit_buffer.push(c),
        KeyCode::Backspace => { app.edit_buffer.pop(); }
        _ => {}
    }
    Ok(())
}

fn handle_link_kind(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Enter => {
            let ty_input = if app.edit_buffer.trim().is_empty() {
                "child".to_string()
            } else {
                app.edit_buffer.trim().to_string()
            };
            let ty = LinkType::parse(&ty_input).unwrap_or(LinkType::Child);
            match &app.link_state {
                LinkState::Kind { from, target } => {
                    let from = from.clone();
                    let target = target.clone();
                    app.link_state = LinkState::None;
                    if let Err(e) = app.perform_link(&from, &target, ty) {
                        app.status_msg = Some(e.to_string());
                    }
                }
                _ => {}
            }
            app.mode = AppMode::ViewingDetail;
            app.edit_buffer.clear();
        }
        KeyCode::Esc => {
            app.link_state = LinkState::None;
            app.mode = AppMode::ViewingDetail;
        }
        KeyCode::Char(c) => app.edit_buffer.push(c),
        KeyCode::Backspace => { app.edit_buffer.pop(); }
        _ => {}
    }
    Ok(())
}

fn handle_unlink_target(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Enter => {
            let target = app.edit_buffer.trim().to_string();
            let from = match &app.link_state {
                LinkState::Unlink { from } => from.clone(),
                _ => String::new(),
            };
            app.link_state = LinkState::None;
            if !target.is_empty() {
                if let Err(e) = app.perform_unlink(&from, &target) {
                    app.status_msg = Some(e.to_string());
                }
            }
            app.mode = AppMode::ViewingDetail;
        }
        KeyCode::Esc => {
            app.link_state = LinkState::None;
            app.mode = AppMode::ViewingDetail;
        }
        KeyCode::Char(c) => app.edit_buffer.push(c),
        KeyCode::Backspace => { app.edit_buffer.pop(); }
        _ => {}
    }
    Ok(())
}

fn handle_palette(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Enter => {
            exec_palette(app);
            app.mode = AppMode::Normal;
        }
        KeyCode::Esc => { app.mode = AppMode::Normal; }
        KeyCode::Tab => {
            if !app.palette_matches.is_empty() {
                app.edit_buffer = app.palette_matches[0].clone() + " ";
            }
        }
        KeyCode::Char(c) => {
            app.edit_buffer.push(c);
            update_palette_matches(app);
        }
        KeyCode::Backspace => {
            app.edit_buffer.pop();
            update_palette_matches(app);
        }
        _ => {}
    }
    Ok(())
}

fn update_palette_matches(app: &mut App) {
    let buf = app.edit_buffer.to_lowercase();
    let mut matches: Vec<String> = Vec::new();

    let commands = [
        "new", "move ", "filter ", "sort priority", "sort title",
        "theme dark", "theme light", "help", "quit",
    ];

    for cmd in commands {
        if cmd.starts_with(&buf) && buf.len() >= 1 {
            matches.push(cmd.to_string());
        }
    }

    for col in &app.board.columns {
        let c = format!("move {}", col.id);
        if c.starts_with(&buf) {
            matches.push(c);
        }
    }

    app.palette_matches = matches;
}

fn exec_palette(app: &mut App) {
    let cmd = app.edit_buffer.trim().to_lowercase();

    if cmd == "new" {
        app.mode = AppMode::AddingTitle;
        app.edit_buffer.clear();
        return;
    }
    if cmd == "help" {
        app.mode = AppMode::Normal;
        return;
    }
    if cmd == "quit" || cmd == "q" {
        app.should_quit = true;
        return;
    }
    if cmd == "theme dark" {
        app.theme = Theme::Dark;
        return;
    }
    if cmd == "theme light" {
        app.theme = Theme::Light;
        return;
    }
    if let Some(rest) = cmd.strip_prefix("move ") {
        let col_id = rest.trim();
        if let Some(col_idx) = app.board.columns.iter().position(|c| c.id == col_id) {
            if let Some((idx, _)) = app.selected_card() {
                let _ = app.move_card_to_column(idx, col_idx);
            }
        }
    }
    if let Some(rest) = cmd.strip_prefix("filter ") {
        app.filter = rest.trim().to_string();
        app.parse_query();
        app.card_focus = 0;
    }
    app.mode = AppMode::Normal;
}

fn handle_filter(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Enter => {
            app.filter = app.edit_buffer.clone();
            app.parse_query();
            app.card_focus = 0;
            app.mode = AppMode::Normal;
        }
        KeyCode::Esc => {
            app.filter.clear();
            app.filter_query = Default::default();
            app.mode = AppMode::Normal;
        }
        KeyCode::Tab => {
            let buf = app.edit_buffer.clone();
            if let Some(last) = buf.split_whitespace().last() {
                if last.contains(':') {
                    let parts: Vec<&str> = last.splitn(2, ':').collect();
                    if parts[0] == "is" {
                        for col in &app.board.columns {
                            if col.id.starts_with(parts.get(1).unwrap_or(&"")) {
                                app.edit_buffer =
                                    buf[..buf.len() - last.len()].to_string() + &format!("is:{}", col.id);
                                break;
                            }
                        }
                    }
                }
            }
        }
        KeyCode::Char(c) => app.edit_buffer.push(c),
        KeyCode::Backspace => { app.edit_buffer.pop(); }
        _ => {}
    }
    Ok(())
}

fn handle_adding(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Enter => {
            let title = app.edit_buffer.trim().to_string();
            if !title.is_empty() {
                if let Ok(id) = app.add_card(&title) {
                    if let Some(idx) = app.board.cards.iter().position(|c| c.id == id) {
                        app.edit_card_idx = Some(idx);
                        app.edit_buffer = app.board.cards[idx].title.clone();
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
        KeyCode::Esc => { app.mode = AppMode::Normal; }
        KeyCode::Char(c) => app.edit_buffer.push(c),
        KeyCode::Backspace => { app.edit_buffer.pop(); }
        _ => {}
    }
    Ok(())
}

fn handle_editing(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Tab => {
            let next = match app.edit_field {
                EditField::Title => EditField::Description,
                EditField::Description => EditField::Priority,
                EditField::Priority => EditField::Labels,
                EditField::Labels => EditField::Assignee,
                EditField::Assignee => EditField::Done,
                EditField::Done => EditField::Title,
            };
            app.edit_field = next;
            app.edit_buffer = field_value(app, app.edit_field);
        }
        KeyCode::Enter => {
            if app.edit_field == EditField::Done {
                let buf = app.edit_buffer.clone();
                let lines: Vec<&str> = buf.lines().collect();
                let title = lines.first().copied().unwrap_or("").trim();
                let desc = buf.split('\n').skip(1).collect::<Vec<_>>().join("\n").trim().to_string();
                if let Some(idx) = app.edit_card_idx {
                    app.update_card(idx, title, &desc, "", "", "")?;
                }
                app.mode = AppMode::Normal;
                app.edit_card_idx = None;
            } else {
                let next = match app.edit_field {
                    EditField::Title => EditField::Description,
                    EditField::Description => EditField::Priority,
                    EditField::Priority => EditField::Labels,
                    EditField::Labels => EditField::Assignee,
                    EditField::Assignee => EditField::Done,
                    EditField::Done => EditField::Title,
                };
                // Save current field's value to card
                save_field(app);
                app.edit_field = next;
                app.edit_buffer = field_value(app, app.edit_field);
            }
        }
        KeyCode::Esc => {
            app.mode = AppMode::Normal;
            app.edit_card_idx = None;
        }
        KeyCode::Char(c) => app.edit_buffer.push(c),
        KeyCode::Backspace => { app.edit_buffer.pop(); }
        _ => {}
    }
    Ok(())
}

fn save_field(app: &mut App) {
    let idx = match app.edit_card_idx {
        Some(i) => i,
        None => return,
    };
    let val = app.edit_buffer.clone();
    if idx < app.board.cards.len() {
        let card = &mut app.board.cards[idx];
        match app.edit_field {
            EditField::Title => card.title = val,
            EditField::Description => card.description = if val.is_empty() { None } else { Some(val) },
            EditField::Priority => card.priority = if val.is_empty() { "medium".into() } else { val },
            EditField::Labels => {
                card.labels = val.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            }
            EditField::Assignee => card.assignee = if val.is_empty() { None } else { Some(val) },
            _ => {}
        }
        card.updated_at = Utc::now();
        let _ = app.save();
    }
}

fn field_value(app: &App, field: EditField) -> String {
    let idx = match app.edit_card_idx {
        Some(i) => i,
        None => return String::new(),
    };
    if idx >= app.board.cards.len() {
        return String::new();
    }
    let card = &app.board.cards[idx];
    match field {
        EditField::Title => card.title.clone(),
        EditField::Description => card.description.clone().unwrap_or_default(),
        EditField::Priority => card.priority.clone(),
        EditField::Labels => card.labels.join(", "),
        EditField::Assignee => card.assignee.clone().unwrap_or_default(),
        EditField::Done => String::new(),
    }
}

fn handle_detail(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Esc | KeyCode::Char('q') => {
            app.mode = AppMode::Normal;
            app.detail_card_id = None;
            app.link_state = LinkState::None;
        }
        KeyCode::Char('l') => {
            if let Some(id) = app.detail_card_id.clone() {
                app.link_state = LinkState::Target { from: id };
                app.edit_buffer.clear();
                app.mode = AppMode::LinkTarget;
            }
        }
        KeyCode::Char('u') => {
            if let Some(id) = app.detail_card_id.clone() {
                app.link_state = LinkState::Unlink { from: id };
                app.edit_buffer.clear();
                app.mode = AppMode::UnlinkTarget;
            }
        }
        KeyCode::Char('e') => {
            if let Some(id) = app.detail_card_id.clone() {
                if let Some(idx) = app.board.cards.iter().position(|c| c.id == id) {
                    app.edit_card_idx = Some(idx);
                    app.edit_buffer = app.board.cards[idx].title.clone();
                    app.edit_field = EditField::Title;
                    app.mode = AppMode::EditingCard;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn handle_confirm(app: &mut App, key: KeyEvent) -> Result<()> {
    match key.code {
        KeyCode::Char('y') | KeyCode::Enter => {
            if let Some((idx, _)) = app.selected_card() {
                let _ = app.remove_card(idx);
            }
            app.mode = AppMode::Normal;
        }
        KeyCode::Char('n') | KeyCode::Esc => { app.mode = AppMode::Normal; }
        _ => {}
    }
    Ok(())
}
