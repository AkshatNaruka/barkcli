use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style, Stylize},
    text::{Line, Span, Text},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
    Frame,
};

use crate::components;

use crate::app::{App, AppMode, EditField, SortKey, Tab};
use barkcli_core::agent::identity::AgentStatus;
use barkcli_core::agent::queue::TaskStatus;
use barkcli_core::models::card::LinkType;
use barkcli_core::models::Card;

pub fn draw(f: &mut Frame, app: &App) {
    let size = f.area();
    if size.width < 60 || size.height < 12 {
        f.render_widget(
            Paragraph::new("Terminal too small (min 60×12)").style(Style::new().fg(app.theme.tokens().colors.muted)),
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
            Style::new().fg(app.theme.tokens().colors.accent).add_modifier(Modifier::BOLD)
        } else { Style::default() };
        ListItem::new(Line::from(Span::styled(format!("  {}", name), style)))
    }).collect();
    let list = List::new(items)
        .block(Block::bordered().title(" Select a board "))
        .highlight_style(Style::new().fg(app.theme.tokens().colors.accent).add_modifier(Modifier::BOLD));
    let h = (app.all_boards.len() + 2).min(area.height.saturating_sub(4) as usize) as u16;
    f.render_widget(list, centered_rect(40, h, area));
}

fn draw_main(f: &mut Frame, app: &App, area: Rect) {
    let bg = Paragraph::new("").style(Style::new().bg(app.theme.tokens().colors.bg));
    f.render_widget(bg, area);

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(1), Constraint::Length(1), Constraint::Min(3), Constraint::Length(1)])
        .split(area);

    draw_header(f, app, chunks[0]);
    draw_tabbar(f, app, chunks[1]);
    draw_content(f, app, chunks[2]);
    draw_status(f, app, chunks[3]);

    match app.mode {
        AppMode::ViewingDetail => {
            if let Some((_, card)) = app.selected_card() {
                draw_detail_overlay(f, area, app, card);
            }
        }
        AppMode::AddingTitle => draw_prompt(f, app, area, "Add card — enter title:", &app.edit_buffer),
        AppMode::EditingCard => draw_edit_overlay(f, area, app),
        AppMode::FilterInput => draw_prompt(f, app, area, &format!("Filter: {}█", app.edit_buffer), ""),
        AppMode::CommandPalette => draw_palette(f, area, app),
        AppMode::ConfirmDelete => draw_confirm_overlay(f, area, app),
        AppMode::CodeSearch => draw_prompt(f, app, area, "Code search (Enter run, Esc cancel):", &app.edit_buffer),
        AppMode::LinkTarget => draw_prompt(f, app, area, "Link to card id (Esc cancel):", &app.edit_buffer),
        AppMode::LinkKind => draw_prompt(f, app, area, "Link as [child|parent|related|blocked-by] (Enter = child):", &app.edit_buffer),
        AppMode::UnlinkTarget => draw_prompt(f, app, area, "Unlink from card id (Esc cancel):", &app.edit_buffer),
        _ => {}
    }
}

fn draw_header(f: &mut Frame, app: &App, area: Rect) {
    let sprint_name = app
        .sprints
        .iter()
        .find(|s| s.end.is_none())
        .map(|s| format!("[sprint:{}]", s.name))
        .unwrap_or_default();
    let left = format!(" 📋 {} {}", app.board_name, sprint_name);
    let n = app.board.cards.len();
    let right = format!("{} cards ", n);
    let line = Line::from(vec![
        Span::styled(left, Style::new().bold().fg(app.theme.tokens().colors.accent)),
        Span::raw(" "),
        Span::styled(right, Style::new().fg(app.theme.tokens().colors.muted)),
    ]);
    f.render_widget(Paragraph::new(line), area);
}

fn draw_tabbar(f: &mut Frame, app: &App, area: Rect) {
    let tabs: Vec<Tab> = crate::app::Tab::ALL.to_vec();
    let mut spans: Vec<Span> = Vec::new();
    spans.push(Span::styled(" ", Style::new().fg(app.theme.tokens().colors.muted)));
    for tab in tabs {
        let active = app.tab == tab;
        spans.push(Span::styled(
            format!(" {} ", tab.label()),
            if active {
                Style::new().fg(app.theme.tokens().colors.bg).bg(app.theme.tokens().colors.accent).add_modifier(Modifier::BOLD)
            } else {
                Style::new().fg(app.theme.tokens().colors.muted)
            },
        ));
        spans.push(Span::styled(" ", Style::new().fg(app.theme.tokens().colors.muted)));
    }
    f.render_widget(Paragraph::new(Line::from(spans)), area);
}

fn draw_content(f: &mut Frame, app: &App, area: Rect) {
    match app.tab {
        Tab::Board => draw_board(f, app, area),
        Tab::List => draw_list(f, app, area),
        Tab::Tree => draw_tree(f, app, area),
        Tab::Agenda => draw_agenda(f, app, area),
        Tab::Reports => draw_reports(f, app, area),
        Tab::Code => draw_code(f, app, area),
        Tab::Agents => draw_agents(f, app, area),
        Tab::Orchestrate => draw_orchestrate(f, app, area),
        Tab::History => draw_history(f, app, area),
    }
}

// ── Board ──

