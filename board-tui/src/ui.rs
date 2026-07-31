use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style, Stylize},
    text::{Line, Span, Text},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
    Frame,
};

use crate::app::{App, AppMode, EditField};
use board_core::models::Card;

const PRIORITY_HIGH: Color = Color::Red;
const PRIORITY_MED: Color = Color::Yellow;
const PRIORITY_LOW: Color = Color::DarkGray;

pub fn draw(f: &mut Frame, app: &App) {
    let size = f.area();
    if size.width < 40 || size.height < 10 {
        f.render_widget(
            Paragraph::new("Terminal too small. Resize to at least 40x10.")
                .style(Style::new().dark_gray()),
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
    let items: Vec<ListItem> = app
        .all_boards
        .iter()
        .enumerate()
        .map(|(i, name)| {
            let style = if i == app.card_focus {
                Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            ListItem::new(Line::from(Span::styled(name, style)))
        })
        .collect();

    let list = List::new(items)
        .block(Block::bordered().title(" Select a board "))
        .highlight_style(Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD));

    let area = centered_rect(30, app.all_boards.len() as u16 + 2, area);
    f.render_widget(list, area);
}

fn draw_main(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),
            Constraint::Min(3),
            Constraint::Length(1),
        ])
        .split(area);

    draw_header(f, app, chunks[0]);
    draw_columns(f, app, chunks[1]);
    draw_status(f, app, chunks[2]);

    match app.mode {
        AppMode::ViewingDetail => {
            if let Some((_, card)) = app.selected_card() {
                draw_detail_overlay(f, area, card);
            }
        }
        AppMode::AddingTitle => {
            draw_input_overlay(f, area, "Add card: enter title", &app.edit_buffer);
        }
        AppMode::EditingCard => {
            draw_edit_overlay(f, area, app);
        }
        AppMode::FilterInput => {
            draw_input_overlay(f, area, &format!("Filter: {}", app.edit_buffer), "");
        }
        AppMode::ConfirmDelete => {
            draw_confirm_overlay(f, area);
        }
        _ => {}
    }
}

fn draw_header(f: &mut Frame, app: &App, area: Rect) {
    let left = format!(" board: {}", app.board_name);
    let card_count = app.board.cards.len();
    let right = format!(" {} cards ", card_count);
    let line = Line::from(vec![
        Span::styled(left, Style::new().bold()),
        Span::raw(" "),
        Span::styled(right, Style::new().dark_gray()),
    ]);
    f.render_widget(Paragraph::new(line), area);
}

fn draw_columns(f: &mut Frame, app: &App, area: Rect) {
    if app.board.columns.is_empty() {
        return;
    }

    let n_cols = app.board.columns.len();
    let widths: Vec<Constraint> = (0..n_cols)
        .map(|_| Constraint::Ratio(1, n_cols as u32))
        .collect();

    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints(widths)
        .split(area);

    for (i, column) in app.board.columns.iter().enumerate() {
        let cards = app.cards_in_column(i);
        let is_focused = i == app.focused_column;

        let border_style = if is_focused {
            Style::new().fg(Color::Yellow)
        } else {
            Style::default()
        };

        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(border_style)
            .title(format!(" {} ", column.name))
            .title_bottom(format!(" {} ", cards.len()));

        let inner_area = block.inner(chunks[i]);

        let items: Vec<ListItem> = if cards.is_empty() {
            vec![ListItem::new(Line::from(Span::styled(
                "  (no cards)",
                Style::new().dark_gray(),
            )))]
        } else {
            cards
                .iter()
                .enumerate()
                .map(|(j, (_, card))| {
                    let is_selected = is_focused && j == app.card_focus;
                    let prefix = if is_selected { "▸ " } else { "  " };
                    let title_span = Span::styled(
                        format!("{}{}", prefix, card.title),
                        if is_selected {
                            Style::new().add_modifier(Modifier::REVERSED)
                        } else {
                            Style::default()
                        },
                    );
                    let labels_str = if card.labels.is_empty() {
                        String::new()
                    } else {
                        format!(" [{}]", card.labels.join(","))
                    };
                    let assignee_str = card
                        .assignee
                        .as_ref()
                        .map(|a| format!(" @{}", a))
                        .unwrap_or_default();
                    ListItem::new(Line::from(vec![
                        title_span,
                        Span::styled(labels_str, Style::new().dark_gray()),
                        Span::raw(assignee_str),
                    ]))
                })
                .collect()
        };

        let list = List::new(items);
        f.render_widget(block, chunks[i]);
        f.render_widget(list, inner_area);
    }
}

