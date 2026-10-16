//! Borderless table component inspired by Vercel CLI's `cli-table3`.
//!
//! Renders aligned columns with padding and no visual borders — just clean,
//! scannable data. Used for lists, reports, and search results.

use ratatui::{
    layout::{Alignment, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

/// A single row in a borderless table.
pub struct TableRow {
    pub columns: Vec<String>,
}

/// A borderless table with aligned columns.
pub struct BorderlessTable {
    pub headers: Vec<String>,
    pub rows: Vec<TableRow>,
    pub alignments: Vec<Alignment>,
}

impl BorderlessTable {
    pub fn new(headers: &[&str]) -> Self {
        let n = headers.len();
        Self {
            headers: headers.iter().map(|s| s.to_string()).collect(),
            rows: Vec::new(),
            alignments: vec![Alignment::Left; n],
        }
    }

    pub fn with_alignment(mut self, col: usize, align: Alignment) -> Self {
        if col < self.alignments.len() {
            self.alignments[col] = align;
        }
        self
    }

    pub fn add_row(&mut self, columns: Vec<String>) {
        self.rows.push(TableRow { columns });
    }

    /// Calculate column widths based on content + headers.
    fn col_widths(&self, max_width: usize) -> Vec<usize> {
        let n = self.headers.len();
        let mut widths = vec![0usize; n];

        for (i, h) in self.headers.iter().enumerate() {
            widths[i] = widths[i].max(h.chars().count());
        }
        for row in &self.rows {
            for (i, col) in row.columns.iter().enumerate() {
                if i < n {
                    widths[i] = widths[i].max(col.chars().count());
                }
            }
        }

        // Cap total width
        let total: usize = widths.iter().sum::<usize>() + (n.saturating_sub(1)) * 2;
        if total > max_width {
            let excess = total - max_width;
            let per_col = excess / n.max(1);
            for w in widths.iter_mut() {
                *w = w.saturating_sub(per_col);
            }
        }
        widths
    }
}

/// Render a borderless table into the given area.
pub fn draw_borderless_table(
    f: &mut Frame,
    area: Rect,
    headers: &[&str],
    rows: &[Vec<String>],
    alignments: &[Alignment],
    text_color: Color,
    header_color: Color,
    muted_color: Color,
) {
    let n = headers.len();
    let mut widths = vec![0usize; n];

    for (i, h) in headers.iter().enumerate() {
        widths[i] = widths[i].max(h.chars().count());
    }
    for row in rows {
        for (i, col) in row.iter().enumerate() {
            if i < n {
                widths[i] = widths[i].max(col.chars().count());
            }
        }
    }

    // Cap to terminal width
    let gap = 2;
    let total: usize = widths.iter().sum::<usize>() + (n.saturating_sub(1)) * gap;
    if total > area.width as usize {
        let excess = total - area.width as usize;
        let per_col = excess / n.max(1);
        for w in widths.iter_mut() {
            *w = w.saturating_sub(per_col);
        }
    }

    let mut lines: Vec<Line> = Vec::new();

    // Header row
    let mut spans: Vec<Span> = Vec::new();
    for (i, h) in headers.iter().enumerate() {
        let padded = format!("{:<width$}", h, width = widths[i]);
        spans.push(Span::styled(
            padded,
            Style::default().fg(header_color).add_modifier(Modifier::BOLD),
        ));
        if i < n - 1 {
            spans.push(Span::raw("  "));
        }
    }
    lines.push(Line::from(spans));

    // Separator (subtle)
    let sep: String = widths.iter().map(|w| "─".repeat(*w)).collect::<Vec<_>>().join("  ");
    lines.push(Line::from(Span::styled(sep, Style::default().fg(muted_color))));

    // Data rows
    for row in rows {
        let mut spans: Vec<Span> = Vec::new();
        for (i, col) in row.iter().enumerate() {
            if i >= n { break; }
            let padded = if alignments.get(i) == Some(&Alignment::Right) {
                format!("{:>width$}", col, width = widths[i])
            } else {
                format!("{:<width$}", col, width = widths[i])
            };
            spans.push(Span::styled(padded, Style::default().fg(text_color)));
            if i < n - 1 {
                spans.push(Span::raw("  "));
            }
        }
        lines.push(Line::from(spans));
    }

    let p = Paragraph::new(lines);
    f.render_widget(p, area);
}

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::layout::Alignment;

    #[test]
    fn table_new_sets_defaults() {
        let t = BorderlessTable::new(&["Name", "Value"]);
        assert_eq!(t.headers.len(), 2);
        assert_eq!(t.rows.len(), 0);
        assert_eq!(t.alignments.len(), 2);
    }

    #[test]
    fn table_add_row() {
        let mut t = BorderlessTable::new(&["A", "B"]);
        t.add_row(vec!["hello".to_string(), "world".to_string()]);
        assert_eq!(t.rows.len(), 1);
        assert_eq!(t.rows[0].columns[0], "hello");
    }

    #[test]
    fn table_alignment() {
        let mut t = BorderlessTable::new(&["Count"]);
        t.add_row(vec!["42".to_string()]);
        t = t.with_alignment(0, Alignment::Right);
        assert_eq!(t.alignments[0], Alignment::Right);
    }
}
