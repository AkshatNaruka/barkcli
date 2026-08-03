use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style, Stylize},
    text::{Line, Span, Text},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
    Frame,
};

use crate::app::{App, AppMode, EditField};
use barkcli_core::models::Card;

pub fn draw(f: &mut Frame, app: &App) {
    let size = f.area();
    if size.width < 40 || size.height < 10 {
        f.render_widget(
            Paragraph::new("Terminal too small (min 40×10)").style(Style::new().fg(Color::DarkGray)),
            size,
        );
        return;
    }
    match app.mode {
        AppMode::BoardPicker => draw_picker(f, app, size),
        _ => draw_main(f, app, size),
    }
}

fn draw_picker(f: &mut Frame, app: &App, area: Rect) {
    let items: Vec<ListItem> = app.all_boards.iter().enumerate().map(|(i, name)| {
        let style = if i == app.card_focus {
            Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD)
        } else { Style::default() };
        ListItem::new(Line::from(Span::styled(format!("  {}", name), style)))
    }).collect();
    let list = List::new(items)
        .block(Block::bordered().title(" Select a board "))
        .highlight_style(Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD));
    let h = (app.all_boards.len() + 2).min(area.height.saturating_sub(4) as usize) as u16;
    f.render_widget(list, centered_rect(32, h, area));
}

fn draw_main(f: &mut Frame, app: &App, area: Rect) {
    let bg = Paragraph::new("").style(Style::new().bg(app.theme_bg()));
    f.render_widget(bg, area);

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(1), Constraint::Min(3), Constraint::Length(1)])
        .split(area);

    draw_header(f, app, chunks[0]);
    draw_columns(f, app, chunks[1]);
    draw_status(f, app, chunks[2]);

    match app.mode {
        AppMode::ViewingDetail => {
            if let Some((_, card)) = app.selected_card() {
                draw_detail_overlay(f, area, app, card);
            }
        }
        AppMode::AddingTitle => draw_prompt(f, area, "Add card — enter title:", &app.edit_buffer),
        AppMode::EditingCard => draw_edit_overlay(f, area, app),
        AppMode::FilterInput => draw_prompt(f, area, &format!("Filter: {}█", app.edit_buffer), ""),
        AppMode::CommandPalette => draw_palette(f, area, app),
        AppMode::ConfirmDelete => draw_confirm_overlay(f, area, app),
        _ => {}
    }
}

fn draw_header(f: &mut Frame, app: &App, area: Rect) {
    let left = format!(" 📋 {}", app.board_name);
    let n = app.board.cards.len();
    let right = format!("{} cards ", n);
    let line = Line::from(vec![
        Span::styled(left, Style::new().bold().fg(Color::Cyan)),
        Span::raw(" "),
        Span::styled(right, Style::new().fg(app.theme_muted())),
    ]);
    f.render_widget(Paragraph::new(line), area);
}

fn draw_columns(f: &mut Frame, app: &App, area: Rect) {
    if app.board.columns.is_empty() { return; }
    let n_cols = app.board.columns.len();
    let widths: Vec<Constraint> = (0..n_cols).map(|_| Constraint::Ratio(1, n_cols as u32)).collect();
    let chunks = Layout::default().direction(Direction::Horizontal).constraints(widths).split(area);

    for (i, col) in app.board.columns.iter().enumerate() {
        let cards = app.cards_in_column(i);
        let focused = i == app.focused_column;
        let border = if focused { Color::Cyan } else { Color::DarkGray };
        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::new().fg(border))
            .style(Style::new().bg(app.theme_col_bg()))
            .title(format!(" {} ", col.name))
            .title_bottom(format!(" {} ", cards.len()));

        let inner = block.inner(chunks[i]);

        let items: Vec<ListItem> = if cards.is_empty() {
            vec![ListItem::new(Line::from(Span::styled("  (no cards)", Style::new().fg(app.theme_muted()))))]
        } else {
            cards.iter().enumerate().map(|(j, (_, card))| {
                let sel = focused && j == app.card_focus;
                let prefix = if sel { "▸ " } else { "  " };
                let dot = match card.priority.as_str() {
                    "high" => Span::styled("●", Style::new().fg(Color::Red).add_modifier(Modifier::BOLD)),
                    "medium" => Span::styled("●", Style::new().fg(Color::Yellow)),
                    _ => Span::styled("●", Style::new().fg(Color::DarkGray)),
                };
                let title_s = Style::default().fg(app.theme_text())
                    .add_modifier(if sel { Modifier::REVERSED } else { Modifier::empty() });
                let title_span = Span::styled(format!("{}{} ", prefix, card.title), title_s);
                let labels_str = if card.labels.is_empty() { String::new() }
                    else { format!("[{}]", card.labels.join(",")) };
                let mut parts = vec![dot, Span::raw(" "), title_span];
                if !labels_str.is_empty() {
                    parts.push(Span::styled(labels_str, Style::new().fg(Color::Cyan)));
                }
                if let Some(ref a) = card.assignee {
                    parts.push(Span::styled(format!(" @{}", a), Style::new().fg(Color::Green)));
                }
                ListItem::new(Line::from(parts))
            }).collect()
        };

        let list = List::new(items);
        f.render_widget(block, chunks[i]);
        f.render_widget(list, inner);
    }
}