fn draw_status(f: &mut Frame, app: &App, area: Rect) {
    let text = match app.mode {
        AppMode::Normal => {
            " ↑↓ sel · ←→ col · Enter detail · a add · e edit · d del · H/L move · / filter · q quit "
                .to_string()
        }
        AppMode::FilterInput => {
            format!(" Filter: {}█", app.edit_buffer)
        }
        AppMode::AddingTitle => {
            " Enter title: ".to_string()
        }
        AppMode::EditingCard => {
            " Tab switch field · Enter save · Esc cancel ".to_string()
        }
        AppMode::ViewingDetail => {
            " Esc close detail ".to_string()
        }
        AppMode::ConfirmDelete => {
            " Delete card? y/n ".to_string()
        }
        AppMode::BoardPicker => {
            " ↑↓ select · Enter open · q quit ".to_string()
        }
    };

    let style = Style::new().fg(Color::White).bg(Color::Blue);
    f.render_widget(
        Paragraph::new(Text::styled(text, style)),
        area,
    );
}

fn draw_detail_overlay(f: &mut Frame, area: Rect, card: &Card) {
    let detail_area = centered_rect(50, 16, area);

    let mut lines = Vec::new();
    lines.push(Line::from(vec![
        Span::styled("ID: ", Style::new().bold()),
        Span::raw(&card.id),
    ]));
    lines.push(Line::from(vec![
        Span::styled("Title: ", Style::new().bold()),
        Span::raw(&card.title),
    ]));
    lines.push(Line::from(vec![
        Span::styled("Column: ", Style::new().bold()),
        Span::raw(&card.column),
        Span::raw("  "),
        Span::styled("Priority: ", Style::new().bold()),
        Span::styled(&card.priority, priority_style(&card.priority)),
    ]));
    if let Some(desc) = &card.description {
        if !desc.is_empty() {
            lines.push(Line::from(Span::styled("Description:", Style::new().bold())));
            for line in desc.lines() {
                lines.push(Line::from(Span::raw(format!("  {}", line))));
            }
        }
    }
    if !card.labels.is_empty() {
        lines.push(Line::from(vec![
            Span::styled("Labels: ", Style::new().bold()),
            Span::styled(card.labels.join(", "), Style::new().cyan()),
        ]));
    }
    if let Some(assignee) = &card.assignee {
        lines.push(Line::from(vec![
            Span::styled("Assignee: ", Style::new().bold()),
            Span::styled(assignee, Style::new().green()),
        ]));
    }
    if !card.checklist.is_empty() {
        lines.push(Line::from(Span::styled("Checklist:", Style::new().bold())));
        for item in &card.checklist {
            let check = if item.done { "[x]" } else { "[ ]" };
            lines.push(Line::from(Span::raw(format!("  {} {}", check, item.text))));
        }
    }
    if !card.comments.is_empty() {
        lines.push(Line::from(Span::styled("Comments:", Style::new().bold())));
        for comment in &card.comments {
            lines.push(Line::from(Span::raw(format!(
                "  {} ({}): {}",
                comment.author, comment.at, comment.text
            ))));
        }
    }
    lines.push(Line::from(Span::raw("")));
    lines.push(Line::from(vec![
        Span::styled("Created: ", Style::new().dark_gray()),
        Span::raw(card.created_at.format("%Y-%m-%d %H:%M UTC").to_string()),
    ]));
    lines.push(Line::from(vec![
        Span::styled("Updated: ", Style::new().dark_gray()),
        Span::raw(card.updated_at.format("%Y-%m-%d %H:%M UTC").to_string()),
    ]));
    lines.push(Line::from(Span::raw("")));
    lines.push(Line::from(Span::styled(
        " [Esc] close ",
        Style::new().dark_gray(),
    )));

    let paragraph = Paragraph::new(Text::from(lines))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Card Detail ")
                .border_style(Style::new().cyan()),
        )
        .wrap(Wrap { trim: false });

    f.render_widget(paragraph, detail_area);
}

