//! Unicode box-drawing component for important messages and confirmations.
//!
//! Inspired by Vercel CLI's `box.ts` — uses Unicode box-drawing characters
//! for a clean, professional presentation of critical information.

use ratatui::{
    layout::{Alignment, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

/// Draw a Unicode box with a title and content lines.
///
/// Uses narrow-terminal detection: falls back to horizontal rules if the
/// content is too wide for the terminal.
pub fn draw_box(f: &mut Frame, area: Rect, title: &str, content: &[&str], border_color: Color) {
    let max_content_width = content.iter().map(|l| l.chars().count()).max().unwrap_or(0);
    let box_width = max_content_width + 4; // 2 for padding, 2 for borders
    let term_width = area.width as usize;

    // Narrow terminal fallback: use horizontal rules instead of box-drawing
    if box_width > term_width {
        let rule = "─".repeat(term_width.min(40));
        let lines: Vec<Line> = std::iter::once(Line::from(Span::styled(
            format!(" {} ", title),
            Style::default().fg(border_color).add_modifier(Modifier::BOLD),
        )))
        .chain(content.iter().map(|l| Line::from(Span::raw(*l))))
        .chain(std::iter::once(Line::from(Span::styled(
            rule,
            Style::default().fg(border_color),
        ))))
        .collect();
        let p = Paragraph::new(lines);
        f.render_widget(p, area);
        return;
    }

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(border_color))
        .title(Span::styled(
            format!(" {} ", title),
            Style::default().fg(border_color).add_modifier(Modifier::BOLD),
        ))
        .title_alignment(Alignment::Left);

    let inner = block.inner(area);
    f.render_widget(block, area);

    let lines: Vec<Line> = content
        .iter()
        .map(|l| Line::from(Span::raw(*l)))
        .collect();
    let p = Paragraph::new(lines).style(Style::default().fg(Color::Reset));
    f.render_widget(p, inner);
}

/// Draw a confirmation box with a message and key hints.
pub fn draw_confirm_box(f: &mut Frame, area: Rect, message: &str, hints: &[(&str, &str)], border_color: Color) {
    let mut content = vec![message.to_string(), String::new()];
    for (key, label) in hints {
        content.push(format!("  [{}] {}", key, label));
    }
    let content_refs: Vec<&str> = content.iter().map(|s| s.as_str()).collect();
    draw_box(f, area, "Confirm", &content_refs, border_color);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn box_width_calculation() {
        let content = ["short", "a much longer line of text"];
        let max = content.iter().map(|l| l.chars().count()).max().unwrap_or(0);
        assert_eq!(max, 26);
    }
}