fn draw_board(f: &mut Frame, app: &App, area: Rect) {
    if app.board.columns.is_empty() { return; }
    let n_cols = app.board.columns.len();
    let widths: Vec<Constraint> = (0..n_cols).map(|_| Constraint::Ratio(1, n_cols as u32)).collect();
    let chunks = Layout::default().direction(Direction::Horizontal).constraints(widths).split(area);

    for (i, col) in app.board.columns.iter().enumerate() {
        let cards = app.cards_in_column(i);
        let focused = i == app.focused_column;
        let border = if focused { app.theme.tokens().colors.accent } else { app.theme.tokens().colors.border };
        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::new().fg(border))
            .style(Style::new().bg(app.theme.tokens().colors.surface))
            .title(format!(" {} ", col.name))
            .title_bottom(format!(" {} ", cards.len()));

        let inner = block.inner(chunks[i]);

        let items: Vec<ListItem> = if cards.is_empty() {
            vec![ListItem::new(Line::from(Span::styled("  (no cards)", Style::new().fg(app.theme.tokens().colors.muted))))]
        } else {
            cards.iter().enumerate().map(|(j, (_, card))| {
                let sel = focused && j == app.card_focus;
                let prefix = if sel { "▸ " } else { "  " };
                let dot = match card.priority.as_str() {
                    "high" => Span::styled("●", Style::new().fg(app.theme.tokens().colors.danger).add_modifier(Modifier::BOLD)),
                    "medium" => Span::styled("●", Style::new().fg(app.theme.tokens().colors.warning)),
                    _ => Span::styled("●", Style::new().fg(app.theme.tokens().colors.muted)),
                };
                let title_s = Style::default().fg(app.theme.tokens().colors.text)
                    .add_modifier(if sel { Modifier::REVERSED } else { Modifier::empty() });
                let title_span = Span::styled(format!("{}{} ", prefix, card.title), title_s);
                let labels_str = if card.labels.is_empty() { String::new() }
                    else { format!("[{}]", card.labels.join(",")) };
                let mut parts = vec![dot, Span::raw(" "), title_span];
                if !labels_str.is_empty() {
                    parts.push(Span::styled(labels_str, Style::new().fg(app.theme.tokens().colors.accent)));
                }
                if let Some(ref a) = card.assignee {
                    parts.push(Span::styled(format!(" @{}", a), Style::new().fg(app.theme.tokens().colors.success)));
                }
                if let Some(e) = card.effort {
                    parts.push(Span::styled(format!(" ⏱{}", e), Style::new().fg(app.theme.tokens().colors.muted)));
                }
                ListItem::new(Line::from(parts))
            }).collect()
        };

        let list = List::new(items);
        f.render_widget(block, chunks[i]);
        f.render_widget(list, inner);
    }
}

// ── List ──

fn draw_list(f: &mut Frame, app: &App, area: Rect) {
    let cards = app.visible_cards();
    let sort_label = match app.list_sort {
        SortKey::Priority => "sort:priority (p)",
        SortKey::Title => "sort:title (t)",
        SortKey::Effort => "sort:effort (e)",
        SortKey::Due => "sort:due (u)",
    };
    let theme = app.theme.tokens();

    let headers = ["PRIO", "EFF", "DUE", "AREA", "TITLE"];
    let alignments = [
        Alignment::Left,
        Alignment::Right,
        Alignment::Left,
        Alignment::Left,
        Alignment::Left,
    ];

    let rows: Vec<Vec<String>> = cards
        .iter()
        .map(|(_, card)| {
            let prio = match card.priority.as_str() {
                "high" => "HI".to_string(),
                "medium" => "MD".to_string(),
                "low" => "LO".to_string(),
                other => other.to_string(),
            };
            let eff = if let Some(e) = card.effort {
                format!("{}", e)
            } else {
                "-".to_string()
            };
            let due = card.due_date.clone().unwrap_or_else(|| "—".to_string());
            let area = card.area.clone().unwrap_or_default();
            let title = card.title.clone();
            vec![prio, eff, due, area, title]
        })
        .collect();

    // Render borderless table
    components::draw_borderless_table(
        f,
        area,
        &headers,
        &rows,
        &alignments,
        theme.colors.text,
        theme.colors.muted,
        theme.colors.muted,
    );

    // Status line below table
    let status_area = Rect {
        x: area.x,
        y: area.y + area.height.saturating_sub(1),
        width: area.width,
        height: 1,
    };
    let status = components::StatusMessage::muted(format!(
        " {} cards  {} ",
        cards.len(),
        sort_label
    ));
    components::draw_status_line(f, status_area, &status, theme);
}

// ── Tree ──

fn draw_tree(f: &mut Frame, app: &App, area: Rect) {
    let block = Block::bordered()
        .border_style(Style::new().fg(app.theme.tokens().colors.border))
        .title(" Hierarchy (parent → child) ");
    let inner = block.inner(area);

    let roots: Vec<String> = app
        .board
        .cards
        .iter()
        .filter(|c| !c.links.iter().any(|l| l.ty == LinkType::Parent))
        .map(|c| c.id.clone())
        .collect();
    let order: Vec<String> = app.board.cards.iter().map(|c| c.id.clone()).collect();
    let card_order = |a: &String| order.iter().position(|c| c == a).unwrap_or(usize::MAX);

    let mut lines: Vec<Line> = Vec::new();
    for (i, root) in roots.iter().enumerate() {
        collect_tree_lines(app, root, 0, &card_order, i == app.card_focus, &mut lines);
    }
    if roots.is_empty() {
        lines.push(Line::from(Span::styled("  (no parent-less cards — nothing linked yet)", Style::new().fg(app.theme.tokens().colors.muted))));
    }
    f.render_widget(block, area);
    f.render_widget(Paragraph::new(Text::from(lines)), inner);
}

fn collect_tree_lines<'a>(
    app: &'a App,
    id: &str,
    depth: usize,
    order: &dyn Fn(&String) -> usize,
    focused: bool,
    out: &mut Vec<Line<'a>>,
) {
    let Some(card) = app.card_by_id(id) else { return };
    let indent = "  ".repeat(depth);
    let done = if card.column == "done" {
        Span::styled("✓", Style::new().fg(app.theme.tokens().colors.success))
    } else {
        Span::styled("•", Style::new().fg(app.theme.tokens().colors.muted))
    };
    let title_s = Style::default()
        .fg(app.theme.tokens().colors.text)
        .add_modifier(if focused { Modifier::REVERSED } else { Modifier::empty() });
    out.push(Line::from(vec![
        Span::raw(indent),
        done,
        Span::raw(" "),
        Span::styled(card.title.clone(), title_s),
        Span::styled(format!(" [{}]", card.id), Style::new().fg(app.theme.tokens().colors.muted)),
    ]));

    let mut children: Vec<String> = card
        .links
        .iter()
        .filter(|l| l.ty == LinkType::Child)
        .map(|l| l.target.clone())
        .collect();
    children.sort_by_key(|c| order(c));
    for child in children {
        collect_tree_lines(app, &child, depth + 1, order, false, out);
    }
}

// ── Agenda ──