fn draw_status(f: &mut Frame, app: &App, area: Rect) {
    let mode_str = match app.mode {
        AppMode::Normal => "NORMAL",
        AppMode::FilterInput => "FILTER",
        AppMode::CommandPalette => "COMMAND",
        AppMode::AddingTitle => "ADD",
        AppMode::EditingCard => "EDIT",
        AppMode::ViewingDetail => "DETAIL",
        AppMode::ConfirmDelete => "CONFIRM",
        AppMode::BoardPicker => "PICK",
    };
    let text = match app.mode {
        AppMode::Normal =>
            format!(" {} │ ↑↓/jk sel · ←→/hl col · Enter detail · a add · e edit · d del · H/L move · / filter · : cmd · q quit ", mode_str),
        AppMode::FilterInput =>
            format!(" {} │ filter: {}█ (Enter apply, Esc clear, Tab autocomplete)", mode_str, app.edit_buffer),
        AppMode::CommandPalette =>
            format!(" {} │ :{}█ (Enter execute, Esc cancel)", mode_str, app.edit_buffer),
        AppMode::AddingTitle =>
            format!(" {} │ Enter title: {}█ (Enter confirm, Esc cancel)", mode_str, app.edit_buffer),
        AppMode::EditingCard =>
            format!(" {} │ Tab next field · Enter save · Esc cancel", mode_str),
        AppMode::ViewingDetail =>
            format!(" {} │ Esc close detail", mode_str),
        AppMode::ConfirmDelete =>
            format!(" {} │ Delete card? y / n", mode_str),
        AppMode::BoardPicker =>
            format!(" {} │ ↑↓ select · Enter open · q quit", mode_str),
    };
    let style = Style::new().fg(Color::White).bg(Color::Blue);
    f.render_widget(Paragraph::new(Text::styled(text, style)), area);
}

fn draw_detail_overlay(f: &mut Frame, area: Rect, app: &App, card: &Card) {
    let w = area.width.min(54);
    let h = area.height.min(18);
    let detail = centered_rect(w, h, area);

    let mut lines = Vec::new();
    lines.push(Line::from(Span::styled(" Card Detail", Style::new().bold().fg(Color::Cyan))));
    lines.push(Line::from(Span::raw("")));
    lines.push(Line::from(vec![Span::styled("ID:        ", Style::new().bold()), Span::raw(&card.id)]));
    lines.push(Line::from(vec![Span::styled("Title:     ", Style::new().bold()), Span::raw(&card.title)]));
    lines.push(Line::from(vec![
        Span::styled("Column:    ", Style::new().bold()), Span::raw(&card.column),
        Span::raw("  "), Span::styled("Priority: ", Style::new().bold()),
        priority_span(&card.priority),
    ]));
    if let Some(ref desc) = card.description {
        if !desc.is_empty() {
            lines.push(Line::from(Span::styled("Description:", Style::new().bold())));
            for dl in desc.lines() { lines.push(Line::from(Span::raw(format!("  {}", dl)))); }
        }
    }
    if !card.labels.is_empty() {
        lines.push(Line::from(vec![
            Span::styled("Labels:    ", Style::new().bold()),
            Span::styled(card.labels.join(", "), Style::new().fg(Color::Cyan)),
        ]));
    }
    if let Some(ref a) = card.assignee {
        lines.push(Line::from(vec![
            Span::styled("Assignee:  ", Style::new().bold()),
            Span::styled(a, Style::new().fg(Color::Green)),
        ]));
    }
    if !card.checklist.is_empty() {
        lines.push(Line::from(Span::styled("Checklist:", Style::new().bold())));
        for item in &card.checklist {
            let mark = if item.done { "✓" } else { "○" };
            lines.push(Line::from(Span::raw(format!("  {} {}", mark, item.text))));
        }
    }
    lines.push(Line::from(Span::raw("")));
    let ts_style = Style::new().fg(Color::DarkGray);
    lines.push(Line::from(vec![Span::styled("Created: ", ts_style),
        Span::styled(card.created_at.format("%Y-%m-%d %H:%M UTC").to_string(), ts_style)]));
    lines.push(Line::from(vec![Span::styled("Updated: ", ts_style),
        Span::styled(card.updated_at.format("%Y-%m-%d %H:%M UTC").to_string(), ts_style)]));

    let p = Paragraph::new(Text::from(lines))
        .block(Block::bordered().border_style(Style::new().fg(Color::Cyan)).style(Style::new().bg(app.theme_card_bg())))
        .wrap(Wrap { trim: false });
    f.render_widget(p, detail);
}

