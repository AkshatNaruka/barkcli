//! Status line component — Vercel CLI's `>` prefix convention.
//!
//! Renders status messages with a consistent prefix, color-coded by severity.
//! Used in the status bar and for transient messages.

use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

/// Severity level for a status message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusLevel {
    Info,
    Success,
    Warning,
    Error,
    Muted,
}

impl StatusLevel {
    pub fn color(&self, theme: &super::super::theme::Theme) -> Color {
        let c = theme.colors;
        match self {
            StatusLevel::Info => c.accent,
            StatusLevel::Success => c.success,
            StatusLevel::Warning => c.warning,
            StatusLevel::Error => c.danger,
            StatusLevel::Muted => c.muted,
        }
    }

    pub fn symbol(&self, theme: &super::super::theme::Theme) -> &'static str {
        match self {
            StatusLevel::Info => "i",
            StatusLevel::Success => "+",
            StatusLevel::Warning => "!",
            StatusLevel::Error => "x",
            StatusLevel::Muted => " ",
        }
    }
}

/// A single status message.
pub struct StatusMessage {
    pub level: StatusLevel,
    pub text: String,
}

impl StatusMessage {
    pub fn info(text: impl Into<String>) -> Self {
        Self { level: StatusLevel::Info, text: text.into() }
    }
    pub fn success(text: impl Into<String>) -> Self {
        Self { level: StatusLevel::Success, text: text.into() }
    }
    pub fn warning(text: impl Into<String>) -> Self {
        Self { level: StatusLevel::Warning, text: text.into() }
    }
    pub fn error(text: impl Into<String>) -> Self {
        Self { level: StatusLevel::Error, text: text.into() }
    }
    pub fn muted(text: impl Into<String>) -> Self {
        Self { level: StatusLevel::Muted, text: text.into() }
    }
}

/// Draw a single status line with `>` prefix.
pub fn draw_status_line(
    f: &mut Frame,
    area: Rect,
    message: &StatusMessage,
    theme: &super::super::theme::Theme,
) {
    let prefix = theme.symbols.status_prefix;
    let color = message.level.color(theme);

    let mut spans = vec![
        Span::styled(format!(" {} ", prefix), Style::default().fg(color).add_modifier(Modifier::BOLD)),
        Span::styled(message.text.clone(), Style::default().fg(color)),
    ];

    // Add severity symbol for non-info levels
    if message.level != StatusLevel::Info && message.level != StatusLevel::Muted {
        spans.insert(1, Span::styled(
            format!("{} ", message.level.symbol(theme)),
            Style::default().fg(color),
        ));
    }

    let p = Paragraph::new(Line::from(spans));
    f.render_widget(p, area);
}

/// Draw a multi-line status block (e.g., scan results with multiple lines).
pub fn draw_status_block(
    f: &mut Frame,
    area: Rect,
    messages: &[StatusMessage],
    theme: &super::super::theme::Theme,
) {
    let lines: Vec<Line> = messages
        .iter()
        .map(|m| {
            let prefix = theme.symbols.status_prefix;
            let color = m.level.color(theme);
            Line::from(vec![
                Span::styled(format!(" {} ", prefix), Style::default().fg(color).add_modifier(Modifier::BOLD)),
                Span::styled(m.text.clone(), Style::default().fg(color)),
            ])
        })
        .collect();

    let p = Paragraph::new(lines);
    f.render_widget(p, area);
}

/// Build a status bar string for the bottom line.
pub fn format_status_bar(
    left: &str,
    right: &str,
    theme: &super::super::theme::Theme,
) -> Line<'static> {
    Line::from(vec![
        Span::styled(left.to_string(), Style::default().fg(theme.colors.text)),
        Span::styled("  │  ".to_string(), Style::default().fg(theme.colors.muted)),
        Span::styled(right.to_string(), Style::default().fg(theme.colors.muted)),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::theme::{DARK, LIGHT, Theme};

    #[test]
    fn status_levels_have_colors() {
        let t: Theme = DARK;
        assert_ne!(StatusLevel::Info.color(&t), StatusLevel::Error.color(&t));
        assert_ne!(StatusLevel::Success.color(&t), StatusLevel::Warning.color(&t));
    }

    #[test]
    fn status_message_constructors() {
        let m = StatusMessage::success("done");
        assert_eq!(m.level, StatusLevel::Success);
        assert_eq!(m.text, "done");
    }

    #[test]
    fn status_bar_format() {
        let t = DARK;
        let line = format_status_bar("Board", "5 cards", &t);
        assert_eq!(line.spans.len(), 3);
    }

    #[test]
    fn light_theme_status() {
        let t: Theme = LIGHT;
        let m = StatusMessage::error("fail");
        assert_eq!(m.level.color(&t), t.colors.danger);
    }
}