fn draw_agenda(f: &mut Frame, app: &App, area: Rect) {
    let (overdue, today, next7, later) = app.agenda_sections();
    let block = Block::bordered()
        .border_style(Style::new().fg(app.theme.tokens().colors.border))
        .title(" Agenda ");
    let inner = block.inner(area);

    let focus_index = app.card_focus;
    let mut lines: Vec<Line> = Vec::new();
    let mut counter = 0usize;

    fn section<'a>(
        app: &'a App,
        title: &'a str,
        items: &[(usize, &'a Card)],
        lines: &mut Vec<Line<'a>>,
        counter: &mut usize,
        focus: usize,
        danger: bool,
    ) {
        lines.push(Line::from(Span::styled(
            title,
            Style::new().fg(if danger { app.theme.tokens().colors.danger } else { app.theme.tokens().colors.accent }).add_modifier(Modifier::BOLD),
        )));
        if items.is_empty() {
            lines.push(Line::from(Span::styled("   (none)", Style::new().fg(app.theme.tokens().colors.muted))));
            return;
        }
        for (_, card) in items {
            let sel = *counter == focus;
            let due = card.due_date.clone().unwrap_or_default();
            let title_s = Style::default()
                .fg(app.theme.tokens().colors.text)
                .add_modifier(if sel { Modifier::REVERSED } else { Modifier::empty() });
            lines.push(Line::from(vec![
                Span::styled(if sel { "▸" } else { " " }, title_s),
                Span::styled(format!(" {} ", due), Style::new().fg(if danger { app.theme.tokens().colors.danger } else { app.theme.tokens().colors.warning })),
                Span::styled(card.title.clone(), title_s),
                Span::styled(format!(" [{}]", card.id), Style::new().fg(app.theme.tokens().colors.muted)),
            ]));
            *counter += 1;
        }
        lines.push(Line::from(Span::raw("")));
    }

    section(app, " Overdue", &overdue, &mut lines, &mut counter, focus_index, true);
    section(app, " Due today", &today, &mut lines, &mut counter, focus_index, false);
    section(app, " Next 7 days", &next7, &mut lines, &mut counter, focus_index, false);
    section(app, " Later", &later, &mut lines, &mut counter, focus_index, false);

    f.render_widget(block, area);
    f.render_widget(Paragraph::new(Text::from(lines)), inner);
}

// ── Reports ──

fn draw_reports(f: &mut Frame, app: &App, area: Rect) {
    let theme = app.theme.tokens();
    let mut lines: Vec<Line> = Vec::new();

    // Sprint burndown
    let burndowns = app.sprint_burndowns();
    lines.push(Line::from(Span::styled(
        " Sprints",
        Style::new().fg(theme.colors.accent).add_modifier(Modifier::BOLD),
    )));
    if burndowns.is_empty() {
        lines.push(Line::from(Span::styled(
            "   (no sprints — barkcli sprint start <name>)",
            Style::new().fg(theme.colors.muted),
        )));
    }
    for b in &burndowns {
        let marker = match b.state.as_str() {
            "active" => theme.symbols.active_indicator,
            "ended" => theme.symbols.inactive_indicator,
            _ => '◇',
        };
        let pct = if b.effort_total > 0 { (b.effort_done as f64 / b.effort_total as f64 * 100.0) as u32 } else { 0 };
        let bar = bar_chart(pct, 24, theme);
        let color = if b.state == "active" { theme.colors.success } else { theme.colors.muted };
        lines.push(Line::from(vec![
            Span::styled(format!("  {} {}", marker, b.name), Style::new().fg(color).add_modifier(Modifier::BOLD)),
            Span::styled(format!("  {}/{} done · {}/{} effort · {}%", b.done, b.total, b.effort_done, b.effort_total, pct), Style::new().fg(theme.colors.muted)),
            Span::styled(bar, Style::new().fg(color)),
        ]));
    }
    lines.push(Line::from(Span::raw("")));

    // Effort by column
    let columns = app.report_columns();
    let max_effort = columns.iter().map(|r| r.effort).max().unwrap_or(1).max(1);
    lines.push(Line::from(Span::styled(
        " Effort by column",
        Style::new().fg(theme.colors.accent).add_modifier(Modifier::BOLD),
    )));
    for r in &columns {
        let pct = (r.effort as f64 / max_effort as f64 * 100.0) as u32;
        lines.push(Line::from(vec![
            Span::styled(format!("  {:<12}", r.label), Style::new().fg(theme.colors.text)),
            Span::styled(bar_chart(pct, 30, theme), Style::new().fg(theme.colors.accent)),
            Span::styled(format!("  {} pts / {} cards", r.effort, r.count), Style::new().fg(theme.colors.muted)),
        ]));
    }
    lines.push(Line::from(Span::raw("")));

    // Effort by area
    let areas = app.report_areas();
    let max_area = areas.iter().map(|r| r.effort).max().unwrap_or(1).max(1);
    lines.push(Line::from(Span::styled(
        " Effort by area",
        Style::new().fg(theme.colors.accent).add_modifier(Modifier::BOLD),
    )));
    if areas.is_empty() {
        lines.push(Line::from(Span::styled(
            "   (no areas)",
            Style::new().fg(theme.colors.muted),
        )));
    }
    for r in &areas {
        let pct = (r.effort as f64 / max_area as f64 * 100.0) as u32;
        lines.push(Line::from(vec![
            Span::styled(format!("  {:<12}", r.label), Style::new().fg(theme.colors.text)),
            Span::styled(bar_chart(pct, 30, theme), Style::new().fg(theme.colors.warning)),
            Span::styled(format!("  {} pts / {} cards", r.effort, r.count), Style::new().fg(theme.colors.muted)),
        ]));
    }

    let p = Paragraph::new(Text::from(lines));
    f.render_widget(p, area);
}

fn bar_chart(pct: u32, width: u16, theme: &crate::theme::Theme) -> String {
    let filled = ((pct as u16 * width) / 100).min(width);
    let full = theme.symbols.bar_full;
    let empty = theme.symbols.bar_empty;
    let mut s = String::with_capacity(width as usize * 2);
    for i in 0..width {
        s.push(if i < filled { full } else { empty });
    }
    s
}

// ── Code ──

fn draw_code(f: &mut Frame, app: &App, area: Rect) {
    let block = Block::bordered()
        .border_style(Style::new().fg(app.theme.tokens().colors.border))
        .title(" Code search (press / to search) ");
    let inner = block.inner(area);

    let mut lines: Vec<Line> = Vec::new();
    if app.code_results.is_empty() {
        lines.push(Line::from(Span::styled(
            "  Press / and type a symbol (e.g. verify_token). Matches show files + linked cards.",
            Style::new().fg(app.theme.tokens().colors.muted),
        )));
    }
    for (i, hit) in app.code_results.iter().enumerate() {
        let sel = i == app.card_focus;
        let s = Style::default()
            .fg(if sel { app.theme.tokens().colors.accent } else { app.theme.tokens().colors.text })
            .add_modifier(if sel { Modifier::REVERSED } else { Modifier::empty() });
        let mut spans = vec![Span::styled(format!("  {} ", hit.path), s)];
        for sym in &hit.matched_symbols {
            spans.push(Span::styled(format!(" [{}]", sym), Style::new().fg(app.theme.tokens().colors.warning)));
        }
            if let Some(ids) = app.context.index.get(&hit.path) {
                if !ids.is_empty() {
                    let joined: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();
                    spans.push(Span::styled(format!(" → {}", joined.join(", ")), Style::new().fg(app.theme.tokens().colors.success)));
                }
            }
        lines.push(Line::from(spans));
    }

    f.render_widget(block, area);
    f.render_widget(Paragraph::new(Text::from(lines)), inner);
}

// ── Agents ──

/// Brand color for a coding-agent tool, detected from agent id/name.
/// Same hexes as web/src/lib/agents.ts and the landing-page hero mock:
/// OpenCode gold #D99C57, Claude terracotta #D97757, Cursor violet #6B5CE7,
/// Codex green #10A37F, Gemini blue #4285F4, human emerald #34D399.
fn agent_tool_color(id: &str, name: &str) -> Option<Color> {
    let hay = format!("{id} {name}").to_lowercase();
    if hay.contains("opencode") {
        Some(Color::Rgb(217, 156, 87))
    } else if hay.contains("claude") {
        Some(Color::Rgb(217, 119, 87))
    } else if hay.contains("cursor") {
        Some(Color::Rgb(107, 92, 231))
    } else if hay.contains("codex") || hay.contains("openai") {
        Some(Color::Rgb(16, 163, 127))
    } else if hay.contains("gemini") {
        Some(Color::Rgb(66, 133, 244))
    } else if hay.contains("human") {
        Some(Color::Rgb(52, 211, 153))
    } else {
        None
    }
}

fn draw_agents(f: &mut Frame, app: &App, area: Rect) {
    let block = Block::bordered()
        .border_style(Style::new().fg(app.theme.tokens().colors.border))
        .title(" Agents ");
    let inner = block.inner(area);

    let mut lines: Vec<Line> = Vec::new();

    // Header
    lines.push(Line::from(vec![
        Span::styled(" ID ", Style::new().fg(app.theme.tokens().colors.muted).add_modifier(Modifier::BOLD)),
        Span::styled("NAME           ", Style::new().fg(app.theme.tokens().colors.muted).add_modifier(Modifier::BOLD)),
        Span::styled("ROLE       ", Style::new().fg(app.theme.tokens().colors.muted).add_modifier(Modifier::BOLD)),
        Span::styled("STATUS   ", Style::new().fg(app.theme.tokens().colors.muted).add_modifier(Modifier::BOLD)),
        Span::styled("TASKS", Style::new().fg(app.theme.tokens().colors.muted).add_modifier(Modifier::BOLD)),
    ]));
    lines.push(Line::from(Span::styled(
        " ".repeat(area.width.min(80) as usize),
        Style::new().fg(app.theme.tokens().colors.border),
    )));

    if app.agents.is_empty() {
        lines.push(Line::from(Span::styled(
            "  No agents registered. Run: barkcli mcp",
            Style::new().fg(app.theme.tokens().colors.muted),
        )));
    } else {
        for (i, agent) in app.agents.iter().enumerate() {
            let sel = i == app.agent_cursor;
            let marker = if sel { "▸" } else { " " };
            let status_style = match agent.status {
                AgentStatus::Idle => Style::new().fg(app.theme.tokens().colors.success),
                AgentStatus::Working => Style::new().fg(app.theme.tokens().colors.warning),
                AgentStatus::Paused => Style::new().fg(app.theme.tokens().colors.muted),
                AgentStatus::Error => Style::new().fg(app.theme.tokens().colors.danger),
            };
            let status_label = match agent.status {
                AgentStatus::Idle => "idle",
                AgentStatus::Working => "working",
                AgentStatus::Paused => "paused",
                AgentStatus::Error => "error",
            };
            let title_s = Style::default()
                .fg(app.theme.tokens().colors.text)
                .add_modifier(if sel { Modifier::REVERSED } else { Modifier::empty() });
            // Agent id carries its coding-agent tool's brand color (matches web + landing).
            let id_s = match agent_tool_color(&agent.id, &agent.name) {
                Some(c) => Style::new()
                    .fg(c)
                    .add_modifier(if sel { Modifier::REVERSED } else { Modifier::empty() }),
                None => title_s,
            };
            lines.push(Line::from(vec![
                Span::styled(format!(" {} {}", marker, agent.id), id_s),
                Span::styled(format!("  {:<14}", agent.name), title_s),
                Span::styled(format!("  {:<10}", agent.role), title_s),
                Span::styled(format!("  {:<8}", status_label), status_style),
                Span::styled(format!("  {}", agent.completed_tasks.len()), Style::new().fg(app.theme.tokens().colors.muted)),
            ]));
        }
    }

    f.render_widget(block, area);
    f.render_widget(Paragraph::new(Text::from(lines)), inner);
}

// ── Orchestrate ──

fn draw_orchestrate(f: &mut Frame, app: &App, area: Rect) {
    let block = Block::bordered()
        .border_style(Style::new().fg(app.theme.tokens().colors.border))
        .title(" Orchestrate ");
    let inner = block.inner(area);

    let mut lines: Vec<Line> = Vec::new();

    // Status bar
    if let Some(ref status) = app.orchestration_status {
        lines.push(Line::from(vec![
            Span::styled("Status: ", Style::new().bold()),
            Span::styled(status.clone(), Style::new().fg(app.theme.tokens().colors.success)),
        ]));
        lines.push(Line::from(Span::raw("")));
    }

    // Task queue header
    lines.push(Line::from(vec![
        Span::styled(" ID ", Style::new().fg(app.theme.tokens().colors.muted).add_modifier(Modifier::BOLD)),
        Span::styled("CARD           ", Style::new().fg(app.theme.tokens().colors.muted).add_modifier(Modifier::BOLD)),
        Span::styled("PRIO  ", Style::new().fg(app.theme.tokens().colors.muted).add_modifier(Modifier::BOLD)),
        Span::styled("STATUS      ", Style::new().fg(app.theme.tokens().colors.muted).add_modifier(Modifier::BOLD)),
        Span::styled("ASSIGNED", Style::new().fg(app.theme.tokens().colors.muted).add_modifier(Modifier::BOLD)),
    ]));
    lines.push(Line::from(Span::styled(
        " ".repeat(area.width.min(80) as usize),
        Style::new().fg(app.theme.tokens().colors.border),
    )));

    if app.task_queue.is_empty() {
        lines.push(Line::from(Span::styled(
            "  No tasks in queue. Run: barkcli orchestrate cycle <board> <role>",
            Style::new().fg(app.theme.tokens().colors.muted),
        )));
    } else {
        for (i, task) in app.task_queue.iter().enumerate() {
            let sel = i == app.task_cursor;
            let marker = if sel { "▸" } else { " " };
            let status_style = match task.status {
                TaskStatus::Pending => Style::new().fg(app.theme.tokens().colors.muted),
                TaskStatus::Assigned => Style::new().fg(app.theme.tokens().colors.warning),
                TaskStatus::InProgress => Style::new().fg(app.theme.tokens().colors.accent),
                TaskStatus::Blocked => Style::new().fg(app.theme.tokens().colors.danger),
                TaskStatus::NeedsInput => Style::new().fg(app.theme.tokens().colors.warning),
                TaskStatus::Completed => Style::new().fg(app.theme.tokens().colors.success),
                TaskStatus::Failed => Style::new().fg(app.theme.tokens().colors.danger),
                TaskStatus::Cancelled => Style::new().fg(app.theme.tokens().colors.muted),
            };
            let status_label = match task.status {
                TaskStatus::Pending => "pending",
                TaskStatus::Assigned => "assigned",
                TaskStatus::InProgress => "in_progress",
                TaskStatus::Blocked => "blocked",
                TaskStatus::NeedsInput => "needs_input",
                TaskStatus::Completed => "completed",
                TaskStatus::Failed => "failed",
                TaskStatus::Cancelled => "cancelled",
            };
            let title_s = Style::default()
                .fg(app.theme.tokens().colors.text)
                .add_modifier(if sel { Modifier::REVERSED } else { Modifier::empty() });
            // Assigned agent shown in its tool's brand color (matches web + landing).
            let assignee = task.assigned_agent.clone().unwrap_or_default();
            let assignee_s = match agent_tool_color(&assignee, "") {
                Some(c) => Style::new().fg(c),
                None => Style::new().fg(app.theme.tokens().colors.muted),
            };
            lines.push(Line::from(vec![
                Span::styled(format!(" {} {}", marker, task.id), title_s),
                Span::styled(format!("  {:<14}", task.card_id), title_s),
                Span::styled(format!("  {:<5}", task.priority), title_s),
                Span::styled(format!("  {:<10}", status_label), status_style),
                Span::styled(format!("  {assignee}"), assignee_s),
            ]));
        }
    }

    f.render_widget(block, area);
    f.render_widget(Paragraph::new(Text::from(lines)), inner);
}

// ── Status bar ──

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
        AppMode::CodeSearch => "CODE",
        AppMode::LinkTarget => "LINK",
        AppMode::LinkKind => "LINK",
        AppMode::UnlinkTarget => "UNLINK",
        AppMode::AgentDetail => "AGENT",
        AppMode::OrchestrateTask => "TASK",
    };

    let (hint, filter_info): (String, String) = match app.mode {
        AppMode::Normal => {
            let tab_hint = match app.tab {
                Tab::Board => "↑↓/jk sel · ←→/hl col · Enter detail · a add · e edit · d del · H/L move · / filter · : cmd · T theme",
                Tab::List => "↑↓/jk sel · Enter detail · p prio · t title · e effort · u due · a add · / filter",
                Tab::Tree => "↑↓/jk sel · Enter detail",
                Tab::Agenda => "↑↓/jk sel · Enter detail",
                Tab::Reports => "read-only · q quit",
                Tab::Code => "↑↓/jk sel · / search · Enter open linked card",
                Tab::Agents => "↑↓/jk sel · Enter detail",
                Tab::Orchestrate => "↑↓/jk sel · r run cycle · c claim · Enter detail",
                Tab::History => "↑↓/jk sel · Enter detail · q quit",
            };
            let filter = if app.filter.is_empty() { String::new() } else { format!(" │ filter:{}", app.filter) };
            (format!("{}", tab_hint), filter)
        }
        AppMode::FilterInput =>
            (format!("filter: {}█ (Enter apply, Esc clear, Tab autocomplete)", app.edit_buffer), String::new()),
        AppMode::CommandPalette =>
            (format!(":{}█ (Enter execute, Esc cancel)", app.edit_buffer), String::new()),
        AppMode::AddingTitle =>
            (format!("Enter title: {}█ (Enter confirm, Esc cancel)", app.edit_buffer), String::new()),
        AppMode::EditingCard =>
            (format!("Tab next field · Enter save · Esc cancel"), String::new()),
        AppMode::ViewingDetail =>
            (format!("Esc close · l link · u unlink · e edit"), String::new()),
        AppMode::ConfirmDelete =>
            (format!("Delete card? y / n"), String::new()),
        AppMode::BoardPicker =>
            (format!("↑↓ select · Enter open · q quit"), String::new()),
        AppMode::CodeSearch =>
            (format!("symbol: {}█ (Enter run)", app.edit_buffer), String::new()),
        AppMode::LinkTarget =>
            (format!("target id: {}█ (Enter confirm, Esc cancel)", app.edit_buffer), String::new()),
        AppMode::LinkKind =>
            (format!("type [child|parent|related|blocked-by]: {}█ (Enter confirm)", app.edit_buffer), String::new()),
        AppMode::UnlinkTarget =>
            (format!("target id: {}█ (Enter confirm, Esc cancel)", app.edit_buffer), String::new()),
        AppMode::AgentDetail =>
            (format!("Esc close"), String::new()),
        AppMode::OrchestrateTask =>
            (format!("Esc close"), String::new()),
    };

    let status_msg = app.status_msg.clone().unwrap_or_default();
    let spinner = app.scan_spinner.clone().unwrap_or_default();
    // Transient feedback (spinner / status message) leads the line so it is
    // always visible on narrow terminals; hints follow and truncate naturally.
    let spinner_part = if spinner.is_empty() { String::new() } else { format!("{} ", spinner) };
    let status_part = if status_msg.is_empty() { String::new() } else { format!("{}{}  ", spinner_part, status_msg) };
    let rest = if status_part.is_empty() {
        format!("{}{}", hint, filter_info)
    } else {
        format!("{}{}{}", status_part, hint, filter_info)
    };

    let theme = app.theme.tokens();
    let line = components::format_status_bar(
        &format!(" {} ", mode_str),
        &rest,
        theme,
    );
    let p = Paragraph::new(line).style(Style::new().bg(theme.colors.surface));
    f.render_widget(p, area);
}