fn draw_prompt(f: &mut Frame, area: Rect, prompt: &str, value: &str) {
    let r = centered_rect(area.width.min(52), 3, area);
    let s = if value.is_empty() { prompt.to_string() } else { format!("{}: {}█", prompt, value) };
    let p = Paragraph::new(s).block(Block::bordered().border_style(Style::new().fg(Color::Cyan)));
    f.render_widget(p, r);
}

fn draw_edit_overlay(f: &mut Frame, area: Rect, app: &App) {
    let w = area.width.min(55);
    let r = centered_rect(w, 12, area);

    let hl = |f: EditField| -> Style {
        if app.edit_field == f { Style::new().fg(Color::Yellow).add_modifier(Modifier::REVERSED) }
        else { Style::default() }
    };
    let val = if app.edit_buffer.is_empty() { "<empty>" } else { &app.edit_buffer };
    let lines = vec![
        Line::from(Span::styled(" Edit Card  (Tab next · Enter save · Esc cancel)", Style::new().bold().fg(Color::Cyan))),
        Line::from(Span::raw("")),
        Line::from(vec![Span::styled("  Title:       ", hl(EditField::Title)), Span::styled(val, hl(EditField::Title))]),
        Line::from(vec![Span::styled("  Description: ", hl(EditField::Description)), Span::styled(val, hl(EditField::Description))]),
        Line::from(vec![Span::styled("  Priority:    ", hl(EditField::Priority)), Span::styled(val, hl(EditField::Priority))]),
        Line::from(vec![Span::styled("  Labels:      ", hl(EditField::Labels)), Span::styled(val, hl(EditField::Labels))]),
        Line::from(vec![Span::styled("  Assignee:    ", hl(EditField::Assignee)), Span::styled(val, hl(EditField::Assignee))]),
        Line::from(Span::raw("")),
        Line::from(Span::styled("  [ Save & Finish ]", if app.edit_field == EditField::Done {
            Style::new().fg(Color::Yellow).add_modifier(Modifier::REVERSED)
        } else { Style::new().fg(Color::DarkGray) })),
    ];
    let p = Paragraph::new(Text::from(lines))
        .block(Block::bordered().border_style(Style::new().fg(Color::Cyan)).style(Style::new().bg(app.theme_card_bg())));
    f.render_widget(p, r);
}

fn draw_palette(f: &mut Frame, area: Rect, app: &App) {
    let w = area.width.min(50);
    let h = (app.palette_matches.len() + 2).max(1) as u16 + 2;
    let r = centered_rect(w, h, area);

    let mut lines = vec![
        Line::from(Span::styled(format!(" :{}█", app.edit_buffer), Style::new().bold())),
    ];
    for m in &app.palette_matches {
        lines.push(Line::from(Span::styled(format!("  {}", m), Style::new().fg(Color::Yellow))));
    }
    if app.palette_matches.is_empty() && !app.edit_buffer.is_empty() {
        lines.push(Line::from(Span::styled("  (no matches)", Style::new().fg(Color::DarkGray))));
    }
    let p = Paragraph::new(Text::from(lines))
        .block(Block::bordered().border_style(Style::new().fg(Color::Cyan)).style(Style::new().bg(app.theme_card_bg())));
    f.render_widget(p, r);
}

fn draw_confirm_overlay(f: &mut Frame, area: Rect, app: &App) {
    let r = centered_rect(30, 3, area);
    let p = Paragraph::new(" Delete card? (y/n) ")
        .block(Block::bordered().border_style(Style::new().fg(Color::Red)).style(Style::new().bg(app.theme_card_bg())));
    f.render_widget(p, r);
}

fn priority_span(p: &str) -> Span {
    match p {
        "high" => Span::styled("high", Style::new().fg(Color::Red).add_modifier(Modifier::BOLD)),
        "medium" => Span::styled("medium", Style::new().fg(Color::Yellow)),
        _ => Span::styled(p, Style::new().fg(Color::DarkGray)),
    }
}

fn centered_rect(width: u16, height: u16, r: Rect) -> Rect {
    Rect {
        x: r.x.saturating_add((r.width.saturating_sub(width)) / 2),
        y: r.y.saturating_add((r.height.saturating_sub(height)) / 2),
        width: width.min(r.width),
        height: height.min(r.height),
    }
}
