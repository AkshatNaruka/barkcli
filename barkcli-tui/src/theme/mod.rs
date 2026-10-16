//! Design tokens for the barkcli TUI.
//!
//! Centralizes all colors, symbols, and spacing values so that theme switching,
//! CI-aware mode, and debug mode are data-driven rather than code-driven.
//!
//! Inspired by Vercel CLI's design philosophy: minimal, clean, consistent.

use ratatui::style::Color;

/// Design tokens for a single theme.
#[derive(Debug, Clone, Copy)]
pub struct Theme {
    pub colors: Colors,
    pub symbols: Symbols,
    pub spacing: Spacing,
}

/// Semantic color palette.
#[derive(Debug, Clone, Copy)]
pub struct Colors {
    pub bg: Color,
    pub surface: Color,
    pub card: Color,
    pub text: Color,
    pub muted: Color,
    pub accent: Color,
    pub selection: Color,
    pub danger: Color,
    pub success: Color,
    pub warning: Color,
    pub border: Color,
}

/// Unicode symbols used across the UI.
#[derive(Debug, Clone, Copy)]
pub struct Symbols {
    pub selection_marker: char,
    pub active_indicator: char,
    pub inactive_indicator: char,
    pub done: char,
    pub todo: char,
    pub bar_full: char,
    pub bar_empty: char,
    pub status_prefix: char,
    pub effort: char,
    pub cross: char,
    pub tick: char,
}

/// Spacing constants.
#[derive(Debug, Clone, Copy)]
pub struct Spacing {
    pub card_padding: u16,
    pub column_gap: u16,
    pub status_padding: u16,
}

/// Shared spacing values (const so they can be used in static themes).
const DEFAULT_SPACING: Spacing = Spacing {
    card_padding: 1,
    column_gap: 2,
    status_padding: 1,
};

impl Default for Spacing {
    fn default() -> Self {
        DEFAULT_SPACING
    }
}

/// Dark theme (default).
pub const DARK: Theme = Theme {
    colors: Colors {
        bg: Color::Rgb(10, 10, 15),
        surface: Color::Rgb(18, 18, 28),
        card: Color::Rgb(25, 25, 38),
        text: Color::Rgb(220, 220, 230),
        muted: Color::Rgb(80, 80, 100),
        accent: Color::Rgb(96, 165, 250),
        selection: Color::Rgb(30, 41, 59),
        danger: Color::Rgb(248, 113, 113),
        success: Color::Rgb(52, 211, 153),
        warning: Color::Rgb(251, 191, 36),
        border: Color::Rgb(60, 60, 80),
    },
    symbols: Symbols {
        selection_marker: '▸',
        active_indicator: '●',
        inactive_indicator: '○',
        done: '✓',
        todo: '☐',
        bar_full: '█',
        bar_empty: '░',
        status_prefix: '>',
        effort: '⏱',
        cross: '✗',
        tick: '✔',
    },
    spacing: DEFAULT_SPACING,
};

/// Light theme.
pub const LIGHT: Theme = Theme {
    colors: Colors {
        bg: Color::Rgb(245, 245, 250),
        surface: Color::Rgb(235, 235, 245),
        card: Color::Rgb(255, 255, 255),
        text: Color::Rgb(30, 30, 40),
        muted: Color::Rgb(160, 160, 170),
        accent: Color::Rgb(37, 99, 235),
        selection: Color::Rgb(219, 234, 254),
        danger: Color::Rgb(220, 38, 38),
        success: Color::Rgb(5, 150, 105),
        warning: Color::Rgb(217, 119, 6),
        border: Color::Rgb(200, 200, 215),
    },
    symbols: Symbols {
        selection_marker: '▸',
        active_indicator: '●',
        inactive_indicator: '○',
        done: '✓',
        todo: '☐',
        bar_full: '█',
        bar_empty: '░',
        status_prefix: '>',
        effort: '⏱',
        cross: '✗',
        tick: '✔',
    },
    spacing: DEFAULT_SPACING,
};

/// Minimal theme inspired by Vercel CLI's clean aesthetic.
/// Near-monochrome with subtle accents.
pub const MINIMAL: Theme = Theme {
    colors: Colors {
        bg: Color::Reset,
        surface: Color::Reset,
        card: Color::Reset,
        text: Color::Reset,
        muted: Color::DarkGray,
        accent: Color::Cyan,
        selection: Color::DarkGray,
        danger: Color::Red,
        success: Color::Green,
        warning: Color::Yellow,
        border: Color::DarkGray,
    },
    symbols: Symbols {
        selection_marker: '>',
        active_indicator: '*',
        inactive_indicator: '-',
        done: 'x',
        todo: ' ',
        bar_full: '=',
        bar_empty: '-',
        status_prefix: '>',
        effort: '#',
        cross: 'x',
        tick: 'v',
    },
    spacing: DEFAULT_SPACING,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dark_theme_colors_are_distinct() {
        let d = DARK.colors;
        assert_ne!(d.bg, d.text);
        assert_ne!(d.card, d.surface);
        assert_ne!(d.accent, d.muted);
    }

    #[test]
    fn light_theme_colors_are_distinct() {
        let l = LIGHT.colors;
        assert_ne!(l.bg, l.text);
        assert_ne!(l.card, l.surface);
        assert_ne!(l.accent, l.muted);
    }

    #[test]
    fn minimal_theme_is_monochrome() {
        let m = MINIMAL.colors;
        assert_eq!(m.bg, Color::Reset);
        assert_eq!(m.text, Color::Reset);
    }

    #[test]
    fn symbols_are_unicode_chars() {
        let s = DARK.symbols;
        assert_eq!(s.selection_marker, '▸');
        assert_eq!(s.done, '✓');
        assert_eq!(s.status_prefix, '>');
    }

    #[test]
    fn spacing_defaults() {
        let sp = Spacing::default();
        assert_eq!(sp.card_padding, 1);
        assert_eq!(sp.column_gap, 2);
        assert_eq!(sp.status_padding, 1);
    }
}