// ── Detail overlay ──

fn draw_detail_overlay(f: &mut Frame, area: Rect, app: &App, card: &Card) {
    let w = area.width.min(72);
    let h = area.height.min(28);
    let detail = centered_rect(w, h, area);

    let mut lines = Vec::new();
    lines.push(Line::from(Span::styled(" Card Detail  (l link · u unlink · e edit · Esc close)", Style::new().bold().fg(app.theme.tokens().colors.accent))));
    lines.push(Line::from(Span::raw("")));
    lines.push(Line::from(vec![
        Span::styled("ID:      ", Style::new().bold()), Span::raw(&card.id),
        Span::raw("   "), Span::styled("Col: ", Style::new().bold()), Span::raw(&card.column),
    ]));
    lines.push(Line::from(vec![
        Span::styled("Title:   ", Style::new().bold()), Span::raw(&card.title),
    ]));
    let mut meta = vec![
        Span::styled("Priority: ", Style::new().bold()),
        priority_span(app, &card.priority),
    ];
    if let Some(e) = card.effort {
        meta.push(Span::styled(format!("   Effort: {}", e), Style::new().bold()));
    }
    if let Some(a) = &card.area {
        meta.push(Span::styled(format!("   Area: {}", a), Style::new().bold()));
    }
    lines.push(Line::from(meta));
    if card.due_date.is_some() || card.remind_at.is_some() {
        let due = card.due_date.clone().unwrap_or_else(|| "—".into());
        let remind = card.remind_at.clone().unwrap_or_else(|| "—".into());
        lines.push(Line::from(vec![
            Span::styled("Due:     ", Style::new().bold()), Span::raw(due),
            Span::raw("   "), Span::styled("Remind: ", Style::new().bold()), Span::raw(remind),
        ]));
    }
    if !card.labels.is_empty() {
        lines.push(Line::from(vec![
            Span::styled("Labels:  ", Style::new().bold()),
            Span::styled(card.labels.join(", "), Style::new().fg(app.theme.tokens().colors.accent)),
        ]));
    }
    if let Some(ref a) = card.assignee {
        lines.push(Line::from(vec![
            Span::styled("Assignee:", Style::new().bold()),
            Span::styled(format!(" {}", a), Style::new().fg(app.theme.tokens().colors.success)),
        ]));
    }

    if !card.links.is_empty() {
        lines.push(Line::from(Span::raw("")));
        lines.push(Line::from(Span::styled("Links:", Style::new().bold())));
        for l in &card.links {
            let name = app.card_by_id(&l.target).map(|c| c.title.clone()).unwrap_or_default();
            lines.push(Line::from(vec![
                Span::raw(format!("   {:<10}", l.ty.to_string())),
                Span::styled(&l.target, Style::new().fg(app.theme.tokens().colors.warning)),
                if name.is_empty() { Span::raw("") } else { Span::styled(format!("  {}", name), Style::new().fg(app.theme.tokens().colors.muted)) },
            ]));
        }
    }

    if !card.acceptance_criteria.is_empty() {
        lines.push(Line::from(Span::raw("")));
        lines.push(Line::from(Span::styled("Acceptance criteria:", Style::new().bold())));
        for ac in &card.acceptance_criteria {
            lines.push(Line::from(Span::raw(format!("   ☐ {}", ac))));
        }
    }

    if let Some(ref desc) = card.description {
        if !desc.is_empty() {
            lines.push(Line::from(Span::raw("")));
            lines.push(Line::from(Span::styled("Description:", Style::new().bold())));
            for dl in desc.lines() { lines.push(Line::from(Span::raw(format!("  {}", dl)))); }
        }
    }

    if !card.checklist.is_empty() {
        lines.push(Line::from(Span::raw("")));
        lines.push(Line::from(Span::styled("Checklist:", Style::new().bold())));
        for item in &card.checklist {
            let mark = if item.done { "✓" } else { "○" };
            lines.push(Line::from(Span::raw(format!("  {} {}", mark, item.text))));
        }
    }

    // Code context
    if let Some(ctx) = app.context.cards.get(&card.id) {
        if !ctx.files.is_empty() {
            lines.push(Line::from(Span::raw("")));
            lines.push(Line::from(Span::styled("Code context:", Style::new().bold())));
            for f in ctx.files.iter().take(8) {
                let status = match f.status.as_str() {
                    "clean" => "✓",
                    "changed" => "!",
                    "stale" => "✗",
                    _ => "?",
                };
                let status_color = match f.status.as_str() {
                    "clean" => app.theme.tokens().colors.success,
                    "changed" => app.theme.tokens().colors.warning,
                    "stale" => app.theme.tokens().colors.danger,
                    _ => app.theme.tokens().colors.muted,
                };
                lines.push(Line::from(vec![
                    Span::styled(format!("   {} ", status), Style::new().fg(status_color)),
                    Span::raw(&f.path),
                ]));
            }
            if let Some(ai) = &ctx.ai {
                lines.push(Line::from(vec![
                    Span::styled("   ai: ", Style::new().fg(app.theme.tokens().colors.accent)),
                    Span::raw(ai.summary.clone()),
                ]));
            }
        }
    }

    lines.push(Line::from(Span::raw("")));
    let ts_style = Style::new().fg(app.theme.tokens().colors.muted);
    lines.push(Line::from(vec![
        Span::styled("Created: ", ts_style),
        Span::styled(card.created_at.format("%Y-%m-%d %H:%M UTC").to_string(), ts_style),
    ]));
    lines.push(Line::from(vec![
        Span::styled("Updated: ", ts_style),
        Span::styled(card.updated_at.format("%Y-%m-%d %H:%M UTC").to_string(), ts_style),
    ]));

    let p = Paragraph::new(Text::from(lines))
        .block(Block::bordered().border_style(Style::new().fg(app.theme.tokens().colors.accent)).style(Style::new().bg(app.theme.tokens().colors.card)))
        .wrap(Wrap { trim: false });
    f.render_widget(p, detail);
}