fn draw_input_overlay(f: &mut Frame, area: Rect, prompt: &str, value: &str) {
    let input_area = centered_rect(50, 3, area);
    let display = if value.is_empty() {
        format!("{} ", prompt)
    } else {
        format!("{}: {}█", prompt, value)
    };
    let paragraph = Paragraph::new(display)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::new().cyan()),
        );
    f.render_widget(paragraph, input_area);
}

fn draw_edit_overlay(f: &mut Frame, area: Rect, app: &App) {
    let edit_area = centered_rect(55, 10, area);

    let field_style = |field: EditField| -> Style {
        if app.edit_field == field {
            Style::new().fg(Color::Yellow).add_modifier(Modifier::REVERSED)
        } else {
            Style::default()
        }
    };

    let display_val = if app.edit_buffer.is_empty() {
        "<empty>".to_string()
    } else {
        app.edit_buffer.clone()
    };

    let lines = vec![
        Line::from(Span::styled(" Edit Card (Tab to switch, Enter next, Esc cancel)", Style::new().bold())),
        Line::from(Span::raw("")),
        Line::from(vec![
            Span::styled("  Title:       ", field_style(EditField::Title)),
            Span::styled(&display_val, field_style(EditField::Title)),
        ]),
        Line::from(vec![
            Span::styled("  Description: ", field_style(EditField::Description)),
            Span::styled(&display_val, field_style(EditField::Description)),
        ]),
        Line::from(vec![
            Span::styled("  Priority:    ", field_style(EditField::Priority)),
            Span::styled(&display_val, field_style(EditField::Priority)),
        ]),
        Line::from(vec![
            Span::styled("  Labels:      ", field_style(EditField::Labels)),
            Span::styled(&display_val, field_style(EditField::Labels)),
        ]),
        Line::from(vec![
            Span::styled("  Assignee:    ", field_style(EditField::Assignee)),
            Span::styled(&display_val, field_style(EditField::Assignee)),
        ]),
        Line::from(Span::raw("")),
        Line::from(Span::styled(
            " [Finish editing] ",
            if app.edit_field == EditField::Done {
                Style::new().fg(Color::Yellow).add_modifier(Modifier::REVERSED)
            } else {
                Style::new().dark_gray()
            },
        )),
    ];

    let paragraph = Paragraph::new(Text::from(lines))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Edit Card ")
                .border_style(Style::new().cyan()),
        );
    f.render_widget(paragraph, edit_area);
}

fn draw_confirm_overlay(f: &mut Frame, area: Rect) {
    let confirm_area = centered_rect(30, 3, area);
    let text = Paragraph::new(" Delete card? (y/n) ")
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::new().red()),
        );
    f.render_widget(text, confirm_area);
}

fn priority_style(priority: &str) -> Style {
    match priority {
        "high" => Style::new().fg(PRIORITY_HIGH).add_modifier(Modifier::BOLD),
        "medium" => Style::new().fg(PRIORITY_MED),
        "low" => Style::new().fg(PRIORITY_LOW),
        _ => Style::default(),
    }
}

fn centered_rect(width: u16, height: u16, r: Rect) -> Rect {
    let x = r.x.saturating_add((r.width.saturating_sub(width)) / 2);
    let y = r.y.saturating_add((r.height.saturating_sub(height)) / 2);
    Rect {
        x,
        y,
        width: width.min(r.width),
        height: height.min(r.height),
    }
}
