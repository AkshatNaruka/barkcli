//! Reusable UI components for the barkcli TUI.
//!
//! Each component is a self-contained rendering function that takes a ratatui
//! Frame and a target Rect, and draws itself. Components are theme-agnostic —
//! they read colors from the passed Theme reference.

pub mod box_;
pub mod status;
pub mod table;

pub use box_::{draw_box, draw_confirm_box};
pub use status::{draw_status_line, format_status_bar, StatusLevel, StatusMessage};
pub use table::draw_borderless_table;