fn draw_prompt(f: &mut Frame, app: &App, area: Rect, prompt: &str, value: &str) {
    let r = centered_rect(area.width.min(64), 3, area);
    let s = if value.is_empty() { prompt.to_string() } else { format!("{}: {}█", prompt, value) };
    let p = Paragraph::new(s).block(Block::bordered().border_style(Style::new().fg(app.theme.tokens().colors.accent)));
    f.render_widget(p, r);
}

fn draw_edit_overlay(f: &mut Frame, area: Rect, app: &App) {
    let w = area.width.min(60);
    let r = centered_rect(w, 12, area);

    let hl = |f: EditField| -> Style {
        if app.edit_field == f { Style::new().fg(app.theme.tokens().colors.warning).add_modifier(Modifier::REVERSED) }
        else { Style::default() }
    };
    let val = if app.edit_buffer.is_empty() { "<empty>" } else { &app.edit_buffer };
    let lines = vec![
        Line::from(Span::styled(" Edit Card  (Tab next · Enter save · Esc cancel)", Style::new().bold().fg(app.theme.tokens().colors.accent))),
        Line::from(Span::raw("")),
        Line::from(vec![Span::styled("  Title:       ", hl(EditField::Title)), Span::styled(val, hl(EditField::Title))]),
        Line::from(vec![Span::styled("  Description: ", hl(EditField::Description)), Span::styled(val, hl(EditField::Description))]),
        Line::from(vec![Span::styled("  Priority:    ", hl(EditField::Priority)), Span::styled(val, hl(EditField::Priority))]),
        Line::from(vec![Span::styled("  Labels:      ", hl(EditField::Labels)), Span::styled(val, hl(EditField::Labels))]),
        Line::from(vec![Span::styled("  Assignee:    ", hl(EditField::Assignee)), Span::styled(val, hl(EditField::Assignee))]),
        Line::from(Span::raw("")),
        Line::from(Span::styled("  [ Save & Finish ]", if app.edit_field == EditField::Done {
            Style::new().fg(app.theme.tokens().colors.warning).add_modifier(Modifier::REVERSED)
        } else { Style::new().fg(app.theme.tokens().colors.muted) })),
    ];
    let p = Paragraph::new(Text::from(lines))
        .block(Block::bordered().border_style(Style::new().fg(app.theme.tokens().colors.accent)).style(Style::new().bg(app.theme.tokens().colors.card)));
    f.render_widget(p, r);
}

fn draw_palette(f: &mut Frame, area: Rect, app: &App) {
    let w = area.width.min(56);
    let h = (app.palette_matches.len() + 2).max(1) as u16 + 2;
    let r = centered_rect(w, h, area);

    let mut lines = vec![
        Line::from(Span::styled(format!(" :{}█", app.edit_buffer), Style::new().bold())),
    ];
    for m in &app.palette_matches {
        lines.push(Line::from(Span::styled(format!("  {}", m), Style::new().fg(app.theme.tokens().colors.warning))));
    }
    if app.palette_matches.is_empty() && !app.edit_buffer.is_empty() {
        lines.push(Line::from(Span::styled("  (no matches)", Style::new().fg(app.theme.tokens().colors.muted))));
    }
    let p = Paragraph::new(Text::from(lines))
        .block(Block::bordered().border_style(Style::new().fg(app.theme.tokens().colors.accent)).style(Style::new().bg(app.theme.tokens().colors.card)));
    f.render_widget(p, r);
}

fn draw_confirm_overlay(f: &mut Frame, area: Rect, app: &App) {
    let theme = app.theme.tokens();
    let message = "Delete this card? This action cannot be undone.";
    let hints = [("y", "Yes, delete"), ("n", "No, cancel")];
    components::draw_confirm_box(f, area, message, &hints, theme.colors.danger);
}

fn priority_span<'a>(app: &App, p: &'a str) -> Span<'a> {
    match p {
        "high" => Span::styled("high", Style::new().fg(app.theme.tokens().colors.danger).add_modifier(Modifier::BOLD)),
        "medium" => Span::styled("medium", Style::new().fg(app.theme.tokens().colors.warning)),
        _ => Span::styled(p, Style::new().fg(app.theme.tokens().colors.muted)),
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

// ── History (Smart History Bundles) ──

fn draw_history(f: &mut Frame, app: &App, area: Rect) {
    use ratatui::widgets::{Block, Borders, List, ListItem, ListState};

    let bundles = barkcli_core::history::list_bundles(None, None, None).unwrap_or_default();
    let items: Vec<ListItem> = bundles
        .iter()
        .map(|b| {
            let status = if b.is_sealed() { "●" } else { "○" };
            let line = format!(
                " {} [{:<7}] {:<30} {} commits  +{}/-{}  {:.0}%",
                status,
                b.kind.as_str(),
                b.title,
                b.stats.commits,
                b.stats.additions,
                b.stats.deletions,
                b.confidence * 100.0,
            );
            ListItem::new(line)
        })
        .collect();

    let mut state = ListState::default();
    if !bundles.is_empty() {
        state.select(Some(app.history_selected.min(bundles.len().saturating_sub(1))));
    }

    let list = List::new(items)
        .block(Block::default().title("Bundles").borders(Borders::ALL))
        .highlight_symbol("> ");
    f.render_stateful_widget(list, area, &mut state);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::{Theme, ThemeVariant};
    use ratatui::{backend::TestBackend, Terminal};

    #[test]
    fn agent_tool_colors_match_web_palette() {
        // Same hexes as web/src/lib/agents.ts and the landing hero mock.
        assert_eq!(agent_tool_color("opencode-1", "worker"), Some(Color::Rgb(217, 156, 87)));
        assert_eq!(agent_tool_color("claude-2", "worker"), Some(Color::Rgb(217, 119, 87)));
        assert_eq!(agent_tool_color("x", "Cursor Agent"), Some(Color::Rgb(107, 92, 231)));
        assert_eq!(agent_tool_color("codex-1", ""), Some(Color::Rgb(16, 163, 127)));
        assert_eq!(agent_tool_color("gemini-1", ""), Some(Color::Rgb(66, 133, 244)));
        assert_eq!(agent_tool_color("human-you", ""), Some(Color::Rgb(52, 211, 153)));
        assert_eq!(agent_tool_color("random-9", "helper"), None);
    }

    fn renders_without_panic(app: &App, width: u16, height: u16) {
        let backend = TestBackend::new(width, height);
        let mut terminal = Terminal::new(backend).expect("terminal");
        terminal.draw(|f| draw(f, app)).expect("draw");
        // The render buffer must be addressable (guarantees the draw wrote a valid frame).
        assert!(terminal.backend().buffer().area.width == width);
    }

    /// Every tab renders cleanly with every theme at terminal sizes from the
    /// minimum (60×12, enforced by draw()) up to large. Catches panics from
    /// out-of-range indices, bad layout constraints, and column arithmetic.
    #[test]
    fn smoke_all_tabs_all_themes_all_sizes() {
        let sizes: [(u16, u16); 5] = [(60, 12), (80, 24), (100, 30), (140, 40), (220, 55)];
        let themes: [Theme; 3] = [Theme::dark(), Theme::light(), Theme::minimal()];
        for tab in crate::app::Tab::ALL {
            for theme in themes {
                let mut app = App::for_test();
                app.tab = tab;
                app.theme = theme;
                for (w, h) in sizes {
                    renders_without_panic(&app, w, h);
                }
            }
        }
    }

    /// Overlays and modal modes render without panicking, including with a
    /// long status message on the smallest allowed terminal.
    #[test]
    fn smoke_all_modes_overlay_and_truncation() {
        let modes = [
            AppMode::Normal,
            AppMode::FilterInput,
            AppMode::CommandPalette,
            AppMode::AddingTitle,
            AppMode::EditingCard,
            AppMode::ViewingDetail,
            AppMode::ConfirmDelete,
            AppMode::BoardPicker,
            AppMode::CodeSearch,
            AppMode::LinkTarget,
            AppMode::LinkKind,
            AppMode::UnlinkTarget,
            AppMode::AgentDetail,
            AppMode::OrchestrateTask,
        ];
        for mode in modes {
            let mut app = App::for_test();
            app.mode = mode;
            app.status_msg = Some("x".repeat(500)); // worst-case status truncation
            renders_without_panic(&app, 60, 12);
            renders_without_panic(&app, 200, 50);
        }
    }

    /// Spinner + status + filter info co-render in the status bar.
    /// Transient feedback must be visible even on the smallest terminal.
    #[test]
    fn smoke_status_bar_with_spinner() {
        let mut app = App::for_test();
        app.scan_spinner = Some("⠋".to_string());
        app.status_msg = Some("scanning git history…".to_string());
        app.filter = "is:todo pri:high".to_string();
        app.parse_query();
        renders_without_panic(&app, 60, 12);
        // Feedback leads the status line → visible even at minimum width.
        let text = rendered_text(&app, 80, 24);
        assert!(text.contains("⠋ scanning git history…"), "spinner+status lead the line");
    }

    /// Theme cycle: Dark → Light → Minimal → Dark.
    #[test]
    fn theme_cycles_through_all_variants() {
        let t = Theme::dark();
        assert_eq!(t.variant, ThemeVariant::Dark);
        assert_eq!(t.label(), "dark");
        let t2 = t.next();
        assert_eq!(t2.variant, ThemeVariant::Light);
        assert_eq!(t2.label(), "light");
        assert!(t2.is_light());
        let t3 = t2.next();
        assert_eq!(t3.variant, ThemeVariant::Minimal);
        assert_eq!(t3.label(), "minimal");
        // Minimal maps to the monochrome token set.
        assert_eq!(t3.tokens().colors.text, ratatui::style::Color::Reset);
        let t4 = t3.next();
        assert_eq!(t4.variant, ThemeVariant::Dark);
        // Tokens are correct per variant.
        assert_eq!(t.tokens().colors.bg, crate::theme::DARK.colors.bg);
        assert_eq!(t2.tokens().colors.bg, crate::theme::LIGHT.colors.bg);
        assert_eq!(t3.tokens().colors.bg, crate::theme::MINIMAL.colors.bg);
    }

    fn rendered_text(app: &App, width: u16, height: u16) -> String {
        let backend = TestBackend::new(width, height);
        let mut terminal = Terminal::new(backend).expect("terminal");
        terminal.draw(|f| draw(f, app)).expect("draw");
        terminal
            .backend()
            .buffer()
            .content
            .iter()
            .map(|c| c.symbol().to_string())
            .collect()
    }

    /// Board view actually shows column titles, card titles, and the active mode.
    #[test]
    fn board_view_renders_expected_content() {
        let app = App::for_test();
        let text = rendered_text(&app, 120, 35);
        assert!(text.contains("Fix login bug"), "board must show card title");
        assert!(text.contains("Write docs"), "board must show second card");
        assert!(text.contains("NORMAL"), "status bar must show mode");
        // Tab bar must list all 9 tabs, including the newest History tab.
        assert!(text.contains("9 History"), "tab bar must include History");
    }

    /// List view (borderless table) shows header row and card titles.
    #[test]
    fn list_view_renders_header_and_rows() {
        let mut app = App::for_test();
        app.tab = crate::app::Tab::List;
        let text = rendered_text(&app, 120, 35);
        assert!(text.contains("PRIO"), "list header present");
        assert!(text.contains("Fix login bug"), "list rows present");
        assert!(text.contains("HI"), "priority badge rendered");
    }

    /// Minimal theme renders and keeps visible text (no corruption in CI mode).
    #[test]
    fn minimal_theme_renders_ascii_symbols() {
        let mut app = App::for_test();
        app.theme = Theme::minimal();
        app.scan_spinner = Some("-".to_string());
        app.status_msg = Some("working".to_string());
        let text = rendered_text(&app, 220, 30);
        assert!(text.contains("- working"), "minimal theme keeps status + ascii spinner");
        assert!(text.contains("9 History"), "minimal theme keeps tab bar intact");
    }
}
